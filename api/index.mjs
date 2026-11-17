// Deploy the esbuild output rather than asking Vercel to recompile workspace
// TypeScript packages without support for their project references.
export { default } from "../artifacts/api-server/dist/vercel.mjs";
