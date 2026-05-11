import { useState, useEffect } from 'react';
import { Plus, Trash2, Database } from 'lucide-react';
import { apiGet, apiPost, apiDelete } from '../../lib/api';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';

interface DbEntry { name: string; size_mb: number; tables: number; }

export default function Databases() {
  const { ok, err } = useToast();
  const [dbs, setDbs] = useState<DbEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', password: '' });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState('');

  const load = async () => {
    try { const r = await apiGet<DbEntry[]>('databases/mysql'); setDbs(r); }
    catch { err('Failed to load databases'); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try { await apiPost('databases/mysql', form); ok(`Database ${form.name} created`); setAddOpen(false); setForm({ name:'', password:'' }); load(); }
    catch (e: any) { err(e.message || 'Failed'); } finally { setSaving(false); }
  };

  const deleteDb = async (name: string) => {
    try { await apiDelete(`databases/mysql/${name}`); ok(`${name} deleted`); setDeleteTarget(''); load(); }
    catch { err('Delete failed'); }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Databases</div><div className="page-desc">MySQL database management</div></div>
        <Button variant="primary" size="sm" icon={<Plus size={13} strokeWidth={1.5} />} onClick={() => setAddOpen(true)}>Create Database</Button>
      </div>

      {loading ? <PageSpinner /> : dbs.length === 0 ? (
        <div className="empty">
          <Database size={32} className="empty-icon" strokeWidth={1.5} />
          <div className="empty-title">No databases</div>
          <div className="empty-desc">Create your first MySQL database</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Size</th><th>Tables</th><th></th></tr></thead>
            <tbody>
              {dbs.map(d => (
                <tr key={d.name}>
                  <td className="mono" style={{ fontWeight: 500 }}>{d.name}</td>
                  <td className="mono" style={{ fontSize: 11 }}>{d.size_mb ? `${d.size_mb.toFixed(1)} MB` : '—'}</td>
                  <td className="mono" style={{ fontSize: 11 }}>{d.tables ?? '—'}</td>
                  <td><Button variant="danger" size="sm" icon={<Trash2 size={12} strokeWidth={1.5} />} onClick={() => setDeleteTarget(d.name)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Create Database" width={380}
        footer={<><Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={create}>Create</Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field"><label>Database Name</label><input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="myapp_db" autoFocus /></div>
          <div className="field"><label>Password</label><input type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} /></div>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget('')} title="Delete Database" width={340}
        footer={<><Button variant="ghost" onClick={() => setDeleteTarget('')}>Cancel</Button><Button variant="danger" onClick={() => deleteDb(deleteTarget)}>Delete</Button></>}>
        <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Delete database <strong>{deleteTarget}</strong> and all its data? This cannot be undone.</p>
      </Modal>
    </div>
  );
}
