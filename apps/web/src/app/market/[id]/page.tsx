import { ListingDetail } from "@/components/market/ListingDetail";

// Listings live on-chain (created at runtime), so resolve on demand.
export const dynamic = "force-dynamic";

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ListingDetail id={id} />;
}
