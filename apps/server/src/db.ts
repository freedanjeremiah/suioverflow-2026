// Server state — SQLite. Tracks users, watched sessions (for the poll loop),
// blobs (for renewal), and daemon-detected notifications.
import Database from 'better-sqlite3';

export interface UserRow { privy_user_id: string; sui_address: string; created_at: number; }
export interface SessionRow { session_id: string; owner: string; name: string; last_version: number; end_epoch: number; updated_at: number; }
export interface BlobRow { blob_object_id: string; session_id: string; end_epoch: number; kind: string; }
export interface NotificationRow { id: number; session_id: string; kind: string; payload: string; ts: number; acked: number; }

export class Db {
  private db: Database.Database;
  constructor(path = 'data/mycelia.sqlite') {
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.init();
  }
  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (privy_user_id TEXT PRIMARY KEY, sui_address TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (session_id TEXT PRIMARY KEY, owner TEXT, name TEXT, last_version INTEGER DEFAULT 0, end_epoch INTEGER DEFAULT 0, updated_at INTEGER);
      CREATE TABLE IF NOT EXISTS blobs (blob_object_id TEXT PRIMARY KEY, session_id TEXT, end_epoch INTEGER, kind TEXT);
      CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, kind TEXT, payload TEXT, ts INTEGER, acked INTEGER DEFAULT 0);
    `);
  }

  upsertUser(privyUserId: string, suiAddress: string) {
    this.db.prepare('INSERT INTO users(privy_user_id, sui_address, created_at) VALUES(?,?,?) ON CONFLICT(privy_user_id) DO UPDATE SET sui_address=excluded.sui_address')
      .run(privyUserId, suiAddress, Date.now());
  }
  getUser(privyUserId: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE privy_user_id=?').get(privyUserId) as UserRow | undefined;
  }

  watchSession(sessionId: string, owner: string, name: string, endEpoch: number) {
    this.db.prepare('INSERT INTO sessions(session_id, owner, name, last_version, end_epoch, updated_at) VALUES(?,?,?,0,?,?) ON CONFLICT(session_id) DO UPDATE SET name=excluded.name, owner=excluded.owner')
      .run(sessionId, owner, name, endEpoch, Date.now());
  }
  listWatched(): SessionRow[] { return this.db.prepare('SELECT * FROM sessions').all() as SessionRow[]; }
  getSession(sessionId: string): SessionRow | undefined { return this.db.prepare('SELECT * FROM sessions WHERE session_id=?').get(sessionId) as SessionRow | undefined; }
  updateSessionVersion(sessionId: string, version: number, endEpoch: number) {
    this.db.prepare('UPDATE sessions SET last_version=?, end_epoch=?, updated_at=? WHERE session_id=?').run(version, endEpoch, Date.now(), sessionId);
  }

  recordBlob(blobObjectId: string, sessionId: string, endEpoch: number, kind: string) {
    this.db.prepare('INSERT INTO blobs(blob_object_id, session_id, end_epoch, kind) VALUES(?,?,?,?) ON CONFLICT(blob_object_id) DO UPDATE SET end_epoch=excluded.end_epoch')
      .run(blobObjectId, sessionId, endEpoch, kind);
  }
  blobsExpiringBy(epoch: number): BlobRow[] { return this.db.prepare('SELECT * FROM blobs WHERE end_epoch <= ?').all(epoch) as BlobRow[]; }
  updateBlobEpoch(blobObjectId: string, endEpoch: number) { this.db.prepare('UPDATE blobs SET end_epoch=? WHERE blob_object_id=?').run(endEpoch, blobObjectId); }

  addNotification(sessionId: string, kind: string, payload: unknown) {
    this.db.prepare('INSERT INTO notifications(session_id, kind, payload, ts) VALUES(?,?,?,?)').run(sessionId, kind, JSON.stringify(payload), Date.now());
  }
  listNotifications(sessionId: string, sinceId = 0): NotificationRow[] {
    return this.db.prepare('SELECT * FROM notifications WHERE session_id=? AND id>? ORDER BY id ASC').all(sessionId, sinceId) as NotificationRow[];
  }
}
