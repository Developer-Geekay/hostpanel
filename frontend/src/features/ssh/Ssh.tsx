import { useState } from 'react';
import { Plus, Copy, Trash2, Terminal } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';

interface SshKey { id: string; label: string; fingerprint: string; added: string; }

const MOCK_KEYS: SshKey[] = [
  { id: '1', label: 'MacBook Pro', fingerprint: 'SHA256:abc123def456...', added: '2025-03-15' },
  { id: '2', label: 'Work Desktop', fingerprint: 'SHA256:xyz789uvw012...', added: '2025-04-01' },
];

export default function Ssh() {
  const { ok } = useToast();
  const [keys, setKeys] = useState<SshKey[]>(MOCK_KEYS);
  const [addOpen, setAddOpen] = useState(false);
  const [keyText, setKeyText] = useState('');
  const [label, setLabel] = useState('');

  const addKey = () => {
    if (!keyText.trim()) return;
    setKeys(k => [...k, { id: String(Date.now()), label: label || 'New Key', fingerprint: 'SHA256:' + Math.random().toString(36).slice(2, 14), added: new Date().toISOString().slice(0, 10) }]);
    ok('SSH key added'); setAddOpen(false); setKeyText(''); setLabel('');
  };

  const copyKey = (fp: string) => { navigator.clipboard.writeText(fp); ok('Fingerprint copied'); };
  const deleteKey = (id: string) => { setKeys(k => k.filter(x => x.id !== id)); ok('Key removed'); };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">SSH Keys</div>
          <div className="page-desc">Manage authorized public keys for SSH access</div>
        </div>
        <Button variant="primary" size="sm" icon={<Plus size={13} strokeWidth={1.5} />} onClick={() => setAddOpen(true)}>Add Key</Button>
      </div>

      <div className="card" style={{ marginBottom: 20, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <Terminal size={18} strokeWidth={1.5} color="var(--accent)" style={{ marginTop: 2, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>SSH Key Authentication</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
            Add your public SSH keys here to enable passwordless authentication to your server.
            Keys are added to <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--bg-3)', padding: '1px 5px', borderRadius: 'var(--radius-sm)' }}>~/.ssh/authorized_keys</code>.
          </div>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Label</th><th>Fingerprint</th><th>Added</th><th></th></tr></thead>
          <tbody>
            {keys.length === 0 && <tr><td colSpan={4}><div className="empty"><div className="empty-title">No SSH keys configured</div></div></td></tr>}
            {keys.map(k => (
              <tr key={k.id}>
                <td style={{ fontWeight: 500 }}>{k.label}</td>
                <td className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{k.fingerprint}</td>
                <td className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{k.added}</td>
                <td>
                  <div className="actions">
                    <Button variant="ghost" size="sm" icon={<Copy size={12} strokeWidth={1.5} />} onClick={() => copyKey(k.fingerprint)} />
                    <Button variant="danger" size="sm" icon={<Trash2 size={12} strokeWidth={1.5} />} onClick={() => deleteKey(k.id)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add SSH Key" width={500}
        footer={<><Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button><Button variant="primary" onClick={addKey}>Add Key</Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field"><label>Label</label><input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. MacBook Pro" autoFocus /></div>
          <div className="field">
            <label>Public Key</label>
            <textarea value={keyText} onChange={e => setKeyText(e.target.value)} placeholder="ssh-rsa AAAA... or ssh-ed25519 AAAA..."
              style={{ height: 100, fontFamily: 'var(--font-mono)', fontSize: 11, resize: 'vertical', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', outline: 'none', width: '100%' }} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
