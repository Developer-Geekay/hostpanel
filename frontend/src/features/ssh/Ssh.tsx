import React, { useState, useEffect } from 'react';
import {
  Key, Plus, Search, Trash2, Copy, Check, Terminal, X
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import { useSsh } from './hooks/useSsh';
import type { SshKey } from './types';

export default function Ssh() {
  const ssh = useSsh();
  const [filter, setFilter] = useState('');
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Automatically select the first key on load/change
  useEffect(() => {
    if (!ssh.loading && ssh.keys.length > 0 && !selectedKeyId && !ssh.addOpen) {
      setSelectedKeyId(ssh.keys[0].id);
    }
  }, [ssh.loading, ssh.keys, selectedKeyId, ssh.addOpen]);

  if (ssh.loading) return <PageSpinner />;

  const filteredKeys = ssh.keys.filter(k =>
    k.label.toLowerCase().includes(filter.toLowerCase()) ||
    k.fingerprint.toLowerCase().includes(filter.toLowerCase()) ||
    k.type.toLowerCase().includes(filter.toLowerCase())
  );

  const selectedKey = ssh.keys.find(k => k.id === selectedKeyId) || ssh.keys[0] || null;

  function handleCopyFingerprint(fp: string) {
    ssh.copyFingerprint(fp);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="split-view" style={{ flex: 1, minHeight: 0 }}>
      
      {/* LEFT PANE: Key List */}
      <div className="split-left">
        <div className="split-pane-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '12px', fontWeight: 600 }}>SSH Keys</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { ssh.openAdd(); setShowDeleteConfirm(false); }}
            style={{ padding: '4px', minWidth: 0 }}
            title="Add SSH Key"
          >
            <Plus size={13} />
          </Button>
        </div>

        <div className="search-wrap" style={{ margin: '8px 10px 4px' }}>
          <Search style={{ width: 12, height: 12, color: 'var(--text-3)', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Filter keys..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>

        <div className="split-scroll">
          <div style={{ height: 4 }} />

          {/* Virtual "Add Key" item in list if form is active */}
          {ssh.addOpen && (
            <div className="list-item sel" style={{ marginBottom: 6 }}>
              <div className="avatar" style={{
                width: '28px', height: '28px', borderRadius: '8px',
                background: 'var(--accent-dim)', border: '1px solid var(--accent-border)',
                display: 'grid', placeItems: 'center', color: 'var(--accent)', flexShrink: 0
              }}>
                <Plus size={14} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="li-name" style={{ fontSize: '12.5px', fontWeight: 500 }}>Add SSH Key</div>
                <div className="li-sub" style={{ fontSize: '10.5px' }}>Authorize new key</div>
              </div>
            </div>
          )}

          {filteredKeys.length === 0 && !ssh.addOpen ? (
            <div style={{ padding: '20px 15px', textAlign: 'center', color: 'var(--text-3)', fontSize: '12.5px' }}>
              No SSH keys found
            </div>
          ) : (
            filteredKeys.map(k => {
              const isSelected = selectedKey?.id === k.id && !ssh.addOpen;
              const cleanType = k.type.replace(/^ssh-/, '');
              const cleanFp = k.fingerprint.length > 22 ? k.fingerprint.substring(0, 22) + '...' : k.fingerprint;

              return (
                <div
                  key={k.id}
                  className={`list-item${isSelected ? ' sel' : ''}`}
                  onClick={() => { setSelectedKeyId(k.id); ssh.closeAdd(); setShowDeleteConfirm(false); }}
                >
                  <div className="avatar" style={{
                    width: '28px', height: '28px', borderRadius: '8px',
                    background: isSelected ? 'var(--accent-dim)' : 'var(--surface2, var(--bg-3))',
                    border: isSelected ? '1px solid var(--accent-border)' : '1px solid var(--border)',
                    display: 'grid', placeItems: 'center',
                    color: isSelected ? 'var(--accent)' : 'var(--text-3)',
                    flexShrink: 0
                  }}>
                    <Key size={14} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="li-name" style={{ fontSize: '12.5px', fontWeight: 500 }}>{k.label || k.type}</div>
                    <div className="li-sub" style={{ fontSize: '10.5px' }}>{cleanFp}</div>
                  </div>
                  <div>
                    <span className={`badge ${cleanType === 'ed25519' ? 'badge-ok' : 'badge-dim'}`} style={{ fontSize: '9px', padding: '1px 5px', textTransform: 'uppercase' }}>
                      {cleanType}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT PANE: Detail / Add Form */}
      <div className="split-right">
        <div className="split-scroll" style={{ padding: '18px 20px' }}>
          <div style={{ maxWidth: '540px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* CASE 1: Add SSH Key Form */}
            {ssh.addOpen ? (
              <div className="card" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>Add SSH Key</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={ssh.closeAdd}
                    style={{ padding: '4px', minWidth: 0, marginLeft: 'auto' }}
                    disabled={ssh.saving}
                  >
                    <X size={14} />
                  </Button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="field">
                    <label style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 6 }}>Label</label>
                    <input
                      value={ssh.label}
                      onChange={e => ssh.setLabel(e.target.value)}
                      placeholder="e.g. MacBook Pro"
                      autoFocus
                      disabled={ssh.saving}
                      style={{ width: '100%', fontSize: '13px' }}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 6 }}>Public Key</label>
                    <textarea
                      value={ssh.keyText}
                      onChange={e => ssh.setKeyText(e.target.value)}
                      placeholder="ssh-ed25519 AAAA... user@hostname&#10;or&#10;ssh-rsa AAAA... user@hostname"
                      rows={5}
                      disabled={ssh.saving}
                      onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) ssh.addKey(); }}
                      style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', resize: 'vertical', width: '100%' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 10, padding: '12px', background: 'var(--surface2, var(--bg-3))', border: '1px solid var(--border)', borderRadius: '6px' }}>
                    <Terminal size={16} strokeWidth={1.5} style={{ color: 'var(--accent)', marginTop: 2, flexShrink: 0 }} />
                    <p style={{ fontSize: '11.5px', color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>
                      Paste your public key from <code style={{ fontFamily: 'var(--font-mono)' }}>~/.ssh/id_ed25519.pub</code> or{' '}
                      <code style={{ fontFamily: 'var(--font-mono)' }}>~/.ssh/id_rsa.pub</code>. Never share your private key.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
                  <Button variant="ghost" size="sm" onClick={ssh.closeAdd} disabled={ssh.saving}>Cancel</Button>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={ssh.saving}
                    disabled={ssh.saving || !ssh.keyText.trim()}
                    onClick={ssh.addKey}
                  >
                    Add Key
                  </Button>
                </div>
              </div>
            ) : selectedKey ? (

              /* CASE 2: Key Details View */
              <>
                {/* Card 1: Key Metadata */}
                <div className="card" style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 14 }}>
                    <div className="avatar" style={{
                      width: '42px', height: '42px', borderRadius: '10px',
                      background: 'var(--accent-dim)', border: '1px solid var(--accent-border)',
                      display: 'grid', placeItems: 'center', color: 'var(--accent)', flexShrink: 0
                    }}>
                      <Key size={22} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text)' }}>
                        {selectedKey.label || selectedKey.type}
                      </h2>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <span className="badge badge-dim" style={{ fontSize: '10.5px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                          {selectedKey.type}
                        </span>
                        <span style={{ fontSize: '11.5px', color: 'var(--text-3)' }}>•</span>
                        <span style={{ fontSize: '11.5px', color: 'var(--text-2)' }}>
                          Added {selectedKey.added || '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border)', margin: '14px 0' }} />

                  {/* Fingerprint block */}
                  <div className="field">
                    <label style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6, fontWeight: 600 }}>
                      Key Fingerprint
                    </label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <pre style={{
                        flex: 1, margin: 0, padding: '8px 10px', background: 'var(--bg-3)',
                        border: '1px solid var(--border)', borderRadius: '6px',
                        fontFamily: 'var(--font-mono)', fontSize: '11.5px', overflowX: 'auto',
                        color: 'var(--text)'
                      }}>
                        {selectedKey.fingerprint}
                      </pre>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={copied ? <Check size={12} style={{ color: 'var(--green)' }} /> : <Copy size={12} />}
                        onClick={() => handleCopyFingerprint(selectedKey.fingerprint)}
                        title="Copy fingerprint"
                        style={{ height: '32px', width: '32px', padding: 0, display: 'grid', placeItems: 'center', flexShrink: 0 }}
                      />
                    </div>
                  </div>
                </div>

                {/* Card 2: Security & Info instructions */}
                <div className="card" style={{ padding: '20px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <Terminal size={18} strokeWidth={1.5} style={{ color: 'var(--accent)', marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>SSH Access Information</div>
                    <div style={{ fontSize: '12.5px', color: 'var(--text-2)', lineHeight: 1.6 }}>
                      This public key is written to your user's <code style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', background: 'var(--bg-3)', padding: '1px 5px', borderRadius: '4px' }}>~/.ssh/authorized_keys</code> configuration.
                      You can use it to establish passwordless SSH sessions to the server.
                    </div>
                  </div>
                </div>

                {/* Card 3: Danger Zone */}
                <div className="card" style={{
                  padding: '20px',
                  border: '1px solid var(--red-border, rgba(239,68,68,0.2))',
                  background: 'rgba(239,68,68,0.02)'
                }}>
                  <h3 style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--red, #ef4444)', marginBottom: 12 }}>
                    Danger Zone
                  </h3>

                  {showDeleteConfirm ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <p style={{ fontSize: '12.5px', color: 'var(--text-2)', lineHeight: 1.4, margin: 0 }}>
                        Are you sure you want to remove this SSH key? Any active ssh sessions will remain active, but future login attempts using this key will be rejected immediately.
                      </p>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                        <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)} disabled={ssh.deleting === selectedKey.id}>
                          Cancel
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          loading={ssh.deleting === selectedKey.id}
                          icon={<Trash2 size={12} />}
                          onClick={() => {
                            ssh.deleteKey(selectedKey.id);
                            setShowDeleteConfirm(false);
                            setSelectedKeyId(null);
                          }}
                        >
                          Confirm Revoke
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <p style={{ fontSize: '12px', color: 'var(--text-3)', margin: 0 }}>
                        Revoke this key's authentication privileges on the server.
                      </p>
                      <Button
                        variant="danger"
                        size="sm"
                        icon={<Trash2 size={12} />}
                        onClick={() => setShowDeleteConfirm(true)}
                      >
                        Revoke Key
                      </Button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* CASE 3: Blank State */
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                height: '100%', minHeight: '300px', gap: 12, color: 'var(--text-3)', textAlign: 'center'
              }}>
                <Key size={32} strokeWidth={1.5} className="empty-icon" />
                <div style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--text-2)' }}>No SSH Key selected</div>
                <div style={{ fontSize: '12px', maxWidth: '280px' }}>
                  Select a key from the left list or click the Add button to authorize a new ssh key.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
