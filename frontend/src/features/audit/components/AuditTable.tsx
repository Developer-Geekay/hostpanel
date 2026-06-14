import type { AuditEntry } from '../types';
import { AUDIT_LIMIT } from '../hooks/useAuditLog';

const ACTION_COLORS: Record<string, string> = {
  auth:     '#3b82f6',
  ssl:      '#f59e0b',
  user:     '#a855f7',
  db:       '#06b6d4',
  service:  '#22c55e',
  ssh:      '#ec4899',
  dns:      '#f97316',
  file:     '#84cc16',
  package:  '#8b5cf6',
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

interface Props {
  entries: AuditEntry[];
  loading: boolean;
  total: number;
  page: number;
  pages: number;
  offset: number;
  onPage: (offset: number) => void;
}

export function AuditTable({ entries, loading, total, page, pages, offset, onPage }: Props) {
  return (
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
          <button className="btn btn-ghost btn-sm" onClick={() => onPage(offset - AUDIT_LIMIT)} disabled={page === 0}>‹ Prev</button>
          <span style={{ color: 'var(--text-2)' }}>Page {page + 1} / {pages}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => onPage(offset + AUDIT_LIMIT)} disabled={page >= pages - 1}>Next ›</button>
        </div>
      )}
    </div>
  );
}
