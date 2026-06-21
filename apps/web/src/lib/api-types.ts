// Wire contract for the app's own Route Handlers (src/app/api/**). Pure types
// only — no runtime. (Marketplace/sharing/ask now go on-chain or to apps/server.)

import type { MemoryGraph } from "./graph/types";

export interface GraphResponse {
  graph: MemoryGraph;
  counts: { nodes: number; edges: number };
}
