import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';

interface Props {
  open: boolean;
  keyText: string;
  setKeyText: (v: string) => void;
  label: string;
  setLabel: (v: string) => void;
  saving: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

export function AddKeyModal({ open, keyText, setKeyText, label, setLabel, saving, onClose, onSubmit }: Props) {
  return (
    <Modal
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      title="Add SSH Key"
      width={520}
      footer={
        <div className="actions" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" size="sm" loading={saving} disabled={!keyText.trim()} onClick={onSubmit}>
            Add Key
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label>Label</label>
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="e.g. MacBook Pro"
            autoFocus
            disabled={saving}
          />
        </div>
        <div className="field">
          <label>Public Key</label>
          <textarea
            value={keyText}
            onChange={e => setKeyText(e.target.value)}
            placeholder={"ssh-ed25519 AAAA... user@hostname\nor\nssh-rsa AAAA... user@hostname"}
            rows={5}
            disabled={saving}
            onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) onSubmit(); }}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 11, resize: 'vertical' }}
          />
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5, margin: 0 }}>
          Paste your public key from <code style={{ fontFamily: 'var(--font-mono)' }}>~/.ssh/id_ed25519.pub</code> or{' '}
          <code style={{ fontFamily: 'var(--font-mono)' }}>~/.ssh/id_rsa.pub</code>. Never share your private key.
        </p>
      </div>
    </Modal>
  );
}
