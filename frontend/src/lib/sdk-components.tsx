import { useState, useEffect, Fragment, ReactNode } from 'react';
import { X } from 'lucide-react';

// ── ConfirmModal ──────────────────────────────────────────────────────────────

interface SdkConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  danger?: boolean;
  onClose(): void;
  onConfirm(): Promise<void>;
}

export function SdkConfirmModal({
  open, title, message, danger, onClose, onConfirm,
}: SdkConfirmModalProps) {
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  const handleConfirm = async () => {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal animate-fade-in" style={{ width: 400 }}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
          {message}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── FormModal ─────────────────────────────────────────────────────────────────

export interface SdkFormField {
  key: string;
  label: string;
  type: 'text' | 'select' | 'select-from-api';
  required?: boolean;
  placeholder?: string;
  /** Static options for type='select' */
  options?: { value: string | number; label: string }[];
  /** Absolute API URL for type='select-from-api' */
  source?: string;
  option_value?: string;
  option_label?: string;
}

interface SdkFormModalProps {
  open: boolean;
  title: string;
  fields: SdkFormField[];
  onClose(): void;
  onSubmit(data: Record<string, unknown>): Promise<void>;
}

export function SdkFormModal({
  open, title, fields, onClose, onSubmit,
}: SdkFormModalProps) {
  const [values, setValues]     = useState<Record<string, unknown>>({});
  const [busy, setBusy]         = useState(false);
  const [formError, setFormErr] = useState('');
  const [apiOpts, setApiOpts]   = useState<Record<string, { value: string; label: string }[]>>({});

  useEffect(() => {
    if (!open) { setValues({}); setFormErr(''); return; }
    // Load select-from-api options on open
    for (const f of fields) {
      if (f.type === 'select-from-api' && f.source) {
        const token = localStorage.getItem('auth_token') ?? '';
        fetch(f.source, { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.json())
          .then((rows: Record<string, unknown>[]) => {
            setApiOpts(prev => ({
              ...prev,
              [f.key]: rows.map(row => ({
                value: String(row[f.option_value ?? 'id'] ?? ''),
                label: String(row[f.option_label ?? 'name'] ?? ''),
              })),
            }));
          })
          .catch(() => {/* non-fatal */});
      }
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const set = (key: string, val: unknown) =>
    setValues(v => ({ ...v, [key]: val }));

  const handleSubmit = async () => {
    setFormErr('');
    for (const f of fields) {
      if (f.required && !values[f.key] && values[f.key] !== 0) {
        setFormErr(`${f.label} is required`);
        return;
      }
    }
    setBusy(true);
    try {
      await onSubmit(values);
    } catch (e: unknown) {
      setFormErr((e as Error).message ?? 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal animate-fade-in" style={{ width: 440 }}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {fields.map(f => (
            <div key={f.key} className="field">
              <label>{f.label}</label>
              {f.type === 'text' && (
                <input
                  type="text"
                  placeholder={f.placeholder ?? ''}
                  value={(values[f.key] as string) ?? ''}
                  onChange={e => set(f.key, e.target.value)}
                />
              )}
              {(f.type === 'select' || f.type === 'select-from-api') && (
                <select
                  value={(values[f.key] as string) ?? ''}
                  onChange={e => set(f.key, e.target.value)}
                >
                  <option value="">Select…</option>
                  {(f.type === 'select' ? f.options ?? [] : apiOpts[f.key] ?? []).map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              )}
            </div>
          ))}
          {formError && (
            <div style={{ color: 'var(--err)', fontSize: 12 }}>{formError}</div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── DataTable ─────────────────────────────────────────────────────────────────

export interface SdkTableColumn {
  key: string;
  label: string;
  type?: 'badge' | 'bool' | 'mono';
}

interface SdkDataTableProps {
  columns: SdkTableColumn[];
  rows: Record<string, unknown>[];
  loading?: boolean;
  empty?: { title: string; desc?: string };
  renderActions?: (row: Record<string, unknown>) => ReactNode;
  renderExpanded?: (row: Record<string, unknown>) => ReactNode;
}

function renderCell(col: SdkTableColumn, row: Record<string, unknown>): ReactNode {
  const val = row[col.key];
  if (col.type === 'badge') {
    const str = String(val ?? '');
    return (
      <span className={`badge badge-${str === 'active' ? 'ok' : 'dim'}`}>{str}</span>
    );
  }
  if (col.type === 'bool') {
    return (
      <span className={`badge ${val ? 'badge-ok' : 'badge-dim'}`}>{val ? 'Yes' : 'No'}</span>
    );
  }
  return <>{String(val ?? '')}</>;
}

export function SdkDataTable({
  columns, rows, loading, empty, renderActions, renderExpanded,
}: SdkDataTableProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="table-wrap">
        {[0.4, 0.6, 0.8].map((op, i) => (
          <div key={i} style={{
            height: 44, borderBottom: '1px solid var(--border-2)',
            opacity: op, background: 'var(--bg-3)',
          }} />
        ))}
      </div>
    );
  }

  if (!rows?.length) {
    return (
      <div className="empty">
        <div className="empty-title">{empty?.title ?? 'No items'}</div>
        {empty?.desc && <div className="empty-desc">{empty.desc}</div>}
      </div>
    );
  }

  const colCount = columns.length + (renderActions ? 1 : 0) + (renderExpanded ? 1 : 0);

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {renderExpanded && <th style={{ width: 32 }} />}
            {columns.map(c => <th key={c.key}>{c.label}</th>)}
            {renderActions && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const key = String(
              row.id ?? row.domain_name ?? row.fqdn ?? i
            );
            const isExpanded = expandedKey === key;
            return (
              <Fragment key={key}>
                <tr>
                  {renderExpanded && (
                    <td
                      onClick={() => setExpandedKey(isExpanded ? null : key)}
                      style={{ cursor: 'pointer', color: 'var(--text-3)', userSelect: 'none' }}
                    >
                      {isExpanded ? '▼' : '▶'}
                    </td>
                  )}
                  {columns.map(c => (
                    <td key={c.key} className={c.type === 'mono' ? 'mono' : ''}>
                      {renderCell(c, row)}
                    </td>
                  ))}
                  {renderActions && (
                    <td>
                      <div className="actions">{renderActions(row)}</div>
                    </td>
                  )}
                </tr>
                {renderExpanded && isExpanded && (
                  <tr>
                    <td colSpan={colCount} style={{ padding: 0 }}>
                      {renderExpanded(row)}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
