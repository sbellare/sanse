import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { createEmailSender, isEmailConfigured } from "../src/lib/email-sender";
import { createInquiryRetryRouter } from "../src/routes/inquiry-retries";
import { createInquiryRouter } from "../src/routes/inquiries";

const email = {
  method: "POST" as const,
  headers: {
    "Content-Type": "application/json",
    "Idempotency-Key": "inquiry-fixture",
  },
  body: JSON.stringify({
    from: "Sanse Solutions <info@sansesolutions.com>",
    to: "info@sansesolutions.com",
    reply_to: "visitor@example.com",
    text: "The full inquiry",
  }),
};

test("Vercel sends directly to Resend and preserves headers and inquiry details", async () => {
  let calls = 0;
  const sender = createEmailSender({
    environment: { VERCEL: "1", RESEND_API_KEY: "fixture-only-not-a-real-key" },
    fetch: async (url, options) => {
      calls += 1;
      assert.equal(url, "https://api.resend.com/emails");
      assert.equal(options?.method, "POST");
      assert.equal(options?.body, email.body);
      const headers = new Headers(options?.headers);
      assert.equal(headers.get("Authorization"), "Bearer fixture-only-not-a-real-key");
      assert.equal(headers.get("Idempotency-Key"), "inquiry-fixture");
      assert.ok(options?.signal);
      return new Response('{"id":"fixture"}', { status: 200 });
    },
    connectorSend: async () => {
      assert.fail("Vercel must not use the Replit connector");
    },
  });
  assert.equal((await sender(email)).status, 200);
  assert.equal(calls, 1);
});

test("Vercel fails explicitly without a Resend key and never falls back", async () => {
  const sender = createEmailSender({
    environment: { VERCEL: "1" },
    connectorSend: async () => assert.fail("No Vercel connector fallback"),
  });
  assert.equal(isEmailConfigured({ VERCEL: "1" }), false);
  await assert.rejects(sender(email), /RESEND_API_KEY/);
});

test("Replit can keep using its existing Resend connector", async () => {
  let calls = 0;
  const sender = createEmailSender({
    environment: {},
    connectorSend: async (options) => {
      calls += 1;
      assert.deepEqual(options, email);
      return new Response(null, { status: 200 });
    },
  });
  await sender(email);
  assert.equal(calls, 1);
});

test("provider rejection is returned without switching transports", async () => {
  const sender = createEmailSender({
    environment: { VERCEL: "1", RESEND_API_KEY: "fixture-only-not-a-real-key" },
    fetch: async () => new Response(null, { status: 403 }),
    connectorSend: async () => assert.fail("Do not hide a rejected direct send"),
  });
  assert.equal((await sender(email)).status, 403);
});

async function withServer(
  application: express.Express,
  run: (url: string) => Promise<void>,
): Promise<void> {
  const server: Server = createServer(application);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    );
  }
}

function loggedApp() {
  const app = express();
  app.use((_req, _res, next) => {
    _req.log = { error() {}, warn() {} } as typeof _req.log;
    next();
  });
  return app;
}

test("cron rejects missing, incorrect, and missing-configuration credentials", async () => {
  let calls = 0;
  const app = loggedApp();
  const run = async () => { calls += 1; };
  const secret = "fixture-scheduler-secret";
  app.use("/api/cron/inquiries", createInquiryRetryRouter(run, () => secret));
  app.use("/unconfigured", createInquiryRetryRouter(run, () => undefined));
  await withServer(app, async (url) => {
    for (const headers of [{}, { Authorization: "Bearer wrong" }]) {
      const response = await fetch(`${url}/api/cron/inquiries`, { headers });
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
    }
    assert.equal((await fetch(`${url}/unconfigured`)).status, 503);
  });
  assert.equal(calls, 0);
});

test("authorized cron runs and awaits a retry cycle", async () => {
  let calls = 0;
  const app = loggedApp();
  app.use("/api/cron/inquiries", createInquiryRetryRouter(async () => {
    await Promise.resolve();
    calls += 1;
  }, () => "fixture-scheduler-secret"));
  await withServer(app, async (url) => {
    const response = await fetch(`${url}/api/cron/inquiries`, {
      headers: { Authorization: "Bearer fixture-scheduler-secret" },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.equal(calls, 1);
  });
});

test("cron reports processing errors without exposing personal details", async () => {
  const app = loggedApp();
  app.use("/api/cron/inquiries", createInquiryRetryRouter(async () => {
    throw new Error("Private inquiry details");
  }, () => "fixture-scheduler-secret"));
  await withServer(app, async (url) => {
    const response = await fetch(`${url}/api/cron/inquiries`, {
      headers: { Authorization: "Bearer fixture-scheduler-secret" },
    });
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /Private inquiry/);
  });
});

test("unconfigured email returns a clear failure before touching inquiry storage", async () => {
  const app = loggedApp();
  app.use(express.json());
  app.use("/api", createInquiryRouter(
    async () => assert.fail("No email should be sent"),
    undefined,
    async () => assert.fail("No counter or database should be touched"),
    () => false,
  ));
  await withServer(app, async (url) => {
    const response = await fetch(`${url}/api/inquiries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Example Visitor",
        email: "visitor@example.com",
        project: "New building",
        stage: "Planning",
        message: "Example project",
      }),
    });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /info@sansesolutions.com/);
  });
});
