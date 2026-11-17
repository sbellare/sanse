import { readFile, writeFile } from "node:fs/promises";
import { pool } from "@workspace/db";
import {
  createInquiryDeliveryService,
  createPostgresInquiryDeliveryStore,
} from "../src/lib/inquiry-delivery";

const calls: string[] = [];
const providerLedgerPath = process.env.INQUIRY_TEST_PROVIDER_LEDGER;
const service = createInquiryDeliveryService(
  createPostgresInquiryDeliveryStore(),
  async ({ headers }) => {
    const key = headers["Idempotency-Key"] ?? "";
    calls.push(key);
    if (providerLedgerPath) {
      let ledger: { logicalEmails: string[]; requests: string[] };
      try {
        ledger = JSON.parse(await readFile(providerLedgerPath, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        ledger = { logicalEmails: [], requests: [] };
      }

      const alreadyAccepted = ledger.logicalEmails.includes(key);
      if (!alreadyAccepted) ledger.logicalEmails.push(key);
      ledger.requests.push(key);
      await writeFile(providerLedgerPath, JSON.stringify(ledger));

      if (!alreadyAccepted) {
        throw new Error("Provider accepted the email but its response was lost");
      }
    }
    return new Response(null, { status: 200 });
  },
);

try {
  await service.processDue();
  process.stdout.write(JSON.stringify({ calls }));
} finally {
  await pool.end();
}
