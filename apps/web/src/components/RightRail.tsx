import { useMemo, useState } from 'react';
import { relevance, type NodeType, type EventKind } from '@mycelia/core';
import { useStore, sharePreview } from '../store.js';
import { Avatar } from './ui/Avatar.js';
import { TypeGlyph, TYPE_LABEL } from './ui/Glyph.js';
import { memberHue, lockedHue, shortAddr } from '../lib/palette.js';

export function RightRail() {
  const sharePanelOpen = useStore((s) => s.sharePanelOpen);
  return (
    <aside className="rail scroll">
      {sharePanelOpen ? <GraftStepper /> : <Inspector />}
      <ActivityFeed />
    </aside>
  );
}

function InspectorEmpty({ hint }: { hint: string }) {
  return <div className="col" data-testid="inspector"><div className="eyebrow">Inspector</div><div className="hint">{hint}</div></div>;
}

function Inspector() {
  const { view, selectedNodeId, manifest, state, address, reveal, unshareNode, busy } = useStore();
  const members = state?.members ?? [];
  if (!selectedNodeId) return <InspectorEmpty hint="Select a memory in the graph to inspect it." />;
  const node = view.find((v) => v.nodeId === selectedNodeId);
  if (!node) return <InspectorEmpty hint="Memory not found." />;
  const root = manifest?.roots.find((r) => r.nodeId === selectedNodeId);
  const isMine = node.owner.toLowerCase() === address?.toLowerCase();
  const isSessionOwner = state?.owner.toLowerCase() === address?.toLowerCase();

  return (
    <div className="col" data-testid="inspector">
      <div className="eyebrow">Inspector</div>
      <div className="card col">
        {node.decrypted && <h3 className="insp-title" data-testid="node-title">{node.title}</h3>}
        {node.decrypted && node.body && <p className="muted">{node.body}</p>}

        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <span className="badge"><TypeGlyph type={node.type} size={12} />{TYPE_LABEL[node.type]}</span>
          <span className="badge"><Avatar address={node.owner} hue={node.locked ? lockedHue() : memberHue(node.owner, members, state?.owner)} />{isMine ? 'yours' : shortAddr(node.owner)}</span>
          {root && <span className="badge up">root · depth {root.depth}</span>}
        </div>

        {node.locked ? (
          <div className="trust-note">Shared before you joined, and not re-shared. The owner controls access.</div>
        ) : node.decrypted ? null : (
          <>
            <button className="btn-pill" data-testid="reveal" disabled={!!busy} onClick={() => reveal(node.nodeId)}>Reveal (decrypt)</button>
            <div className="trust-note">Encrypted with Seal. Only session members can decrypt.</div>
          </>
        )}

        {isMine && isSessionOwner && !node.locked && (
          <>
            <button className="btn-outline danger btn-sm" data-testid="prune" disabled={!!busy} onClick={() => unshareNode(node.nodeId)}>Stop sharing this</button>
            <div className="hint">(forward-only: blocks future reads)</div>
          </>
        )}
      </div>
    </div>
  );
}

