---
name: Vercel TypeScript defaults
description: Why leaf API configs must directly declare module resolution for Vercel.
---

When supporting Vercel's per-file Node TypeScript compiler, declare the intended module and moduleResolution settings directly in the leaf API configuration, not just an inherited base.

**Why:** Vercel's compiler adapter applies NodeNext defaults before TypeScript processes inherited configuration. Local bundler-mode type checks can pass while Vercel silently skips emit after shared workspace exports fail to resolve.

**How to apply:** For future API configuration changes, retain the direct settings and run the regression check modeling Vercel's per-file language service. A normal workspace type check alone does not cover this behavior.
