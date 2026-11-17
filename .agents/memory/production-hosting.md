---
name: Production hosting constraints
description: User-chosen production platform and its scheduling constraint.
---

The user chose Vercel for the production website and confirmed the project uses the Hobby plan. The domain's DNS is managed in Squarespace.

**Why:** The user explicitly chose to configure the inquiry backend on Vercel, rather than keep it hosted on Replit.

**How to apply:** Preserve the Vercel production target when working on inquiry delivery. Do not assume Pro-only scheduling is available or make a plan change. Frequent queued retries need a trusted external scheduler on Hobby; communicate any remaining external setup rather than describing the live site as fixed based only on local tests.
