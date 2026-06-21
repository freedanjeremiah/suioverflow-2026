"use client";

import type { GraphResponse } from "./api-types";

// Thin browser client for the app's own Route Handlers (same-origin /api).
// (Marketplace + sharing now go on-chain via @mycelia/core, not these routes.)

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export function getGraph(): Promise<GraphResponse> {
  return fetch("/api/graph").then((r) => json<GraphResponse>(r));
}
