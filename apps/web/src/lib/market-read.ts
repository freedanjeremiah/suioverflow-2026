"use client";

import { api, rpcProxyUrl } from "./api";
import type { ListingView } from "@mycelia/core";

// Read-only marketplace access — works logged-out (no signer needed to enumerate
// or read listings). The heavy SDK is dynamically imported so it stays off SSR.
async function readClient() {
  const config = await api.config();
  const { makeSuiClient, MarketClient } = await import("@mycelia/core");
  const client = makeSuiClient({ network: config.network, proxyUrl: rpcProxyUrl() });
  return new MarketClient(client, config.packageId);
}

export async function loadListings(): Promise<ListingView[]> {
  return (await readClient()).listListings(50);
}

export async function loadListing(id: string): Promise<ListingView | null> {
  return (await readClient()).getListing(id);
}
