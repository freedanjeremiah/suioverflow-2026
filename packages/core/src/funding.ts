// Master -> user wallet funding. MYCELIA_SPEC §19: master faucet-funds itself,
// then transfers gas (SUI) + WAL so each user pays for + owns their own memories.
import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import type { Signer } from '@mysten/sui/cryptography';
import type { SuiClient } from './access.js';
import type { SuiAddress } from './types.js';

/** Find the WAL coin type held by `owner` (testnet WAL package id varies). */
export async function discoverWalType(client: SuiClient, owner: SuiAddress): Promise<string | undefined> {
  const { balances } = await client.core.listBalances({ owner });
  return balances.find((b) => /::wal::WAL$/i.test(b.coinType))?.coinType;
}

export async function balanceOf(client: SuiClient, owner: SuiAddress, coinType = '0x2::sui::SUI'): Promise<bigint> {
  const b = await client.core.getBalance({ owner, coinType });
  return BigInt(b.balance?.balance ?? '0');
}

export interface FundResult {
  digest: string;
  fundedSui: bigint;
  fundedWal: bigint;
}

/**
 * Transfer `suiMist` SUI and `walAmount` WAL from the master to `recipient`,
 * skipping a coin if the recipient is already above `minSui`/`minWal`.
 */
export async function fundAddress(
  client: SuiClient,
  master: Signer,
  masterAddress: SuiAddress,
  recipient: SuiAddress,
  opts: { suiMist: bigint; walAmount: bigint; minSui?: bigint; minWal?: bigint },
): Promise<FundResult> {
  const walType = await discoverWalType(client, masterAddress);
  const curSui = await balanceOf(client, recipient);
  const curWal = walType ? await balanceOf(client, recipient, walType) : 0n;
  // master must keep gas headroom; only fund a coin it can actually cover
  const masterSui = await balanceOf(client, masterAddress);
  const masterWal = walType ? await balanceOf(client, masterAddress, walType) : 0n;
  const GAS_RESERVE = 20_000_000n; // ~0.02 SUI kept for master's own gas

  const needSui = curSui < (opts.minSui ?? opts.suiMist) && masterSui > opts.suiMist + GAS_RESERVE;
  const needWal = !!walType && curWal < (opts.minWal ?? opts.walAmount) && masterWal >= opts.walAmount;
  if (!needSui && !needWal) return { digest: '', fundedSui: 0n, fundedWal: 0n };

  const tx = new Transaction();
  let fundedSui = 0n;
  let fundedWal = 0n;
  if (needSui) {
    tx.transferObjects([tx.add(coinWithBalance({ balance: opts.suiMist }))], recipient);
    fundedSui = opts.suiMist;
  }
  if (needWal && walType) {
    tx.transferObjects([tx.add(coinWithBalance({ type: walType, balance: opts.walAmount }))], recipient);
    fundedWal = opts.walAmount;
  }
  (client as any).cache?.clear?.();
  const r = await client.core.signAndExecuteTransaction({ transaction: tx, signer: master, include: { effects: true } });
  const t = r.$kind === 'Transaction' ? r.Transaction : undefined;
  if (!t || (t.effects && !t.effects.status.success)) {
    throw new Error(`fundAddress failed: ${JSON.stringify((r as any).FailedTransaction?.effects?.status?.error ?? r.$kind)}`);
  }
  await client.core.waitForTransaction({ digest: t.digest });
  return { digest: t.digest, fundedSui, fundedWal };
}

/** Sweep a wallet's SUI (minus a gas reserve) + all WAL to `recipient`. */
export async function sweepTo(
  client: SuiClient,
  signer: Signer,
  signerAddress: SuiAddress,
  recipient: SuiAddress,
  gasReserve = 10_000_000n,
): Promise<{ sentSui: bigint; sentWal: bigint; digest: string }> {
  const walType = await discoverWalType(client, signerAddress);
  const sui = await balanceOf(client, signerAddress);
  const wal = walType ? await balanceOf(client, signerAddress, walType) : 0n;
  const sendSui = sui > gasReserve ? sui - gasReserve : 0n;
  if (sendSui <= 0n && wal <= 0n) return { sentSui: 0n, sentWal: 0n, digest: '' };
  const tx = new Transaction();
  if (wal > 0n && walType) tx.transferObjects([tx.add(coinWithBalance({ type: walType, balance: wal }))], recipient);
  if (sendSui > 0n) tx.transferObjects([tx.add(coinWithBalance({ balance: sendSui }))], recipient);
  (client as any).cache?.clear?.();
  const r = await client.core.signAndExecuteTransaction({ transaction: tx, signer, include: { effects: true } });
  const t = r.$kind === 'Transaction' ? r.Transaction : null;
  if (!t || (t.effects && !t.effects.status.success)) throw new Error(`sweep failed: ${JSON.stringify((r as any).FailedTransaction?.effects?.status?.error ?? r.$kind)}`);
  await client.core.waitForTransaction({ digest: t.digest });
  return { sentSui: sendSui, sentWal: wal, digest: t.digest };
}
