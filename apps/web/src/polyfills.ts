// Minimal browser shims for the Mysten SDKs (Buffer/process/global).
import { Buffer } from 'buffer';
const g = globalThis as any;
if (!g.Buffer) g.Buffer = Buffer;
if (!g.global) g.global = globalThis;
if (!g.process) g.process = { env: {}, browser: true, version: '' };
