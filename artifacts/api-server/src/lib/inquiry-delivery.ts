import { randomUUID } from "node:crypto";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { createInquiryFailureAlertReporter } from "./inquiry-failure-alert";
import { logger } from "./logger";

export type InquiryDetails = {
  name: string;
  email: string;
  project: string;
  stage?: string;
  message?: string;
};

export type InquiryDeliveryStatus = "pending" | "delivered" | "failed";
type EmailSender = (options: {
  method: "POST";
  headers: Record<string, string>;
  body: string;
}) => Promise<Response>;

type ClaimedInquiry = InquiryDetails & { id: string; attempts: number };
type ExpiredInquiryFailure = { id: string; attempts: number };
export type InquiryTerminalFailureEvent = {
  inquiryId: string;
  attempts: number;
  reason: "provider_rejected" | "retry_limit_reached" | "attempt_lease_expired";
};
type TerminalFailureReporter = (
  event: InquiryTerminalFailureEvent,
) => void | Promise<void>;

export interface InquiryDeliveryStore {
  enqueue(id: string, inquiry: InquiryDetails): Promise<void>;
  claim(id: string): Promise<ClaimedInquiry | null>;
  listDueIds(limit: number): Promise<string[]>;
  failExpiredAttempts(): Promise<ExpiredInquiryFailure[]>;
  pruneOldStatuses(): Promise<void>;
  settle(
    id: string,
    attempt: number,
    status: InquiryDeliveryStatus,
    nextAttemptAt?: Date,
  ): Promise<boolean>;
  getStatus(id: string): Promise<InquiryDeliveryStatus | null>;
}

export interface InquiryDeliveryService {
  enqueue(inquiry: InquiryDetails): Promise<string>;
  attempt(id: string): Promise<InquiryDeliveryStatus | null>;
  getStatus(id: string): Promise<InquiryDeliveryStatus | null>;
  processDue(): Promise<void>;
}

const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
const LEASE_DURATION_MS = 2 * 60_000;
const connectors = new ReplitConnectors();

const sendTeamEmail: EmailSender = (options) =>
  connectors.proxy("resend", "/emails", options);

function buildEmail(inquiry: ClaimedInquiry): string {
  return [
    "A new project inquiry was submitted through the Sanse Solutions website.",
    "",
    `Name: ${inquiry.name}`,
    `Email: ${inquiry.email}`,
    `Project type: ${inquiry.project}`,
    `Project stage: ${inquiry.stage?.trim() || "Not provided"}`,
    "",
    "What they would like to discuss:",
    inquiry.message?.trim() || "Not provided",
  ].join("\n");
}

export function createInquiryDeliveryService(
  store: InquiryDeliveryStore,
  sendEmail: EmailSender = sendTeamEmail,
  now: () => number = Date.now,
  reportTerminalFailure: TerminalFailureReporter = createInquiryFailureAlertReporter(),
): InquiryDeliveryService {
  function notifyTerminalFailure(event: InquiryTerminalFailureEvent): void {
    try {
      void Promise.resolve(reportTerminalFailure(event)).catch((error: unknown) => {
        logger.warn(
          { errorType: error instanceof Error ? error.name : "unknown" },
          "Inquiry failure alert could not be delivered",
        );
      });
    } catch (error) {
      logger.warn(
        { errorType: error instanceof Error ? error.name : "unknown" },
        "Inquiry failure alert could not be delivered",
      );
    }
  }

  async function failExpiredAttempts(): Promise<void> {
    const failures = await store.failExpiredAttempts();
    for (const failure of failures) {
      notifyTerminalFailure({
        inquiryId: failure.id,
        attempts: failure.attempts,
        reason: "attempt_lease_expired",
      });
    }
  }

  async function attempt(id: string): Promise<InquiryDeliveryStatus | null> {
    await failExpiredAttempts();
    const inquiry = await store.claim(id);
    if (!inquiry) return store.getStatus(id);

    let retryableFailure = false;
    try {
      const response = await sendEmail({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `sanse-inquiry-${inquiry.id}`,
        },
        body: JSON.stringify({
          from: "Sanse Solutions <info@sansesolutions.com>",
          to: "info@sansesolutions.com",
          reply_to: inquiry.email,
          subject: `Website inquiry: ${inquiry.project}`,
          text: buildEmail(inquiry),
        }),
      });
      if (response.ok) {
        const settled = await store.settle(inquiry.id, inquiry.attempts, "delivered");
        return settled ? "delivered" : store.getStatus(inquiry.id);
      }
      retryableFailure = response.status === 429 || response.status >= 500;
    } catch {
      retryableFailure = true;
    }

    if (!retryableFailure || inquiry.attempts >= MAX_ATTEMPTS) {
      const settled = await store.settle(inquiry.id, inquiry.attempts, "failed");
      if (!settled) return store.getStatus(inquiry.id);
      notifyTerminalFailure({
        inquiryId: inquiry.id,
        attempts: inquiry.attempts,
        reason: retryableFailure ? "retry_limit_reached" : "provider_rejected",
      });
      return "failed";
    }

    const delay = RETRY_DELAYS_MS[inquiry.attempts - 1];
    const settled = await store.settle(
      inquiry.id,
      inquiry.attempts,
      "pending",
      new Date(now() + delay),
    );
    return settled ? "pending" : store.getStatus(inquiry.id);
  }

  return {
    async enqueue(inquiry) {
      const id = randomUUID();
      await store.enqueue(id, inquiry);
      return id;
    },
    attempt,
    getStatus: (id) => store.getStatus(id),
    async processDue() {
      await failExpiredAttempts();
      await store.pruneOldStatuses();
      const ids = await store.listDueIds(25);
      await Promise.all(ids.map((id) => attempt(id)));
    },
  };
}

