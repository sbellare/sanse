import { Router, type IRouter } from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { SendInquiryBody, SendInquiryResponse } from "@workspace/api-zod";
import { checkInquiryRateLimit } from "../lib/inquiry-rate-limit";

const router: IRouter = Router();
const connectors = new ReplitConnectors();

router.post("/inquiries", async (req, res): Promise<void> => {
  const honeypot = req.body?.website;
  if (typeof honeypot === "string" ? honeypot.trim() : honeypot != null) {
    res.json(SendInquiryResponse.parse({ success: true }));
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
  const text = [
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

  try {
    const response = await connectors.proxy("resend", "/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Sanse Solutions <info@sansesolutions.com>",
        to: "info@sansesolutions.com",
        reply_to: inquiry.email,
        subject: `Website inquiry: ${inquiry.project}`,
        text,
      }),
    });

    if (!response.ok) {
      req.log.error({ status: response.status }, "Resend rejected website inquiry");
      res.status(502).json({ error: "We couldn't send your inquiry right now. Please try again." });
      return;
    }

    try {
      const acknowledgmentResponse = await connectors.proxy("resend", "/emails", {
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

    res.json(SendInquiryResponse.parse({ success: true }));
  } catch (error) {
    req.log.error(
      { errorType: error instanceof Error ? error.name : "unknown" },
      "Failed to send website inquiry",
    );
    res.status(502).json({ error: "We couldn't send your inquiry right now. Please try again." });
  }
});

export default router;
