import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Database as DatabaseIcon } from 'lucide-react';
import { apiGet, apiPost, apiDelete } from '../../lib/api';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';

interface DbEntry {
  name: string;
  size_mb: number;
  tables: number;
}

export default function Databases() {
  const toast = useToast();
  const [dbs, setDbs] = useState<DbEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', password: '' });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiGet<DbEntry[]>('databases/mysql');
      setDbs(r);
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to load databases');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await apiPost('databases/mysql', form);
      toast.ok(`Database ${form.name} created`);
      setAddOpen(false);
      setForm({ name: '', password: '' });
      load();
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to create database');
    } finally {
      setSaving(false);
    }
  }

  async function deleteDb() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`databases/mysql/${deleteTarget}`);
      toast.ok(`${deleteTarget} deleted`);
      setDeleteTarget('');
      load();
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Databases</div>
          <div className="page-desc">MySQL database management</div>
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={13} strokeWidth={1.5} />}
          onClick={() => { setForm({ name: '', password: '' }); setAddOpen(true); }}
        >
          Create Database
        </Button>
      </div>

      {loading ? (
        <PageSpinner />
      ) : dbs.length === 0 ? (
        <div className="empty">
          <DatabaseIcon size={32} strokeWidth={1.5} className="empty-icon" />
          <div className="empty-title">No databases</div>
          <div className="empty-desc">Create your first MySQL database.</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Size</th>
                <th>Tables</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {dbs.map(d => (
                <tr key={d.name}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <DatabaseIcon size={13} strokeWidth={1.5} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      <span className="mono" style={{ fontWeight: 500 }}>{d.name}</span>
                    </div>
                  </td>
                  <td className="mono" style={{ fontSize: 11 }}>
                    {d.size_mb != null ? `${d.size_mb.toFixed(1)} MB` : '—'}
                  </td>
                  <td className="mono" style={{ fontSize: 11 }}>{d.tables ?? '—'}</td>
                  <td>
                    <Button
                      variant="danger"
                      size="sm"
                      icon={<Trash2 size={12} strokeWidth={1.5} />}
                      onClick={() => setDeleteTarget(d.name)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Database modal */}
      <Modal
        open={addOpen}
        onClose={() => { if (!saving) setAddOpen(false); }}
        title="Create Database"
        width={380}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)} disabled={saving}>Cancel</Button>
            <Button
              variant="primary"
              size="sm"
              loading={saving}
              disabled={!form.name.trim()}
              onClick={create}
            >
              Create
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label>Database Name</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="myapp_db"
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
              placeholder="Database user password"
            />
          </div>
        </div>
      </Modal>

      {/* Delete confirm modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => { if (!deleting) setDeleteTarget(''); }}
        title="Delete Database"
        width={340}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setDeleteTarget('')} disabled={deleting}>Cancel</Button>
            <Button variant="danger" size="sm" loading={deleting} onClick={deleteDb}>Delete</Button>
          </>
        }
      >
        <p style={{ fontSize: 13, color: 'var(--text-2)' }}>
          Delete database <strong style={{ color: 'var(--text)' }}>{deleteTarget}</strong> and all its data?
          This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
