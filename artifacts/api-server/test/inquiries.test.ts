import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { createServer, type Server } from "node:http";
import { createInquiryRouter } from "../src/routes/inquiries";

const inquiry = {
  name: "Ada Example",
  email: "ada@example.com",
  project: "New building",
  stage: "Planning",
  message: "We are planning a low-carbon home.",
};

type TestEmailSender = NonNullable<Parameters<typeof createInquiryRouter>[0]>;
let requestNumber = 0;

async function submitInquiry(sendEmail: TestEmailSender) {
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { warn() {}, error() {} } as typeof req.log;
    next();
  });
  app.use(createInquiryRouter(sendEmail));

  const testServer = createServer(app);
  await new Promise<void>((resolve) => testServer.listen(0, "127.0.0.1", resolve));
  const address = testServer.address();
  assert.ok(address && typeof address !== "string");
  requestNumber += 1;

  try {
    return await fetch(`http://127.0.0.1:${address.port}/inquiries`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": `192.0.2.${requestNumber}`,
      },
      body: JSON.stringify(inquiry),
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      testServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("sends the team notification before the visitor acknowledgment", async () => {
  const calls: Array<{ to: string; from: string }> = [];
  const response = await submitInquiry(async (options) => {
    const payload = JSON.parse(String(options.body)) as { to: string; from: string };
    calls.push(payload);
    return new Response(null, { status: 200 });
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls.map(({ to }) => to), [
    "info@sansesolutions.com",
    inquiry.email,
  ]);
});

test("does not acknowledge when the team notification fails", async () => {
  let calls = 0;
  const response = await submitInquiry(async () => {
    calls += 1;
    return new Response(null, { status: 503 });
  });

  assert.equal(response.status, 502);
  assert.equal(calls, 1);
});

test("does not acknowledge when sending the team notification throws", async () => {
  let calls = 0;
  const response = await submitInquiry(async () => {
    calls += 1;
    throw new Error("temporary email service failure");
  });

  assert.equal(response.status, 502);
  assert.equal(calls, 1);
});

test("succeeds when the acknowledgment is rejected by the email service", async () => {
  let calls = 0;
  const response = await submitInquiry(async () => {
    calls += 1;
    return new Response(null, { status: calls === 1 ? 200 : 503 });
  });

  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});

test("succeeds when sending the acknowledgment throws", async () => {
  let calls = 0;
  const response = await submitInquiry(async () => {
    calls += 1;
    if (calls === 2) throw new Error("temporary email service failure");
    return new Response(null, { status: 200 });
  });

  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});

test("sends the acknowledgment to the submitted email from Sanse", async () => {
  const sent: Array<{ to: string; from: string }> = [];
  const response = await submitInquiry(async (options) => {
    sent.push(JSON.parse(String(options.body)) as { to: string; from: string });
    return new Response(null, { status: 200 });
  });

  assert.equal(response.status, 200);
  assert.equal(sent[1]?.to, inquiry.email);
  assert.equal(sent[1]?.from, "Sanse Solutions <info@sansesolutions.com>");
});
