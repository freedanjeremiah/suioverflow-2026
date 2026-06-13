import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { api } from '../lib/api.js';
import { useStore } from '../store.js';

export function Login() {
  const { ready, authenticated, user, login, getAccessToken, logout } = usePrivy();
  const afterLogin = useStore((s) => s.afterLogin);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [devId, setDevId] = useState('did:privy:builder');
  const [devAllowed, setDevAllowed] = useState<boolean>(false);
  const [privyOn, setPrivyOn] = useState<boolean>(true);

  useEffect(() => { api.health().then((h) => { setDevAllowed(Boolean(h.devLogin)); setPrivyOn(Boolean(h.privy)); }).catch(() => setDevAllowed(true)); }, []);

  // Once Privy authenticates, bridge to a funded Sui wallet via the backend.
  useEffect(() => {
    if (!authenticated || !user) return;
    let cancel = false;
    (async () => {
      setBusy(true); setMsg('Bridging to your Sui wallet…');
      try {
        let res;
        try {
          const token = await getAccessToken();
          res = await api.login({ token: token ?? undefined });
        } catch {
          res = await api.login({ privyUserId: user.id }); // dev fallback when server lacks PRIVY_APP_SECRET
        }
        if (!cancel) { setMsg('Funding your wallet…'); afterLogin(res.seedHex, res.address, user?.email?.address ?? null); }
      } catch (e) { if (!cancel) setMsg('Login failed: ' + (e as Error).message); }
      finally { if (!cancel) setBusy(false); }
    })();
    return () => { cancel = true; };
  }, [authenticated, user, getAccessToken, afterLogin]);

  const devLogin = async () => {
    setBusy(true); setMsg('Dev login…');
    try { const res = await api.login({ privyUserId: devId }); afterLogin(res.seedHex, res.address, null); }
    catch (e) { setMsg('Dev login failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center', position: 'relative', background: 'var(--canvas)' }}>
      <div className="orb drift" style={{ width: 380, height: 380, background: 'radial-gradient(circle, var(--peach), transparent 70%)', opacity: 0.45 }} />
      <div className="card" style={{ width: 420, padding: 28, position: 'relative', zIndex: 1 }}>
        <h1 style={{ fontSize: 24 }}>Your agent's memory, shared on your terms.</h1>
        <p className="muted" style={{ marginTop: 8 }}>Sign in to grow your graph and graft encrypted slices into shared sessions.</p>

        {!authenticated ? (
          <button className="btn-pill" style={{ width: '100%', marginTop: 16 }} disabled={!ready || busy} onClick={() => login()}>
            {ready ? 'Sign in with email' : 'Loading…'}
          </button>
        ) : (
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 16 }}>
            <span className="badge">{user?.email?.address ?? user?.id}</span>
            <button className="btn-text" onClick={() => logout()}>Sign out</button>
          </div>
        )}
        {msg && <p className="hint" style={{ marginTop: 12 }}>{msg}</p>}

        {devAllowed && (
          <details className="fold" open style={{ marginTop: 20, borderTop: '1px solid var(--hairline)', paddingTop: 16 }}>
            <summary>Developer login{privyOn ? '' : ' (PRIVY_APP_SECRET not set)'}</summary>
            <div className="row" style={{ marginTop: 10 }}>
              <input data-testid="dev-userid" value={devId} onChange={(e) => setDevId(e.target.value)} placeholder="privy user id" />
              <button className="btn-outline btn-sm" data-testid="dev-login" disabled={busy} onClick={devLogin}>Enter</button>
            </div>
            <p className="hint" style={{ marginTop: 8 }}>Derives a real, funded Sui wallet for this identity.</p>
          </details>
        )}
      </div>
    </div>
  );
}
