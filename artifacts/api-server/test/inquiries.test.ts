import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import express from "express";
import { createServer } from "node:http";
import {
  createInquiryDeliveryService,
  type InquiryDeliveryService,
  type InquiryDeliveryStatus,
  type InquiryDeliveryStore,
  type InquiryDetails,
} from "../src/lib/inquiry-delivery";
import {
  createInquiryRateLimiter,
  type InquiryRateLimitStore,
} from "../src/lib/inquiry-rate-limit";
import { createInquiryRouter } from "../src/routes/inquiries";

const inquiry: InquiryDetails = {
  name: "Ada Example",
  email: "ada@example.com",
  project: "New building",
  stage: "Planning",
  message: "We are planning a low-carbon home.",
};

type EmailOptions = {
  method: "POST";
  headers: Record<string, string>;
  body: string;
};
type TestEmailSender = (options: EmailOptions) => Promise<Response>;
type TestRecord = InquiryDetails & {
  id: string;
  status: InquiryDeliveryStatus | "sending";
  attempts: number;
  nextAttemptAt: number;
  leaseUntil?: number;
};

let requestNumber = 0;

class MemoryInquiryRateLimitStore implements InquiryRateLimitStore {
  readonly submissions = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  async consume(address: string, windowMs: number, limit: number) {
    const now = this.now();
    const recent = (this.submissions.get(address) ?? []).filter(
      (submittedAt) => submittedAt > now - windowMs,
    );
    const allowed = recent.length < limit;
    if (allowed) recent.push(now);
    this.submissions.set(address, recent);
    return {
      allowed,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil(((recent[0] ?? now) + windowMs - now) / 1000),
      ),
    };
  }
}

const defaultTestRateLimiter = createInquiryRateLimiter(
  new MemoryInquiryRateLimitStore(),
);

class MemoryInquiryStore implements InquiryDeliveryStore {
  readonly records = new Map<string, TestRecord>();
  clock = 1_000_000;

  async enqueue(id: string, details: InquiryDetails) {
    this.records.set(id, {
      ...details,
      id,
      status: "pending",
      attempts: 0,
      nextAttemptAt: this.clock,
    });
  }

  async claim(id: string) {
    const record = this.records.get(id);
    if (
      !record ||
      record.attempts >= 5 ||
      !(
        (record.status === "pending" && record.nextAttemptAt <= this.clock) ||
        (record.status === "sending" && (record.leaseUntil ?? 0) <= this.clock)
      )
    ) {
      return null;
    }
    record.status = "sending";
    record.attempts += 1;
    record.leaseUntil = this.clock + 120_000;
    return {
      id: record.id,
      name: record.name,
      email: record.email,
      project: record.project,
      stage: record.stage,
      message: record.message,
      attempts: record.attempts,
    };
  }

  async listDueIds(limit: number) {
    return [...this.records.values()]
      .filter(
        (record) =>
          record.attempts < 5 &&
          ((record.status === "pending" && record.nextAttemptAt <= this.clock) ||
            (record.status === "sending" && (record.leaseUntil ?? 0) <= this.clock)),
      )
      .slice(0, limit)
      .map(({ id }) => id);
  }

  async failExpiredAttempts() {
    for (const record of this.records.values()) {
      if (
        record.status === "sending" &&
        (record.leaseUntil ?? Infinity) <= this.clock &&
        record.attempts >= 5
      ) {
        record.status = "failed";
      }
    }
  }

  async pruneOldStatuses() {}

  async settle(id: string, status: InquiryDeliveryStatus, nextAttemptAt?: Date) {
    const record = this.records.get(id);
    assert.ok(record);
    record.status = status;
    if (status === "pending") record.nextAttemptAt = nextAttemptAt?.getTime() ?? this.clock;
  }

  async getStatus(id: string) {
    const record = this.records.get(id);
    if (!record) return null;
    return record.status === "sending" ? "pending" : record.status;
  }
}

