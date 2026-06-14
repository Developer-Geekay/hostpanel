import { RefreshCw, Trash2 } from 'lucide-react';
import { useAuditLog } from './hooks/useAuditLog';
import { AuditTable } from './components/AuditTable';

export default function AuditLog() {
  const a = useAuditLog();

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Log</h1>
          <p className="page-subtitle">Activity history for all admin actions</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => a.load(a.offset)} disabled={a.loading}>
            <RefreshCw size={14} style={a.loading ? { animation: 'spin 1s linear infinite' } : undefined} />
            Refresh
          </button>
          <button className="btn btn-danger btn-sm" onClick={a.handleClear} disabled={a.clearing || a.loading}>
            <Trash2 size={14} /> Clear
          </button>
        </div>
      </div>

      {a.error && (
        <div style={{ color: 'var(--err)', marginBottom: 12, fontSize: 13 }}>{a.error}</div>
      )}

      <AuditTable
        entries={a.entries}
        loading={a.loading}
        total={a.total}
        page={a.page}
        pages={a.pages}
        offset={a.offset}
        onPage={a.load}
      />
    </div>
  );
}
