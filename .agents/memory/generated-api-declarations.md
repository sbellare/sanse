---
name: Generated API declarations
description: Keeping generated package declarations aligned with their source contracts during type checks.
---

When downstream API-server or web-app type checks report missing generated fields or exports, rebuild the referenced API packages before treating the consumer errors as source defects.

**Why:** The workspace can retain stale declaration outputs even when generated TypeScript sources already contain the updated contract, causing misleading compile errors in dependent artifacts.

**How to apply:** Rebuild the affected project references (such as `lib/api-zod` and `lib/api-client-react`) before rerunning consumer type checks.

Deployment builds must also generate referenced library declarations before a hosting provider performs its own TypeScript compilation. A successful esbuild bundle does not establish that these declarations exist.

**Why:** Vercel's subsequent per-file TypeScript compilation can report only `Emit skipped` when a clean checkout lacks referenced declaration outputs, hiding the underlying TS6305 diagnostic.

**How to apply:** Keep shared-reference compilation in the API's build command, not solely in local typechecking. When diagnosing `Emit skipped`, inspect the per-file semantic diagnostics with a clean-checkout view of library outputs.