function createTestDelivery(
  store = new MemoryInquiryStore(),
  sendEmail: TestEmailSender = async () => new Response(null, { status: 200 }),
) {
  return {
    store,
    service: createInquiryDeliveryService(store, sendEmail, () => store.clock),
  };
}

async function submitInquiry(
  delivery: InquiryDeliveryService,
  sendAcknowledgment: TestEmailSender = async () => new Response(null, { status: 200 }),
  options: {
    address?: string;
    body?: unknown;
    rateLimiter?: (address: string) => Promise<{ allowed: true } | {
      allowed: false;
      retryAfterSeconds: number;
    }>;
  } = {},
) {
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { warn() {}, error() {} } as typeof req.log;
    next();
  });
  app.use(createInquiryRouter(
    sendAcknowledgment,
    delivery,
    options.rateLimiter ?? defaultTestRateLimiter,
  ));

  const testServer = createServer(app);
  await new Promise<void>((resolve) => testServer.listen(0, "127.0.0.1", resolve));
  const address = testServer.address();
  assert.ok(address && typeof address !== "string");
  requestNumber += 1;

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/inquiries`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": options.address ?? `192.0.2.${requestNumber}`,
      },
      body: JSON.stringify(options.body ?? inquiry),
    });
    const submitted = await response.clone().json();
    const statusResponse = submitted.inquiryId
      ? await fetch(`http://127.0.0.1:${address.port}/inquiries/${submitted.inquiryId}/status`)
      : null;
    return {
      response,
      statusResponse,
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      testServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("silently accepts a filled honeypot without saving or sending email", async () => {
  let emailCalls = 0;
  const { store, service } = createTestDelivery(undefined, async () => {
    emailCalls += 1;
    return new Response(null, { status: 200 });
  });

  const { response } = await submitInquiry(service, async () => {
    emailCalls += 1;
    return new Response(null, { status: 200 });
  }, {
    body: { ...inquiry, website: "https://spam.example" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, status: "delivered" });
  assert.equal(store.records.size, 0);
  assert.equal(emailCalls, 0);
});

test("returns a clear validation message for invalid inquiry details", async () => {
  let emailCalls = 0;
  const { store, service } = createTestDelivery(undefined, async () => {
    emailCalls += 1;
    return new Response(null, { status: 200 });
  });

  const { response } = await submitInquiry(service, undefined, {
    body: { ...inquiry, email: "not-an-email" },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Please check the inquiry details and try again.",
  });
  assert.equal(store.records.size, 0);
  assert.equal(emailCalls, 0);
});

test("limits each address to five inquiries in fifteen minutes with Retry-After", async () => {
  let teamEmailCalls = 0;
  let acknowledgmentCalls = 0;
  const { store, service } = createTestDelivery(undefined, async () => {
    teamEmailCalls += 1;
    return new Response(null, { status: 200 });
  });
  const address = "198.51.100.77";
  const responses = [];

  for (let index = 0; index < 6; index += 1) {
    const result = await submitInquiry(service, async () => {
      acknowledgmentCalls += 1;
      return new Response(null, { status: 200 });
    }, { address });
    responses.push(result.response);
  }

  assert.deepEqual(responses.slice(0, 5).map(({ status }) => status), [200, 200, 200, 200, 200]);
  const throttled = responses[5];
  assert.equal(throttled.status, 429);
  const retryAfter = Number(throttled.headers.get("Retry-After"));
  assert.ok(Number.isInteger(retryAfter) && retryAfter > 0 && retryAfter <= 15 * 60);
  const body = await throttled.json();
  assert.match(body.error, /wait about \d+ minutes before trying again/i);
  assert.equal(store.records.size, 5);
  assert.equal(teamEmailCalls, 5);
  assert.equal(acknowledgmentCalls, 5);
});

test("shares the rolling limit across API instances and releases it after the window", async () => {
  let now = 1_000_000;
  const sharedStore = new MemoryInquiryRateLimitStore(() => now);
  const firstInstance = createInquiryRateLimiter(sharedStore);
  const secondInstance = createInquiryRateLimiter(sharedStore);
  const address = "203.0.113.46";

  for (let count = 0; count < 5; count += 1) {
    const limiter = count % 2 === 0 ? firstInstance : secondInstance;
    assert.deepEqual(await limiter(address), { allowed: true });
  }

  const throttled = await secondInstance(address);
  assert.equal(throttled.allowed, false);
  if (!throttled.allowed) assert.ok(throttled.retryAfterSeconds > 0);

  now += 15 * 60 * 1000 + 1;
  assert.deepEqual(await firstInstance(address), { allowed: true });
});

test("sends the team notification with the submitter as the reply address", async () => {
  const events: string[] = [];
  const teamMessages: { to: string; reply_to: string; text: string }[] = [];
  const { service } = createTestDelivery(undefined, async (options) => {
    events.push("team");
    teamMessages.push(
      JSON.parse(options.body) as { to: string; reply_to: string; text: string },
    );
    return new Response(null, { status: 200 });
  });
  const { response } = await submitInquiry(service, async () => {
    events.push("visitor");
    return new Response(null, { status: 200 });
  });

  assert.equal(response.status, 200);
  assert.deepEqual(events, ["team", "visitor"]);
  assert.equal(teamMessages[0]?.to, "info@sansesolutions.com");
  assert.equal(teamMessages[0]?.reply_to, inquiry.email);
  assert.match(teamMessages[0]?.text ?? "", /Name: Ada Example/);
  assert.match(teamMessages[0]?.text ?? "", /Project stage: Planning/);
  assert.match(teamMessages[0]?.text ?? "", /We are planning a low-carbon home\./);
  assert.equal((await response.json()).status, "delivered");
});

test("stores a rejected team notification as pending and exposes its status", async () => {
  const keys: string[] = [];
  const { service } = createTestDelivery(undefined, async (options) => {
    keys.push(options.headers["Idempotency-Key"]);
    return new Response(null, { status: 503 });
  });
  const { response, statusResponse } = await submitInquiry(service);
  const result = await response.json();

  assert.equal(response.status, 202);
  assert.equal(result.status, "pending");
  assert.ok(result.inquiryId);
  assert.deepEqual(keys, [`sanse-inquiry-${result.inquiryId}`]);
  assert.ok(statusResponse);
  assert.deepEqual(await statusResponse.json(), { status: "pending" });
});

test("queues a thrown team notification without sending the visitor acknowledgment", async () => {
  let calls = 0;
  const { service } = createTestDelivery(undefined, async () => {
    calls += 1;
    throw new Error("temporary email service failure");
  });
  const { response } = await submitInquiry(service, async () => {
    throw new Error("should not send acknowledgment before team delivery");
  });

  assert.equal(response.status, 202);
  assert.equal(calls, 1);
});

test("does not retry a permanent provider rejection and reports failure", async () => {
  let calls = 0;
  const { service } = createTestDelivery(undefined, async () => {
    calls += 1;
    return new Response(null, { status: 400 });
  });
  const { response, statusResponse } = await submitInquiry(service);
  const result = await response.json();

  assert.equal(response.status, 503);
  assert.equal(result.status, "failed");
  assert.equal(calls, 1);
  assert.ok(statusResponse);
  assert.deepEqual(await statusResponse.json(), { status: "failed" });
});

test("uses the same provider idempotency key for bounded retry attempts", async () => {
  const store = new MemoryInquiryStore();
  const keys: string[] = [];
  const { service } = createTestDelivery(store, async (options) => {
    keys.push(options.headers["Idempotency-Key"]);
    return new Response(null, { status: 503 });
  });
  const id = await service.enqueue(inquiry);

  assert.equal(await service.attempt(id), "pending");
  assert.equal(await service.attempt(id), "pending");
  assert.equal(keys.length, 1);

  for (const retryDelay of [60_000, 5 * 60_000, 30 * 60_000]) {
    store.clock += retryDelay;
    assert.equal(await service.attempt(id), "pending");
  }
  store.clock += 2 * 60 * 60_000;
  assert.equal(await service.attempt(id), "failed");
  assert.equal(await service.attempt(id), "failed");
  assert.equal(keys.length, 5);
  assert.ok(keys.every((key) => key === `sanse-inquiry-${id}`));
});

test("retries a pending notification and transitions status to delivered", async () => {
  const store = new MemoryInquiryStore();
  const keys: string[] = [];
  let calls = 0;
  const { service } = createTestDelivery(store, async (options) => {
    calls += 1;
    keys.push(options.headers["Idempotency-Key"]);
    return new Response(null, { status: calls === 1 ? 503 : 200 });
  });
  const id = await service.enqueue(inquiry);

  assert.equal(await service.attempt(id), "pending");
  store.clock += 60_000;
  assert.equal(await service.attempt(id), "delivered");
  assert.equal(await service.getStatus(id), "delivered");
  assert.deepEqual(keys, [`sanse-inquiry-${id}`, `sanse-inquiry-${id}`]);
});

test("the background retry cycle attempts due inquiries", async () => {
  const store = new MemoryInquiryStore();
  let calls = 0;
  const { service } = createTestDelivery(store, async () => {
    calls += 1;
    return new Response(null, { status: 200 });
  });
  const id = await service.enqueue(inquiry);

  await service.processDue();

  assert.equal(calls, 1);
  assert.equal(await service.getStatus(id), "delivered");
});

test("PostgreSQL retries pending inquiries after a process restart and recovers expired leases", {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const { pool } = await import("@workspace/db");
  const schema = `inquiry_restart_${randomUUID().replaceAll("-", "")}`;
  const ids = [randomUUID(), randomUUID()];
  const workerPath = process.env.INQUIRY_RESTART_WORKER_PATH;
  assert.ok(workerPath, "restart worker bundle should be configured by the test runner");

  await pool.query(`CREATE SCHEMA "${schema}"`);
  try {
    await pool.query(
      `CREATE TABLE "${schema}".inquiry_deliveries
       (LIKE public.inquiry_deliveries INCLUDING ALL)`,
    );
    await pool.query(
      `INSERT INTO "${schema}".inquiry_deliveries
       (id, status, name, email, project, stage, message, attempts, next_attempt_at)
       VALUES
       ($1, 'pending', $3, $4, $5, $6, $7, 0, NOW()),
       ($2, 'sending', $3, $4, $5, $6, $7, 1, NOW() - INTERVAL '1 minute')`,
      [ids[0], ids[1], inquiry.name, inquiry.email, inquiry.project, inquiry.stage, inquiry.message],
    );
    await pool.query(
      `UPDATE "${schema}".inquiry_deliveries
       SET lease_until = NOW() - INTERVAL '1 second'
       WHERE id = $1`,
      [ids[1]],
    );

    const runWorker = () => {
      const result = spawnSync(process.execPath, [workerPath], {
        encoding: "utf8",
        env: {
          ...process.env,
          PGOPTIONS: `${process.env.PGOPTIONS ?? ""} -c search_path=${schema}`.trim(),
        },
      });
      assert.equal(result.status, 0, result.stderr || result.error?.message);
      return JSON.parse(result.stdout) as { calls: string[] };
    };

    const firstRun = runWorker();
    assert.deepEqual(firstRun.calls.sort(), ids.map((id) => `sanse-inquiry-${id}`).sort());

    const statuses = await pool.query<{ id: string; status: string }>(
      `SELECT id, status FROM "${schema}".inquiry_deliveries ORDER BY id`,
    );
    assert.deepEqual(statuses.rows, ids.map((id) => ({ id, status: "delivered" })).sort((a, b) =>
      a.id.localeCompare(b.id),
    ));

    const restartedWorker = runWorker();
    assert.deepEqual(restartedWorker.calls, []);
  } finally {
    try {
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await pool.end();
    }
  }
});
