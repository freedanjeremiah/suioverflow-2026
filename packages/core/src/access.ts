// Access layer — reach Sui reliably. MYCELIA_SPEC §1 (Tatum) / docs.md §3.
// Tatum is PRIMARY for every Sui RPC call (x-api-key header). The public fullnode
// is NOT a routing fallback — it is a capability shim: Tatum's gateway does not
// implement a few methods the SDK needs for writes (e.g. suix_getLatestSuiSystemState,
// which it uses to resolve the gas price). When Tatum answers a JSON-RPC -32601
// (Method not found), that single call is retried on the fullnode so transactions
// work; everything Tatum can answer stays on Tatum. The browser has no key (secrets
// never ship to the bundle) and instead targets the backend `/api/sui-rpc` proxy,
// which runs this same shim. Same client interface feeds Seal + Walrus.
import { SuiJsonRpcClient, JsonRpcHTTPTransport } from '@mysten/sui/jsonRpc';
import { requestSuiFromFaucetV2, getFaucetHost } from '@mysten/sui/faucet';

export interface AccessOptions {
  network: 'testnet' | 'mainnet' | 'devnet';
  tatumJsonRpcUrl?: string; // Tatum Sui JSON-RPC gateway, e.g. https://sui-mainnet.gateway.tatum.io
  tatumApiKey?: string; // Tatum x-api-key (server-side only)
  fullnodeUrl?: string; // capability shim only — answers methods Tatum returns -32601 for
  // Explicit RPC URL for the keyless path — used ONLY by the browser to reach the
  // backend Tatum proxy (which runs the shim). Ignored when a Tatum key is set.
  proxyUrl?: string;
}

/** fetch with exponential backoff on 429/5xx — Tatum free tier rate-limits bursts. */
function retryingFetch(maxRetries = 5): typeof fetch {
  return async (input: any, init?: any) => {
    let delay = 250;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(input, init);
      if (res.status !== 429 && res.status < 500) return res;
      if (attempt >= maxRetries) return res;
      await new Promise((r) => setTimeout(r, delay + Math.floor(delay * 0.3)));
      delay = Math.min(delay * 2, 4000);
    }
  };
}

/** True if a JSON-RPC response body carries a -32601 (Method not found) error. */
export function isMethodNotFound(text: string): boolean {
  try {
    const j = JSON.parse(text);
    const arr = Array.isArray(j) ? j : [j];
    return arr.some((x) => x && x.error && x.error.code === -32601);
  } catch {
    return false;
  }
}

/**
 * Tatum-primary fetch with a fullnode capability shim. POSTs to Tatum (x-api-key);
 * if Tatum returns a -32601 the same request is retried on `fullnodeUrl`. Tatum
 * stays primary for every method it actually implements.
 */
export function makeTatumFetch(tatumUrl: string, apiKey: string, fullnodeUrl?: string): typeof fetch {
  const base = retryingFetch();
  return async (_input: any, init?: any) => {
    const res = await base(tatumUrl, { ...init, headers: { ...(init?.headers ?? {}), 'x-api-key': apiKey } });
    if (!fullnodeUrl || !res.ok) return res;
    const text = await res.text();
    if (isMethodNotFound(text)) {
      return base(fullnodeUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: init?.body });
    }
    return new Response(text, { status: res.status, statusText: res.statusText, headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' } });
  };
}

/**
 * Build a Sui JSON-RPC client. Tatum is primary for every call; the fullnode acts
 * only as a -32601 capability shim (see makeTatumFetch). The keyless `proxyUrl`
 * path is reserved for the browser, whose proxy target runs the same shim.
 */
export function makeSuiClient(opts: AccessOptions): SuiJsonRpcClient {
  if (opts.tatumApiKey && opts.tatumJsonRpcUrl) {
    const transport = new JsonRpcHTTPTransport({
      url: opts.tatumJsonRpcUrl,
      fetch: makeTatumFetch(opts.tatumJsonRpcUrl, opts.tatumApiKey, opts.fullnodeUrl),
    });
    return new SuiJsonRpcClient({ network: opts.network, transport });
  }
  if (opts.proxyUrl) {
    return new SuiJsonRpcClient({
      network: opts.network,
      transport: new JsonRpcHTTPTransport({ url: opts.proxyUrl, fetch: retryingFetch() }),
    });
  }
  throw new Error('makeSuiClient: Tatum gateway not configured (set TATUM_API_KEY + TATUM_SUI_JSONRPC) and no proxyUrl given — refusing to fall back to a public fullnode');
}

export type SuiClient = SuiJsonRpcClient;

/** Request testnet SUI from the faucet (rate-limited; fail-soft). */
export async function faucet(
  network: 'testnet' | 'devnet',
  recipient: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await requestSuiFromFaucetV2({ host: getFaucetHost(network), recipient });
    if (res.status === 'Success') return { ok: true };
    return { ok: false, error: JSON.stringify(res.status) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
