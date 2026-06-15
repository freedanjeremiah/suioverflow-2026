import { useState } from 'react';
import { useStore } from '../store.js';
import { Avatar } from './ui/Avatar.js';
import { memberHue, shortAddr } from '../lib/palette.js';

export function LeftRail() {
  const { sessions, currentId, state, address, email, busy } = useStore();
  const { createSession, joinSession, selectSession, addMember, removeMember, logout } = useStore();
  const [newName, setNewName] = useState('');
  const [joinId, setJoinId] = useState('');
  const [memberAddr, setMemberAddr] = useState('');
  const pushToast = useStore((s) => s.pushToast);
  const ref = sessions.find((s) => s.id === currentId);
  const isOwner = ref?.role === 'owner';
  const members = state?.members ?? (address ? [address] : []);

  const invite = () => {
    if (!currentId) return;
    const name = ref?.name ?? 'shared session';
    const text = `Join my Mycelia session "${name}": open the app, choose "Join with a session ID", paste ${currentId}`;
    navigator.clipboard?.writeText(text).then(
      () => pushToast('success', 'Invite copied. Send it to your collaborator.'),
      () => pushToast('info', currentId),
    );
  };

  return (
    <aside className="rail scroll">
      {/* 1. header */}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="wordmark"><span className="dot" style={{ background: 'var(--mint)' }} />Mycelia</span>
        <button className="btn-text btn-sm" onClick={logout} data-testid="logout">Sign out</button>
      </div>

      {/* 2. identity */}
      {address && (
        <div className="identity" data-testid="my-address" data-address={address}>
          <Avatar address={address} size="lg" label={email}
            hue={memberHue(address, members, state?.owner)} title={address} />
          <div className="meta">
            <div className="who">{email || 'You'}</div>
            <div className="addr">{shortAddr(address)}</div>
          </div>
        </div>
      )}

      {/* 3. sessions */}
      <section className="col">
        <div className="eyebrow">Sessions</div>
        {sessions.length === 0 && (
          <div className="hint">Sessions are encrypted spaces you share. Create one below.</div>
        )}
        {sessions.map((s) => (
          <button key={s.id} className={`row-item${s.id === currentId ? ' active' : ''}`}
            data-testid="session-item" data-session-id={s.id} onClick={() => selectSession(s.id)}>
            <div className="session-row">
              <span className="name">{s.name}</span>
              <span className="badge up">{s.role}</span>
            </div>
            <div className="sid">{shortAddr(s.id)}</div>
          </button>
        ))}
        <div className="row" style={{ marginTop: 4 }}>
          <input data-testid="new-session-name" placeholder="Name a new session…" value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim() && !busy) { createSession(newName.trim()); setNewName(''); } }} />
          <button className="btn-outline btn-sm" data-testid="create-session" disabled={!newName.trim() || !!busy}
            onClick={() => { createSession(newName.trim()); setNewName(''); }}>Create</button>
        </div>
        <details className="fold" open>
          <summary>Join with a session ID</summary>
          <div className="row" style={{ marginTop: 6 }}>
            <input data-testid="join-session-id" placeholder="0x… session id" value={joinId}
              onChange={(e) => setJoinId(e.target.value)} />
            <button className="btn-outline btn-sm" data-testid="join-session" disabled={!joinId.trim() || !!busy}
              onClick={() => { joinSession(joinId.trim()); setJoinId(''); }}>Join</button>
          </div>
        </details>
      </section>

      {/* 4. members */}
      {currentId && state && (
        <section className="col">
          <div className="eyebrow">Members</div>
          <div className="member-strip">
            {members.map((mAddr) => {
              const owner = mAddr.toLowerCase() === state.owner.toLowerCase();
              return (
                <span key={mAddr} className="member-chip" data-testid="member-chip">
                  <Avatar address={mAddr} hue={memberHue(mAddr, members, state.owner)} ownerRing={owner} />
                  <span className="mono">{shortAddr(mAddr)}</span>
                  {owner && <span className="badge up">owner</span>}
                  {isOwner && !owner && (
                    <button className="x" aria-label="Remove member" onClick={() => removeMember(mAddr)}>✕</button>
                  )}
                </span>
              );
            })}
          </div>
          {isOwner && (
            <div className="col" style={{ marginTop: 6 }}>
              <button className="btn-outline btn-sm" onClick={invite}>Copy invite</button>
              <details className="fold" open>
                <summary>Add by wallet address</summary>
                <div className="row" style={{ marginTop: 6 }}>
                  <input data-testid="member-address" placeholder="0x… wallet address" value={memberAddr}
                    onChange={(e) => setMemberAddr(e.target.value)} />
                  <button className="btn-outline btn-sm" data-testid="add-member" disabled={!memberAddr.trim() || !!busy}
                    onClick={() => { addMember(memberAddr.trim()); setMemberAddr(''); }}>Add</button>
                </div>
                <div className="hint" style={{ marginTop: 6 }}>
                  Removing someone later blocks future reads only; copies they already decrypted stay on their device.
                </div>
              </details>
            </div>
          )}
        </section>
      )}

      {/* 5. storage */}
      {state && <StorageSection isOwner={isOwner} />}

      <GuideCard />
    </aside>
  );
}

function StorageSection({ isOwner }: { isOwner: boolean }) {
  const state = useStore((s) => s.state);
  const currentEpoch = useStore((s) => s.currentEpoch);
  const busy = useStore((s) => s.busy);
  const renew = useStore((s) => s.renew);
  const epochs = useStore((s) => s.config?.storageEpochs ?? 5);
  if (!state) return null;
  const expiring = currentEpoch > 0 && state.endEpoch > 0 && state.endEpoch - currentEpoch <= 2;
  return (
    <section className="col" data-testid="storage">
      <div className="eyebrow">Storage</div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="hint">Funded through epoch {state.endEpoch || '—'}{currentEpoch ? ` · now ${currentEpoch}` : ''}</span>
        <span className="dot" data-testid="storage-health"
          style={{ background: expiring ? 'var(--warning)' : 'var(--success)' }} />
      </div>
      {expiring && <div className="hint" style={{ color: 'var(--warning)' }}>Storage expiring soon — renew to keep this session alive.</div>}
      {isOwner && <button className="btn-outline btn-sm" data-testid="renew" disabled={!!busy} onClick={() => renew(epochs)}>Renew storage</button>}
    </section>
  );
}

function GuideCard() {
  const phase = useStore((s) => s.phase);
  const guide = useStore((s) => s.guide);
  const sessions = useStore((s) => s.sessions);
  const dismissGuide = useStore((s) => s.dismissGuide);
  const steps = [
    { done: sessions.length > 0, label: 'Create a session' },
    { done: guide.grafted, label: 'Graft a memory into it' },
    { done: guide.revealed, label: 'Reveal something a member shared' },
  ];
  if (phase !== 'ready' || guide.dismissed || steps.every((s) => s.done)) return null;
  return (
    <div className="guide-card" style={{ marginTop: 'auto' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="eyebrow">First steps</div>
        <button className="btn-text btn-sm" aria-label="Dismiss guide" onClick={dismissGuide}>✕</button>
      </div>
      {steps.map((s, i) => (
        <div key={i} className={`guide-step${s.done ? ' done' : ''}`}>
          <span className="gn">{i + 1}</span>
          <span>{s.label}</span>
        </div>
      ))}
      <div className="hint" style={{ marginTop: 6 }}>
        Sample memories are pre-loaded so you can try grafting immediately.
      </div>
    </div>
  );
}
