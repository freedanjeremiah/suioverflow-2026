import type { Metadata } from "next";
import { GraphExplorer } from "@/components/explorer/GraphExplorer";

export const metadata: Metadata = {
  title: "Your graph · Mycelium",
  description: "Explore your living memory and select a slice to share, just by pointing at it.",
};

export default function GraphPage() {
  return <GraphExplorer />;
}
