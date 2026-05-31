// Centralized config. MYCELIA_SPEC §1/§19. Never hardcode key servers / package ids (CLAUDE.md).
// Reads from a provided env record so it works in Node (process.env) and the
// browser (import.meta.env). Secrets must NEVER be passed to the browser bundle.

export interface PublicConfig {
  suiNetwork: 'testnet' | 'mainnet' | 'devnet';
  suiFullnodeUrl: string;
  tatumSuiJsonRpc: string;
  walrusPublisher: string;
  walrusAggregator: string;
  privyAppId: string;
  myceliaPackageId: string;
  sealKeyServerIds: string[];
  sealThreshold: number;
  storageEpochs: number;
  renewThresholdEpochs: number;
  pollIntervalMs: number;
}

export interface ServerSecrets {
  privyAppSecret: string;
  tatumApiKey: string;
  tatumSuiGrpc: string;
  suiFaucetUrl: string;
  masterSuiAddress: string;
  masterSuiPrivkey: string;
}

export type EnvRecord = Record<string, string | undefined>;

function req(env: EnvRecord, key: string, fallback?: string): string {
  const v = env[key] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing required config: ${key}`);
  return v;
}
function opt(env: EnvRecord, key: string, fallback = ''): string {
  return env[key] ?? fallback;
}
function num(env: EnvRecord, key: string, fallback: number): number {
  const v = env[key];
  return v === undefined || v === '' ? fallback : Number(v);
}

export function loadPublicConfig(env: EnvRecord): PublicConfig {
  return {
    suiNetwork: (opt(env, 'SUI_NETWORK', 'testnet') as PublicConfig['suiNetwork']),
    suiFullnodeUrl: opt(env, 'SUI_FULLNODE_URL', 'https://fullnode.testnet.sui.io'),
    tatumSuiJsonRpc: opt(env, 'TATUM_SUI_JSONRPC', 'https://sui-testnet.gateway.tatum.io'),
    walrusPublisher: opt(env, 'WALRUS_PUBLISHER', 'https://publisher.walrus-testnet.walrus.space'),
    walrusAggregator: opt(env, 'WALRUS_AGGREGATOR', 'https://aggregator.walrus-testnet.walrus.space'),
    privyAppId: opt(env, 'PRIVY_APP_ID', opt(env, 'VITE_PRIVY_APP_ID')),
    myceliaPackageId: opt(env, 'MYCELIA_PACKAGE_ID'),
    sealKeyServerIds: opt(env, 'SEAL_KEY_SERVER_IDS')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    sealThreshold: num(env, 'SEAL_THRESHOLD', 2),
    storageEpochs: num(env, 'STORAGE_EPOCHS', 5),
    renewThresholdEpochs: num(env, 'RENEW_THRESHOLD_EPOCHS', 1),
    pollIntervalMs: num(env, 'POLL_INTERVAL_MS', 8000),
  };
}

/** Fail loud on misconfiguration (called at server/mcp startup, not in the browser). */
export function validatePublicConfig(c: PublicConfig): void {
  const errs: string[] = [];
  if (!c.myceliaPackageId) errs.push('MYCELIA_PACKAGE_ID is required');
  if (c.sealKeyServerIds.length === 0) errs.push('SEAL_KEY_SERVER_IDS is required');
  if (c.sealThreshold < 1) errs.push('SEAL_THRESHOLD must be >= 1');
  if (c.sealKeyServerIds.length > 0 && c.sealThreshold > c.sealKeyServerIds.length)
    errs.push(`SEAL_THRESHOLD (${c.sealThreshold}) exceeds key-server count (${c.sealKeyServerIds.length}) — decryption impossible`);
  if (errs.length) throw new Error('Invalid config:\n - ' + errs.join('\n - '));
}

export function loadServerSecrets(env: EnvRecord): ServerSecrets {
  return {
    privyAppSecret: opt(env, 'PRIVY_APP_SECRET'),
    tatumApiKey: opt(env, 'TATUM_API_KEY'),
    tatumSuiGrpc: opt(env, 'TATUM_SUI_GRPC', 'sui-testnet-grpc.gateway.tatum.io:443'),
    suiFaucetUrl: opt(env, 'SUI_FAUCET_URL', 'https://faucet.testnet.sui.io/v2/gas'),
    masterSuiAddress: opt(env, 'MASTER_SUI_ADDRESS'),
    masterSuiPrivkey: opt(env, 'MASTER_SUI_PRIVKEY'),
  };
}

export { req as requireEnv };
