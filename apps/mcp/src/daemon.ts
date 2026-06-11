// In-process poll loop: detect head-version bumps -> notifications (check-again
// feed), and auto-renew storage for sessions this agent owns. MYCELIA_SPEC §9.
import type { Runtime } from './runtime.js';

export class Daemon {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private rt: Runtime, private intervalMs: number) {}

  start() {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }
  stop() { if (this.timer) clearInterval(this.timer); }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      let epoch = 0;
      try { epoch = await this.rt.storage.currentEpoch(); } catch { /* ignore */ }
      for (const s of this.rt.store.sessions()) {
        try {
          const state = await this.rt.sessions.getSessionState(s.session_id);
          if (state.headVersion > s.last_version) {
            this.rt.store.setVersion(s.session_id, state.headVersion);
            if (s.last_version > 0) this.rt.store.notify(s.session_id, 'head', { version: state.headVersion });
          }
          // auto-renew: extend the actual Walrus blobs we own near expiry (#3),
          // then update the on-chain end_epoch marker.
          if (s.cap_id && epoch > 0) {
            const due = this.rt.store.blobsForSession(s.session_id).filter((b) => b.end_epoch - epoch <= this.rt.pub.renewThresholdEpochs);
            if (due.length) {
              const target = epoch + this.rt.pub.storageEpochs;
              const r = await this.rt.service.renewStorage(due.map((b) => b.blob_object_id), this.rt.pub.storageEpochs, this.rt.keypair);
              for (const id of r.extended) this.rt.store.setBlobEpoch(id, target);
              try { await this.rt.service.renew(s.cap_id, s.session_id, target, this.rt.keypair); } catch { /* marker best-effort */ }
              if (r.extended.length) this.rt.store.notify(s.session_id, 'renewed', { blobs: r.extended.length, throughEpoch: target });
            }
          }
        } catch { /* transient RPC error */ }
      }
    } finally {
      this.running = false;
    }
  }
}
