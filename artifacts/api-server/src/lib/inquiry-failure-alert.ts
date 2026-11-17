import { logger } from "./logger";
import type { InquiryTerminalFailureEvent } from "./inquiry-delivery";

type FailureAlertPayload = {
  inquiryId: string;
  attempts: number;
  category: InquiryTerminalFailureEvent["reason"];
};

type FailureAlertFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export function createInquiryFailureAlertReporter(
  webhookUrl: string | undefined = process.env.INQUIRY_FAILURE_ALERT_WEBHOOK_URL,
  send: FailureAlertFetch = fetch,
): (event: InquiryTerminalFailureEvent) => Promise<void> {
  return async (event) => {
    logger.error(event, "Inquiry delivery permanently failed");

    if (!webhookUrl) {
      logger.warn(
        { alertDestinationConfigured: false },
        "Inquiry failure alert destination is not configured",
      );
      return;
    }

    let destination: URL;
    try {
      destination = new URL(webhookUrl);
    } catch {
      logger.warn({}, "Inquiry failure alert destination is invalid");
      return;
    }
    if (destination.protocol !== "https:") {
      logger.warn({}, "Inquiry failure alert destination must use HTTPS");
      return;
    }

    const payload: FailureAlertPayload = {
      inquiryId: event.inquiryId,
      attempts: event.attempts,
      category: event.reason,
    };

    try {
      const response = await send(destination, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5_000),
        redirect: "error",
      });
      if (!response.ok) {
        logger.warn(
          { status: response.status },
          "Inquiry failure alert destination returned an error",
        );
      }
    } catch (error) {
      logger.warn(
        { errorType: error instanceof Error ? error.name : "unknown" },
        "Inquiry failure alert could not be delivered",
      );
    }
  };
}
