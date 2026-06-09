// Local-first private memory graph (SQLite) for the MCP server. MYCELIA_SPEC §2.1.
// Holds the agent's nodes/edges (cleartext, never leaves until encrypted) plus
// the sessions it tracks and daemon-detected notifications.
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { neighborhood, type Node, type Edge, type NodeType } from '@mycelia/core';

export interface SessionRef { session_id: string; name: string; cap_id: string | null; role: string; last_version: number; }

export class MemoryStore {
  private db: Database.Database;
  constructor(path: string, readonly owner: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (id TEXT PRIMARY KEY, owner TEXT, type TEXT, title TEXT, body TEXT, importance REAL, tags TEXT, created_at INTEGER, updated_at INTEGER, version INTEGER);
      CREATE TABLE IF NOT EXISTS edges (id TEXT PRIMARY KEY, "from" TEXT, "to" TEXT, rel TEXT, owner TEXT);
      CREATE TABLE IF NOT EXISTS sessions (session_id TEXT PRIMARY KEY, name TEXT, cap_id TEXT, role TEXT, last_version INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, kind TEXT, payload TEXT, ts INTEGER, acked INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS blobs (blob_object_id TEXT PRIMARY KEY, session_id TEXT, end_epoch INTEGER, kind TEXT);
    `);
  }

  // ---- private graph (Flow A) ----
  remember(p: { title: string; body: string; type: NodeType; importance?: number; tags?: string[]; links?: { to: string; rel: string }[] }): Node {
    const existing = this.db.prepare('SELECT * FROM nodes WHERE title=? AND owner=?').get(p.title, this.owner) as any;
    const now = Date.now();
    let node: Node;
    if (existing) {
      node = { ...this.rowToNode(existing), body: p.body, type: p.type, importance: p.importance ?? existing.importance, tags: p.tags ?? JSON.parse(existing.tags), updatedAt: now, version: existing.version + 1 };
      this.db.prepare('UPDATE nodes SET type=?,body=?,importance=?,tags=?,updated_at=?,version=? WHERE id=?')
        .run(node.type, node.body, node.importance, JSON.stringify(node.tags), now, node.version, node.id);
    } else {
      node = { id: randomUUID(), owner: this.owner, type: p.type, title: p.title, body: p.body, importance: p.importance ?? 0.5, tags: p.tags ?? [], createdAt: now, updatedAt: now, version: 1 };
      this.db.prepare('INSERT INTO nodes(id,owner,type,title,body,importance,tags,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(node.id, node.owner, node.type, node.title, node.body, node.importance, JSON.stringify(node.tags), now, now, node.version);
    }
    for (const l of p.links ?? []) {
      const to = this.nodeByTitleOrId(l.to);
      if (to) this.link(node.id, to.id, l.rel);
    }
    return node;
  }

  link(from: string, to: string, rel: string) {
    const dup = this.db.prepare('SELECT 1 FROM edges WHERE "from"=? AND "to"=? AND rel=?').get(from, to, rel);
    if (!dup) this.db.prepare('INSERT INTO edges(id,"from","to",rel,owner) VALUES(?,?,?,?,?)').run(randomUUID(), from, to, rel, this.owner);
  }

  nodeByTitleOrId(q: string): Node | undefined {
    const r = (this.db.prepare('SELECT * FROM nodes WHERE id=? OR title=?').get(q, q)) as any;
    return r ? this.rowToNode(r) : undefined;
  }
  allNodes(): Node[] { return (this.db.prepare('SELECT * FROM nodes').all() as any[]).map((r) => this.rowToNode(r)); }
  allEdges(): Edge[] { return (this.db.prepare('SELECT * FROM edges').all() as any[]).map((r) => ({ id: r.id, from: r.from, to: r.to, rel: r.rel, owner: r.owner })); }

  /** Lexical prefilter + d-hop neighborhood. Returns a subgraph for the agent to rank. */
  recall(query: string, depth = 1): { nodes: (Node & { score: number })[]; edges: Edge[] } {
    const nodes = this.allNodes();
    const edges = this.allEdges();
    const terms = query.toLowerCase().split(/\W+/).filter(Boolean);
    const score = (n: Node) => {
      const hay = `${n.title} ${n.body} ${n.tags.join(' ')}`.toLowerCase();
      let s = 0;
      for (const t of terms) if (hay.includes(t)) s += hay.split(t).length - 1;
      return s + (n.title.toLowerCase().includes(query.toLowerCase()) ? 3 : 0);
    };
    const ranked = nodes.map((n) => ({ n, s: score(n) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    const roots = (ranked.length ? ranked : nodes.map((n) => ({ n, s: 0 }))).slice(0, 6);
    const keep = new Set<string>();
    for (const r of roots) for (const id of neighborhood(r.n.id, edges, depth)) keep.add(id);
    const scoreMap = new Map(ranked.map((x) => [x.n.id, x.s]));
    const out = nodes.filter((n) => keep.has(n.id)).map((n) => ({ ...n, score: scoreMap.get(n.id) ?? 0 }));
    return { nodes: out, edges: edges.filter((e) => keep.has(e.from) && keep.has(e.to)) };
  }

  // ---- sessions ----
  trackSession(s: SessionRef) {
    this.db.prepare('INSERT INTO sessions(session_id,name,cap_id,role,last_version) VALUES(?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET name=excluded.name,cap_id=COALESCE(excluded.cap_id,sessions.cap_id),role=excluded.role')
      .run(s.session_id, s.name, s.cap_id, s.role, s.last_version);
  }
  sessions(): SessionRef[] { return this.db.prepare('SELECT * FROM sessions').all() as SessionRef[]; }
  session(id: string): SessionRef | undefined { return this.db.prepare('SELECT * FROM sessions WHERE session_id=?').get(id) as SessionRef | undefined; }
  setVersion(id: string, v: number) { this.db.prepare('UPDATE sessions SET last_version=? WHERE session_id=?').run(v, id); }

  // ---- published blobs (for renewal, invariant #3) ----
  recordBlobs(sessionId: string, refs: { blobObjectId: string; endEpoch: number; kind: string }[]) {
    const stmt = this.db.prepare('INSERT INTO blobs(blob_object_id,session_id,end_epoch,kind) VALUES(?,?,?,?) ON CONFLICT(blob_object_id) DO UPDATE SET end_epoch=excluded.end_epoch');
    for (const r of refs) if (r.blobObjectId) stmt.run(r.blobObjectId, sessionId, r.endEpoch, r.kind);
  }
  blobsForSession(sessionId: string): { blob_object_id: string; end_epoch: number; kind: string }[] {
    return this.db.prepare('SELECT * FROM blobs WHERE session_id=?').all(sessionId) as any[];
  }
  blobsExpiringBy(epoch: number): { blob_object_id: string; session_id: string; end_epoch: number }[] {
    return this.db.prepare('SELECT * FROM blobs WHERE end_epoch <= ?').all(epoch) as any[];
  }
  setBlobEpoch(blobObjectId: string, endEpoch: number) { this.db.prepare('UPDATE blobs SET end_epoch=? WHERE blob_object_id=?').run(endEpoch, blobObjectId); }
  blobIdsByKind(sessionId: string, kinds: string[]): string[] {
    return this.blobsForSession(sessionId).filter((b) => kinds.includes(b.kind)).map((b) => b.blob_object_id);
  }
  removeBlobs(ids: string[]) { const s = this.db.prepare('DELETE FROM blobs WHERE blob_object_id=?'); for (const id of ids) s.run(id); }

  // ---- notifications (check-again feed) ----
  notify(sessionId: string, kind: string, payload: unknown) {
    this.db.prepare('INSERT INTO notifications(session_id,kind,payload,ts) VALUES(?,?,?,?)').run(sessionId, kind, JSON.stringify(payload), Date.now());
  }
  feed(sessionId?: string, limit = 50): any[] {
    const rows = sessionId
      ? this.db.prepare('SELECT * FROM notifications WHERE session_id=? ORDER BY id DESC LIMIT ?').all(sessionId, limit)
      : this.db.prepare('SELECT * FROM notifications ORDER BY id DESC LIMIT ?').all(limit);
    return (rows as any[]).map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
  }

  private rowToNode(r: any): Node {
    return { id: r.id, owner: r.owner, type: r.type, title: r.title, body: r.body, importance: r.importance, tags: JSON.parse(r.tags || '[]'), createdAt: r.created_at, updatedAt: r.updated_at, version: r.version };
  }
}
