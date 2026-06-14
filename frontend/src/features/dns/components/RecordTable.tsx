import { ChevronLeft, Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import type { DnsRecord, DnsZone } from '../types';
import { RECORD_TYPES } from '../types';

interface Props {
  zone: DnsZone;
  records: DnsRecord[];
  typeFilter: string;
  deleteTarget: string;
  onBack: () => void;
  onFilterChange: (t: string) => void;
  onDeleteClick: (id: string) => void;
  onDeleteConfirm: (id: string) => void;
  onDeleteCancel: () => void;
}

export function RecordTable({ zone, records, typeFilter, deleteTarget,
  onBack, onFilterChange, onDeleteClick, onDeleteConfirm, onDeleteCancel }: Props) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <Button variant="ghost" size="sm" icon={<ChevronLeft size={13} strokeWidth={1.5} />} onClick={onBack}>
          Zones
        </Button>
        <span style={{ color: 'var(--border)' }}>·</span>
        <span className="mono" style={{ fontSize: 13, color: 'var(--text)' }}>{zone.name}</span>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginLeft: 4 }}>
          {RECORD_TYPES.map(t => (
            <button key={t} onClick={() => onFilterChange(t)} style={{
              padding: '3px 8px', fontSize: 11,
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              background: typeFilter === t ? 'var(--accent-dim)' : 'transparent',
              color: typeFilter === t ? 'var(--accent)' : 'var(--text-2)',
              cursor: 'pointer', fontFamily: 'var(--font-mono)',
            }}>{t}</button>
          ))}
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Content</th>
              <th>TTL</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="empty">
                    <div className="empty-title">No records</div>
                    <div className="empty-desc">
                      {typeFilter !== 'All' ? `No ${typeFilter} records found.` : 'This zone has no records yet.'}
                    </div>
                  </div>
                </td>
              </tr>
            )}
            {records.map((r, i) => {
              const id = `${r.type}/${r.name}`;
              return (
                <tr key={i}>
                  <td className="mono">{r.name}</td>
                  <td>
                    <span className="badge badge-dim" style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                      {r.type}
                    </span>
                  </td>
                  <td className="mono" style={{
                    fontSize: 11, maxWidth: 280, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{r.content}</td>
                  <td className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{r.ttl}</td>
                  <td>
                    <Button variant="danger" size="sm" icon={<Trash2 size={12} strokeWidth={1.5} />}
                      onClick={() => onDeleteClick(id)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={!!deleteTarget} onClose={onDeleteCancel} title="Delete Record" width={340}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={onDeleteCancel}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={() => onDeleteConfirm(deleteTarget)}>Delete</Button>
          </div>
        }>
        <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Delete this DNS record?</p>
      </Modal>
    </>
  );
}
