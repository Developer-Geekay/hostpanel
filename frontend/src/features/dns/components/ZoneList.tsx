import { Globe, Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import type { DnsZone } from '../types';

interface Props {
  zones: DnsZone[];
  deleteTarget: string;
  onSelect: (zone: DnsZone) => void;
  onDeleteClick: (name: string) => void;
  onDeleteConfirm: (name: string) => void;
  onDeleteCancel: () => void;
}

export function ZoneList({ zones, deleteTarget, onSelect, onDeleteClick, onDeleteConfirm, onDeleteCancel }: Props) {
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Zone</th>
              <th>Serial</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {zones.length === 0 && (
              <tr>
                <td colSpan={3}>
                  <div className="empty">
                    <Globe size={28} strokeWidth={1.5} className="empty-icon" />
                    <div className="empty-title">No DNS zones</div>
                    <div className="empty-desc">Add a zone to start managing DNS records.</div>
                  </div>
                </td>
              </tr>
            )}
            {zones.map(z => (
              <tr key={z.name}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                    onClick={() => onSelect(z)}>
                    <Globe size={13} strokeWidth={1.5} color="var(--accent)" />
                    <span className="mono" style={{ color: 'var(--accent)' }}>{z.name}</span>
                  </div>
                </td>
                <td className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{z.serial}</td>
                <td>
                  <Button variant="danger" size="sm" icon={<Trash2 size={12} strokeWidth={1.5} />}
                    onClick={() => onDeleteClick(z.name)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!deleteTarget} onClose={onDeleteCancel} title="Delete Zone" width={340}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={onDeleteCancel}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={() => onDeleteConfirm(deleteTarget)}>Delete</Button>
          </div>
        }>
        <p style={{ fontSize: 13, color: 'var(--text-2)' }}>
          Delete zone <strong style={{ color: 'var(--text)' }}>{deleteTarget}</strong> and all its records?
        </p>
      </Modal>
    </>
  );
}
