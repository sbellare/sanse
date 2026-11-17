import { timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";
import { processQueuedInquiries } from "../lib/inquiry-delivery";

export function createInquiryRetryRouter(
  processDue: () => Promise<void> = processQueuedInquiries,
  getSecret: () => string | undefined = () => process.env.CRON_SECRET,
): IRouter {
  const router: IRouter = Router();

  router.get("/", async (req, res): Promise<void> => {
    res.setHeader("Cache-Control", "no-store");
    const secret = getSecret();
    if (!secret || secret.length < 16) {
      res.status(503).json({ error: "Inquiry retry scheduling is not configured." });
      return;
    }

    const expected = Buffer.from(`Bearer ${secret}`);
    const supplied = Buffer.from(req.get("authorization") ?? "");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    try {
      await processDue();
      res.json({ success: true });
    } catch (error) {
      req.log.error(
        { errorType: error instanceof Error ? error.name : "unknown" },
        "Scheduled inquiry retry cycle failed",
      );
      res.status(503).json({ error: "Inquiry retries could not finish." });
    }
  });

  return router;
}
