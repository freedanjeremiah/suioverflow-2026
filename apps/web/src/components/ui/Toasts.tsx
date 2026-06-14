import { useStore, type Toast } from '../../store.js';

/** Bottom-center toast stack (spec §6): plain-language line, optional raw
    detail behind a disclosure, auto-dismiss handled by the store. */
export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  if (toasts.length === 0) return null;
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onClose={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  return (
    <div className={`toast ${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
      <span className="dot" />
      <div style={{ minWidth: 0 }}>
        <div>{toast.message}</div>
        {toast.detail && (
          <details>
            <summary>details</summary>
            <div className="t-detail mono">{toast.detail}</div>
          </details>
        )}
      </div>
      <button className="t-close" onClick={onClose} aria-label="Dismiss">✕</button>
    </div>
  );
}
