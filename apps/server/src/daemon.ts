// Daemon — poll loop (notify on head change) + storage renewal. MYCELIA_SPEC §9.
// NO Tatum webhooks (CLAUDE.md): notifications come from polling the session head.
import type { Runtime } from './runtime.js';
import type { Db } from './db.js';

export class Daemon {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private rt: Runtime, private db: Db, private intervalMs: number) {}

  start() {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }
  stop() { if (this.timer) clearInterval(this.timer); }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      let epoch = 0;
      try { epoch = await this.rt.storage.currentEpoch(); } catch { /* ignore */ }

      // 1. poll each watched session head; emit a notification on a version bump
      for (const s of this.db.listWatched()) {
        try {
          const state = await this.rt.sessions.getSessionState(s.session_id);
          if (state.headVersion > s.last_version) {
            this.db.updateSessionVersion(s.session_id, state.headVersion, state.endEpoch);
            if (s.last_version > 0) {
              this.db.addNotification(s.session_id, 'head', { version: state.headVersion, ts: Date.now() });
            }
          }
        } catch { /* transient RPC error; retry next tick */ }
      }

      // 2. renewal: extend blobs near expiry (master funds what it owns; else nudge)
      if (epoch > 0) {
        const threshold = epoch + this.rt.pub.renewThresholdEpochs;
        for (const b of this.db.blobsExpiringBy(threshold)) {
          try {
            await this.rt.storage.extend(b.blob_object_id, this.rt.pub.storageEpochs, this.rt.master);
            this.db.updateBlobEpoch(b.blob_object_id, epoch + this.rt.pub.storageEpochs);
            this.db.addNotification(b.session_id, 'renewed', { blob: b.blob_object_id, endEpoch: epoch + this.rt.pub.storageEpochs });
          } catch {
            // owner-owned blob the master can't extend -> nudge the owner (UI renew)
            this.db.addNotification(b.session_id, 'renewal_needed', { blob: b.blob_object_id, byEpoch: b.end_epoch });
          }
        }
      }
    } finally {
      this.running = false;
    }
  }
}
