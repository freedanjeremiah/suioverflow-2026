import { useEffect, useState } from 'react';

// Mycelia MCP usage docs. Reached via the '#docs' hash route (any auth state),
// styled with the editorial token system (styles/docs.css). Static reference —
// no backend calls. The tool list mirrors apps/mcp/src/server.ts 1:1.

type Tool = { name: string; args: string; desc: string };

const TOOLS: Tool[] = [
  { name: 'remember', args: 'title, body, type?, importance?, tags?, links?', desc: 'Store a durable memory (node) in your private local graph, optionally linked to existing memories.' },
  { name: 'recall', args: 'query, depth=1', desc: 'Recall relevant private memories: lexical match + d-hop neighborhood. Returns a subgraph for you to rank.' },
  { name: 'create_session', args: 'name, members?', desc: 'Create an encrypted shared session on-chain. Returns sessionId + capId.' },
  { name: 'share', args: 'session, root, depth=1', desc: 'Graft a memory + its d-hop neighborhood into a session: encrypt each node, publish to Walrus (you pay + own), update policy + head.' },
  { name: 'join', args: 'session', desc: 'Track a session you were added to (by id) so you can sync + reveal it.' },
  { name: 'sync', args: 'session', desc: 'Merged graph structure (nodes with owner/type, depth, locked vs revealable) + the activity feed.' },
  { name: 'reveal', args: 'session, node', desc: 'Decrypt one shared node (Seal). Returns content, or a clean no-access result if policy denies.' },
  { name: 'expand', args: 'session, node', desc: 'Publish a new version of a node you own into the session (live propagation). Members see it on next sync.' },
  { name: 'add_member', args: 'session, address', desc: 'Add a member address to a session you own.' },
  { name: 'remove_member', args: 'session, address', desc: 'Remove a member. Forward-only: blocks future key issuance; cannot retract already-decrypted copies.' },
  { name: 'unshare', args: 'session, node', desc: 'Un-share a node. Forward-only: blocks future decrypts of that node.' },
  { name: 'renew', args: 'session, epochs?', desc: 'Extend real Walrus storage for blobs you own (+ update the on-chain end_epoch marker) so data does not expire.' },
];

const RESOURCES = [
  { uri: 'mycelia://identity', desc: 'This agent’s Sui address, network, package id, and SUI balance.' },
  { uri: 'mycelia://sessions', desc: 'Sessions this agent tracks (id, name, role, last seen version).' },
  { uri: 'mycelia://feed', desc: 'Check-again notifications — head bumps and renewal reminders from the daemon.' },
];

const ENV = [
  ['SUI_NETWORK', 'testnet', 'Sui network the server talks to.'],
  ['SUI_FULLNODE_URL', 'https://fullnode.testnet.sui.io', 'Sui RPC endpoint (public fullnode by default).'],
  ['WALRUS_AGGREGATOR', 'https://aggregator.walrus-testnet.walrus.space', 'Walrus aggregator for blob reads.'],
  ['MYCELIA_PACKAGE_ID', '0x0aa7…3452', 'Published mycelia::session Move package.'],
  ['SEAL_KEY_SERVER_IDS', '0x73d0…db75, 0xf5d1…23c8', 'Allowlisted testnet Seal key servers (comma-separated).'],
  ['SEAL_THRESHOLD', '2', 'Key servers required to decrypt. Below this → fail closed.'],
  ['MYCELIA_KEY', '(optional)', 'bech32 suiprivkey to reuse a funded wallet. Else a key is generated at ~/.mycelia/keystore.json.'],
];

const ENDPOINT = 'https://mcp.philotheephilix.in/mcp';

const ADD_CLI = `claude mcp add --transport http mycelia ${ENDPOINT}`;

const CONFIG = `{
  "mcpServers": {
    "mycelia": {
      "type": "http",
      "url": "${ENDPOINT}"
    }
  }
}`;

// For self-hosting the server yourself (stdio). Optional — the hosted endpoint
// above needs none of this.
const SELF_HOST = `{
  "mcpServers": {
    "mycelia": {
      "command": "npx",
      "args": ["-y", "tsx", "/ABS/PATH/sharegraph/apps/mcp/src/index.ts"],
      "env": {
        "SUI_NETWORK": "testnet",
        "SUI_FULLNODE_URL": "https://fullnode.testnet.sui.io",
        "WALRUS_AGGREGATOR": "https://aggregator.walrus-testnet.walrus.space",
        "MYCELIA_PACKAGE_ID": "0x0aa76ee7630ca154b27e5365db0368f8901aa5aee79d81855d4961aa01af3452",
        "SEAL_KEY_SERVER_IDS": "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75,0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8",
        "SEAL_THRESHOLD": "2"
      }
    }
  }
}`;

const FLOW = `// Owner — capture, then share a slice
remember   { title: "Project Atlas", body: "...", type: "project" }
create_session { name: "Atlas Team" }              -> sessionId, capId
add_member { session: sessionId, address: "0x…" }
share      { session: sessionId, root: "Project Atlas", depth: 1 }

// Collaborator — join, see structure, decrypt one node
join       { session: sessionId }
sync       { session: sessionId }                  -> nodes + locked/revealable + feed
reveal     { session: sessionId, node: nodeId }    -> decrypted content

// Owner — live update + lifecycle
expand     { session: sessionId, node: "Project Atlas" }
renew      { session: sessionId }
remove_member { session: sessionId, address: "0x…" }   // forward-only`;

const SECTIONS: [string, string][] = [
  ['install', 'Install'],
  ['env', 'Configuration'],
  ['tools', 'Tools'],
  ['resources', 'Resources'],
  ['flow', 'A typical flow'],
  ['notes', 'Good to know'],
];

