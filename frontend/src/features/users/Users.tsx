import { useState, useEffect } from 'react';
import { UserPlus, KeyRound, Trash2, MoreHorizontal } from 'lucide-react';
import { apiGet, apiPost, apiDelete } from '../../lib/api';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import { Toggle } from '../../components/ui/Toggle';
import { useToast } from '../../components/ui/Toast';

interface User { username: string; role: 'admin'|'user'; suspended: boolean; has_ftp: boolean; }

export default function Users() {
  const { ok, err } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwUser, setPwUser] = useState('');
  const [deleteTarget, setDeleteTarget] = useState('');
  const [form, setForm] = useState({ username: '', password: '', role: 'user' });
  const [newPw, setNewPw] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try { const r = await apiGet<User[]>('users'); setUsers(r); }
    catch { err('Failed to load users'); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const addUser = async () => {
    setSaving(true);
    try { await apiPost('users', form); ok(`User ${form.username} created`); setAddOpen(false); setForm({ username:'', password:'', role:'user' }); load(); }
    catch (e: any) { err(e.message || 'Failed'); } finally { setSaving(false); }
  };

  const changePw = async () => {
    setSaving(true);
    try { await apiPost(`users/${pwUser}/password`, { password: newPw }); ok('Password changed'); setPwOpen(false); setNewPw(''); }
    catch { err('Failed'); } finally { setSaving(false); }
  };

  const deleteUser = async (u: string) => {
    try { await apiDelete(`users/${u}`); ok(`${u} deleted`); setDeleteTarget(''); load(); }
    catch { err('Delete failed'); }
  };

  const toggleSuspend = async (u: User) => {
    try { await apiPost(`users/${u.username}/suspend`, { suspended: !u.suspended }); load(); }
    catch { err('Failed'); }
  };

  const toggleFtp = async (u: User) => {
    try {
      u.has_ftp ? await apiDelete(`users/${u.username}/ftp`) : await apiPost(`users/${u.username}/ftp/enable`, {});
      load();
    } catch { err('Failed'); }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Users</div><div className="page-desc">Manage panel accounts and access</div></div>
        <Button variant="primary" size="sm" icon={<UserPlus size={13} strokeWidth={1.5} />} onClick={() => setAddOpen(true)}>Add User</Button>
      </div>

      {loading ? <PageSpinner /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Username</th><th>Role</th><th>Status</th><th>FTP</th><th>Suspended</th><th>Actions</th></tr></thead>
            <tbody>
              {users.length === 0 && <tr><td colSpan={6}><div className="empty"><div className="empty-title">No users</div></div></td></tr>}
              {users.map(u => (
                <tr key={u.username}>
                  <td className="mono" style={{ fontWeight: 500 }}>{u.username}</td>
                  <td><span className={`badge ${u.role === 'admin' ? 'badge-info' : 'badge-dim'}`}>{u.role}</span></td>
                  <td><span className={`badge ${u.suspended ? 'badge-err' : 'badge-ok'}`}>{u.suspended ? 'Suspended' : 'Active'}</span></td>
                  <td><Toggle checked={u.has_ftp} onChange={() => toggleFtp(u)} /></td>
                  <td><Toggle checked={u.suspended} onChange={() => toggleSuspend(u)} /></td>
                  <td>
                    <div className="actions">
                      <Button variant="ghost" size="sm" icon={<KeyRound size={12} strokeWidth={1.5} />}
                        onClick={() => { setPwUser(u.username); setPwOpen(true); }}>Password</Button>
                      <Button variant="danger" size="sm" icon={<Trash2 size={12} strokeWidth={1.5} />}
                        onClick={() => setDeleteTarget(u.username)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add User" width={380}
        footer={<><Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={addUser}>Create</Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field"><label>Username</label><input value={form.username} onChange={e => setForm(f => ({...f, username: e.target.value}))} autoFocus /></div>
          <div className="field"><label>Password</label><input type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} /></div>
          <div className="field"><label>Role</label>
            <select value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))}>
              <option value="user">User</option><option value="admin">Admin</option>
            </select>
          </div>
        </div>
      </Modal>

      <Modal open={pwOpen} onClose={() => { setPwOpen(false); setNewPw(''); }} title={`Change password — ${pwUser}`} width={360}
        footer={<><Button variant="ghost" onClick={() => { setPwOpen(false); setNewPw(''); }}>Cancel</Button><Button variant="primary" loading={saving} onClick={changePw}>Update</Button></>}>
        <div className="field"><label>New Password</label><input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} autoFocus /></div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget('')} title="Delete User" width={340}
        footer={<><Button variant="ghost" onClick={() => setDeleteTarget('')}>Cancel</Button><Button variant="danger" onClick={() => deleteUser(deleteTarget)}>Delete</Button></>}>
        <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Delete user <strong>{deleteTarget}</strong>? This cannot be undone.</p>
      </Modal>
    </div>
  );
}
