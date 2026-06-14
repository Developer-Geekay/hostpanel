import { Trash2 } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import type { PackageItem } from '../types';

interface Props {
  target: PackageItem | null;
  force: boolean;
  uninstalling: boolean;
  onForceChange: (v: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export function UninstallModal({ target, force, uninstalling, onForceChange, onClose, onConfirm }: Props) {
  return (
    <Modal
      open={!!target}
      onClose={() => { if (!uninstalling) onClose(); }}
      title="Uninstall Package"
      footer={
        <div className="actions" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={uninstalling}>Cancel</Button>
          <Button
            variant="danger"
            size="sm"
            loading={uninstalling}
            icon={<Trash2 size={12} strokeWidth={1.5} />}
            onClick={onConfirm}
          >
            {force ? 'Force Uninstall' : 'Uninstall'}
          </Button>
        </div>
      }
    >
      <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14 }}>
        Are you sure you want to uninstall <strong style={{ color: 'var(--text)' }}>{target?.name}</strong>?
        This cannot be undone.
      </p>
      {force && (
        <div className="badge badge-warn" style={{ width: '100%', padding: '10px 12px', fontSize: 12, marginBottom: 12 }}>
          A conflict was detected. Force uninstall will remove the package regardless of dependencies.
        </div>
      )}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textTransform: 'none', fontSize: 13, letterSpacing: 0 }}>
        <input
          type="checkbox"
          checked={force}
          onChange={e => onForceChange(e.target.checked)}
          style={{ width: 'auto' }}
        />
        Force uninstall (ignore conflicts)
      </label>
    </Modal>
  );
}
