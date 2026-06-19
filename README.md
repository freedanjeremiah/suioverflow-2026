[![Docs](https://img.shields.io/badge/Docs-sharegraph.vercel.app-6e56cf?style=for-the-badge)](https://sharegraph.vercel.app/#docs)
[![Demo Video](https://img.shields.io/badge/Demo_Video-Watch-ff4d4d?style=for-the-badge)](https://canva.link/ribg9baxw5472rr)

# Sui Overflow Project

**A local-first, end-to-end-encrypted, multi-party memory graph for AI agents.**

📖 [Docs](https://sharegraph.vercel.app/#docs) · 🎬 [Demo video](https://canva.link/ribg9baxw5472rr)

Your AI agent already remembers you — but that memory is a silo. Mycelia turns it into a
**graph** (skills, projects, people, ideas, and how they connect) and lets you **graft a slice**
of that graph — a node and its *d*-hop neighborhood — into a shared, encrypted **session** with
other people and their agents. The slice stays **alive**: when an owner expands a shared node,
every participant sees it. Everything is **end-to-end encrypted**, **owner-attributed on-chain**,
and **hosted by no one**.

**Demo video:** `mycelia-demo.mp4` (recorded against a live network) — **On-chain:** deployed on **Sui mainnet**.

---

## 60-second pitch

| | |
|---|---|
| **Problem** | Agent memory is siloed. Sharing what your agent knows means copy-paste (dead, stale) or a shared doc (no structure, no ownership, no liveness). Centralized "shared memory" means **someone hosts it, can read it, and can delete it**. |
| **Solution** | Share a *graph slice*, not a document. Live propagation, verifiable ownership, encrypted by **policy** (not by recipient), no central host. |
| **What's novel** | The graph **builds itself** from conversation + **graph-native sharing with depth as a first-class control** + **encrypt-by-policy** so membership can change with **zero re-encryption** + a clean **four-layer separation of concerns** mapped onto Walrus / Seal / Sui / Tatum. |
| **Proof it's real** | `mycelia::session` Move package **deployed on Sui mainnet**; in-browser Seal encrypt + Walrus publish; cross-party decrypt and live realtime propagation verified end-to-end between two real wallets. |

---

## How the graph builds itself

You never draw the graph by hand. As you talk to your agent in Claude Code, it calls the
`remember` tool to extract durable facts from the conversation and upsert them as **typed nodes
and edges** in a private local graph (SQLite, on your device). The graph grows passively, as a
side effect of working — it is the raw material everything else operates on.

- **Every memory becomes a typed node** — `skill` · `project` · `person` · `concept` ·
  `communication` — with a title, body, an `importance` score (`0..1`, which drives spore size in
  the visualizer), and tags.
- **Relations become typed edges** — `uses`, `authored`, `relates`, `partOf`, … When a new memory
  references one that already exists, the agent links them by title or id, so the graph **densifies
  as you work** instead of staying a flat list.
- **`recall` is the reverse path** — a lexical match plus a *d*-hop neighborhood walk returns a
  ranked subgraph for the agent to reason over, so context comes back *structured*, not as a blob.
- **Capture is always-on and fully private.** Nothing leaves the device at this stage. The graph is
  yours until you explicitly **graft a slice** into a session.

The result is a living map of what your agent knows about you — accumulated automatically from
conversation — that becomes the input to selective, encrypted, on-chain sharing.

```
  conversation in Claude Code
        │  remember(title, body, type, importance, tags, links)
        ▼
  private local graph (SQLite)
    nodes (typed, owner-attributed)  ──edges (typed relations)──►  denser graph over time
        │  recall(query, depth)  → ranked d-hop subgraph
        ▼
  share@depth  →  encrypt → publish → on-chain policy  (the rest of this README)
```

---

## The four-layer architecture

Each layer answers **exactly one question**. Keeping them separate is the core design invariant —
no layer is allowed to do another's job.

| Layer | Answers | Tech | Where |
|---|---|---|---|
| **Storage** | Is the data available? | **Walrus** (decentralized blobs + Quilt batching) | `packages/core/src/storage.ts` |
| **Confidentiality** | Who may decrypt it? | **Seal** (identity-based encryption + threshold key servers + on-chain policy) | `packages/core/src/crypto.ts` |
| **Coordination** | What is current truth & who's allowed? | **Sui** (`Session` Move object + policy) | `packages/core/src/chain.ts` + `move/` |
| **Access** | How do we reach Sui reliably? | **Tatum** Sui gRPC (with public fullnode fallback) | `packages/core/src/access.ts` |

```
   AGENT (Claude Code / browser)
        │  remember · share@depth · reveal · expand
        ▼
   ┌─────────────────────── on device ───────────────────────┐
   │  local graph (SQLite, never leaves)                      │
   │  NodeVersion ── Seal.encrypt ──► ciphertext              │  ← encrypt BEFORE publish, always
   └──────────────────────────┬──────────────────────────────┘
                              ▼
        Walrus  ◄── ciphertext blobs (owner = the user's wallet)
          │
        Sui Session object  ◄── manifest head pointer + shared-node policy
          │                      (the ONLY mutable shared object)
        Seal seal_approve  ◄── Move gate: member? AND node shared? AND right session?
```

---

## How it works (the write & read paths)

**Sharing a node** (`share` at depth *d*):

1. **Build** a `NodeVersion` from the local graph — the root and its *d*-hop neighborhood.
2. **Encrypt** each version with Seal to an identity that encodes *which policy gate must pass*
   (`sealId = sessionId ++ blake2b256(nodeId)`).
3. **Publish** the ciphertext to Walrus, Quilt-batched, with `send_object_to = ownerAddress` —
   so the **Walrus Blob object's owner is the user**, not us.
4. **Policy** — add the node's seal identity to the Sui `Session.shared_nodes`.
5. **Manifest + event log** — rebuild the (also encrypted) manifest, bump the on-chain head version,
   append an event so every participant's daemon notices on next poll.

**Revealing a node** (`reveal`):

1. Read the session head from Sui → fetch + decrypt the manifest (needs membership) → graph structure.
2. Create a wallet-signed `SessionKey` (TTL'd), build the `seal_approve` transaction, ask the
   threshold key servers for key shares.
3. The Move `seal_approve` gate asserts: caller is a member **AND** the node's identity is in
   `shared_nodes` **AND** the identity carries this session's prefix. Abort = deny.
4. Below threshold or denied → **fail closed**. `NoAccessError` means "no access," never a retry.

**Revocation is forward-only — and we say so.** Removing a member or un-sharing a node blocks
*future* key issuance. It does **not** retract copies already decrypted on someone's device.
We never claim hard delete.

---

## Security model & invariants

These are asserted in code and tests, not just documented:

1. **No cleartext leaves the device** except the session-head pointer (blob IDs + a version integer).
2. **Exactly one mutable shared object per session** — the Sui `Session`; everything else is
   immutable, versioned blobs.
3. **Storage is rented per epoch** and must be renewed, or data is lost — the daemon owns renewal.
4. **Revocation is forward-only.** No UX or comment ever claims hard delete.
5. **Single-writer per node** — only the owner publishes new versions.
6. **Owner = the Walrus Blob object's owner** — always `send_object_to = owner` on publish.
7. **Encrypt before publish, always** — a publish path that can emit plaintext is a bug
   (ciphertext is asserted before the PUT).

**What the operator can and cannot do:** the backend holds one funded "master" wallet that
transfers gas + WAL to a user on first login *so the user pays for, and owns, their own storage*.
The master wallet **never holds content keys** and **cannot decrypt** anything — decryption requires
a user-wallet-signed `SessionKey`, a threshold of independent Seal key servers, and a passing
on-chain `seal_approve`.

---

## Anticipated judge questions (and our answers)

**[Technical] "Where does encryption actually happen — client or server?"**
On the device, before anything is published. Seal IBE in `packages/core/src/crypto.ts`; we assert
the payload is ciphertext before the Walrus PUT. The server never sees plaintext.

**[Technical] "Then what stops *you* from reading users' memories?"**
We can't. The master wallet only funds gas/WAL. Decryption needs (a) a `SessionKey` signed by the
*user's* wallet, (b) key shares from a *threshold* of independent Seal key servers, and (c) a passing
Move `seal_approve`. Miss any one → fail closed.

**[Technical] "Is this really on-chain, or a slide?"**
Deployed on Sui mainnet: the `mycelia::session` Move module with a `seal_approve` policy gate, backed
by 7 passing Move tests. The package id lives in `MYCELIA_PACKAGE_ID`.

**[Impact] "Can you really 'unshare'? Isn't that fake delete?"**
We're explicit that it isn't a delete — it's **forward-only revocation**. Removing a member or
un-sharing a node blocks future key issuance; copies already pulled stay on that device. We chose
honesty over a misleading "delete" button, and the UI says so.

**[Impact] "Why decentralized instead of a Postgres row with ACLs?"**
Because the threat we're removing is *the host itself* — a central store can read, delete, censor, and
is a single point of failure. Mycelia has no host: blobs live on Walrus, policy on Sui, keys split
across independent servers. The graph survives any one participant (or us) going offline.

**[Skeptic] "In-browser Walrus writes — mocked, or do they really land?"**
Verified end-to-end in a real browser: Seal-encrypt + Walrus publish reaching the storage threshold,
then cross-party decrypt of the result. If the in-browser WASM write ever fails, we fall back to a
publisher PUT with `send_object_to = user` — owner stays the user either way.

**[Skeptic] "Did two real wallets actually exchange a memory live?"**
Yes. In the realtime test, user B joins a session by ID, decrypts user A's node (cross-party), then
A publishes a new node and **B's canvas auto-updates 3→4 spores with no manual refresh** — the
daemon poll detects the on-chain head bump and re-syncs.

**[Skeptic] "What's *not* done?"** (we'd rather you hear it from us)
The daemon can't *extend* user-owned blobs (only the owner can) — it emits a `renewal_needed`
signal and the owner renews via the UI. The Tatum gRPC gateway is opt-in (`PREFER_TATUM`) because
the free tier rate-limits; the default access path is the public Sui fullnode.

---

## Tech stack

- **Language / runtime:** TypeScript, Node ≥ 20, pnpm workspaces monorepo.
- **Chain & crypto SDKs:** `@mysten/sui`, `@mysten/walrus` (+ `@mysten/walrus-wasm`), `@mysten/seal`,
  `@noble/hashes`.
- **Smart contract:** Move 2024 (`mycelia::session`), deployed on Sui mainnet.
- **Backend:** Fastify + WebSocket, `@privy-io` token verification, `better-sqlite3`, Tatum Sui gRPC.
- **Web:** React 18, Vite 6, Zustand, TanStack Query, `@privy-io/react-auth`, in-browser Walrus + Seal.
  Bioluminescent "living mycelium" canvas — glowing spores (nodes), drifting hyphae (edges),
  deterministic per-owner colors, deliberately **not blue**.
- **Agent integration:** Model Context Protocol stdio server (`apps/mcp`) — drops straight into
  Claude Code.
- **Auth bridge:** Privy embedded wallet → Sui `Ed25519Keypair` for tx signing *and* Seal SessionKey
  signing.

---

## Repository layout

```
mycelia/  (repo: sharegraph)
├─ packages/core/      framework-agnostic engine: graph, storage, crypto, chain,
│                      access, identity, manifest, events, service, funding
├─ apps/server/        Fastify API: login + master-wallet funding, watch, notifications
├─ apps/web/           React visualizer + sharing/management UI (in-browser Sui/Walrus/Seal)
├─ apps/mcp/           MCP server + poll/renew daemon for Claude Code
├─ move/               mycelia::session Move module + tests (deployed to mainnet)
└─ test/               unit + Move + Playwright E2E (single-user, multi-party, realtime, Privy)
```

---

## Quickstart

**Prerequisites:** Node ≥ 20, `pnpm`, and a funded Sui mainnet wallet (for the master funder).

```bash
pnpm install
cp .env.example .env          # fill in the values below
```

Required env (`.env`):

| Key | What |
|---|---|
| `SUI_NETWORK` | `mainnet` for submission (`testnet` for local dev) |
| `MYCELIA_PACKAGE_ID` | Deployed Move package id (or publish your own with `pnpm move:publish`) |
| `SEAL_KEY_SERVER_IDS` | Comma-separated allowlisted Seal key-server object IDs (mainnet) |
| `SEAL_THRESHOLD` | Key-server threshold (default `2`; must be ≤ key-server count) |
| `MASTER_SUI_ADDRESS` / `MASTER_SUI_PRIVKEY` | Funded operator wallet (funds users' gas + WAL) |
| `PRIVY_APP_ID` / `PRIVY_APP_SECRET` | Privy auth (dev-login fallback exists if the secret is absent) |
| `WALRUS_PUBLISHER` / `WALRUS_AGGREGATOR` | Walrus mainnet endpoints |

```bash
# one-time setup
pnpm setup:master      # provision the master funder wallet
pnpm move:publish      # publish the Move package → sets MYCELIA_PACKAGE_ID

# run
pnpm dev               # server + web together
pnpm dev:web           # web only  (http://localhost:5173)
pnpm dev:server        # server only

# verify
pnpm test              # all tests
pnpm test:unit         # core unit tests
pnpm typecheck
```

**Use it from Claude Code (MCP):** point your MCP host at `apps/mcp` (see `apps/mcp/mcp.example.json`).
The server exposes these tools:

```
remember · recall · create_session · share · join · sync
reveal · expand · add_member · remove_member · unshare · renew
```

---

## Status & verification

| Area | State |
|---|---|
| Storage round-trip (Walrus + Quilt) | verified |
| Seal encrypt/decrypt + `seal_approve` policy, fail-closed | verified |
| Move module deployed + tests | 7 Move tests green; package live on Sui mainnet |
| Core engine | 12 unit tests green |
| Single-user E2E (login → graft → reveal → capture) | PASS in-browser, 0 real console errors |
| Multi-party + real Privy login | PASS (cross-party decrypt; OTP login bridged to funded wallet) |
| Live 2-user realtime propagation | PASS (B's canvas auto-updates on A's publish) |
| Full browser wiring sweep (every control → real backend action) | PASS |

> Flows were validated end-to-end on testnet first; the submission build targets Sui mainnet
> (`SUI_NETWORK=mainnet` + mainnet Walrus/Seal endpoints + a mainnet `MYCELIA_PACKAGE_ID`).

---

## Non-goals (v1, on purpose)

Real-time sub-second collaboration · true hard-delete of already-shared data · cross-chain (Sui only)
· automatic multi-writer merge of a single node (single-writer-per-node removes the need).

---

## License

MIT — see [`LICENSE`](LICENSE).
