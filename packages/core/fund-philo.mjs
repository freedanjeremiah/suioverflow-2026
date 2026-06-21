// Fund philo (SUI + WAL) from master so its MCP can create the session + write
// to Walrus. Run from packages/core (where @mysten/sui resolves) with env sourced:
//   set -a; source ../../.env; set +a; node fund-philo.mjs
import { Transaction } from '@mysten/sui/transactions';
import { loadPublicConfig, loadServerSecrets, makeSuiClient, keypairFromSecret, addressOf } from './dist/index.js';

const pub = loadPublicConfig(process.env);
const sec = loadServerSecrets(process.env);
const client = makeSuiClient({ network: pub.suiNetwork, tatumJsonRpcUrl: pub.tatumSuiJsonRpc, tatumApiKey: sec.tatumApiKey, fullnodeUrl: pub.suiFullnodeUrl });

const master = keypairFromSecret(process.env.MASTER_SUI_PRIVKEY.trim());
const masterAddr = addressOf(master);
const philo = addressOf(keypairFromSecret(process.env.MYCELIA_KEY.trim()));

const bal = async (who) => {
  const all = await client.getAllBalances({ owner: who });
  const sui = all.find((b) => b.coinType.endsWith('::sui::SUI'))?.totalBalance ?? '0';
  const wal = all.find((b) => /::wal::WAL$/i.test(b.coinType));
  return { sui, walType: wal?.coinType, wal: wal?.totalBalance ?? '0' };
};
const exec = async (tx, label) => {
  const r = await client.core.signAndExecuteTransaction({ transaction: tx, signer: master, include: { effects: true } });
  const t = r.Transaction;
  if (!t || (t.effects && !t.effects.status.success)) throw new Error(`${label}: ${JSON.stringify(t?.effects?.status ?? r.$kind)}`);
  await client.core.waitForTransaction({ digest: t.digest });
  console.log(label, 'ok', t.digest);
};

console.log('master', masterAddr); let mb = await bal(masterAddr); console.log('  SUI', mb.sui, '| WAL', mb.wal, mb.walType);
console.log('philo ', philo); let pb = await bal(philo); console.log('  SUI', pb.sui, '| WAL', pb.wal);

const SUI_T = 2_000_000_000n, WAL_T = 1_500_000_000n;

if (BigInt(pb.sui) < SUI_T) {
  const tx = new Transaction();
  const [c] = tx.splitCoins(tx.gas, [SUI_T]);
  tx.transferObjects([c], philo);
  await exec(tx, `SUI -> philo (${SUI_T})`);
} else console.log('philo SUI ok');

if (mb.walType && BigInt(pb.wal) < WAL_T) {
  const coins = await client.getCoins({ owner: masterAddr, coinType: mb.walType });
  const sorted = coins.data.sort((a, b) => (BigInt(b.balance) > BigInt(a.balance) ? 1 : -1));
  const send = BigInt(sorted[0].balance) > WAL_T ? WAL_T : (BigInt(sorted[0].balance) * 8n) / 10n;
  const tx = new Transaction();
  const [w] = tx.splitCoins(tx.object(sorted[0].coinObjectId), [send]);
  tx.transferObjects([w], philo);
  await exec(tx, `WAL -> philo (${send})`);
} else console.log('philo WAL ok or master has none');

pb = await bal(philo);
console.log('philo AFTER: SUI', pb.sui, '| WAL', pb.wal);
