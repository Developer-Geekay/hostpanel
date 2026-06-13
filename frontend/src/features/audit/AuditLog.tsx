import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { apiGet, apiDelete } from '../../lib/api';

interface AuditEntry {
  id: number;
  ts: string;
  actor: string;
  action: string;
  resource: string | null;
  detail: string | null;
  status: string;
}

const ACTION_COLORS: Record<string, string> = {
  auth: '#3b82f6',
  ssl:  '#f59e0b',
  user: '#a855f7',
  db:   '#06b6d4',
};

function actionColor(action: string): string {
  const prefix = action.split('.')[0];
  return ACTION_COLORS[prefix] ?? '#6b7280';
}

function formatTs(ts: string): string {
  try {
    const d = new Date(ts.endsWith('Z') ? ts : ts + 'Z');
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch { return ts; }
}

const LIMIT = 100;

export default function AuditLog() {
  const [entries, setEntries]   = useState<AuditEntry[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [offset, setOffset]     = useState(0);
  const [clearing, setClearing] = useState(false);
  const [error, setError]       = useState('');

  const load = useCallback(async (off: number) => {
    setLoading(true);
    setError('');
    try {
      const [rows, cnt] = await Promise.all([
        apiGet<AuditEntry[]>(`audit?limit=${LIMIT}&offset=${off}`),
        apiGet<{ total: number }>('audit/count'),
      ]);
      setEntries(rows);
      setTotal(cnt.total);
      setOffset(off);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(0); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClear = async () => {
    if (!confirm('Clear all audit log entries? This cannot be undone.')) return;
    setClearing(true);
    try { await apiDelete('audit'); await load(0); }
    catch (e: unknown) { setError((e as Error).message ?? 'Failed to clear'); }
    finally { setClearing(false); }
  };

  const pages = Math.ceil(total / LIMIT);
  const page  = Math.floor(offset / LIMIT);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Log</h1>
          <p className="page-subtitle">Activity history for all admin actions</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => load(offset)} disabled={loading}>
            <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
            Refresh
          </button>
          <button className="btn btn-danger btn-sm" onClick={handleClear} disabled={clearing || loading}>
            <Trash2 size={14} /> Clear
          </button>
        </div>
      </div>

      {error && <div style={{ color: 'var(--err)', marginBottom: 12, fontSize: 13 }}>{error}</div>}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 160 }}>Time</th>
                <th style={{ width: 100 }}>Actor</th>
                <th style={{ width: 180 }}>Action</th>
                <th>Resource</th>
                <th>Detail</th>
                <th style={{ width: 70 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && entries.length === 0
                ? [0.4, 0.6, 0.8, 0.6, 0.4].map((op, i) => (
                    <tr key={i}>
                      {[160, 100, 180, 160, 120, 70].map((w, j) => (
                        <td key={j}>
                          <div style={{ height: 16, width: w * 0.7, background: 'var(--bg-3)', borderRadius: 3, opacity: op }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : entries.length === 0
                  ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)' }}>
                        No audit entries yet — actions will appear here as they happen.
                      </td>
                    </tr>
                  )
                  : entries.map(e => (
                    <tr key={e.id}>
                      <td className="mono" style={{ fontSize: 12, color: 'var(--text-3)' }}>{formatTs(e.ts)}</td>
                      <td style={{ fontWeight: 500 }}>{e.actor}</td>
                      <td>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontFamily: 'var(--font-mono)',
                          background: actionColor(e.action) + '22',
                          color: actionColor(e.action),
                          border: `1px solid ${actionColor(e.action)}44`,
                        }}>
                          {e.action}
                        </span>
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}>{e.resource ?? '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{e.detail ?? ''}</td>
                      <td>
                        <span className={`badge ${e.status === 'ok' ? 'badge-ok' : 'badge-err'}`}>
                          {e.status}
                        </span>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '10px 16px', borderTop: '1px solid var(--border-2)', fontSize: 13 }}>
            <span style={{ color: 'var(--text-3)' }}>{total} total entries</span>
            <button className="btn btn-ghost btn-sm" onClick={() => load(offset - LIMIT)} disabled={page === 0}>‹ Prev</button>
            <span style={{ color: 'var(--text-2)' }}>Page {page + 1} / {pages}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => load(offset + LIMIT)} disabled={page >= pages - 1}>Next ›</button>
          </div>
        )}
      </div>
    </div>
  );
}
