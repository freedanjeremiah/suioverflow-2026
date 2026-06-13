import { useEffect, useState } from 'react';
import { useStore } from './store.js';
import { Landing } from './components/Landing.js';
import { Pitch } from './components/Pitch.js';
import { Docs } from './components/Docs.js';
import { LeftRail } from './components/LeftRail.js';
import { Visualizer } from './components/Visualizer.js';
import { RightRail } from './components/RightRail.js';
import { Toasts } from './components/ui/Toasts.js';

// Reactive current hash (logged-out hash routing: '' -> Landing, '#pitch' -> Pitch).
function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

export function App() {
  const phase = useStore((s) => s.phase);
  const init = useStore((s) => s.init);
  const currentId = useStore((s) => s.currentId);
  const poll = useStore((s) => s.pollNotifications);
  const config = useStore((s) => s.config);
  const hash = useHashRoute();

  useEffect(() => { void init(); }, [init]);

  // live "check again" + propagation polling
  useEffect(() => {
    if (!currentId) return;
    const ms = config?.pollIntervalMs ?? 8000;
    const t = setInterval(() => void poll(), ms);
    return () => clearInterval(t);
  }, [currentId, poll, config]);

  // Docs is a standalone reference reachable in any auth state.
  if (hash === '#docs') return <Docs />;
  if (phase === 'loading') return <Splash />;
  if (phase === 'login') return <LoggedOut />;
  return <Shell />;
}

// Logged-out view, hash-routed: the pitch deck on '#pitch', else the landing
// page (which itself embeds <Login/> so the auth flow + testids stay reachable).
function LoggedOut() {
  const hash = useHashRoute();
  return (
    <>
      {hash === '#pitch' ? <Pitch /> : <Landing />}
      <Toasts />
    </>
  );
}

function Shell() {
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  return (
    <div className="app">
      <button className="btn-outline btn-sm drawer-toggle left" data-testid="toggle-left"
        aria-label="Toggle sessions panel" onClick={() => setLeftOpen((v) => !v)}>☰</button>
      <button className="btn-outline btn-sm drawer-toggle right" data-testid="toggle-right"
        aria-label="Toggle inspector panel" onClick={() => setRightOpen((v) => !v)}>ⓘ</button>
      <div className={`rail-left${leftOpen ? ' open' : ''}`}><LeftRail /></div>
      <Visualizer />
      <div className={`rail-right${rightOpen ? ' open' : ''}`}><RightRail /></div>
      <Toasts />
    </div>
  );
}

function Splash() {
  return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center', background: 'var(--canvas)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div className="wordmark" style={{ fontSize: 34 }}>Mycelia</div>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--ink)', animation: 'pulse 1.6s infinite' }} />
        <div className="hint">Waking the mycelium…</div>
      </div>
    </div>
  );
}
