import { useEffect, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { Login } from './Login.js';

// Marketing landing page, ported from landing/index.html into JSX.
// Smooth-scroll (NOT slide-snapped). All CTAs drive Privy login or scroll to
// the embedded <Login/> (which carries the Playwright data-testids).
export function Landing() {
  const { login } = usePrivy();
  const rootRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // Scroll reveal via IntersectionObserver + nav border on scroll + drifting specks.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const reveals = Array.from(root.querySelectorAll<HTMLElement>('.reveal'));

    let io: IntersectionObserver | null = null;
    if (reduced || !('IntersectionObserver' in window)) {
      reveals.forEach((el) => el.classList.add('in'));
    } else {
      io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add('in');
              io?.unobserve(entry.target);
            }
          }
        },
        { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
      );
      reveals.forEach((el) => io!.observe(el));
    }

    const nav = navRef.current;
    const onScroll = () => {
      if (!nav) return;
      if (window.scrollY > 12) nav.classList.add('scrolled');
      else nav.classList.remove('scrolled');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => {
      io?.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const seePitch = () => { window.location.hash = 'pitch'; };
  const year = new Date().getFullYear();

  return (
    <div className="landing" ref={rootRef}>
      <div className="specks" aria-hidden="true">
        <div className="orb drift" style={{ width: 480, height: 480, top: '8%', right: '8%', background: 'radial-gradient(circle, var(--mint), transparent 70%)', opacity: 0.45 }} />
        <div className="orb drift" style={{ width: 420, height: 420, top: '60%', left: '-4%', background: 'radial-gradient(circle, var(--lavender), transparent 70%)', opacity: 0.45 }} />
        <div className="orb drift" style={{ width: 380, height: 380, bottom: '6%', right: '12%', background: 'radial-gradient(circle, var(--peach), transparent 70%)', opacity: 0.45 }} />
      </div>

      {/* ============ NAV ============ */}
      <nav ref={navRef} className="lp-nav">
        <div className="nav-inner">
          <a href="#top" className="brand">
            <BrandLogo />
            Mycelia
          </a>
          <div className="nav-links">
            <a href="#problem">Problem</a>
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#use-cases">Use cases</a>
            <a href="#trust">Security</a>
            <a href="#faq">FAQ</a>
            <a href="#docs">Docs</a>
            <a href="#pitch" onClick={(e) => { e.preventDefault(); seePitch(); }}>Pitch deck</a>
          </div>
          <button className="btn btn-primary nav-cta" onClick={() => login()}>Sign in</button>
        </div>
      </nav>

      {/* ============ HERO ============ */}
      <header className="hero" id="top">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">Local-first · End-to-end encrypted · No host</span>
            <h1 className="reveal">A <span className="glow-green">living memory</span> graph your agent <span className="glow-amber">actually owns</span>.</h1>
            <p className="sub reveal d1">Mycelia lets any AI agent build a private knowledge graph, then share encrypted slices into live, multi-party sessions — owner-attributed, on-chain coordinated, and hosted by no one.</p>
            <div className="cta-row reveal d2">
              <button className="btn btn-primary" onClick={() => login()}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Get started
              </button>
              <a href="#how" className="btn btn-ghost">See how it works</a>
              <a href="#pitch" className="btn btn-ghost" onClick={(e) => { e.preventDefault(); seePitch(); }}>See the pitch</a>
            </div>
            <div className="trust reveal d3">
              <span className="trust-chip"><span className="dot" style={{ background: 'var(--spore)', color: 'var(--spore)' }} /> Live on Sui testnet</span>
              <span className="trust-chip"><span className="dot" style={{ background: 'var(--orchid)', color: 'var(--orchid)' }} /> Works in any MCP host</span>
              <span className="trust-chip"><span className="dot" style={{ background: 'var(--amber)', color: 'var(--amber)' }} /> Forward-only revocation</span>
            </div>
          </div>

          {/* animated mycelium graph motif */}
          <div className="hero-viz reveal d2" aria-hidden="true">
            <svg viewBox="0 0 460 420">
              <circle className="ring-faint" cx="230" cy="210" r="80" />
              <circle className="ring-faint" cx="230" cy="210" r="140" />
              <circle className="ring-faint" cx="230" cy="210" r="195" />
              <g>
                <path className="hypha drift" style={{ stroke: 'var(--spore)' }} d="M230 210 C 150 170, 120 110, 95 78" />
                <path className="hypha drift" style={{ stroke: 'var(--spore)' }} d="M230 210 C 300 170, 340 120, 372 92" />
                <path className="hypha" style={{ stroke: 'var(--amber)' }} d="M230 210 C 290 250, 330 290, 360 330" />
                <path className="hypha drift" style={{ stroke: 'var(--orchid)' }} d="M230 210 C 160 260, 120 300, 92 338" />
                <path className="hypha" style={{ stroke: 'var(--teal)' }} d="M230 210 C 175 215, 120 220, 70 200" />
                <path className="hypha" style={{ stroke: 'var(--orchid)' }} d="M95 78 C 120 150, 80 230, 70 200" />
                <path className="hypha" style={{ stroke: 'var(--amber)' }} d="M372 92 C 360 180, 380 280, 360 330" />
                <path className="hypha drift" style={{ stroke: 'var(--spore)' }} d="M92 338 C 200 360, 290 360, 360 330" />
              </g>
              <g className="spore-node pulse" style={{ color: 'var(--spore)' }}>
                <circle className="body" cx="230" cy="210" r="17" fill="var(--spore)" />
                <circle cx="230" cy="210" r="28" fill="none" stroke="var(--ink)" strokeWidth="1.2" opacity="0.5" />
              </g>
              <g className="spore-node pulse" style={{ color: 'var(--orchid)', animationDelay: '.8s' }}><circle className="body" cx="95" cy="78" r="11" fill="var(--orchid)" /></g>
              <g className="spore-node pulse" style={{ color: 'var(--amber)', animationDelay: '1.6s' }}><circle className="body" cx="372" cy="92" r="10" fill="var(--amber)" /></g>
              <g className="spore-node pulse" style={{ color: 'var(--amber)', animationDelay: '1.1s' }}><circle className="body" cx="360" cy="330" r="12" fill="var(--amber)" /></g>
              <g className="spore-node pulse" style={{ color: 'var(--orchid)', animationDelay: '2.0s' }}><circle className="body" cx="92" cy="338" r="9" fill="var(--orchid)" /></g>
              <g className="spore-node pulse" style={{ color: 'var(--teal)', animationDelay: '0.4s' }}><circle className="body" cx="70" cy="200" r="8" fill="var(--teal)" /></g>
            </svg>
          </div>
        </div>
      </header>

      {/* ============ SOCIAL PROOF / STATS BAR ============ */}
      <section style={{ padding: '36px 0' }} className="reveal">
        <div className="wrap proof-bar">
          <div className="proof-item"><span className="pi-num">4</span><span className="stack"><strong>decentralized layers</strong><span className="hint">Walrus · Seal · Sui · Tatum</span></span></div>
          <div className="proof-item"><span className="pi-num">17/17</span><span className="stack"><strong>persona lifecycle tests</strong><span className="hint">passing on Sui testnet</span></span></div>
          <div className="proof-item"><span className="pi-num">12</span><span className="stack"><strong>MCP memory tools</strong><span className="hint">for any agent platform</span></span></div>
          <div className="proof-item"><span className="pi-num">0</span><span className="stack"><strong>central servers</strong><span className="hint">your blobs, your wallet</span></span></div>
        </div>
      </section>

      <hr className="divider" />

      {/* ============ PROBLEM ============ */}
      <section id="problem" className="problem">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">The problem</span>
            <h2>Agent memory today is siloed, plaintext, and owned by someone else.</h2>
            <p>Your agent's understanding of you is locked inside one tool — and the moment you want to share it, the options all break something.</p>
          </div>
          <div className="grid-3">
            <div className="card reveal d1">
              <div className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></svg></div>
              <h3>Locked in a silo</h3>
              <p>Memory lives in one app's database. You can't selectively hand a teammate the relevant slice of what your agent knows.</p>
            </div>
            <div className="card reveal d2">
              <div className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 12s4-7 9-7 9 7 9 7-4 7-9 7-9-7-9-7z" /><circle cx="12" cy="12" r="2.5" /></svg></div>
              <h3>Plaintext by default</h3>
              <p>Copy-paste a brain dump or drop it in a shared doc, and it sits in cleartext on someone's server, readable forever.</p>
            </div>
            <div className="card reveal d3">
              <div className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3v18M5 8l7-5 7 5M5 16l7 5 7-5" /></svg></div>
              <h3>A single point of control</h3>
              <p>Centralized shared memory means one host can read it, delete it, or go down — and you can never truly take it back.</p>
            </div>
          </div>
          <p className="muted reveal" style={{ textAlign: 'center', marginTop: 36, fontSize: 17 }}>People want <strong style={{ color: 'var(--ink)' }}>fine-grained, revocable, provable</strong> sharing — "share <em>this</em> part of what my agent knows, with <em>these</em> people, and let it stay live."</p>
        </div>
      </section>

      <hr className="divider" />

      {/* ============ SOLUTION / BENEFITS ============ */}
      <section id="solution">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">The solution</span>
            <h2>Share a <em>slice</em> of your graph — alive, encrypted, and yours.</h2>
            <p>Mycelium is a living network of threads that connects organisms and shares nutrients. Mycelia connects agents' memories the same way: you graft a node and its neighborhood into a shared session, and it stays live.</p>
          </div>
          <div className="benefits">
            <div className="benefit reveal d1">
              <div className="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h4l3-8 4 16 3-8h4" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
              <div><h4>Local-first</h4><p>The full graph lives in SQLite on your device. Nothing leaves except an encrypted pointer.</p></div>
            </div>
            <div className="benefit reveal d1">
              <div className="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg></div>
              <div><h4>End-to-end encrypted</h4><p>Every blob is Seal ciphertext. Encryption is by policy, not by recipient — membership changes without re-encrypting.</p></div>
            </div>
            <div className="benefit reveal d2">
              <div className="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.4" /><path d="M3 20c0-3 3-5 6-5s6 2 6 5M14 20c0-2 2-3.5 4-3.5" /></svg></div>
              <div><h4>Multi-party &amp; live</h4><p>Everyone contributes their slice into one merged graph. Expand a shared node and all participants see it.</p></div>
            </div>
            <div className="benefit reveal d2">
              <div className="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" /><path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
              <div><h4>You own &amp; pay for your blobs</h4><p>Your own wallet rents the Walrus storage and owns each blob object. No host, no rent-seeker in the middle.</p></div>
            </div>
            <div className="benefit reveal d3">
              <div className="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 109-9" strokeLinecap="round" /><path d="M3 4v5h5" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
              <div><h4>Forward-only revocation</h4><p>Remove a member and future key issuance is blocked — honestly. We never pretend to hard-delete what was already read.</p></div>
            </div>
            <div className="benefit reveal d3">
              <div className="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v6m0 0l3-3m-3 3L9 6M5 21h14a2 2 0 002-2v-6H3v6a2 2 0 002 2z" /></svg></div>
              <div><h4>Depth-share, not brain-dump</h4><p>Share a root node and its <em>d</em>-hop neighborhood. Depth is a first-class control, so you never leak unrelated nodes.</p></div>
            </div>
          </div>
        </div>
      </section>

      <hr className="divider" />

      {/* ============ HOW IT WORKS — FOUR LAYERS ============ */}
      <section id="how">
        <div className="wrap">
          <div className="section-head center reveal">
            <span className="eyebrow">How it works</span>
            <h2>Four layers, each answering exactly one question.</h2>
            <p>Mycelia keeps storage, confidentiality, coordination, and access strictly separate. That separation is the whole design.</p>
          </div>
          <div className="layers">
            <div className="layer reveal d1" style={{ '--lc': 'var(--spore)' } as React.CSSProperties}>
              <div className="ln">Layer 01 · Storage</div>
              <h3>Walrus</h3>
              <div className="q">"Is the data available?"</div>
              <p>Immutable, versioned ciphertext blobs, batched with Quilt and rented per epoch.</p>
              <span className="tech">blobs + Quilt</span>
            </div>
            <div className="layer reveal d2" style={{ '--lc': 'var(--orchid)' } as React.CSSProperties}>
              <div className="ln">Layer 02 · Confidentiality</div>
              <h3>Seal</h3>
              <div className="q">"Who may decrypt it?"</div>
              <p>Identity-based encryption with threshold key servers, gated by an on-chain Move policy.</p>
              <span className="tech">IBE + threshold</span>
            </div>
            <div className="layer reveal d3" style={{ '--lc': 'var(--amber)' } as React.CSSProperties}>
              <div className="ln">Layer 03 · Coordination</div>
              <h3>Sui</h3>
              <div className="q">"What's the current truth?"</div>
              <p>One mutable Session object per session holds members, policy, and the head pointer.</p>
              <span className="tech">Move · Session object</span>
            </div>
            <div className="layer reveal d4" style={{ '--lc': 'var(--teal)' } as React.CSSProperties}>
              <div className="ln">Layer 04 · Access</div>
              <h3>Tatum</h3>
              <div className="q">"How do I reach Sui?"</div>
              <p>Reliable Sui gRPC access, with a public fullnode fallback. No webhooks.</p>
              <span className="tech">Sui gRPC</span>
            </div>
          </div>

          <div className="flow-strip">
            <div className="flow-step reveal d1"><div className="n">01</div><h4>Remember</h4><p>Your agent upserts durable facts as nodes + edges in a private local graph.</p></div>
            <div className="flow-arrow reveal d1"><FlowArrow /></div>
            <div className="flow-step reveal d2"><div className="n">02</div><h4>Graft</h4><p>Pick a root + depth. Each node is encrypted and published to Walrus, owned by you.</p></div>
            <div className="flow-arrow reveal d2"><FlowArrow /></div>
            <div className="flow-step reveal d3"><div className="n">03</div><h4>Propagate</h4><p>The session head bumps; collaborators decrypt only what policy allows, attributed by owner.</p></div>
            <div className="flow-arrow reveal d3"><FlowArrow /></div>
            <div className="flow-step reveal d4"><div className="n">04</div><h4>Recheck</h4><p>A poll loop notifies everyone when a node lands or changes — "check again."</p></div>
          </div>
        </div>
      </section>

      <hr className="divider" />

      {/* ============ FEATURES ============ */}
      <section id="features">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Features</span>
            <h2>Everything you need to share memory without losing control.</h2>
          </div>
          <div className="feat-grid">
            <div className="feat reveal d1">
              <div className="ic" style={{ color: 'var(--spore)', borderColor: 'rgba(124,224,160,0.4)' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M12 8.5v3m-1.5 1.5L7 16m9.5-1L13 13" /></svg></div>
              <h3>Private graph</h3>
              <p>A structured, owner-attributed graph of skills, projects, people, concepts, and communications — captured as you talk.</p>
            </div>
            <div className="feat reveal d2">
              <div className="ic" style={{ color: 'var(--orchid)', borderColor: 'rgba(212,121,201,0.4)' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8 11l8-4M8 13l8 4" /></svg></div>
              <h3>Depth-share</h3>
              <p>Select a root, slide depth 0–3, preview the exact neighborhood that will be shared, then graft it into a session.</p>
            </div>
            <div className="feat reveal d3">
              <div className="ic" style={{ color: 'var(--amber)', borderColor: 'rgba(232,162,74,0.4)' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /><circle cx="12" cy="12" r="4" /></svg></div>
              <h3>Live sessions</h3>
              <p>One mutable Session object on Sui; everything else immutable and versioned. Expansions propagate to every member.</p>
            </div>
            <div className="feat reveal d1">
              <div className="ic" style={{ color: 'var(--teal)', borderColor: 'rgba(95,214,196,0.4)' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9z" /><path d="M10.5 21a1.8 1.8 0 003 0" /></svg></div>
              <h3>Notify &amp; recheck</h3>
              <p>A poll loop (never webhooks) surfaces new and changed nodes in a "check again" feed with reveal-on-demand.</p>
            </div>
            <div className="feat reveal d2">
              <div className="ic" style={{ color: 'var(--rust)', borderColor: 'rgba(224,118,74,0.4)' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 018 0" /><path d="M15 4l4-1" strokeLinecap="round" /></svg></div>
              <h3>Ownership &amp; revocation</h3>
              <p>Every blob is owned by its author's wallet. Remove a member and future decrypts fail closed — forward-only, by design.</p>
            </div>
            <div className="feat reveal d3">
              <div className="ic" style={{ color: 'var(--spore)', borderColor: 'rgba(124,224,160,0.4)' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 3H5a2 2 0 00-2 2v3m13-5h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3m13 5h3a2 2 0 002-2v-3" /><circle cx="12" cy="12" r="3" /></svg></div>
              <h3>MCP for any platform</h3>
              <p>A standard MCP server exposes 12 memory tools, so any agent host — not just one vendor — gets a Mycelia memory.</p>
            </div>
          </div>
        </div>
      </section>

      <hr className="divider" />

      {/* ============ USE CASES / PERSONAS ============ */}
      <section id="use-cases">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Who it's for</span>
            <h2>Built for the way teams of humans and agents actually work.</h2>
          </div>
          <div className="persona-grid">
            <div className="persona reveal d1">
              <div className="tag"><span className="av" style={{ background: 'var(--mint)' }}>B</span> The Builder</div>
              <h3>Onboard a collaborator with the right slice</h3>
              <p>Share <span className="mono" style={{ color: 'var(--ink)' }}>Project X</span> at depth 2 with a teammate and keep it live as the project evolves — without leaking unrelated personal nodes.</p>
            </div>
            <div className="persona reveal d2">
              <div className="tag"><span className="av" style={{ background: 'var(--lavender)' }}>C</span> The Collaborator</div>
              <h3>Contribute and see only what's shared</h3>
              <p>Join a session, graft your <span className="mono" style={{ color: 'var(--ink)' }}>Design System</span> at depth 1, and get nudged the moment something new lands.</p>
            </div>
            <div className="persona reveal d3">
              <div className="tag"><span className="av" style={{ background: 'var(--peach)' }}>M</span> The Mentor</div>
              <h3>Quick share, quick revoke</h3>
              <p>Drop a high-value node — a hiring rubric, a postmortem — into many short-lived sessions, and un-share to actually limit future access.</p>
            </div>
            <div className="persona reveal d1">
              <div className="tag"><span className="av" style={{ background: 'var(--sky)' }}>L</span> The Team Lead</div>
              <h3>Own a durable, audited session</h3>
              <p>Manage membership, fund storage renewal, and watch the feed — so the session never silently expires and ex-members stay out.</p>
            </div>
            <div className="persona reveal d2">
              <div className="tag"><span className="av" style={{ background: 'var(--rose)' }}>P</span> The Privacy-First User</div>
              <h3>Know exactly who can decrypt</h3>
              <p>Adopt Mycelia <em>because</em> of Seal + Walrus: clear trust assumptions, threshold key servers, and no cleartext anywhere.</p>
            </div>
            <div className="persona reveal d3" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', background: 'var(--canvas-soft)' }}>
              <h3 style={{ fontSize: 22 }}>Your agent, your call.</h3>
              <p style={{ margin: '10px 0 16px' }}>Whichever side of the table you're on, you keep ownership and control.</p>
              <button className="btn btn-ghost" style={{ minHeight: 42, padding: '10px 18px' }} onClick={() => login()}>Start building</button>
            </div>
          </div>
        </div>
      </section>

      <hr className="divider" />

      {/* ============ TRUST / SECURITY ============ */}
      <section id="trust" className="trust-sec">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Trust &amp; security</span>
            <h2>Seven invariants, enforced in code and tests.</h2>
            <p>These aren't marketing promises — they're assertions the build refuses to violate.</p>
          </div>
          <div className="invariants">
            <Invariant d="d1"><strong>No cleartext leaves your device</strong> — only an encrypted session-head pointer (blob IDs + a version int) ever does.</Invariant>
            <Invariant d="d1"><strong>Exactly one mutable shared object</strong> per session. Everything else is immutable, versioned ciphertext.</Invariant>
            <Invariant d="d2"><strong>Storage is rented per epoch and renewed</strong> by the daemon — surfaced as "funded through epoch N," never silently lost.</Invariant>
            <Invariant d="d2"><strong>Revocation is forward-only</strong> — we block future key issuance and never claim to hard-delete what was already read.</Invariant>
            <Invariant d="d3"><strong>Single-writer per node</strong> — only the owner publishes new versions, so there's no merge ambiguity.</Invariant>
            <Invariant d="d3"><strong>Owner = the Walrus blob object's owner</strong> — you pay for and control your own memory.</Invariant>
            <Invariant d="d4"><strong>Encrypt before publish, always</strong> — a publish path that can emit plaintext is treated as a bug. It fails closed.</Invariant>
            <Invariant d="d4"><strong>Below-threshold key servers fail closed</strong> — a denied decrypt means "no access," never a silent downgrade.</Invariant>
          </div>
          <div className="quote-band reveal">
            <p>"No cleartext <span className="em">ever</span> leaves your device."</p>
          </div>
        </div>
      </section>

      <hr className="divider" />

      {/* ============ STATUS ============ */}
      <section id="status">
        <div className="wrap">
          <div className="status-grid">
            <div className="reveal">
              <span className="eyebrow">Status</span>
              <h2 style={{ fontSize: 'clamp(30px,4vw,42px)', marginTop: 14 }}>Live on Sui testnet — real transactions, not a mockup.</h2>
              <p className="muted" style={{ fontSize: 17, marginTop: 16 }}>Every layer is wired end-to-end against live infrastructure: real Walrus blobs, real Seal threshold encryption, real Sui Move policy. The full persona lifecycle — create, share, cross-party decrypt, contribute, revoke, fail-closed — passes on testnet.</p>
              <div className="cta-row" style={{ display: 'flex', gap: 14, marginTop: 28, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => login()}>Try it now</button>
                <a href="#how" className="btn btn-ghost">Read the architecture</a>
              </div>
            </div>
            <div className="status-card reveal d2">
              <div className="status-row"><span className="led" /><span className="lbl">Walrus + Seal + Sui round-trip</span><span className="badge-pass">PASS</span></div>
              <div className="status-row"><span className="led" /><span className="lbl">Persona lifecycle (P1–P5)</span><span className="val">17 / 17</span></div>
              <div className="status-row"><span className="led" /><span className="lbl">Cross-party reveal, both ways</span><span className="badge-pass">PASS</span></div>
              <div className="status-row"><span className="led" /><span className="lbl">Forward-only revocation</span><span className="badge-pass">PASS</span></div>
              <div className="status-row"><span className="led" /><span className="lbl">MCP server (any host)</span><span className="val">12 tools</span></div>
              <div className="status-row"><span className="led" /><span className="lbl">Web visualizer · Privy auth</span><span className="val">wired</span></div>
            </div>
          </div>
        </div>
      </section>

      <hr className="divider" />

      {/* ============ GET STARTED — embeds <Login/> (keeps testids) ============ */}
      <section id="get-started">
        <div className="wrap">
          <div className="section-head center reveal">
            <span className="eyebrow">Get started</span>
            <h2>Drop Mycelia into any agent in two steps.</h2>
            <p>Mycelia ships as a standard MCP server. Point your agent host at it and your agent gets a private, shareable memory graph — or sign in to the web visualizer below.</p>
          </div>
          <div className="grid-2" style={{ alignItems: 'start' }}>
            <div className="code-card reveal d1">
              <div className="bar"><span className="b" style={{ background: '#44403c' }} /><span className="b" style={{ background: '#57534e' }} /><span className="b" style={{ background: '#78716c' }} /><span className="fn">mcp.json</span></div>
              <pre>{`# 1 · register the Mycelia MCP server
{
  "mcpServers": {
    "mycelia": {
      "command": "npx",
      "args": ["-y", "@mycelia/mcp"]
    }
  }
}`}</pre>
            </div>
            <div className="code-card reveal d2">
              <div className="bar"><span className="b" style={{ background: '#44403c' }} /><span className="b" style={{ background: '#57534e' }} /><span className="b" style={{ background: '#78716c' }} /><span className="fn">your agent · 12 tools</span></div>
              <pre>{`# 2 · your agent now has memory tools
mycelia_remember   // upsert nodes + edges
mycelia_recall     // structured subgraph
mycelia_create_session
mycelia_share      // graft a root at depth d
mycelia_join  mycelia_sync  mycelia_reveal
mycelia_expand     // live propagation
mycelia_add_member  mycelia_remove_member
mycelia_unshare    mycelia_renew`}</pre>
            </div>
          </div>
          <p className="hint reveal" style={{ textAlign: 'center', marginTop: 18 }}>Local Sui keystore · local SQLite graph · an in-process daemon polls for updates and auto-renews storage.</p>

          {/* The real auth card — preserves the Playwright data-testids. */}
          <div className="login-mount reveal d1">
            <Login />
          </div>
        </div>
      </section>

      <hr className="divider" />

      {/* ============ FAQ ============ */}
      <section id="faq">
        <div className="wrap">
          <div className="section-head center reveal">
            <span className="eyebrow">FAQ</span>
            <h2>Questions, answered.</h2>
          </div>
          <div className="faq">
            <Faq d="d1" q="Does Mycelia only work with one agent platform?">No. The core is framework-agnostic and exposed through a standard MCP server, so any MCP-capable host — Claude Code or otherwise — can give its agent a Mycelia memory. There's also a web visualizer with Privy auth and embedded wallets.</Faq>
            <Faq d="d1" q="Where is my data actually stored?">Your full graph stays local in SQLite. When you share, encrypted blobs are published to Walrus (decentralized storage) and owned by your own wallet. The only on-chain shared object is a tiny Session pointer on Sui. No central server holds your memory.</Faq>
            <Faq d="d2" q="Can someone read what I share if they're not a member?">No. Every blob — including the manifest that describes graph structure — is Seal ciphertext. Decryption requires being a session member and the node's identity being in the on-chain policy. A denied decrypt fails closed as "no access," never a silent retry or downgrade.</Faq>
            <Faq d="d2" q="What happens when I revoke access?">Removing a member or un-sharing a node blocks all <em>future</em> key issuance — the policy gate aborts on the next request. We're explicit that this is forward-only: copies a member already decrypted locally aren't magically retracted. We never claim hard-delete.</Faq>
            <Faq d="d3" q="Who pays for storage, and what if it expires?">You do — your wallet rents Walrus storage per epoch and owns each blob. A background daemon tracks expiry and renews before storage lapses, surfacing "funded through epoch N" so a session never silently dies.</Faq>
            <Faq d="d3" q="What does &quot;depth-share&quot; mean?">Instead of sharing a whole document, you share a root node and its <em>d</em>-hop neighborhood (depth 0–3). You preview exactly which nodes get included before confirming, so you never accidentally leak unrelated parts of your graph.</Faq>
            <Faq d="d4" q="Is this production-ready?">Mycelia runs live on Sui testnet today with real Walrus + Seal + Sui transactions and a passing persona lifecycle test suite (17/17). It's an early, fully-wired build — no mocks — built on the four-layer architecture described above.</Faq>
          </div>
        </div>
      </section>

      {/* ============ FINAL CTA ============ */}
      <section className="final-cta">
        <div className="wrap">
          <div className="panel reveal">
            <span className="eyebrow">Start today</span>
            <h2 style={{ marginTop: 14 }}>Give your agent a memory it owns.</h2>
            <p>Build a private knowledge graph, share encrypted slices on your terms, and revoke when you're done. Live on Sui testnet — works in any platform via MCP.</p>
            <div className="cta-row">
              <button className="btn btn-primary" onClick={() => login()}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Get started
              </button>
              <a href="#how" className="btn btn-ghost">See how it works</a>
            </div>
          </div>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer>
        <div className="wrap">
          <div className="foot-grid">
            <div className="foot-brand">
              <a href="#top" className="brand">
                <BrandLogo />
                Mycelia
              </a>
              <p>A local-first, end-to-end-encrypted, multi-party memory graph for AI agents. Hosted by no one.</p>
            </div>
            <div className="foot-cols">
              <div className="foot-col">
                <h5>Product</h5>
                <a href="#how">How it works</a>
                <a href="#features">Features</a>
                <a href="#get-started">Get started</a>
                <a href="#status">Status</a>
              </div>
              <div className="foot-col">
                <h5>Built on</h5>
                <a href="#how">Walrus · Storage</a>
                <a href="#how">Seal · Confidentiality</a>
                <a href="#how">Sui · Coordination</a>
                <a href="#how">Tatum · Access</a>
              </div>
              <div className="foot-col">
                <h5>Learn</h5>
                <a href="#problem">The problem</a>
                <a href="#trust">Security model</a>
                <a href="#use-cases">Use cases</a>
                <a href="#faq">FAQ</a>
                <a href="#pitch" onClick={(e) => { e.preventDefault(); seePitch(); }}>Pitch deck</a>
              </div>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© {year} Mycelia. Encrypt before publish, always.</span>
            <span className="mono" style={{ color: 'var(--muted)' }}>local-first · e2e-encrypted · forward-only revocation</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function BrandLogo() {
  return (
    <svg className="logo" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="4.5" fill="#a7e5d3" stroke="#0c0a09" strokeWidth="1" />
      <circle cx="6" cy="9" r="2.6" fill="#c8b8e0" stroke="#0c0a09" strokeWidth="1" />
      <circle cx="25" cy="8" r="2.6" fill="#f4c5a8" stroke="#0c0a09" strokeWidth="1" />
      <circle cx="24" cy="24" r="2.6" fill="#a8c8e8" stroke="#0c0a09" strokeWidth="1" />
      <circle cx="7" cy="24" r="2.2" fill="#e8b8c4" stroke="#0c0a09" strokeWidth="1" />
      <g stroke="#a8a29e" strokeWidth="1.1" opacity="0.6">
        <path d="M16 16 L6 9" /><path d="M16 16 L25 8" /><path d="M16 16 L24 24" /><path d="M16 16 L7 24" />
      </g>
    </svg>
  );
}

function FlowArrow() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
  );
}

function Invariant({ d, children }: { d: string; children: React.ReactNode }) {
  return (
    <div className={`invariant reveal ${d}`}>
      <span className="chk"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12l5 5 9-11" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
      <span>{children}</span>
    </div>
  );
}

function Faq({ d, q, children }: { d: string; q: string; children: React.ReactNode }) {
  return (
    <details className={`q-item reveal ${d}`}>
      <summary>{q}<span className="plus">+</span></summary>
      <div className="a-body">{children}</div>
    </details>
  );
}