async function getDatabasePool() {
  const { pool } = await import("@workspace/db");
  return pool;
}

export function createPostgresInquiryDeliveryStore(): InquiryDeliveryStore {
  return {
    async enqueue(id, inquiry) {
      const pool = await getDatabasePool();
      await pool.query(
        `INSERT INTO inquiry_deliveries
         (id, status, name, email, project, stage, message, attempts, next_attempt_at)
         VALUES ($1, 'pending', $2, $3, $4, $5, $6, 0, NOW())`,
        [id, inquiry.name, inquiry.email, inquiry.project, inquiry.stage ?? null, inquiry.message ?? null],
      );
    },
    async claim(id) {
      const pool = await getDatabasePool();
      const result = await pool.query<ClaimedInquiry>(
        `UPDATE inquiry_deliveries
         SET status = 'sending', attempts = attempts + 1,
             lease_until = NOW() + ($2 * INTERVAL '1 millisecond'), updated_at = NOW()
         WHERE id = $1 AND attempts < $3
           AND ((status = 'pending' AND next_attempt_at <= NOW())
             OR (status = 'sending' AND lease_until <= NOW()))
         RETURNING id, name, email, project, stage, message, attempts`,
        [id, LEASE_DURATION_MS, MAX_ATTEMPTS],
      );
      const row = result.rows[0];
      if (!row || !row.name || !row.email || !row.project) return null;
      return row;
    },
    async listDueIds(limit) {
      const pool = await getDatabasePool();
      const result = await pool.query<{ id: string }>(
        `SELECT id FROM inquiry_deliveries
         WHERE attempts < $2
           AND ((status = 'pending' AND next_attempt_at <= NOW())
             OR (status = 'sending' AND lease_until <= NOW()))
         ORDER BY next_attempt_at, created_at
         LIMIT $1`,
        [limit, MAX_ATTEMPTS],
      );
      return result.rows.map(({ id }) => id);
    },
    async failExpiredAttempts() {
      const pool = await getDatabasePool();
      const result = await pool.query<ExpiredInquiryFailure>(
        `UPDATE inquiry_deliveries
         SET status = 'failed', name = NULL, email = NULL, project = NULL,
             stage = NULL, message = NULL, lease_until = NULL, updated_at = NOW()
         WHERE status = 'sending' AND lease_until <= NOW() AND attempts >= $1
         RETURNING id, attempts`,
        [MAX_ATTEMPTS],
      );
      return result.rows;
    },
    async pruneOldStatuses() {
      const pool = await getDatabasePool();
      await pool.query(
        `DELETE FROM inquiry_deliveries
         WHERE status IN ('delivered', 'failed')
           AND created_at < NOW() - INTERVAL '30 days'`,
      );
    },
    async settle(id, attempt, status, nextAttemptAt) {
      const pool = await getDatabasePool();
      if (status === "pending") {
        const result = await pool.query(
          `UPDATE inquiry_deliveries
           SET status = 'pending', next_attempt_at = $2, lease_until = NULL, updated_at = NOW()
           WHERE id = $1 AND status = 'sending' AND attempts = $3`,
          [id, nextAttemptAt, attempt],
        );
        return result.rowCount === 1;
      }

      const result = await pool.query(
        `UPDATE inquiry_deliveries
         SET status = $2, name = NULL, email = NULL, project = NULL,
             stage = NULL, message = NULL, lease_until = NULL, updated_at = NOW()
         WHERE id = $1 AND status = 'sending' AND attempts = $3`,
        [id, status, attempt],
      );
      return result.rowCount === 1;
    },
    async getStatus(id) {
      const pool = await getDatabasePool();
      const result = await pool.query<{ status: InquiryDeliveryStatus | "sending" }>(
        "SELECT status FROM inquiry_deliveries WHERE id = $1",
        [id],
      );
      const status = result.rows[0]?.status;
      return status === "sending" ? "pending" : status ?? null;
    },
  };
}

export const inquiryDeliveryService = createInquiryDeliveryService(
  createPostgresInquiryDeliveryStore(),
);

export async function processQueuedInquiries(): Promise<void> {
  await inquiryDeliveryService.processDue();
}

export const inquiryRetryIntervalMs = 30_000;
