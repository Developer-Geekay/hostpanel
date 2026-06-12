import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastKind = 'ok' | 'err' | 'warn' | 'info';

interface Toast {
  id: number;
  msg: string;
  kind: ToastKind;
}

interface ToastCtx {
  toast(msg: string, kind?: ToastKind): void;
  ok(msg: string): void;
  err(msg: string): void;
}

const ToastContext = createContext<ToastCtx | null>(null);
let nextId = 1;

const icons = {
  ok:   <CheckCircle2 size={15} />,
  err:  <XCircle size={15} />,
  warn: <AlertTriangle size={15} />,
  info: <Info size={15} />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts(t => t.filter(x => x.id !== id));
  }, []);

  const toast = useCallback((msg: string, kind: ToastKind = 'info') => {
    const id = nextId++;
    setToasts(t => [...t, { id, msg, kind }]);
    setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  const ok  = useCallback((msg: string) => toast(msg, 'ok'),  [toast]);
  const err = useCallback((msg: string) => toast(msg, 'err'), [toast]);

  // Memoize the context value so consumers don't re-render (and useCallbacks
  // don't invalidate) every time a toast is added/removed.
  const value = useMemo(() => ({ toast, ok, err }), [toast, ok, err]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9000, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.kind} animate-fade-in`}>
            <span className="toast-icon">{icons[t.kind]}</span>
            <span className="toast-msg">{t.msg}</span>
            <button className="toast-close" onClick={() => dismiss(t.id)}><X size={13} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
