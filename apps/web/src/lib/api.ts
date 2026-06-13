// Backend operator API client (auth/funding/daemon feed). Vite proxies /api -> :8787.
export interface PublicConfig {
  network: 'testnet' | 'mainnet' | 'devnet';
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
export interface Notification { id: number; session_id: string; kind: string; payload: string; ts: number; }

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

// Backend base URL. Empty in dev (Vite proxies /api -> :8787); on Vercel set
// VITE_API_URL=https://sharegraph.philotheephilix.in so the browser calls the VM.
const BASE = ((import.meta as any).env?.VITE_API_URL ?? '').replace(/\/$/, '');
const u = (path: string) => BASE + path;

// Sui JSON-RPC proxy on the backend — forwards to the Tatum gateway with the
// server-held x-api-key, so the browser uses Tatum without ever seeing the key.
export const rpcProxyUrl = () => u('/api/sui-rpc');

export const api = {
  config: () => fetch(u('/api/config')).then((r) => j<PublicConfig>(r)),
  health: () => fetch(u('/api/health')).then((r) => j<any>(r)),
  login: (body: { token?: string; privyUserId?: string }) =>
    fetch(u('/api/login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => j<LoginResult>(r)),
  watch: (id: string, body: { owner: string; name: string; endEpoch: number }) =>
    fetch(u(`/api/sessions/${id}/watch`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => j(r)),
  registerBlobs: (id: string, blobs: { blobObjectId: string; endEpoch: number; kind: string }[]) =>
    fetch(u(`/api/sessions/${id}/blobs`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ blobs }) }).then((r) => j(r)),
  notifications: (id: string, since = 0) =>
    fetch(u(`/api/sessions/${id}/notifications?since=${since}`)).then((r) => j<{ notifications: Notification[] }>(r)),
};
