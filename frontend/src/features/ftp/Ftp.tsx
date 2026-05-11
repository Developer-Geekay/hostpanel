import { useState, useEffect } from 'react';
import { Plus, Trash2, KeyRound, Server } from 'lucide-react';
import { apiGet, apiPost, apiDelete, apiPut } from '../../lib/api';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';

interface FtpAccount { username: string; home_dir: string; enabled: boolean; }

export default function Ftp() {
  const { ok, err } = useToast();
  const [accounts, setAccounts] = useState<FtpAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwUser, setPwUser] = useState('');
  const [newPw, setNewPw] = useState('');
  const [form, setForm] = useState({ username: '', password: '', home_dir: '/home' });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState('');

  const load = async () => {
    try { const r = await apiGet<FtpAccount[]>('ftp/accounts'); setAccounts(r); }
    catch { err('Failed to load FTP accounts'); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.username.trim()) return;
    setSaving(true);
    try { await apiPost('ftp/accounts', form); ok(`FTP account ${form.username} created`); setAddOpen(false); setForm({ username:'', password:'', home_dir:'/home' }); load(); }
    catch (e: any) { err(e.message || 'Failed'); } finally { setSaving(false); }
  };

  const changePw = async () => {
    setSaving(true);
    try { await apiPut(`ftp/accounts/${pwUser}/password`, { password: newPw }); ok('Password updated'); setPwOpen(false); setNewPw(''); }
    catch { err('Failed'); } finally { setSaving(false); }
  };

  const deleteAccount = async (u: string) => {
    try { await apiDelete(`ftp/accounts/${u}`); ok(`${u} deleted`); setDeleteTarget(''); load(); }
    catch { err('Delete failed'); }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">FTP Accounts</div><div className="page-desc">Manage FTP user accounts</div></div>
        <Button variant="primary" size="sm" icon={<Plus size={13} strokeWidth={1.5} />} onClick={() => setAddOpen(true)}>Add Account</Button>
      </div>

      {loading ? <PageSpinner /> : accounts.length === 0 ? (
        <div className="empty">
          <Server size={32} className="empty-icon" strokeWidth={1.5} />
          <div className="empty-title">No FTP accounts</div>
          <div className="empty-desc">Create an FTP account to enable file transfer access</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Username</th><th>Home Directory</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {accounts.map(a => (
                <tr key={a.username}>
                  <td className="mono" style={{ fontWeight: 500 }}>{a.username}</td>
                  <td className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{a.home_dir}</td>
                  <td><span className={`badge ${a.enabled ? 'badge-ok' : 'badge-dim'}`}>{a.enabled ? 'Active' : 'Disabled'}</span></td>
                  <td>
                    <div className="actions">
                      <Button variant="ghost" size="sm" icon={<KeyRound size={12} strokeWidth={1.5} />}
                        onClick={() => { setPwUser(a.username); setPwOpen(true); }}>Password</Button>
                      <Button variant="danger" size="sm" icon={<Trash2 size={12} strokeWidth={1.5} />} onClick={() => setDeleteTarget(a.username)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add FTP Account" width={400}
        footer={<><Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={create}>Create</Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field"><label>Username</label><input value={form.username} onChange={e => setForm(f => ({...f, username: e.target.value}))} autoFocus /></div>
          <div className="field"><label>Password</label><input type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} /></div>
          <div className="field"><label>Home Directory</label><input value={form.home_dir} onChange={e => setForm(f => ({...f, home_dir: e.target.value}))} /></div>
        </div>
      </Modal>

      <Modal open={pwOpen} onClose={() => { setPwOpen(false); setNewPw(''); }} title={`Change password — ${pwUser}`} width={360}
        footer={<><Button variant="ghost" onClick={() => { setPwOpen(false); setNewPw(''); }}>Cancel</Button><Button variant="primary" loading={saving} onClick={changePw}>Update</Button></>}>
        <div className="field"><label>New Password</label><input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} autoFocus /></div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget('')} title="Delete Account" width={340}
        footer={<><Button variant="ghost" onClick={() => setDeleteTarget('')}>Cancel</Button><Button variant="danger" onClick={() => deleteAccount(deleteTarget)}>Delete</Button></>}>
        <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Delete FTP account <strong>{deleteTarget}</strong>?</p>
      </Modal>
    </div>
  );
}
