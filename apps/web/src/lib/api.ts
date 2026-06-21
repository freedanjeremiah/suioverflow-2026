// Backend operator API client (auth/funding/daemon feed) — ported from the old
// Vite app. In Next the browser calls apps/server directly; set
// NEXT_PUBLIC_API_URL (default http://localhost:8787). Server CORS allows :5173.

export interface PublicConfig {
  network: "testnet" | "mainnet" | "devnet";
  fullnodeUrl: string;
  walrusAggregator: string;
  walrusPublisher: string;
  packageId: string;
  keyServerIds: string[];
  sealThreshold: number;
  storageEpochs: number;
  privyAppId: string;
  pollIntervalMs: number;
}
export interface LoginResult {
  address: string;
  seedHex: string;
  privyUserId: string;
  funded: { sui: string; wal: string; digest: string };
}
export interface Notification {
  id: number;
  session_id: string;
  kind: string;
  payload: string;
  ts: number;
}
export interface HealthResult {
  ok: boolean;
  master: string; // the ask-service / master operator address
  privy: boolean;
  devLogin: boolean;
}

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

// apps/server base URL. In dev the server runs on :8787; override per-deploy with
// NEXT_PUBLIC_API_URL (e.g. https://sharegraph.philotheephilix.in).
const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787").replace(/\/$/, "");
const u = (path: string) => BASE + path;

// Sui JSON-RPC proxy on the backend — forwards to Tatum with the server-held
// x-api-key, so the browser uses Tatum without ever seeing the key.
export const rpcProxyUrl = () => u("/api/sui-rpc");

export const api = {
  config: () => fetch(u("/api/config")).then((r) => j<PublicConfig>(r)),
  health: () => fetch(u("/api/health")).then((r) => j<HealthResult>(r)),
  login: (body: { token?: string; privyUserId?: string }) =>
    fetch(u("/api/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => j<LoginResult>(r)),
  watch: (id: string, body: { owner: string; name: string; endEpoch: number }) =>
    fetch(u(`/api/sessions/${id}/watch`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => j<unknown>(r)),
  registerBlobs: (id: string, blobs: { blobObjectId: string; endEpoch: number; kind: string }[]) =>
    fetch(u(`/api/sessions/${id}/blobs`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blobs }),
    }).then((r) => j<unknown>(r)),
  notifications: (id: string, since = 0) =>
    fetch(u(`/api/sessions/${id}/notifications?since=${since}`)).then((r) =>
      j<{ notifications: Notification[] }>(r),
    ),
};
