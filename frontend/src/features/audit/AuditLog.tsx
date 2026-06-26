import React, { useState } from 'react';
import {
  RefreshCw, Trash2, Search, ChevronDown, ChevronUp, CheckCircle, AlertCircle, Clock
} from 'lucide-react';
import { useAuditLog, AUDIT_LIMIT } from './hooks/useAuditLog';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import type { AuditEntry } from './types';

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

export default function AuditLog() {
  const a = useAuditLog();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);

  // Apply filters locally on the loaded entries
  const filteredEntries = a.entries.filter(e => {
    // Search filter
    const matchesSearch =
      e.actor.toLowerCase().includes(search.toLowerCase()) ||
      (e.action && e.action.toLowerCase().includes(search.toLowerCase())) ||
      (e.resource && e.resource.toLowerCase().includes(search.toLowerCase())) ||
      (e.detail && e.detail.toLowerCase().includes(search.toLowerCase()));

    // Category filter
    const matchesCategory =
      category === 'all' || e.action.startsWith(category);

    // Status filter
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'ok' && e.status === 'ok') ||
      (statusFilter === 'err' && e.status !== 'ok');

    return matchesSearch && matchesCategory && matchesStatus;
  });

  return (
    <div className="page" style={{ padding: '18px 20px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Audit Log</h1>
          <p className="page-subtitle" style={{ fontSize: '13px', color: 'var(--text-2)' }}>
            Activity history for all console and API admin actions
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => a.load(a.offset)}
            disabled={a.loading}
            icon={<RefreshCw size={12} className={a.loading ? "spin-icon" : undefined} />}
          >
            Refresh
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={a.handleClear}
            disabled={a.clearing || a.loading}
            icon={<Trash2 size={12} />}
          >
            Clear Log
          </Button>
        </div>
      </div>

      {a.error && (
        <div className="badge badge-err" style={{ marginBottom: 12, padding: '8px 12px', fontSize: '13px' }}>
          ⚠ {a.error}
        </div>
      )}

      {/* Filter Bar */}
      <div className="card" style={{ padding: '12px 14px', marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <div className="search-wrap" style={{ flex: 1, minWidth: '180px', margin: 0 }}>
          <Search style={{ width: 12, height: 12, color: 'var(--text-3)', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search logs (actor, action, resource)..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          style={{
            padding: '6px 10px',
            fontSize: '13px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'var(--surface, var(--bg-2))',
            color: 'var(--text)',
            outline: 'none',
            height: '30px'
          }}
        >
          <option value="all">All Actions</option>
          <option value="auth">Authentication</option>
          <option value="user">Users</option>
          <option value="db">Databases</option>
          <option value="ssl">SSL Certificates</option>
          <option value="dns">DNS Records</option>
          <option value="service">Services</option>
          <option value="ssh">SSH Keys</option>
          <option value="file">File Manager</option>
          <option value="package">Package Manager</option>
        </select>

        <div style={{ display: 'flex', gap: 4, height: '30px' }}>
          <Button
            variant={statusFilter === 'all' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('all')}
            style={{ padding: '4px 10px' }}
          >
            All
          </Button>
          <Button
            variant={statusFilter === 'ok' ? 'ghost' : 'outline'}
            className={statusFilter === 'ok' ? 'btn-success' : ''}
            size="sm"
            onClick={() => setStatusFilter('ok')}
            style={{ padding: '4px 10px' }}
          >
            Success
          </Button>
          <Button
            variant={statusFilter === 'err' ? 'danger' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('err')}
            style={{ padding: '4px 10px' }}
          >
            Error
          </Button>
        </div>
      </div>

      {/* Main Table card */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="table-wrap" style={{ flex: 1, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 140 }}>Time</th>
                <th style={{ width: 100 }}>Actor</th>
                <th style={{ width: 160 }}>Action</th>
                <th style={{ width: 150 }}>Resource</th>
                <th>Detail</th>
                <th style={{ width: 75 }}>Status</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {a.loading && filteredEntries.length === 0 ? (
                /* Skeleton Loading state */
                [0.4, 0.6, 0.8, 0.6, 0.4].map((op, i) => (
                  <tr key={i}>
                    {[140, 100, 160, 150, 120, 75].map((w, j) => (
                      <td key={j}>
                        <div style={{ height: 16, width: w * 0.7, background: 'var(--bg-3)', borderRadius: 3, opacity: op }} />
                      </td>
                    ))}
                    <td></td>
                  </tr>
                ))
              ) : filteredEntries.length === 0 ? (
                /* Empty state */
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)', fontSize: '13px' }}>
                    No matching activity log entries found.
                  </td>
                </tr>
              ) : (
                filteredEntries.map(e => {
                  const isExpanded = expandedRowId === e.id;
                  const rowColor = isExpanded ? 'var(--accent-dim)' : 'transparent';
                  return (
                    <React.Fragment key={e.id}>
                      <tr
                        style={{ cursor: 'pointer', background: rowColor }}
                        onClick={() => setExpandedRowId(isExpanded ? null : e.id)}
                      >
                        <td className="mono" style={{ fontSize: '11.5px', color: 'var(--text-3)' }}>
                          {formatTs(e.ts)}
                        </td>
                        <td style={{ fontWeight: 500, color: 'var(--text)' }}>
                          {e.actor}
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-block',
                            padding: '1px 6px',
                            borderRadius: 4,
                            fontSize: '10.5px',
                            fontFamily: 'var(--font-mono)',
                            background: actionColor(e.action) + '15',
                            color: actionColor(e.action),
                            border: `1px solid ${actionColor(e.action)}30`,
                          }}>
                            {e.action}
                          </span>
                        </td>
                        <td className="mono" style={{ fontSize: '11.5px', color: 'var(--text-2)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.resource ?? '—'}
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--text-2)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.detail ?? ''}
                        </td>
                        <td>
                          <span className={`badge ${e.status === 'ok' ? 'badge-ok' : 'badge-err'}`} style={{ fontSize: '10px', padding: '2px 6px' }}>
                            {e.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', color: 'var(--text-3)' }}>
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr style={{ background: 'var(--bg-3, #1e1e1e)', borderLeft: '3px solid var(--accent)' }}>
                          <td colSpan={7} style={{ padding: '12px 18px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              <div style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-3)', fontWeight: 600 }}>
                                Activity Log Details
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '8px 12px', fontSize: '12.5px', color: 'var(--text-2)' }}>
                                <span style={{ color: 'var(--text-3)' }}>Event ID</span>
                                <span className="mono" style={{ color: 'var(--text)' }}>#{e.id}</span>
                                
                                <span style={{ color: 'var(--text-3)' }}>Timestamp</span>
                                <span style={{ color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <Clock size={12} />
                                  {new Date(e.ts.endsWith('Z') ? e.ts : e.ts + 'Z').toLocaleString()}
                                </span>
                                
                                <span style={{ color: 'var(--text-3)' }}>Actor Account</span>
                                <span style={{ color: 'var(--text)', fontWeight: 500 }}>{e.actor}</span>
                                
                                <span style={{ color: 'var(--text-3)' }}>Action Target</span>
                                <span className="mono" style={{ color: 'var(--accent)' }}>{e.action}</span>
                                
                                <span style={{ color: 'var(--text-3)' }}>Affected Resource</span>
                                <span className="mono" style={{ color: 'var(--text)' }}>{e.resource ?? '—'}</span>
                                
                                <span style={{ color: 'var(--text-3)' }}>Status</span>
                                <span>
                                  <span className={`badge ${e.status === 'ok' ? 'badge-ok' : 'badge-err'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    {e.status === 'ok' ? <CheckCircle size={10} /> : <AlertCircle size={10} />}
                                    {e.status === 'ok' ? 'Successful' : 'Failed / Error'}
                                  </span>
                                </span>

                                <span style={{ color: 'var(--text-3)' }}>Detail / Parameters</span>
                                <pre style={{
                                  margin: 0, padding: '8px 10px', background: 'var(--surface, var(--bg-2))',
                                  border: '1px solid var(--border)', borderRadius: '6px',
                                  fontFamily: 'var(--font-mono)', fontSize: '11.5px', overflowX: 'auto',
                                  color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-all'
                                }}>
                                  {e.detail ?? 'No additional parameter details available.'}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        {a.pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '10px 16px', borderTop: '1px solid var(--border-2)', fontSize: '13px', flexShrink: 0 }}>
            <span style={{ color: 'var(--text-3)' }}>{a.total} total log entries</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => a.load(a.offset - AUDIT_LIMIT)}
              disabled={a.page === 0}
              style={{ padding: '3px 8px' }}
            >
              ‹ Prev
            </Button>
            <span style={{ color: 'var(--text-2)' }}>Page {a.page + 1} / {a.pages}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => a.load(a.offset + AUDIT_LIMIT)}
              disabled={a.page >= a.pages - 1}
              style={{ padding: '3px 8px' }}
            >
              Next ›
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
