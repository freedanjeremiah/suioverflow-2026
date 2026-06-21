// Minimal browser shims for the Mysten SDKs (Buffer/process/global), ported
// from the old Vite app. Imported first in the client Providers component so it
// runs before any @mysten/* code touches Buffer/global.
import { Buffer } from "buffer";

const g = globalThis as unknown as Record<string, unknown>;
if (!g.Buffer) g.Buffer = Buffer;
if (!g.global) g.global = globalThis;
if (!g.process) g.process = { env: {}, browser: true, version: "" };
