import { Router, type IRouter } from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import {
  GetInquiryStatusParams,
  GetInquiryStatusResponse,
  SendInquiryBody,
  SendInquiryResponse,
} from "@workspace/api-zod";
import { checkInquiryRateLimit } from "../lib/inquiry-rate-limit";
import {
  inquiryDeliveryService,
  type InquiryDeliveryStatus,
  type InquiryDeliveryService,
} from "../lib/inquiry-delivery";

const connectors = new ReplitConnectors();
type ProxyOptions = NonNullable<Parameters<ReplitConnectors["proxy"]>[2]>;
type EmailSender = (options: ProxyOptions) => Promise<Response>;

export function createInquiryRouter(
  sendEmail: EmailSender = (options) => connectors.proxy("resend", "/emails", options),
  delivery: InquiryDeliveryService = inquiryDeliveryService,
): IRouter {
  const inquiryRouter: IRouter = Router();

  inquiryRouter.post("/inquiries", async (req, res): Promise<void> => {
    const honeypot = req.body?.website;
    if (typeof honeypot === "string" ? honeypot.trim() : honeypot != null) {
      res.json(SendInquiryResponse.parse({ success: true, status: "delivered" }));
      return;
    }

    const parsed = SendInquiryBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Please check the inquiry details and try again." });
      return;
    }

    const rateLimit = checkInquiryRateLimit(req.ip || "unknown");
    if (!rateLimit.allowed) {
      res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
      res.status(429).json({
        error: `You’ve sent several inquiries. Please wait about ${Math.max(1, Math.ceil(rateLimit.retryAfterSeconds / 60))} minutes before trying again.`,
      });
      return;
    }

    const inquiry = parsed.data;

    try {
      const inquiryId = await delivery.enqueue(inquiry);
      let status: InquiryDeliveryStatus | null | undefined;
      try {
        status = await delivery.attempt(inquiryId);
      } catch (error) {
        req.log.warn(
          { errorType: error instanceof Error ? error.name : "unknown" },
          "Inquiry was saved but its immediate delivery attempt could not finish",
        );
      }

      if (status === "failed") {
        res.status(503).json({
          success: false,
          status: "failed",
          inquiryId,
          error: "We couldn't deliver your inquiry. Please contact us directly or try again.",
        });
        return;
      }

      if (status === "delivered") {
        try {
          const acknowledgmentResponse = await sendEmail({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "Sanse Solutions <info@sansesolutions.com>",
              to: inquiry.email,
              subject: "We received your inquiry | Sanse Solutions",
              text: [
                "Thank you for contacting Sanse Solutions.",
                "",
                "We’ve received your project inquiry, and our team will review your message.",
                "We appreciate you reaching out.",
              ].join("\n"),
            }),
          });

          if (!acknowledgmentResponse.ok) {
            req.log.warn(
              { status: acknowledgmentResponse.status },
              "Resend rejected inquiry acknowledgment",
            );
          }
        } catch (error) {
          req.log.warn(
            { errorType: error instanceof Error ? error.name : "unknown" },
            "Failed to send inquiry acknowledgment",
          );
        }
      }

      const responseBody = SendInquiryResponse.parse({
        success: true,
        status: status === "delivered" ? "delivered" : "pending",
        inquiryId,
      });
      res.status(status === "delivered" ? 200 : 202).json(responseBody);
    } catch (error) {
      req.log.error(
        { errorType: error instanceof Error ? error.name : "unknown" },
        "Failed to save website inquiry for delivery",
      );
      res.status(503).json({ error: "We couldn't safely save your inquiry. Please try again." });
    }
  });

  inquiryRouter.get("/inquiries/:inquiryId/status", async (req, res): Promise<void> => {
    const params = GetInquiryStatusParams.safeParse(req.params);
    if (!params.success) {
      res.status(404).json({ error: "Inquiry status not found." });
      return;
    }

    try {
      const status = await delivery.getStatus(params.data.inquiryId);
      if (!status) {
        res.status(404).json({ error: "Inquiry status not found." });
        return;
      }
      res.json(GetInquiryStatusResponse.parse({ status }));
    } catch (error) {
      req.log.error(
        { errorType: error instanceof Error ? error.name : "unknown" },
        "Failed to check inquiry delivery status",
      );
      res.status(503).json({ error: "Inquiry delivery status is temporarily unavailable." });
    }
  });

  return inquiryRouter;
}

export default createInquiryRouter();