function GraftStepper() {
  const { local, shareRootId, depth, setShareRoot, setDepth, openShare, shareSelection, progress, busy, state, config } = useStore();
  const clearSamples = useStore((s) => s.clearSamples);
  const preview = sharePreview(local, shareRootId, depth);
  const hasSamples = local.nodes.some((n) => n.tags?.includes('sample'));
  const memberCount = state?.members.length ?? 1;
  const threshold = config?.sealThreshold ?? 0;
  const servers = config?.keyServerIds.length ?? 0;
  // one pass over edges -> degree per node, instead of an O(nodes x edges) filter per row
  const degree = useMemo(() => {
    const d = new Map<string, number>();
    for (const e of local.edges) { d.set(e.from, (d.get(e.from) ?? 0) + 1); d.set(e.to, (d.get(e.to) ?? 0) + 1); }
    return d;
  }, [local.edges]);
  const connCount = (id: string) => degree.get(id) ?? 0;
  const errored = progress.find((p) => p.status === 'error');

  return (
    <div className="stepper" data-testid="share-panel">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="eyebrow">Graft a memory</div>
        <button className="btn-text" aria-label="Close" onClick={() => openShare(false)}>✕</button>
      </div>

      {/* step 1 */}
      <div className="step-head"><span className="sn">1</span>Choose a memory</div>
      <Capture />
      <div className="memory-list">
        {local.nodes.map((n) => (
          <button key={n.id} className={`row-item${n.id === shareRootId ? ' active' : ''}`} data-testid="local-node"
            onClick={() => setShareRoot(n.id)}>
            <div className="t">{n.title}{n.tags?.includes('sample') && <span className="badge up" style={{ marginLeft: 6 }}>sample</span>}</div>
            <div className="m">{TYPE_LABEL[n.type]} · {connCount(n.id)} connections</div>
          </button>
        ))}
      </div>
      {hasSamples && <button className="btn-text btn-sm" onClick={clearSamples}>Clear samples</button>}

      {/* step 2 */}
      <div className={`step-head${shareRootId ? '' : ' todo'}`}><span className="sn">2</span>How much context?</div>
      <input type="range" min={0} max={3} value={depth} data-testid="share-depth" aria-label="Share depth"
        onChange={(e) => setDepth(Number(e.target.value))} />
      <div className="row" style={{ justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
        <span>just this</span><span>+1</span><span>+2</span><span>+3</span>
      </div>
      <div>+{depth} hop{depth === 1 ? '' : 's'} · {preview.length} memories</div>
      <div className="hint">Dashed nodes on the canvas show exactly what will be shared.</div>
      {shareRootId && (
        <div className="card col" data-testid="share-preview" style={{ gap: 4 }}>
          {preview.map((n) => (
            <div key={n.id} className="row"><TypeGlyph type={n.type} size={12} /><span className="hint">{n.title}</span></div>
          ))}
        </div>
      )}

      {/* step 3 */}
      <div className="step-head"><span className="sn">3</span>Encrypt &amp; share</div>
      <div className="trust-note">Encrypted with Seal. Only the {memberCount} members of this session can decrypt. {threshold}-of-{servers} key servers.</div>
      {progress.length > 0 && (
        <div className="ceremony" data-testid="progress">
          {progress.map((s) => (
            <div key={s.key} className={`c-step ${s.status}`}>
              <span className="ck">{s.status === 'done' ? '✓' : ''}</span>
              <span>{s.label}</span>
            </div>
          ))}
          {errored && (
            <>
              <div className="hint" style={{ color: 'var(--error)' }}>{errored.error}</div>
              <button className="btn-outline btn-sm" onClick={() => shareSelection()}>Try again</button>
            </>
          )}
        </div>
      )}

      <button className="btn-pill" data-testid="graft" disabled={!shareRootId || !!busy} onClick={() => shareSelection()}>
        Graft {preview.length} memor{preview.length === 1 ? 'y' : 'ies'}
      </button>
    </div>
  );
}

function Capture() {
  const capture = useStore((s) => s.capture);
  const local = useStore((s) => s.local);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState<NodeType>('concept');
  const [connectTo, setConnectTo] = useState('');

  if (!open) return <button className="btn-text" data-testid="capture-toggle" onClick={() => setOpen(true)}>＋ Capture a new memory</button>;
  return (
    <div className="card col" data-testid="capture-form">
      <input data-testid="capture-title" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea data-testid="capture-body" placeholder="What to remember…" rows={2} value={body} onChange={(e) => setBody(e.target.value)} />
      <select data-testid="capture-type" value={type} onChange={(e) => setType(e.target.value as NodeType)}>
        {(['skill', 'project', 'person', 'concept', 'communication'] as NodeType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
      </select>
      <select value={connectTo} onChange={(e) => setConnectTo(e.target.value)} aria-label="Connect to">
        <option value="">Connect to… (optional)</option>
        {local.nodes.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
      </select>
      <div className="row">
        <button className="btn-outline btn-sm" data-testid="capture-save" disabled={!title.trim()}
          onClick={() => { capture({ title: title.trim(), body, type, connectTo: connectTo || undefined, rel: connectTo ? 'relates' : undefined }); setTitle(''); setBody(''); setConnectTo(''); setOpen(false); }}>Save to my memory</button>
        <button className="btn-text btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

const VERB: Record<EventKind, string> = {
  added: 'added', expanded: 'expanded', shared: 'grafted', revoked: 'un-shared',
  member_added: 'added a member', member_removed: 'removed a member',
};

function ActivityFeed() {
  const { events, notifications, manifest, reveal, view, busy, address, state } = useStore();
  const members = state?.members ?? [];
  const myRoots = useMemo(() => {
    const titleById = new Map(view.map((v) => [v.nodeId, v.title]));
    return (manifest?.roots ?? []).map((r) => titleById.get(r.nodeId) || '').filter(Boolean) as string[];
  }, [manifest, view]);
  const empty = events.length === 0 && notifications.length === 0;
  const who = (a: string) => (a.toLowerCase() === address?.toLowerCase() ? 'You' : shortAddr(a));

  return (
    <div className="col" style={{ marginTop: 'auto' }} data-testid="feed">
      <div className="eyebrow">Activity</div>
      {empty && <div className="hint">No activity yet. Grafts and reveals will appear here live.</div>}
      {notifications.map((n) => (
        <div key={'nt' + n.id} className="feed-item">
          <div className="what" style={n.kind === 'renewal_needed' ? { color: 'var(--warning)' } : undefined}>
            {n.kind === 'head' ? 'Session updated · just now' : n.kind === 'renewal_needed' ? 'Storage renewal needed' : n.kind}
          </div>
        </div>
      ))}
      {[...events].reverse().slice(0, 20).map((e) => {
        const actor = who(e.actor);
        return (
        <div key={e.seq} className="feed-item">
          <div className="who">
            <Avatar address={e.actor} hue={memberHue(e.actor, members, state?.owner)} />
            <span className="mono">{actor}</span>
          </div>
          <div className="what">{actor} {VERB[e.kind]}{e.title ? ` "${e.title}"` : ''}</div>
          {myRoots.length > 0 && e.title && <RelevanceBar value={relevance(e, myRoots)} />}
          {e.nodeId && <button className="btn-text btn-sm" data-testid="feed-reveal" disabled={!!busy} onClick={() => reveal(e.nodeId!)}>Reveal</button>}
        </div>
        );
      })}
    </div>
  );
}

function RelevanceBar({ value }: { value: number }) {
  return (
    <div className="relevance" title={`relevance ${(value * 100) | 0}%`}>
      <div style={{ width: `${Math.max(6, value * 100)}%` }} />
    </div>
  );
}
