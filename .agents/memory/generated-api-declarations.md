---
name: Generated API declarations
description: Keeping generated package declarations aligned with their source contracts during type checks.
---

When downstream API-server or web-app type checks report missing generated fields or exports, rebuild the referenced API packages before treating the consumer errors as source defects.

**Why:** The workspace can retain stale declaration outputs even when generated TypeScript sources already contain the updated contract, causing misleading compile errors in dependent artifacts.

**How to apply:** Rebuild the affected project references (such as `lib/api-zod` and `lib/api-client-react`) before rerunning consumer type checks.

Deployment builds must also generate referenced library declarations before a hosting provider performs its own TypeScript compilation. A successful esbuild bundle does not establish that these declarations exist.

**Why:** A clean checkout can lack referenced declaration outputs, causing TS6305. Generating them alone does not guarantee Vercel's separate compiler will succeed.

**How to apply:** Keep shared-reference compilation in the API's build command, not solely in local typechecking. When diagnosing `Emit skipped`, inspect the per-file semantic diagnostics with a clean-checkout view of library outputs.

Explicitly declare module and module-resolution settings in the API's leaf TypeScript configuration when supporting Vercel; inherited settings alone are insufficient.

**Why:** Vercel's TypeScript wrapper sets defaults on the raw leaf configuration before TypeScript resolves `extends`. It can inject NodeNext module resolution over workspace Bundler settings and break extensionless shared-library exports. Ordinary local typechecks do not reproduce this behavior.

**How to apply:** Do not disable type checking or `noEmitOnError` to mask a deployment compiler mismatch.

Prefer the already-built JavaScript output as Vercel's Express entrypoint, with a strict source typecheck in the build command.

**Why:** A local TypeScript language-service mock passed while Vercel still failed. Vercel's host differs in symlink resolution, discovered-file tracking, and project-reference handling; such a mock is not proof of a working provider build.

**How to apply:** Keep Vercel pointed at the build output directory, preserve a visible Express import for its entrypoint detector, and include generated logger workers. Verify the actual generated bundle rather than another approximate compiler host. A local build is not a confirmed successful Vercel deployment.
