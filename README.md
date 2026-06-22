[![Live App](https://img.shields.io/badge/Live_App-mycelium--ashy.vercel.app-6e56cf?style=for-the-badge)](https://mycelium-ashy.vercel.app/)
[![Demo Video](https://img.shields.io/badge/Demo_Video-Watch-ff4d4d?style=for-the-badge)](https://canva.link/qp1fmm8cgbbkrs7)
[![Sui Mainnet](https://img.shields.io/badge/Sui-Mainnet-4da2ff?style=for-the-badge)](https://suiscan.xyz/mainnet/object/0x76768f18e5c5b20a53b7ef34d54f8cafd8a7fe1b14573b93b372436492cc0c83)
[![Sui Testnet](https://img.shields.io/badge/Sui-Testnet-6fbcf0?style=for-the-badge)](https://suiscan.xyz/testnet/object/0x9e0527c0a6b090c575bdccbd5ed3301ce67138e9429c4f24aeade54b204ac9c0)

# Mycelium — Sui Overflow Project

**A local-first, end-to-end-encrypted, multi-party memory graph for AI agents — with an on-chain marketplace.**

🌐 [Live app](https://mycelium-ashy.vercel.app/) · 🎬 [Demo video](https://canva.link/qp1fmm8cgbbkrs7) · ⛓️ Deployed on **Sui mainnet** *and* **Sui testnet**

Your AI agent already remembers you — but that memory is a silo. Mycelium turns it into a
**graph** (skills, projects, people, ideas, and how they connect) and lets you **graft a slice**
of that graph — a node and its *d*-hop neighborhood — into a shared, encrypted **session** with
other people and their agents. The slice stays **alive**: when an owner expands a shared node,
every participant sees it. You can also **list a graph for sale** on-chain — buyers join the
session by paying, and anyone can **ask questions of a listing** through a server-bridged LLM.
Everything is **end-to-end encrypted**, **owner-attributed on-chain**, and **hosted by no one**.

**On-chain:** `mycelia::session` + `mycelia::marketplace` Move modules, package
[`0x76768f…cc0c83`](https://suiscan.xyz/mainnet/object/0x76768f18e5c5b20a53b7ef34d54f8cafd8a7fe1b14573b93b372436492cc0c83) on **Sui mainnet**.

---

## 60-second pitch

| | |
|---|---|
| **Problem** | Agent memory is siloed. Sharing what your agent knows means copy-paste (dead, stale) or a shared doc (no structure, no ownership, no liveness). Centralized "shared memory" means **someone hosts it, can read it, and can delete it**. |
| **Solution** | Share a *graph slice*, not a document. Live propagation, verifiable ownership, encrypted by **policy** (not by recipient), no central host — plus an on-chain marketplace to monetize a graph. |
| **What's novel** | The graph **builds itself** from conversation + **graph-native sharing with depth as a first-class control** + **encrypt-by-policy** so membership can change with **zero re-encryption** + a clean **four-layer separation of concerns** mapped onto Walrus / Seal / Sui / Tatum + an **escrow-based marketplace** where purchase = membership. |
| **Proof it's real** | `mycelia::session` and `mycelia::marketplace` Move modules **deployed on Sui mainnet**; in-browser Seal encrypt + Walrus publish; cross-party decrypt and live realtime propagation verified end-to-end between two real wallets; a public Next.js app at [mycelium-ashy.vercel.app](https://mycelium-ashy.vercel.app/). |

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
  share@depth  →  encrypt → publish → on-chain policy  →  (optional) list for sale
```

---

## The four-layer architecture

Each layer answers **exactly one question**. Keeping them separate is the core design invariant —
no layer is allowed to do another's job.

| Layer | Answers | Tech | Where |
|---|---|---|---|
| **Storage** | Is the data available? | **Walrus** (decentralized blobs + Quilt batching) | `packages/core/src/storage.ts` |
| **Confidentiality** | Who may decrypt it? | **Seal** (identity-based encryption + threshold key servers + on-chain policy) | `packages/core/src/crypto.ts` |
| **Coordination** | What is current truth & who's allowed? | **Sui** (`Session` + `Listing` Move objects + policy) | `packages/core/src/chain.ts` · `packages/core/src/market.ts` · `move/` |
| **Access** | How do we reach Sui reliably? | **Tatum** Sui gRPC (with public fullnode fallback + server RPC proxy) | `packages/core/src/access.ts` |

```
   AGENT (Claude Code / browser)
        │  remember · share@depth · reveal · expand · list · purchase · ask
        ▼
   ┌─────────────────────── on device ───────────────────────┐
   │  local graph (SQLite, never leaves)                      │
   │  NodeVersion ── Seal.encrypt ──► ciphertext              │  ← encrypt BEFORE publish, always
   └──────────────────────────┬──────────────────────────────┘
                              ▼
        Walrus  ◄── ciphertext blobs (owner = the user's wallet)
          │
        Sui Session object  ◄── manifest head pointer + shared-node policy
          │                      (the ONLY mutable shared object per session)
        Sui Listing object  ◄── escrows SessionCap; purchase() adds buyer as member
          │
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

**Listing & buying a graph** (`list_for_sale` / `purchase`):

1. The owner **lists** a session: a `Listing` shared object **escrows the `SessionCap`** and stores
   `owner`, `price`, `title`, `blurb`. The ask-service (server master wallet) is added as a member
   so the listing can be queried.
2. Anyone can **ask** a listing via `POST /api/listings/:id/ask` — the server (holding the ask-service
   membership) decrypts the graph and answers through an LLM (OpenAI when configured, lexical fallback otherwise).
3. A **buyer** pays SUI to `purchase`; the escrowed `SessionCap` adds the buyer as a `Session` member,
   so they can now decrypt and `expand` the graph themselves.

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
8. **Purchase = membership** — the marketplace never moves plaintext; buying a listing only adds the
   buyer to the on-chain member set, after which normal Seal-gated decryption applies.

**What the operator can and cannot do:** the backend holds one funded "master" wallet that
transfers gas + WAL to a user on first login *so the user pays for, and owns, their own storage*.
The master wallet **never holds content keys** and **cannot decrypt** anything — decryption requires
a user-wallet-signed `SessionKey`, a threshold of independent Seal key servers, and a passing
on-chain `seal_approve`. (The one exception is the ask-service: an owner *explicitly* lists a graph
and adds the ask-service as a member, opting that specific graph into public Q&A.)

---

## Repository layout

```
suioverflow-2026/  (product: Mycelium)
├─ packages/core/      framework-agnostic engine: graph, storage, crypto, chain, market,
│                      access, identity, manifest, events, service, funding
├─ apps/server/        Fastify API: login + master-wallet funding, RPC proxy, watch,
│                      notifications, and the marketplace "ask" (LLM-over-listing) endpoint
├─ apps/web/           Next.js 16 / React 19 app: 3D graph explorer, sharing UI, marketplace
├─ apps/mcp/           MCP server + poll/renew daemon for Claude Code (stdio + HTTP bridge)
├─ move/               mycelia::session + mycelia::marketplace Move modules (deployed to mainnet)
└─ test/              unit + Move + Playwright E2E (single-user, multi-party, realtime, Privy)
```

### `packages/core` — the engine (`packages/core/src/index.ts`)

| Module | Key exports | Role |
|---|---|---|
| `chain.ts` | `SessionClient` | Session create / add·remove member / share·unshare / set head / `seal_approve` tx |
| `market.ts` | `MarketClient` | `listForSale`, `purchase`, `listListings`, `getListing` |
| `service.ts` | `Mycelia` | Orchestration: `createSession`, `findPersonalSession`, `loadFullGraph`, `putNode`, `shareSlice`, `reveal` |
| `crypto.ts` | `Crypto`, `SessionKey`, `NoAccessError`, `sealIdBytes/Hex` | Seal IBE encrypt/decrypt + identity construction |
| `storage.ts` | `Storage` | Walrus publish / Quilt / read / extend / delete |
| `access.ts` | `makeSuiClient`, fullnode fallback | Sui RPC (Tatum-primary) |
| `identity.ts` | `keypairFromSecret`, `ownerColor` | Ed25519 keypairs + deterministic per-owner palette |

### `apps/server` — Fastify backend (`apps/server/src/index.ts`)

| Route | Method | Purpose |
|---|---|---|
| `/api/health` | GET | Status, master address, Privy/dev-login flags |
| `/api/config` | GET | Public config (network, package id, key servers — no secrets) |
| `/api/sui-rpc` | POST | Sui JSON-RPC proxy (hides the Tatum key from the browser; fullnode fallback) |
| `/api/login` | POST | Privy token → Sui keypair bridge; funds the user's gas + WAL |
| `/api/sessions/:id/watch` | POST | Register a session for daemon renewal polling |
| `/api/sessions/:id/blobs` | POST | Register published blob refs for renewal tracking |
| `/api/sessions/:id/notifications` | GET | Poll daemon-detected changes |
| `/api/listings/:id/ask` | POST | Ask an LLM over a listed graph (master decrypts via ask-service membership) |

### `apps/mcp` — MCP tools for Claude Code (`apps/mcp/src/server.ts`)

```
mycelia_remember · mycelia_recall · mycelia_create_session · mycelia_share · mycelia_join
mycelia_sync · mycelia_reveal · mycelia_expand · mycelia_add_member · mycelia_remove_member
mycelia_unshare · mycelia_renew
```

Runs over stdio (drops straight into Claude Code) or as an HTTP bridge.

### `apps/web` — Next.js app (`apps/web`)

- **Stack:** Next.js 16, React 19, `@privy-io/react-auth` v3 (email login), TanStack Query, Zustand,
  `react-force-graph-3d` + `three` + `d3-force-3d`, Tailwind CSS 4, in-browser `@mysten/walrus` (+ WASM) and `@mysten/seal`.
- **Routes:** `/` (landing) · `/graph` (3D explorer + share controls) · `/market` (listing browser) ·
  `/market/[id]` (listing detail + ask) · `/pitch` · `/api/graph` (seed graph route).
- **State:** a Zustand store (`src/lib/store.ts`) mirrors the personal Walrus session and drives the
  bioluminescent "living mycelium" canvas — glowing spores (nodes), drifting hyphae (edges),
  deterministic per-owner colors, deliberately **not blue**.

### `move/` — on-chain modules

- **`mycelia::session`** — `Session` shared object (members, `shared_nodes` Seal allowlist, head
  pointer, event blob), `SessionCap`, and the `seal_approve` decryption gate.
- **`mycelia::marketplace`** — `Listing` shared object that escrows a `SessionCap`; `list_for_sale`
  and `purchase` (purchase adds the buyer as a session member).

---

## Tech stack

- **Language / runtime:** TypeScript, Node ≥ 20, pnpm workspaces monorepo.
- **Chain & crypto SDKs:** `@mysten/sui`, `@mysten/walrus` (+ `@mysten/walrus-wasm`), `@mysten/seal`,
  `@mysten/bcs`, `@noble/hashes`.
- **Smart contract:** Move 2024 (`mycelia::session` + `mycelia::marketplace`), deployed on Sui mainnet.
- **Backend:** Fastify + WebSocket, `@privy-io/server-auth` token verification, `better-sqlite3`,
  Tatum Sui gRPC, optional OpenAI for the listing ask endpoint.
- **Web:** Next.js 16, React 19, Zustand, TanStack Query, `@privy-io/react-auth`, in-browser Walrus + Seal,
  `react-force-graph-3d` / `three`, Tailwind 4.
- **Agent integration:** Model Context Protocol stdio server (`apps/mcp`) — drops straight into Claude Code.
- **Auth bridge:** Privy embedded wallet → Sui `Ed25519Keypair` for tx signing *and* Seal SessionKey signing.

---

## On-chain deployment

The same `mycelia::session` + `mycelia::marketplace` Move package is **live on both Sui mainnet and Sui testnet**.

### Sui mainnet

| | |
|---|---|
| **Package id** | [`0x76768f18e5c5b20a53b7ef34d54f8cafd8a7fe1b14573b93b372436492cc0c83`](https://suiscan.xyz/mainnet/object/0x76768f18e5c5b20a53b7ef34d54f8cafd8a7fe1b14573b93b372436492cc0c83) |
| **Upgrade capability** | `0x11b6d626b380330da9a81b34f0247f5d9e3c4141e482ef30655843b8bf409320` |
| **Modules** | `mycelia::session`, `mycelia::marketplace` |
| **Network** | Sui mainnet (`chain-id 35834a8a`) |

### Sui testnet

| | |
|---|---|
| **Package id** | [`0x9e0527c0a6b090c575bdccbd5ed3301ce67138e9429c4f24aeade54b204ac9c0`](https://suiscan.xyz/testnet/object/0x9e0527c0a6b090c575bdccbd5ed3301ce67138e9429c4f24aeade54b204ac9c0) |
| **Upgrade capability** | `0x77202804ea1ebf8fd18594154535e45be82d653d3cf6956f83067cf70ef125fe` |
| **Modules** | `mycelia::session`, `mycelia::marketplace` |
| **Network** | Sui testnet (`chain-id 4c78adac`) — used for live dev + the full end-to-end flow (Seal decrypt + Walrus persistence with testnet WAL) |

Both deployments are recorded in `move/Published.toml`.

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
| `MYCELIA_PACKAGE_ID` | `0x76768f…cc0c83` on mainnet (or publish your own with `pnpm move:publish`) |
| `SEAL_KEY_SERVER_IDS` | Comma-separated allowlisted Seal key-server object IDs (mainnet) |
| `SEAL_THRESHOLD` | Key-server threshold (must be ≤ key-server count) |
| `MASTER_SUI_ADDRESS` / `MASTER_SUI_PRIVKEY` | Funded operator wallet (funds users' gas + WAL) |
| `PRIVY_APP_ID` / `PRIVY_APP_SECRET` | Privy auth (dev-login fallback exists if the secret is absent) |
| `WALRUS_PUBLISHER` / `WALRUS_AGGREGATOR` | Walrus mainnet endpoints |
| `OPENAI_API_KEY` | Optional — enables LLM answers on the marketplace ask endpoint (lexical fallback otherwise) |

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
pnpm test:e2e          # Playwright browser flows
pnpm typecheck
```

**Use it from Claude Code (MCP):** point your MCP host at `apps/mcp` (see `apps/mcp/mcp.example.json`).

---

## Deployment

The web app (`apps/web`) is deployed on Vercel at **[mycelium-ashy.vercel.app](https://mycelium-ashy.vercel.app/)**.
Because it's a pnpm monorepo, the web build first builds the `@mycelia/core` workspace dependency:

| Vercel setting | Value |
|---|---|
| **Root Directory** | `apps/web` |
| **Build Command** | `pnpm --filter @mycelia/core build && next build` (baked into `apps/web` `build` script) |
| **Env** | `NEXT_PUBLIC_API_URL` (deployed `apps/server` URL), `NEXT_PUBLIC_PRIVY_APP_ID` |

The Fastify backend (`apps/server`) and the MCP daemon run separately — Docker Compose and Dockerfiles
are in the repo. Remember to add the Vercel domain to the server's `CORS_ORIGINS`.

---

## Status & verification

| Area | State |
|---|---|
| Storage round-trip (Walrus + Quilt) | verified |
| Seal encrypt/decrypt + `seal_approve` policy, fail-closed | verified |
| Move modules deployed + tests | `session` + `marketplace` live on Sui mainnet |
| Core engine | unit tests green |
| Single-user E2E (login → graft → reveal → capture) | PASS in-browser |
| Multi-party + real Privy login | PASS (cross-party decrypt; OTP login bridged to funded wallet) |
| Live 2-user realtime propagation | PASS (B's canvas auto-updates on A's publish) |
| Marketplace (list → ask → purchase → decrypt) | PASS on-chain |

> Flows were validated end-to-end on testnet first; the submission build targets Sui mainnet
> (`SUI_NETWORK=mainnet` + mainnet Walrus/Seal endpoints + mainnet `MYCELIA_PACKAGE_ID`).

---

## Non-goals (v1, on purpose)

Real-time sub-second collaboration · true hard-delete of already-shared data · cross-chain (Sui only)
· automatic multi-writer merge of a single node (single-writer-per-node removes the need).

---

## License

MIT — see [`LICENSE`](LICENSE).
