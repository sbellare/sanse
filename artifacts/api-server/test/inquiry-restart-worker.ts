import { pool } from "@workspace/db";
import {
  createInquiryDeliveryService,
  createPostgresInquiryDeliveryStore,
} from "../src/lib/inquiry-delivery";

const calls: string[] = [];
const service = createInquiryDeliveryService(
  createPostgresInquiryDeliveryStore(),
  async ({ headers }) => {
    calls.push(headers["Idempotency-Key"] ?? "");
    return new Response(null, { status: 200 });
  },
);

try {
  await service.processDue();
  process.stdout.write(JSON.stringify({ calls }));
} finally {
  await pool.end();
}
