import { useState } from 'react';
import { Plus, Copy, Trash2, Terminal, Key } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';

interface SshKey {
  id: string;
  label: string;
  fingerprint: string;
  added: string;
}

const MOCK_KEYS: SshKey[] = [
  { id: '1', label: 'MacBook Pro', fingerprint: 'SHA256:abc123def456ghi789jklm', added: '2025-03-15' },
  { id: '2', label: 'Work Desktop', fingerprint: 'SHA256:xyz789uvw012rst345abc6', added: '2025-04-01' },
  { id: '3', label: 'GitHub Actions', fingerprint: 'SHA256:pqr456stu789vwx012yz3a', added: '2025-04-22' },
];

export default function Ssh() {
  const toast = useToast();
  const [keys, setKeys] = useState<SshKey[]>(MOCK_KEYS);
  const [addOpen, setAddOpen] = useState(false);
  const [keyText, setKeyText] = useState('');
  const [label, setLabel] = useState('');

  function addKey() {
    if (!keyText.trim()) return;
    const newKey: SshKey = {
      id: String(Date.now()),
      label: label.trim() || 'New Key',
      fingerprint: 'SHA256:' + Math.random().toString(36).slice(2, 26),
      added: new Date().toISOString().slice(0, 10),
    };
    setKeys(k => [...k, newKey]);
    toast.ok('SSH key added');
    setAddOpen(false);
    setKeyText('');
    setLabel('');
  }

  function copyKey(fp: string) {
    navigator.clipboard.writeText(fp);
    toast.ok('Fingerprint copied');
  }

  function deleteKey(id: string) {
    setKeys(k => k.filter(x => x.id !== id));
    toast.ok('Key removed');
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">SSH Keys</div>
          <div className="page-desc">Manage authorized public keys for SSH access</div>
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={13} strokeWidth={1.5} />}
          onClick={() => { setKeyText(''); setLabel(''); setAddOpen(true); }}
        >
          Add Key
        </Button>
      </div>

      {/* Info card */}
      <div className="card" style={{ marginBottom: 20, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <Terminal size={18} strokeWidth={1.5} style={{ color: 'var(--accent)', marginTop: 2, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4, color: 'var(--text)' }}>
            SSH Key Authentication
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
            Add your public SSH keys here to enable passwordless authentication to your server.
            Keys are appended to{' '}
            <code style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              background: 'var(--bg-3)',
              padding: '1px 5px',
              borderRadius: 'var(--radius-sm)',
            }}>
              ~/.ssh/authorized_keys
            </code>.
            Only the public key (ending in <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--bg-3)', padding: '1px 5px', borderRadius: 'var(--radius-sm)' }}>.pub</code>) should be added here.
          </div>
        </div>
      </div>

      {/* Note: SSH key API not available — using local state */}
      <div
        className="badge badge-warn"
        style={{ marginBottom: 16, padding: '8px 12px', fontSize: 12, width: '100%' }}
      >
        SSH key management is operating in preview mode. Changes are stored locally for this session only.
      </div>

      {keys.length === 0 ? (
        <div className="empty">
          <Key size={32} strokeWidth={1.5} className="empty-icon" />
          <div className="empty-title">No SSH keys configured</div>
          <div className="empty-desc">Add a public SSH key to enable secure passwordless login.</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>Fingerprint</th>
                <th>Added</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map(k => (
                <tr key={k.id}>
                  <td style={{ fontWeight: 500, color: 'var(--text)' }}>{k.label}</td>
                  <td className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{k.fingerprint}</td>
                  <td className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{k.added}</td>
                  <td>
                    <div className="actions">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Copy size={12} strokeWidth={1.5} />}
                        onClick={() => copyKey(k.fingerprint)}
                      >
                        Copy
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        icon={<Trash2 size={12} strokeWidth={1.5} />}
                        onClick={() => deleteKey(k.id)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add SSH Key modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add SSH Key"
        width={520}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!keyText.trim()}
              onClick={addKey}
            >
              Add Key
            </Button>
          </>
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
            />
          </div>
          <div className="field">
            <label>Public Key</label>
            <textarea
              value={keyText}
              onChange={e => setKeyText(e.target.value)}
              placeholder="ssh-rsa AAAA... user@hostname&#10;or&#10;ssh-ed25519 AAAA... user@hostname"
              style={{
                height: 120,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                resize: 'vertical',
                background: 'var(--bg)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 10px',
                outline: 'none',
                width: '100%',
              }}
            />
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
            Paste your public key (from <code style={{ fontFamily: 'var(--font-mono)' }}>~/.ssh/id_rsa.pub</code> or
            <code style={{ fontFamily: 'var(--font-mono)' }}> ~/.ssh/id_ed25519.pub</code>). Never share your private key.
          </p>
        </div>
      </Modal>
    </div>
  );
}
