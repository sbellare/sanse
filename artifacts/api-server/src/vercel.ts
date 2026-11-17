import app from "./app";
import { createInquiryRetryRouter } from "./routes/inquiry-retries";

// Reuse the full API without app.listen() or a background interval: Vercel
// owns the HTTP server, and the authenticated scheduler invokes queued retries.
app.use("/api/cron/inquiries", createInquiryRetryRouter());

export default app;
