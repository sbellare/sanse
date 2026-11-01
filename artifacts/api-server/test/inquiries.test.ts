import assert from "node:assert/strict";
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
) {
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { warn() {}, error() {} } as typeof req.log;
    next();
  });
  app.use(createInquiryRouter(sendAcknowledgment, delivery));

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
        "X-Forwarded-For": `192.0.2.${requestNumber}`,
      },
      body: JSON.stringify(inquiry),
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

test("delivers the team notification before the visitor acknowledgment", async () => {
  const events: string[] = [];
  const { service } = createTestDelivery(undefined, async () => {
    events.push("team");
    return new Response(null, { status: 200 });
  });
  const { response } = await submitInquiry(service, async () => {
    events.push("visitor");
    return new Response(null, { status: 200 });
  });

  assert.equal(response.status, 200);
  assert.deepEqual(events, ["team", "visitor"]);
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
