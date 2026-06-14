import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';

interface Props {
  open: boolean;
  value: string;
  saving: boolean;
  onChange: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function AddZoneModal({ open, value, saving, onChange, onClose, onSubmit }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Add DNS Zone" width={360}
      footer={
        <div className="actions" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" loading={saving} disabled={!value.trim()} onClick={onSubmit}>
            Create
          </Button>
        </div>
      }>
      <div className="field">
        <label>Domain</label>
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="example.com"
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') onSubmit(); }}
        />
      </div>
    </Modal>
  );
}
