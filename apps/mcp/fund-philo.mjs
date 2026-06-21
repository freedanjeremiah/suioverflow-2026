// Fund philo's account (SUI + WAL) from the master so its MCP can write to Walrus.
import 'dotenv/config';
import { Transaction } from '@mysten/sui/transactions';
import { loadPublicConfig, loadServerSecrets, makeSuiClient, keypairFromSecret, addressOf } from '@mycelia/core';

const pub = loadPublicConfig(process.env);
const sec = loadServerSecrets(process.env);
const client = makeSuiClient({ network: pub.suiNetwork, tatumJsonRpcUrl: pub.tatumSuiJsonRpc, tatumApiKey: sec.tatumApiKey, fullnodeUrl: pub.suiFullnodeUrl });

const master = keypairFromSecret(process.env.MASTER_SUI_PRIVKEY.trim());
const masterAddr = addressOf(master);
// philo = whoever MYCELIA_KEY now points at (we wrote it via derive-philo.mjs)
const philo = addressOf(keypairFromSecret(process.env.MYCELIA_KEY.trim()));

const balances = async (who) => {
  const all = await client.getAllBalances({ owner: who });
  const sui = all.find((b) => b.coinType.endsWith('::sui::SUI'))?.totalBalance ?? '0';
  const wal = all.find((b) => /::wal::WAL$/i.test(b.coinType));
  return { sui, walType: wal?.coinType, wal: wal?.totalBalance ?? '0' };
};

console.log('master', masterAddr);
let mb = await balances(masterAddr); console.log('  SUI', mb.sui, '| WAL', mb.wal, mb.walType ?? '(none)');
console.log('philo ', philo);
let pb = await balances(philo); console.log('  SUI', pb.sui, '| WAL', pb.wal, pb.walType ?? '(none)');

const exec = async (tx, label) => {
  const r = await client.core.signAndExecuteTransaction({ transaction: tx, signer: master, include: { effects: true } });
  const t = r.Transaction;
  if (!t || (t.effects && !t.effects.status.success)) throw new Error(`${label} failed: ${JSON.stringify(t?.effects?.status ?? r.$kind)}`);
  await client.core.waitForTransaction({ digest: t.digest });
  console.log(label, 'ok', t.digest);
};

const SUI_TARGET = 2_000_000_000n; // 2 SUI
const WAL_TARGET = 1_000_000_000n; // 1 WAL

// 1) SUI top-up (split from gas)
if (BigInt(pb.sui) < SUI_TARGET) {
  const tx = new Transaction();
  const [c] = tx.splitCoins(tx.gas, [SUI_TARGET]);
  tx.transferObjects([c], philo);
  await exec(tx, 'SUI transfer 2 SUI');
} else console.log('philo SUI sufficient');

// 2) WAL top-up (split from the master's largest WAL coin)
if (mb.walType && BigInt(pb.wal) < WAL_TARGET) {
  const coins = await client.getCoins({ owner: masterAddr, coinType: mb.walType });
  const sorted = coins.data.sort((a, b) => (BigInt(b.balance) > BigInt(a.balance) ? 1 : -1));
  if (!sorted.length) { console.log('master has no WAL coins to send'); }
  else {
    const send = BigInt(sorted[0].balance) > WAL_TARGET ? WAL_TARGET : BigInt(sorted[0].balance) / 2n;
    const tx = new Transaction();
    const src = tx.object(sorted[0].coinObjectId);
    const [w] = tx.splitCoins(src, [send]);
    tx.transferObjects([w], philo);
    await exec(tx, `WAL transfer ${send}`);
  }
} else if (!mb.walType) console.log('master has NO WAL — cannot fund philo WAL (Walrus writes will fail)');
else console.log('philo WAL sufficient');

pb = await balances(philo);
console.log('philo AFTER: SUI', pb.sui, '| WAL', pb.wal);
