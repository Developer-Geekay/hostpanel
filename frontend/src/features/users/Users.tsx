import { useState, useEffect } from 'react';
import {
  UserPlus, Users as UsersIcon, Search, KeyRound, Trash2, Shield,
  HardDrive, Globe, Database, Eye, EyeOff, AlertTriangle, Folder,
  User, Check, X
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { Toggle } from '../../components/ui/Toggle';
import { useToast } from '../../components/ui/Toast';
import { apiGet, apiPut } from '../../lib/api';
import { useUsers } from './hooks/useUsers';

export default function Users() {
  const u = useUsers();
  const toast = useToast();
  const [filter, setFilter] = useState('');
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null);
  
  // Local password eye toggles
  const [showPassword, setShowPassword] = useState(false);
  const [showPortalPassword, setShowPortalPassword] = useState(false);
  
  // Local password change form
  const [newPasswordLocal, setNewPasswordLocal] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  // Local resources state
  const [resources, setResources] = useState<{
    domains: string[];
    ssl_certs: string[];
    databases: string[];
    ftp_account: boolean;
  } | null>(null);
  const [loadingResources, setLoadingResources] = useState(false);

  // Automatically select first user if none selected
  useEffect(() => {
    if (u.users.length > 0 && !selectedUsername && !u.addOpen) {
      setSelectedUsername(u.users[0].username);
    }
  }, [u.users, selectedUsername, u.addOpen]);

  const selectedUser = u.users.find(user => user.username === selectedUsername) || null;

  // Load user resources on selection change
  useEffect(() => {
    if (selectedUser) {
      setLoadingResources(true);
      apiGet<{ domains: string[]; ssl_certs: string[]; databases: string[]; ftp_account: boolean }>(
        `users/${selectedUser.username}/resources`
      )
        .then(res => setResources(res))
        .catch(() => setResources(null))
        .finally(() => setLoadingResources(false));
    } else {
      setResources(null);
    }
  }, [selectedUser]);

  const generatePassword = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let pass = "";
    for (let i = 0; i < 14; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPasswordLocal.trim() || !selectedUser) return;
    setSavingPw(true);
    try {
      await apiPut(`users/${selectedUser.username}/password`, { new_password: newPasswordLocal });
      toast.ok(`Password successfully updated for ${selectedUser.username}`);
      setNewPasswordLocal('');
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setSavingPw(false);
    }
  };

  const filteredUsers = u.users.filter(user =>
    user.username.toLowerCase().includes(filter.toLowerCase()) ||
    user.home_dir.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Top Header */}
      <div className="page-header" style={{ flexShrink: 0, paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div className="page-title">Users</div>
          <div className="page-desc">Manage hosting users and system access</div>
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={<UserPlus size={13} />}
          onClick={() => { u.setAddOpen(true); setSelectedUsername(null); }}
        >
          Add User
        </Button>
      </div>

      {u.loading && u.users.length === 0 ? (
        <PageSpinner />
      ) : u.users.length === 0 && !u.addOpen ? (
        <div className="empty" style={{ flex: 1 }}>
          <UsersIcon size={32} strokeWidth={1.5} className="empty-icon" />
          <div className="empty-title">No users found</div>
          <div className="empty-desc">Create your first hosting user account.</div>
        </div>
      ) : (
        <div className="split-view" style={{ flex: 1, minHeight: 0 }}>
          {/* LEFT: Users List */}
          <div className="split-left">
            <div className="split-pane-header">
              <h3 style={{ fontSize: '12px', fontWeight: 600 }}>Hosting Accounts</h3>
            </div>
            <div className="search-wrap" style={{ margin: '8px 10px 4px' }}>
              <Search style={{ width: 12, height: 12, color: 'var(--text-3)', flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Filter users..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
              />
            </div>
            <div className="split-scroll">
              <div style={{ height: 4 }} />
              {filteredUsers.map(user => {
                const isSelected = user.username === selectedUsername;
                const isSuspended = user.status === 'suspended';
                const avatarChar = (user.username?.[0] || 'U').toUpperCase();
                
                // Root has admin accent colors, others have regular user colors
                const isAdminUser = user.username === 'root';

                return (
                  <div
                    key={user.username}
                    className={`list-item${isSelected ? ' sel' : ''}`}
                    onClick={() => { setSelectedUsername(user.username); u.setAddOpen(false); }}
                  >
                    <div className="avatar" style={{
                      width: '28px', height: '28px', borderRadius: '8px',
                      background: isAdminUser ? 'var(--accent-dim)' : 'var(--blue-dim)',
                      border: isAdminUser ? '1px solid var(--accent-border)' : '1px solid var(--blue-border)',
                      display: 'grid', placeItems: 'center',
                      fontFamily: 'var(--font-mono)', fontSize: '11px', 
                      color: isAdminUser ? 'var(--accent-fg, var(--accent))' : 'var(--blue)',
                      flexShrink: 0
                    }}>
                      {avatarChar}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="li-name" style={{ fontSize: '12.5px', fontWeight: 500 }}>{user.username}</div>
                      <div className="li-sub" style={{ fontSize: '10.5px' }}>{user.home_dir}</div>
                    </div>
                    <span className={`chip ${isSuspended ? 'chip-red' : 'chip-green'}`} style={{ fontSize: '9px', padding: '1px 5px' }}>
                      {isSuspended ? 'suspended' : 'active'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT: User Detail or Add User form */}
          <div className="split-right" style={{ paddingLeft: '20px' }}>
            {u.addOpen ? (
              /* CREATE USER SCREEN */
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                <div className="split-pane-header">
                  <h3 style={{ fontSize: '13px', fontWeight: 600 }}>Create New Hosting Account</h3>
                </div>
                <div className="split-scroll" style={{ padding: '18px 20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '420px' }}>
                    
                    {/* Username */}
                    <div className="field">
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-2)' }}>Username</label>
                      <input
                        value={u.form.username}
                        autoFocus
                        disabled={u.saving}
                        onChange={e => u.setForm(f => ({ ...f, username: e.target.value }))}
                        placeholder="e.g. webmaster"
                      />
                    </div>

                    {/* System Password */}
                    <div className="field">
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-2)' }}>Linux System Password</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={u.form.password}
                            disabled={u.saving}
                            onChange={e => u.setForm(f => ({ ...f, password: e.target.value }))}
                            placeholder="Min 8 characters"
                            style={{ paddingRight: '32px' }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-3)' }}
                          >
                            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={u.saving}
                          onClick={() => u.setForm(f => ({ ...f, password: generatePassword() }))}
                        >
                          Generate
                        </Button>
                      </div>
                    </div>

                    {/* Panel Password (Optional) */}
                    <div className="field">
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-2)' }}>
                        Console Login Password <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(Optional)</span>
                      </label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <input
                            type={showPortalPassword ? 'text' : 'password'}
                            value={u.form.portal_password}
                            disabled={u.saving}
                            placeholder="Leave blank for system-only access"
                            onChange={e => u.setForm(f => ({ ...f, portal_password: e.target.value }))}
                            style={{ paddingRight: '32px' }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPortalPassword(!showPortalPassword)}
                            style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-3)' }}
                          >
                            {showPortalPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={u.saving}
                          onClick={() => u.setForm(f => ({ ...f, portal_password: generatePassword() }))}
                        >
                          Generate
                        </Button>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                      <Button
                        variant="primary"
                        size="sm"
                        loading={u.saving}
                        disabled={!u.form.username.trim() || !u.form.password}
                        onClick={u.addUser}
                      >
                        Create Account
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={u.saving}
                        onClick={() => { u.setAddOpen(false); if (u.users.length > 0) setSelectedUsername(u.users[0].username); }}
                      >
                        Cancel
                      </Button>
                    </div>

                  </div>
                </div>
              </div>
            ) : selectedUser ? (
              /* DETAIL VIEW SCREEN */
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                {/* Detail Header */}
                <div className="split-pane-header" style={{ gap: '14px' }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '9px',
                    background: selectedUser.username === 'root' ? 'var(--accent-dim)' : 'var(--blue-dim)',
                    border: selectedUser.username === 'root' ? '1px solid var(--accent-border)' : '1px solid var(--blue-border)',
                    display: 'grid', placeItems: 'center', flexShrink: 0
                  }}>
                    <User size={16} style={{ color: selectedUser.username === 'root' ? 'var(--accent-fg, var(--accent))' : 'var(--blue)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text)' }}>
                      {selectedUser.username}
                    </h3>
                    <div className="mono" style={{ fontSize: '10px', color: 'var(--text-3)', marginTop: '2px' }}>
                      Shell: {selectedUser.shell || '/bin/bash'} · Home: {selectedUser.home_dir}
                    </div>
                  </div>
                  <span className={`chip ${selectedUser.status === 'suspended' ? 'chip-red' : 'chip-green'}`}>
                    {selectedUser.status}
                  </span>
                </div>

                {/* Details Scroll Content */}
                <div className="split-scroll" style={{ padding: '16px 18px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '640px' }}>
                    
                    {/* User Properties Grid */}
                    <div>
                      <div className="stat-lbl" style={{ marginBottom: '8px' }}>Account Settings</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                        
                        <div className="card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-2)' }}>FTP Access</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-3)', marginTop: '2px' }}>Enable connection via FTP</div>
                          </div>
                          <Toggle checked={selectedUser.ftp_enabled} onChange={() => u.toggleFtp(selectedUser)} />
                        </div>

                        <div className="card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-2)' }}>Suspend Account</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-3)', marginTop: '2px' }}>Freeze directory and site access</div>
                          </div>
                          <Toggle checked={selectedUser.status === 'suspended'} onChange={() => u.toggleSuspend(selectedUser)} />
                        </div>

                      </div>
                    </div>

                    {/* Resources section */}
                    <div>
                      <div className="stat-lbl" style={{ marginBottom: '8px' }}>User Resources</div>
                      {loadingResources ? (
                        <div style={{ color: 'var(--text-3)', fontSize: '11.5px', padding: '10px' }}>Loading resources...</div>
                      ) : resources ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          
                          {/* Domains */}
                          <div className="card" style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '6px' }}>
                              <Globe size={11} /> Owned Domains
                            </div>
                            {resources.domains.length === 0 ? (
                              <div style={{ fontSize: '11.5px', color: 'var(--text-3)' }}>No domains assigned.</div>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {resources.domains.map(d => (
                                  <span key={d} className="chip chip-blue" style={{ fontSize: '10px' }}>{d}</span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Databases */}
                          <div className="card" style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '6px' }}>
                              <Database size={11} /> MySQL Databases
                            </div>
                            {resources.databases.length === 0 ? (
                              <div style={{ fontSize: '11.5px', color: 'var(--text-3)' }}>No databases assigned.</div>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {resources.databases.map(db => (
                                  <span key={db} className="chip chip-gray" style={{ fontSize: '10px' }}>{db}</span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* SSL Certificates */}
                          <div className="card" style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '6px' }}>
                              <Shield size={11} /> SSL Certificates
                            </div>
                            {resources.ssl_certs.length === 0 ? (
                              <div style={{ fontSize: '11.5px', color: 'var(--text-3)' }}>No active SSL certificates.</div>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {resources.ssl_certs.map(cert => (
                                  <span key={cert} className="chip chip-green" style={{ fontSize: '10px' }}>{cert}</span>
                                ))}
                              </div>
                            )}
                          </div>

                        </div>
                      ) : (
                        <div style={{ color: 'var(--text-3)', fontSize: '11.5px', padding: '10px' }}>Failed to retrieve resources.</div>
                      )}
                    </div>

                    {/* Change Password Inline Section */}
                    <div className="card" style={{ padding: '14px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                        Change Password
                      </div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-3)', marginBottom: '10px' }}>
                        Update the Linux system password for this account.
                      </div>
                      <form onSubmit={handlePasswordChange} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div className="field" style={{ flex: 1, minWidth: '180px', marginBottom: 0 }}>
                          <input
                            type="password"
                            value={newPasswordLocal}
                            onChange={e => setNewPasswordLocal(e.target.value)}
                            placeholder="New password (min 8 chars)"
                            style={{ height: '32px', fontSize: '12px' }}
                          />
                        </div>
                        <Button
                          variant="primary"
                          size="sm"
                          loading={savingPw}
                          disabled={!newPasswordLocal.trim()}
                          onClick={handlePasswordChange}
                          style={{ height: '32px' }}
                        >
                          Update Password
                        </Button>
                      </form>
                    </div>

                    {/* Danger Zone */}
                    {selectedUser.username !== 'root' && (
                      <div className="card" style={{ border: '1px solid var(--red-border)', background: 'var(--red-dim)', padding: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--red)', marginBottom: '4px' }}>
                          <AlertTriangle size={13} /> Danger Zone
                        </div>
                        <p style={{ fontSize: '11px', color: 'var(--text-2)', marginBottom: '12px' }}>
                          Permanently delete user account <strong>{selectedUser.username}</strong> and all associated resources, databases, configurations, and home directory contents. This cannot be undone.
                        </p>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => u.setDeleteTarget(selectedUser.username)}
                        >
                          Delete Account
                        </Button>
                      </div>
                    )}

                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-3)', fontSize: '13px' }}>
                Select a user account from the list or add a new user to begin
              </div>
            )}
          </div>

        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!u.deleteTarget}
        onClose={() => { if (!u.deleting) u.setDeleteTarget(''); }}
        title="Delete Hosting Account"
        width={360}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => u.setDeleteTarget('')} disabled={u.deleting}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" loading={u.deleting} onClick={u.deleteUser}>
              Confirm Delete
            </Button>
          </div>
        }
      >
        <p style={{ fontSize: '12.5px', color: 'var(--text-2)', lineHeight: 1.5 }}>
          Are you absolutely sure you want to delete <strong style={{ color: 'var(--text)' }}>{u.deleteTarget}</strong> and all its associated website domains, databases, mailboxes, and folder assets? This operation is permanent.
        </p>
      </Modal>
    </div>
  );
}
