import { useState, useEffect, useCallback } from 'react';
import { UserPlus, KeyRound, Trash2, Users as UsersIcon } from 'lucide-react';
import { apiGet, apiPost, apiDelete } from '../../lib/api';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import { Toggle } from '../../components/ui/Toggle';
import { useToast } from '../../components/ui/Toast';

interface User {
  username: string;
  role: 'admin' | 'user';
  suspended: boolean;
  has_ftp: boolean;
}

export default function Users() {
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwUser, setPwUser] = useState('');
  const [deleteTarget, setDeleteTarget] = useState('');
  const [form, setForm] = useState({ username: '', password: '', role: 'user' });
  const [newPw, setNewPw] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiGet<User[]>('users');
      setUsers(r);
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function addUser() {
    if (!form.username.trim() || !form.password) return;
    setSaving(true);
    try {
      await apiPost('users', form);
      toast.ok(`User ${form.username} created`);
      setAddOpen(false);
      setForm({ username: '', password: '', role: 'user' });
      load();
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setSaving(false);
    }
  }

  async function changePw() {
    if (!newPw.trim()) return;
    setSaving(true);
    try {
      await apiPost(`users/${pwUser}/password`, { password: newPw });
      toast.ok('Password changed');
      setPwOpen(false);
      setNewPw('');
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`users/${deleteTarget}`);
      toast.ok(`${deleteTarget} deleted`);
      setDeleteTarget('');
      load();
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  async function toggleSuspend(u: User) {
    try {
      await apiPost(`users/${u.username}/suspend`, { suspended: !u.suspended });
      load();
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to update suspension');
    }
  }

  async function toggleFtp(u: User) {
    try {
      if (u.has_ftp) {
        await apiDelete(`users/${u.username}/ftp`);
      } else {
        await apiPost(`users/${u.username}/ftp/enable`, {});
      }
      load();
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to update FTP access');
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Users</div>
          <div className="page-desc">Manage panel accounts and access</div>
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={<UserPlus size={13} strokeWidth={1.5} />}
          onClick={() => { setForm({ username: '', password: '', role: 'user' }); setAddOpen(true); }}
        >
          Add User
        </Button>
      </div>

      {loading ? (
        <PageSpinner />
      ) : users.length === 0 ? (
        <div className="empty">
          <UsersIcon size={32} strokeWidth={1.5} className="empty-icon" />
          <div className="empty-title">No users</div>
          <div className="empty-desc">Create the first user account.</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>FTP</th>
                <th>Suspended</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.username}>
                  <td className="mono" style={{ fontWeight: 500 }}>{u.username}</td>
                  <td>
                    <span className={`badge ${u.role === 'admin' ? 'badge-info' : 'badge-dim'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${u.suspended ? 'badge-err' : 'badge-ok'}`}>
                      {u.suspended ? 'Suspended' : 'Active'}
                    </span>
                  </td>
                  <td>
                    <Toggle checked={u.has_ftp} onChange={() => toggleFtp(u)} />
                  </td>
                  <td>
                    <Toggle checked={u.suspended} onChange={() => toggleSuspend(u)} />
                  </td>
                  <td>
                    <div className="actions">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<KeyRound size={12} strokeWidth={1.5} />}
                        onClick={() => { setPwUser(u.username); setNewPw(''); setPwOpen(true); }}
                      >
                        Password
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        icon={<Trash2 size={12} strokeWidth={1.5} />}
                        onClick={() => setDeleteTarget(u.username)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add User modal */}
      <Modal
        open={addOpen}
        onClose={() => { if (!saving) setAddOpen(false); }}
        title="Add User"
        width={380}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)} disabled={saving}>Cancel</Button>
            <Button
              variant="primary"
              size="sm"
              loading={saving}
              disabled={!form.username.trim() || !form.password}
              onClick={addUser}
            >
              Create
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label>Username</label>
            <input
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              autoFocus
              disabled={saving}
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              disabled={saving}
            />
          </div>
          <div className="field">
            <label>Role</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} disabled={saving}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
      </Modal>

      {/* Change Password modal */}
      <Modal
        open={pwOpen}
        onClose={() => { if (!saving) { setPwOpen(false); setNewPw(''); } }}
        title={`Change password — ${pwUser}`}
        width={360}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => { setPwOpen(false); setNewPw(''); }} disabled={saving}>Cancel</Button>
            <Button variant="primary" size="sm" loading={saving} disabled={!newPw.trim()} onClick={changePw}>Update</Button>
          </>
        }
      >
        <div className="field">
          <label>New Password</label>
          <input
            type="password"
            value={newPw}
            onChange={e => setNewPw(e.target.value)}
            autoFocus
            disabled={saving}
            onKeyDown={e => { if (e.key === 'Enter') changePw(); }}
          />
        </div>
      </Modal>

      {/* Delete User modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => { if (!deleting) setDeleteTarget(''); }}
        title="Delete User"
        width={340}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setDeleteTarget('')} disabled={deleting}>Cancel</Button>
            <Button variant="danger" size="sm" loading={deleting} onClick={deleteUser}>Delete</Button>
          </>
        }
      >
        <p style={{ fontSize: 13, color: 'var(--text-2)' }}>
          Delete user <strong style={{ color: 'var(--text)' }}>{deleteTarget}</strong>? This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
