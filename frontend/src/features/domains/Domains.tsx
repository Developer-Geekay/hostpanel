import { useState, useEffect } from 'react';
import { Plus, Trash2, Globe, Lock } from 'lucide-react';
import { apiGet, apiPost, apiDelete } from '../../lib/api';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import { Toggle } from '../../components/ui/Toggle';
import { useToast } from '../../components/ui/Toast';

interface Domain { name: string; document_root: string; force_https: boolean; active: boolean; }

export default function Domains() {
  const { ok, err } = useToast();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState('');

  const load = async () => {
    try { const r = await apiGet<Domain[]>('domains'); setDomains(r); }
    catch { err('Failed to load domains'); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!newDomain.trim()) return;
    setSaving(true);
    try { await apiPost('domains', { name: newDomain.trim() }); ok(`Domain ${newDomain} added`); setAddOpen(false); setNewDomain(''); load(); }
    catch (e: any) { err(e.message || 'Failed'); } finally { setSaving(false); }
  };

  const deleteDomain = async (name: string) => {
    try { await apiDelete(`domains/${name}`); ok(`${name} deleted`); setDeleteTarget(''); load(); }
    catch { err('Delete failed'); }
  };

  const toggleForceHttps = async (d: Domain) => {
    try { await apiPost(`domains/${d.name}/force-https`, { enabled: !d.force_https }); load(); }
    catch { err('Failed'); }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Domains</div><div className="page-desc">Manage hosted domains and virtual hosts</div></div>
        <Button variant="primary" size="sm" icon={<Plus size={13} strokeWidth={1.5} />} onClick={() => setAddOpen(true)}>Add Domain</Button>
      </div>

      {loading ? <PageSpinner /> : domains.length === 0 ? (
        <div className="empty">
          <Globe size={32} className="empty-icon" strokeWidth={1.5} />
          <div className="empty-title">No domains</div>
          <div className="empty-desc">Add a domain to start hosting websites</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Domain</th><th>Document Root</th><th>Status</th><th>Force HTTPS</th><th>Actions</th></tr></thead>
            <tbody>
              {domains.map(d => (
                <tr key={d.name}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Globe size={13} strokeWidth={1.5} color="var(--accent)" />
                      <span className="mono" style={{ fontWeight: 500 }}>{d.name}</span>
                    </div>
                  </td>
                  <td className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{d.document_root}</td>
                  <td><span className={`badge ${d.active ? 'badge-ok' : 'badge-dim'}`}>{d.active ? 'Active' : 'Inactive'}</span></td>
                  <td><Toggle checked={d.force_https} onChange={() => toggleForceHttps(d)} label={d.force_https ? 'On' : 'Off'} /></td>
                  <td><Button variant="danger" size="sm" icon={<Trash2 size={12} strokeWidth={1.5} />} onClick={() => setDeleteTarget(d.name)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={addOpen} onClose={() => { setAddOpen(false); setNewDomain(''); }} title="Add Domain" width={380}
        footer={<><Button variant="ghost" onClick={() => { setAddOpen(false); setNewDomain(''); }}>Cancel</Button><Button variant="primary" loading={saving} onClick={add}>Add</Button></>}>
        <div className="field"><label>Domain Name</label><input value={newDomain} onChange={e => setNewDomain(e.target.value)} placeholder="example.com" autoFocus onKeyDown={e => e.key === 'Enter' && add()} /></div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget('')} title="Delete Domain" width={340}
        footer={<><Button variant="ghost" onClick={() => setDeleteTarget('')}>Cancel</Button><Button variant="danger" onClick={() => deleteDomain(deleteTarget)}>Delete</Button></>}>
        <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Delete domain <strong>{deleteTarget}</strong> and all its configuration?</p>
      </Modal>
    </div>
  );
}
