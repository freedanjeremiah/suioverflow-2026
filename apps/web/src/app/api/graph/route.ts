import { MY_GRAPH } from "@/lib/graph/data";
import type { GraphResponse } from "@/lib/api-types";

// The visitor's own living memory graph. Static seed today; the endpoint exists
// so the UI is wired to a backend (and a real source can replace it later).
export async function GET() {
  const body: GraphResponse = {
    graph: MY_GRAPH,
    counts: { nodes: MY_GRAPH.nodes.length, edges: MY_GRAPH.edges.length },
  };
  return Response.json(body);
}
