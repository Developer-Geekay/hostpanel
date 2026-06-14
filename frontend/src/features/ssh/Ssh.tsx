import { Plus, Key, Terminal } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import { useSsh } from './hooks/useSsh';
import { KeyRow } from './components/KeyRow';
import { AddKeyModal } from './components/AddKeyModal';

export default function Ssh() {
  const ssh = useSsh();

  if (ssh.loading) return <PageSpinner />;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">SSH Keys</div>
          <div className="page-desc">Manage authorized public keys for SSH access</div>
        </div>
        <Button variant="primary" size="sm" icon={<Plus size={13} strokeWidth={1.5} />} onClick={ssh.openAdd}>
          Add Key
        </Button>
      </div>

      <div className="card" style={{ marginBottom: 20, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <Terminal size={18} strokeWidth={1.5} style={{ color: 'var(--accent)', marginTop: 2, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>SSH Key Authentication</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
            Keys are written to <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--bg-3)', padding: '1px 5px', borderRadius: 'var(--radius-sm)' }}>~/.ssh/authorized_keys</code> and
            enable passwordless login. Only paste the public key ending in <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--bg-3)', padding: '1px 5px', borderRadius: 'var(--radius-sm)' }}>.pub</code>.
          </div>
        </div>
      </div>

      {ssh.keys.length === 0 ? (
        <div className="empty">
          <Key size={32} strokeWidth={1.5} className="empty-icon" />
          <div className="empty-title">No SSH keys configured</div>
          <div className="empty-desc">Add a public key to enable secure passwordless login.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
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
                {ssh.keys.map(k => (
                  <KeyRow
                    key={k.id}
                    sshKey={k}
                    deleting={ssh.deleting === k.id}
                    onCopy={ssh.copyFingerprint}
                    onDelete={ssh.deleteKey}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AddKeyModal
        open={ssh.addOpen}
        keyText={ssh.keyText}
        setKeyText={ssh.setKeyText}
        label={ssh.label}
        setLabel={ssh.setLabel}
        saving={ssh.saving}
        onClose={ssh.closeAdd}
        onSubmit={ssh.addKey}
      />
    </div>
  );
}
