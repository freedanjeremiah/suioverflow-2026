import { useEffect, useRef, useState } from 'react';

// Scroll-snap pitch deck, ported from pitch/index.html into JSX.
// 10 full-viewport slides; dot-nav, progress bar, keyboard nav. A fixed
// "← Back" button returns to the landing page by clearing the hash.

const SLIDE_NAMES = [
  'Mycelia', 'Problem', 'Solution', 'Why now', 'How it works',
  'Product', 'Any agent', 'Status', 'Market', 'Ask',
];

const OWNER_HUES = ['#a7e5d3', '#c8b8e0', '#f4c5a8', '#a8c8e8', '#e8b8c4'];

export function Pitch() {
  const deckRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [pct, setPct] = useState(0);
  const [hintHidden, setHintHidden] = useState(false);

  const goBack = () => { window.location.hash = ''; };

  const goToSlide = (i: number) => {
    const deck = deckRef.current;
    if (!deck) return;
    const slides = deck.querySelectorAll<HTMLElement>('.slide');
    const clamped = Math.max(0, Math.min(slides.length - 1, i));
    slides[clamped]?.scrollIntoView({ behavior: 'smooth' });
  };

  // progress + active dot + scroll hint
  useEffect(() => {
    const deck = deckRef.current;
    if (!deck) return;
    const onScroll = () => {
      const st = deck.scrollTop;
      const max = deck.scrollHeight - deck.clientHeight;
      setPct(max > 0 ? (st / max) * 100 : 0);
      setHintHidden(st > 40);
      let idx = Math.round(st / deck.clientHeight);
      idx = Math.max(0, Math.min(SLIDE_NAMES.length - 1, idx));
      setActive(idx);
    };
    deck.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => deck.removeEventListener('scroll', onScroll);
  }, []);

  // reveal-on-scroll (toggles in/out as in the source deck)
  useEffect(() => {
    const deck = deckRef.current;
    if (!deck) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const reveals = Array.from(deck.querySelectorAll<HTMLElement>('.reveal'));
    if (reduced || !('IntersectionObserver' in window)) {
      reveals.forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) e.target.classList.add('in');
          else e.target.classList.remove('in');
        }
      },
      { root: deck, threshold: 0.15 },
    );
    reveals.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // keyboard nav
  useEffect(() => {
    const deck = deckRef.current;
    if (!deck) return;
    const current = () => Math.round(deck.scrollTop / deck.clientHeight);
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === 'ArrowDown' || k === 'PageDown' || k === ' ') { e.preventDefault(); goToSlide(current() + 1); }
      else if (k === 'ArrowUp' || k === 'PageUp') { e.preventDefault(); goToSlide(current() - 1); }
      else if (k === 'Home') { e.preventDefault(); goToSlide(0); }
      else if (k === 'End') { e.preventDefault(); goToSlide(SLIDE_NAMES.length - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="pitch">
      <button className="pitch-back" onClick={goBack} aria-label="Back to landing">← Back</button>
      <div className="progress" style={{ width: `${pct}%` }} />
      <nav className="dotnav" aria-label="Slide navigation">
        {SLIDE_NAMES.map((name, i) => (
          <button key={name} className={i === active ? 'active' : ''} title={name} aria-label={`Go to ${name}`} onClick={() => goToSlide(i)}>
            <i />
          </button>
        ))}
      </nav>
      <div className="scrollhint" style={{ opacity: hintHidden ? 0 : 0.85 }}><span>↓</span> scroll</div>

      <div className="deck" ref={deckRef}>

        {/* 1 · TITLE */}
        <section className="slide dark" data-name="Mycelia">
          <MyceliumWeb count={26} />
          <div className="spore-acc" style={{ width: 6, height: 6, background: 'var(--spore)', left: '18%', top: '30%', animation: 'drift 9s ease-in-out infinite' }} />
          <div className="spore-acc" style={{ width: 4, height: 4, background: 'var(--orchid)', left: '78%', top: '64%', animation: 'drift 11s ease-in-out infinite' }} />
          <div className="spore-acc" style={{ width: 5, height: 5, background: 'var(--amber)', left: '64%', top: '22%', animation: 'drift 13s ease-in-out infinite' }} />
          <div className="slide-inner title-wrap">
            <div className="brandmark reveal in">
              <svg className="logo" viewBox="0 0 100 100" aria-hidden="true">
                <g fill="none" strokeWidth="3" strokeLinecap="round">
                  <path d="M50 50 L26 24" stroke="#57534e" opacity=".7" />
                  <path d="M50 50 L80 30" stroke="#57534e" opacity=".7" />
                  <path d="M50 50 L22 72" stroke="#57534e" opacity=".7" />
                  <path d="M50 50 L78 76" stroke="#57534e" opacity=".7" />
                </g>
                <circle cx="50" cy="50" r="9" fill="#f4c5a8" className="node-glow" style={{ color: '#f4c5a8' }} />
                <circle cx="26" cy="24" r="5.5" fill="#a7e5d3" className="node-glow" style={{ color: '#a7e5d3' }} />
                <circle cx="80" cy="30" r="5" fill="#a8c8e8" className="node-glow" style={{ color: '#a8c8e8' }} />
                <circle cx="22" cy="72" r="5" fill="#c8b8e0" className="node-glow" style={{ color: '#c8b8e0' }} />
                <circle cx="78" cy="76" r="5.5" fill="#e8b8c4" className="node-glow" style={{ color: '#e8b8c4' }} />
              </svg>
              <span className="name">Mycelia</span>
            </div>
            <h1 className="big reveal d1 in" style={{ maxWidth: '18ch' }}>A living, encrypted <span className="spore-txt">memory graph</span> for AI agents.</h1>
            <p className="lead reveal d2 in">Agents grow a private knowledge graph — then graft encrypted slices into shared sessions. Local-first. End-to-end encrypted. Hosted by no one.</p>
            <div className="row reveal d3 in" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
              <span className="pill"><span className="dot dot-spore" /> Local-first</span>
              <span className="pill"><span className="dot dot-amber" /> End-to-end encrypted</span>
              <span className="pill"><span className="dot dot-orchid" /> On-chain coordination</span>
              <span className="pill"><span className="dot dot-teal" /> Any agent platform (MCP)</span>
            </div>
          </div>
          <div className="foot"><span>Seed pitch · 2026</span><span className="mono">live on Sui mainnet</span></div>
        </section>

        {/* 2 · PROBLEM */}
        <section className="slide" data-name="Problem">
          <div className="snum"><b>01</b> / 10 · Problem</div>
          <div className="slide-inner">
            <p className="eyebrow reveal">The problem</p>
            <h2 className="h2 reveal d1" style={{ margin: '14px 0 28px', maxWidth: '20ch' }}>Agent memory is <span style={{ color: 'var(--rust)' }}>siloed, plaintext, and centrally owned.</span></h2>
            <div className="grid g3">
              <div className="card reveal d2">
                <div className="tag">Siloed</div>
                <h3>It can't be shared.</h3>
                <p>Your agent's understanding of you is trapped in one app. Onboarding a teammate means a brain-dump — or copy-paste that's dead the moment it lands.</p>
              </div>
              <div className="card reveal d3">
                <div className="tag">Plaintext</div>
                <h3>Someone can read it.</h3>
                <p>Memory lives in a vendor's database in the clear. Your most sensitive context — clients, code, decisions — is one breach or subpoena away.</p>
              </div>
              <div className="card reveal d4">
                <div className="tag">Centrally owned</div>
                <h3>Someone can delete it.</h3>
                <p>A single host can read it, lose it, or lock you out. Shared memory becomes a single point of failure you don't control.</p>
              </div>
            </div>
            <p className="callout reveal d5" style={{ marginTop: 30 }}>People want to share <b>this slice</b> of what my agent knows, with <b>these people</b> — and keep it <b>live, private, and revocable.</b> No tool does that today.</p>
          </div>
        </section>

        {/* 3 · SOLUTION */}
        <section className="slide" data-name="Solution">
          <div className="snum"><b>02</b> / 10 · Solution</div>
          <div className="spore-acc" style={{ width: 5, height: 5, background: 'var(--spore)', left: '84%', top: '26%', animation: 'drift 10s ease-in-out infinite' }} />
          <div className="slide-inner">
            <p className="eyebrow reveal">The solution</p>
            <h2 className="h2 reveal d1" style={{ margin: '14px 0 14px', maxWidth: '22ch' }}>A shared memory <span className="spore-txt">mycelium</span> — grow privately, graft selectively.</h2>
            <p className="lead reveal d2" style={{ marginBottom: 30 }}>Mycelia is a knowledge graph your agent builds from conversation. You share a <b className="amber-txt">node and its d-hop neighborhood</b> into an encrypted session — and it stays alive.</p>
            <div className="grid g2" style={{ gap: 16 }}>
              <ul className="clean reveal d3">
                <li><b>Graph-native sharing with depth.</b> Share a node + its neighborhood, not a flat document. Depth is a first-class control.</li>
                <li className="amber"><b>Live propagation.</b> When an owner expands a shared node, every participant sees it update in place.</li>
              </ul>
              <ul className="clean reveal d4">
                <li className="orchid"><b>Encrypted by policy, not recipient.</b> Membership can change with zero re-encryption.</li>
                <li className="rust"><b>Forward-only revocation.</b> Un-share blocks all future reads — provably, on-chain.</li>
              </ul>
            </div>
            <p className="callout reveal d5" style={{ marginTop: 28 }}><b>Mycelium</b> is the underground thread network fungi use to share nutrients between organisms. Mycelia connects agents' memories the same way.</p>
          </div>
        </section>

        {/* 4 · WHY NOW */}
        <section className="slide" data-name="Why now">
          <div className="snum"><b>03</b> / 10 · Why now</div>
          <div className="slide-inner">
            <p className="eyebrow reveal">Why now</p>
            <h2 className="h2 reveal d1" style={{ margin: '14px 0 30px', maxWidth: '20ch' }}>Three curves just crossed.</h2>
            <div className="grid g3">
              <div className="card reveal d2 glow-l">
                <div className="tag spore-txt">Agents went mainstream</div>
                <h3>Memory is the bottleneck.</h3>
                <p>Every serious agent now needs persistent memory. MCP made tools portable across hosts — there's finally a standard socket to plug memory into.</p>
              </div>
              <div className="card reveal d3 glow-a">
                <div className="tag amber-txt">Decentralized storage is real</div>
                <h3>Walrus + Seal shipped.</h3>
                <p>Programmable blob storage and identity-based threshold encryption are now live on Sui mainnet — the primitives for "hosted by no one" finally exist.</p>
              </div>
              <div className="card reveal d4">
                <div className="tag orchid-txt">Privacy is non-negotiable</div>
                <h3>Plaintext is a liability.</h3>
                <p>Enterprises and individuals won't pour their context into someone else's readable database. The default has to flip to encrypted.</p>
              </div>
            </div>
            <p className="callout reveal d5" style={{ marginTop: 30 }}>Two years ago the encryption + storage layer didn't exist. Today it's a mainnet call away. <b>The window is open now.</b></p>
          </div>
        </section>

        {/* 5 · HOW IT WORKS (FOUR LAYERS) */}
        <section className="slide" data-name="How it works">
          <div className="snum"><b>04</b> / 10 · How it works</div>
          <MyceliumWeb count={20} style={{ opacity: 0.5 }} />
          <div className="slide-inner">
            <p className="eyebrow reveal">Architecture</p>
            <h2 className="h2 reveal d1" style={{ margin: '14px 0 12px', maxWidth: '24ch' }}>Four layers. Each answers <span className="amber-txt">exactly one question.</span></h2>
            <p className="lead reveal d2" style={{ marginBottom: 24 }}>Keeping them separate is the core invariant — and the reason no single party can read, forge, or lose your memory.</p>
            <div className="layers">
              <div className="layer reveal d2"><span className="q"><LayerDot cls="dot-spore" />Storage</span><span className="ans">Is the data available? Ciphertext blobs, rented per epoch, Quilt-batched.</span><span className="tech spore-txt">Walrus</span></div>
              <div className="layer reveal d3"><span className="q"><LayerDot cls="dot-orchid" />Confidentiality</span><span className="ans">Who may decrypt it? Identity-based encryption, t-of-n threshold key servers.</span><span className="tech orchid-txt">Seal</span></div>
              <div className="layer reveal d4"><span className="q"><LayerDot cls="dot-amber" />Coordination</span><span className="ans">What is the current truth &amp; the rules? One mutable Session object + Move policy.</span><span className="tech amber-txt">Sui</span></div>
              <div className="layer reveal d5"><span className="q"><LayerDot cls="dot-teal" />Access</span><span className="ans">Can we reach Sui reliably? gRPC with public-fullnode fallback.</span><span className="tech teal-txt">Tatum</span></div>
            </div>
            <p className="callout reveal d6" style={{ marginTop: 24 }}><b>Encrypt → publish → register policy → bump head.</b> No cleartext ever leaves the device except a blob-id pointer + a version integer.</p>
          </div>
        </section>

        {/* 6 · PRODUCT */}
        <section className="slide" data-name="Product">
          <div className="snum"><b>05</b> / 10 · Product</div>
          <div className="slide-inner">
            <p className="eyebrow reveal">Product</p>
            <h2 className="h2 reveal d1" style={{ margin: '14px 0 14px', maxWidth: '24ch' }}>One MCP server. <span className="spore-txt">Works in every agent.</span></h2>
            <p className="lead reveal d2" style={{ marginBottom: 26 }}>Mycelia ships as a Model Context Protocol server — so Claude, Cursor, or any MCP host gets a private, shareable memory graph with zero custom integration. Plus an editorial web visualizer to see and steer it.</p>
            <div className="grid g2">
              <div className="card reveal d3 glow-l">
                <div className="tag">MCP server · drop-in</div>
                <h3>12 memory tools, any host.</h3>
                <p style={{ marginBottom: 12 }}>A local SQLite graph + Sui keystore + an in-process daemon (poll → notify, auto-renew).</p>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  <span className="kbd">remember</span><span className="kbd">recall</span><span className="kbd">create_session</span>
                  <span className="kbd">share</span><span className="kbd">join</span><span className="kbd">sync</span>
                  <span className="kbd">reveal</span><span className="kbd">expand</span><span className="kbd">add_member</span>
                  <span className="kbd">remove_member</span><span className="kbd">unshare</span><span className="kbd">renew</span>
                </div>
              </div>
              <div className="card reveal d4">
                <div className="tag">Web visualizer · the canvas</div>
                <h3>The graph, alive.</h3>
                <p>Spores glow by owner; hyphae thread between them. Pick a root, drag a depth slider, watch the neighborhood light up — then "graft into session." Privy login, your wallet pays for your own storage.</p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                  <span className="pill"><span className="dot dot-spore" /> You</span>
                  <span className="pill"><span className="dot dot-orchid" /> Collaborator</span>
                  <span className="pill"><span className="dot dot-amber" /> Shared / merged</span>
                  <span className="pill"><span className="dot dot-rust" /> Expiring</span>
                </div>
              </div>
            </div>
            <p className="callout reveal d5" style={{ marginTop: 26 }}>MCP is the wedge: <b>we don't compete with agent platforms — we make all of them remember, privately.</b></p>
          </div>
        </section>

        {/* 7 · DISTRIBUTION / ANY AGENT */}
        <section className="slide" data-name="Any agent">
          <div className="snum"><b>06</b> / 10 · Distribution</div>
          <MyceliumWeb count={18} style={{ opacity: 0.45 }} />
          <div className="slide-inner">
            <p className="eyebrow reveal">One protocol · every assistant</p>
            <h2 className="h2 reveal d1" style={{ margin: '14px 0 14px', maxWidth: '24ch' }}>Graft from <span className="spore-txt">any AI tool</span> you already use.</h2>
            <p className="lead reveal d2" style={{ marginBottom: 28 }}>Mycelia is a Model Context Protocol server, so the same <b className="amber-txt">graft</b> — share a node and its neighborhood into an encrypted session — works anywhere your assistant speaks MCP. Capture in one tool, reveal in another. The memory follows you, not the app.</p>
            <div className="grid g4" style={{ gap: 14 }}>
              <div className="card reveal d2 glow-l"><div className="tag spore-txt">Claude</div><h3>Code · Desktop</h3><p>Native MCP host — remember, graft and reveal inline.</p></div>
              <div className="card reveal d3 glow-a"><div className="tag amber-txt">ChatGPT</div><h3>Connectors</h3><p>Add Mycelia as an MCP connector and graft straight from chat.</p></div>
              <div className="card reveal d4"><div className="tag orchid-txt">Perplexity</div><h3>Research → memory</h3><p>Turn findings into nodes, then graft a slice to your team.</p></div>
              <div className="card reveal d5"><div className="tag teal-txt">Cursor · Windsurf · any</div><h3>Any MCP host</h3><p>One stdio server. No per-tool integration to maintain.</p></div>
            </div>
            <p className="callout reveal d6" style={{ marginTop: 28 }}>Write once with <span className="kbd">mycelia_share</span> — the encrypted slice is decryptable by policy from <b>every</b> tool the recipient uses. The graph is the product; the assistant is just the lens.</p>
          </div>
        </section>

        {/* 8 · TRACTION / STATUS */}
        <section className="slide" data-name="Status">
          <div className="snum"><b>07</b> / 10 · Status</div>
          <div className="slide-inner">
            <p className="eyebrow reveal">Traction · status</p>
            <h2 className="h2 reveal d1" style={{ margin: '14px 0 26px', maxWidth: '22ch' }}>Real, end to end, <span className="spore-txt">live on Sui mainnet today.</span></h2>
            <div className="statline reveal d2" style={{ marginBottom: 30 }}>
              <div className="stat"><div className="n spore-txt">4/4</div><div className="l">layers live (Walrus · Seal · Sui · Tatum)</div></div>
              <div className="stat"><div className="n amber-txt">17/17</div><div className="l">persona lifecycle tests passing</div></div>
              <div className="stat"><div className="n orchid-txt">40</div><div className="l">UI controls wired end to end</div></div>
              <div className="stat"><div className="n teal-txt">12</div><div className="l">MCP tools, any host</div></div>
            </div>
            <div className="grid g2">
              <ul className="clean reveal d3">
                <li><b>Real on-chain transactions.</b> Create session → Seal-encrypt → Walrus publish (user owns the blob) → read → seal_approve → decrypt — all on Sui mainnet.</li>
                <li className="amber"><b>Cross-party reveal, both directions.</b> Two wallets, real key servers, P1–P5 personas: contribute, reveal, remove, fail-closed — 17/17 green.</li>
              </ul>
              <ul className="clean reveal d4">
                <li className="orchid"><b>Real Privy email-OTP login</b> drives an end-to-end flow: in-browser encrypt + Walrus publish, reveal-decrypt, capture.</li>
                <li className="teal"><b>Owner-paid storage.</b> Each user's wallet pays for and owns the blobs it writes; the daemon renews them before they expire.</li>
              </ul>
            </div>
            <p className="callout reveal d5" style={{ marginTop: 26 }}>Move contract <span className="mono hint">mycelia::session</span> deployed on Sui; threshold-2 Seal key servers live; every control wired to a real on-chain action.</p>
          </div>
        </section>

        {/* 9 · MARKET / WHO */}
        <section className="slide" data-name="Market">
          <div className="snum"><b>08</b> / 10 · Market</div>
          <div className="slide-inner">
            <p className="eyebrow reveal">Who it's for</p>
            <h2 className="h2 reveal d1" style={{ margin: '14px 0 14px', maxWidth: '24ch' }}>Every team running agents on shared, sensitive context.</h2>
            <p className="lead reveal d2" style={{ marginBottom: 26 }}>We start where memory hurts most and trust matters most — developer + knowledge teams already living in MCP hosts.</p>
            <div className="grid g3" style={{ gap: 16 }}>
              <div className="card reveal d3">
                <div className="tag spore-txt">P1 · The Builder</div>
                <p>Founder/dev in Claude Code. Onboards a collaborator by sharing the <b>relevant slice</b> of project knowledge — not a brain-dump.</p>
              </div>
              <div className="card reveal d3">
                <div className="tag orchid-txt">P2 · The Collaborator</div>
                <p>Joins a session, contributes their own slice. Sees only what's shared, clearly attributed, with notify-to-recheck.</p>
              </div>
              <div className="card reveal d4">
                <div className="tag amber-txt">P3 · The Mentor</div>
                <p>Drops high-value nodes into many short sessions — a hiring rubric, a postmortem. Quick share, quick revoke.</p>
              </div>
              <div className="card reveal d4">
                <div className="tag teal-txt">P4 · The Team Lead</div>
                <p>Owns a long-lived team session: membership control, audit trail, funded storage renewal so it never silently dies.</p>
              </div>
              <div className="card reveal d5">
                <div className="tag" style={{ color: 'var(--rust)' }}>P5 · Privacy-First</div>
                <p>Adopts Mycelia <b>because</b> of Seal + Walrus. Knows exactly who can decrypt and the trust assumptions.</p>
              </div>
              <div className="card reveal d5 glow-a" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <h3 className="amber-txt" style={{ fontSize: 24 }}>The opportunity</h3>
                <p>Memory becomes the substrate layer beneath the entire agent economy. Bottom-up: priced per session + per-epoch storage, paid by the user who owns it.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 10 · ASK / CLOSE */}
        <section className="slide" data-name="Ask">
          <div className="snum"><b>09</b> / 10 · Ask</div>
          <MyceliumWeb count={18} style={{ opacity: 0.45 }} />
          <div className="spore-acc" style={{ width: 6, height: 6, background: 'var(--amber)', left: '22%', top: '34%', animation: 'drift 10s ease-in-out infinite' }} />
          <div className="spore-acc" style={{ width: 5, height: 5, background: 'var(--spore)', left: '80%', top: '60%', animation: 'drift 12s ease-in-out infinite' }} />
          <div className="slide-inner">
            <p className="eyebrow reveal">The ask</p>
            <h2 className="big reveal d1" style={{ margin: '14px 0 18px', maxWidth: '18ch' }}>Help us make every agent <span className="spore-txt">remember</span> — <span className="amber-txt">privately.</span></h2>
            <p className="lead reveal d2" style={{ marginBottom: 26 }}>The hard part is done: four layers live on mainnet, encryption and revocation proven cross-party. We're raising to scale the network, ship the hosted onboarding, and seed the first teams.</p>
            <div className="grid g3 reveal d3" style={{ marginBottom: 30 }}>
              <div className="card"><div className="tag spore-txt">Engineering</div><h3>Mainnet + hardening</h3><p>Audit the Move policy, productionize the daemon and renewal economics.</p></div>
              <div className="card"><div className="tag amber-txt">Go-to-market</div><h3>MCP-host distribution</h3><p>Land the first developer teams where agents + shared context already live.</p></div>
              <div className="card"><div className="tag orchid-txt">Network</div><h3>Key-server diversity</h3><p>Expand the threshold set so confidentiality has no single point of trust.</p></div>
            </div>
            <div className="divider reveal d4" />
            <div className="foot" style={{ position: 'static', marginTop: 18, padding: 0 }}>
              <span className="reveal d5"><b className="amber-txt">Mycelia</b> · a living, encrypted memory graph for AI agents</span>
              <span className="mono reveal d5">disha.ai@dishacom.com</span>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}

function LayerDot({ cls }: { cls: string }) {
  return (
    <span className={cls} style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', marginRight: 9, border: '1px solid rgba(12,10,9,.25)' }} />
  );
}

// Procedural mycelium web background, generated once per slide (deterministic
// React render of random nodes + nearest-neighbor hyphae).
function MyceliumWeb({ count, style }: { count: number; style?: React.CSSProperties }) {
  const data = useRef<{ paths: { d: string; stroke: string; opacity: number; dur: number }[]; nodes: { x: number; y: number; r: number; c: string; delay: number }[] } | null>(null);
  if (!data.current) {
    const W = 1200, H = 760;
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const nodes = Array.from({ length: count }, () => ({
      x: rand(60, W - 60), y: rand(50, H - 50), r: rand(3.5, 9),
      c: OWNER_HUES[Math.floor(Math.random() * OWNER_HUES.length)]!, delay: rand(0, 3),
    }));
    const paths: { d: string; stroke: string; opacity: number; dur: number }[] = [];
    nodes.forEach((a, i) => {
      const dists = nodes
        .map((b, j) => ({ j, d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2 }))
        .filter((o) => o.j !== i)
        .sort((p, q) => p.d - q.d);
      const k = Math.min(2, dists.length);
      for (let m = 0; m < k; m++) {
        const di = dists[m]!;
        if (di.j < i) continue; // avoid dup edges
        const b = nodes[di.j]!;
        const mx = (a.x + b.x) / 2 + rand(-40, 40);
        const my = (a.y + b.y) / 2 + rand(-40, 40);
        paths.push({
          d: `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
          stroke: Math.random() > 0.5 ? a.c : b.c,
          opacity: Number((0.1 + Math.random() * 0.16).toFixed(2)),
          dur: Number(rand(7, 16).toFixed(1)),
        });
      }
    });
    data.current = { paths, nodes };
  }
  const { paths, nodes } = data.current;
  return (
    <svg className="bgcanvas" preserveAspectRatio="xMidYMid slice" viewBox="0 0 1200 760" aria-hidden="true" style={style}>
      {paths.map((p, i) => (
        <path key={`p${i}`} className="hypha" d={p.d} stroke={p.stroke} strokeWidth="1" opacity={p.opacity} strokeDasharray="4 8" style={{ animation: `shimmer ${p.dur}s linear infinite` }} />
      ))}
      {nodes.map((a, i) => (
        <circle key={`n${i}`} cx={a.x.toFixed(1)} cy={a.y.toFixed(1)} r={a.r.toFixed(1)} fill={a.c} opacity="0.85" className="node-glow" style={{ color: a.c, animationDelay: `${a.delay.toFixed(2)}s` }} />
      ))}
    </svg>
  );
}