export function Docs() {
  const [active, setActive] = useState('install');
  const goBack = () => { window.location.hash = ''; };

  // highlight the TOC entry for the section currently in view
  useEffect(() => {
    const els = SECTIONS.map(([id]) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (!('IntersectionObserver' in window) || els.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-10% 0px -70% 0px', threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="docs">
      <button className="docs-back btn-outline btn-sm" onClick={goBack} aria-label="Back to landing">← Back</button>

      <header className="docs-hero">
        <p className="eyebrow">Documentation</p>
        <h1>Mycelia MCP</h1>
        <p className="docs-lead">
          One Model Context Protocol server gives any host — Claude Code, Claude Desktop, Cursor, Windsurf — a
          private, end-to-end-encrypted memory graph. Memories live in a local SQLite graph; shared slices are
          Seal-encrypted, published to Walrus, and coordinated by a Sui <code>Session</code> object. You pay for and
          own your own storage.
        </p>
        <div className="docs-pills">
          <span className="docs-pill"><i className="dot mint" /> Local-first</span>
          <span className="docs-pill"><i className="dot lavender" /> End-to-end encrypted</span>
          <span className="docs-pill"><i className="dot peach" /> Forward-only revocation</span>
          <span className="docs-pill"><i className="dot sky" /> 12 tools · 3 resources</span>
        </div>
      </header>

      <div className="docs-body">
        <nav className="docs-toc" aria-label="On this page">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className={active === id ? 'active' : ''}>{label}</a>
          ))}
        </nav>

        <main className="docs-main">
          <section id="install" className="docs-section">
            <h2>Install</h2>
            <p>The server is hosted over HTTP (Streamable HTTP transport) at <code>{ENDPOINT}</code>. Point any MCP host at the endpoint — no clone, no keys, no local process. In Claude Code:</p>
            <pre><code>{ADD_CLI}</code></pre>
            <p>Or add the entry directly to your host’s <code>mcpServers</code> config:</p>
            <pre><code>{CONFIG}</code></pre>
            <p className="docs-note">
              The hosted endpoint carries its own funded Sui identity and config server-side — every memory you write is
              owned by that wallet. Prefer to own your storage and keys? Self-host the stdio server instead (below).
            </p>
            <details className="docs-details">
              <summary>Self-host (stdio)</summary>
              <p>Clone the repo and run the server locally with <code>tsx</code> (a bundled dev dependency) — no build step. Point the path at your checkout:</p>
              <pre><code>{SELF_HOST}</code></pre>
              <p className="docs-note">
                On first run a local Sui keypair is generated at <code>~/.mycelia/keystore.json</code>. On testnet the
                server best-effort tops up SUI from the faucet, but you must fund it with <strong>WAL</strong> to publish.
                To reuse an already-funded wallet, set <code>MYCELIA_KEY</code> to its bech32 <code>suiprivkey…</code>.
              </p>
            </details>
          </section>

          <section id="env" className="docs-section">
            <h2>Configuration</h2>
            <p>The hosted endpoint needs no client configuration. These environment variables apply only when self-hosting — pass them in the stdio MCP entry above.</p>
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead><tr><th>Variable</th><th>Default</th><th>Purpose</th></tr></thead>
                <tbody>
                  {ENV.map(([k, v, d]) => (
                    <tr key={k}><td><code>{k}</code></td><td className="mono">{v}</td><td>{d}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="tools" className="docs-section">
            <h2>Tools</h2>
            <p>Twelve tools, prefixed <code>mycelia_</code>. Encryption and publishing happen on-device; the owner of every blob is this server’s key.</p>
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead><tr><th>Tool</th><th>Arguments</th><th>What it does</th></tr></thead>
                <tbody>
                  {TOOLS.map((t) => (
                    <tr key={t.name}>
                      <td><code>mycelia_{t.name}</code></td>
                      <td className="mono docs-args">{t.args}</td>
                      <td>{t.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="resources" className="docs-section">
            <h2>Resources</h2>
            <p>Read-only state the host can subscribe to.</p>
            <ul className="docs-list">
              {RESOURCES.map((r) => (
                <li key={r.uri}><code>{r.uri}</code> — {r.desc}</li>
              ))}
            </ul>
          </section>

          <section id="flow" className="docs-section">
            <h2>A typical flow</h2>
            <p>An owner captures memories and shares a slice; a collaborator joins and reveals what they’re allowed to.</p>
            <pre><code>{FLOW}</code></pre>
          </section>

          <section id="notes" className="docs-section">
            <h2>Good to know</h2>
            <ul className="docs-list">
              <li><strong>You pay, you own.</strong> <code>share</code> publishes to Walrus from this server’s wallet, so the wallet owns every blob it writes. Fund it with SUI (gas) and WAL (storage).</li>
              <li><strong>Fail closed.</strong> A denied decrypt returns a clean <code>access: false</code> result, not an error to retry. Below-threshold key servers return <code>degraded: true</code> — never a silent downgrade.</li>
              <li><strong>Forward-only revocation.</strong> <code>remove_member</code> and <code>unshare</code> block all <em>future</em> reads on-chain. They cannot retract copies already decrypted. No tool claims hard delete.</li>
              <li><strong>Raise the call timeout.</strong> The default MCP request timeout is 60s; <code>share</code> and <code>reveal</code> touch the chain and Walrus and can run longer. Pass <code>{'{ timeout: 300000 }'}</code> from the host.</li>
              <li><strong>Storage is rented per epoch.</strong> The in-process daemon polls for changes and flags near-expiry blobs; run <code>renew</code> (owner only) to extend them before they lapse.</li>
            </ul>
          </section>
        </main>
      </div>
    </div>
  );
}
