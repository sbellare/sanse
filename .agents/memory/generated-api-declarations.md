---
name: Generated API declarations
description: Keeping generated package declarations aligned with their source contracts during type checks.
---

When downstream API-server or web-app type checks report missing generated fields or exports, rebuild the referenced API packages before treating the consumer errors as source defects.

**Why:** The workspace can retain stale declaration outputs even when generated TypeScript sources already contain the updated contract, causing misleading compile errors in dependent artifacts.

**How to apply:** Rebuild the affected project references (such as `lib/api-zod` and `lib/api-client-react`) before rerunning consumer type checks.
