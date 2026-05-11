import { useState, useEffect } from 'react';
import { Plus, Trash2, ArrowLeftRight } from 'lucide-react';
import { apiGet, apiPost, apiDelete } from '../../lib/api';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';

interface Redirect { id: string; source_domain: string; source_path: string; dest_url: string; type: number; www_handling: string; }

export default function Redirects() {
  const { ok, err } = useToast();
  const [redirects, setRedirects] = useState<Redirect[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ source_domain: '', source_path: '/', dest_url: '', type: 301, www_handling: 'both' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try { const r = await apiGet<Redirect[]>('redirects'); setRedirects(r); }
    catch { err('Failed to load redirects'); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const add = async () => {
    setSaving(true);
    try { await apiPost('redirects', form); ok('Redirect created'); setAddOpen(false); setForm({ source_domain:'', source_path:'/', dest_url:'', type:301, www_handling:'both' }); load(); }
    catch (e: any) { err(e.message || 'Failed'); } finally { setSaving(false); }
  };

  const del = async (id: string) => {
    try { await apiDelete(`redirects/${id}`); ok('Deleted'); load(); }
    catch { err('Delete failed'); }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Redirects</div><div className="page-desc">URL redirect and forwarding rules</div></div>
        <Button variant="primary" size="sm" icon={<Plus size={13} strokeWidth={1.5} />} onClick={() => setAddOpen(true)}>Add Redirect</Button>
      </div>

      {loading ? <PageSpinner /> : redirects.length === 0 ? (
        <div className="empty">
          <ArrowLeftRight size={32} className="empty-icon" strokeWidth={1.5} />
          <div className="empty-title">No redirects</div>
          <div className="empty-desc">Create URL redirect rules to forward traffic</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Source</th><th>Destination</th><th>Type</th><th>WWW</th><th></th></tr></thead>
            <tbody>
              {redirects.map(r => (
                <tr key={r.id}>
                  <td className="mono" style={{ fontSize: 11 }}>{r.source_domain}{r.source_path}</td>
                  <td className="mono" style={{ fontSize: 11, color: 'var(--text-2)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.dest_url}</td>
                  <td><span className="badge badge-dim">{r.type}</span></td>
                  <td style={{ fontSize: 11, color: 'var(--text-2)' }}>{r.www_handling}</td>
                  <td><Button variant="danger" size="sm" icon={<Trash2 size={12} strokeWidth={1.5} />} onClick={() => del(r.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Redirect" width={460}
        footer={<><Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={add}>Create</Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field"><label>Source Domain</label><input value={form.source_domain} onChange={e => setForm(f => ({...f, source_domain: e.target.value}))} placeholder="example.com" autoFocus /></div>
            <div className="field"><label>Source Path</label><input value={form.source_path} onChange={e => setForm(f => ({...f, source_path: e.target.value}))} /></div>
          </div>
          <div className="field"><label>Destination URL</label><input value={form.dest_url} onChange={e => setForm(f => ({...f, dest_url: e.target.value}))} placeholder="https://newsite.com" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field"><label>Type</label><select value={form.type} onChange={e => setForm(f => ({...f, type: Number(e.target.value)}))}><option value={301}>301 Permanent</option><option value={302}>302 Temporary</option></select></div>
            <div className="field"><label>WWW Handling</label><select value={form.www_handling} onChange={e => setForm(f => ({...f, www_handling: e.target.value}))}><option value="both">Both</option><option value="www">WWW only</option><option value="non-www">Non-WWW only</option></select></div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
