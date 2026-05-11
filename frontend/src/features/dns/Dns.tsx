import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, ChevronLeft, Globe, ArrowLeftRight } from 'lucide-react';
import { apiGet, apiPost, apiDelete } from '../../lib/api';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';

interface DnsZone { name: string; serial: string; }
interface DnsRecord { id: string; name: string; type: string; content: string; ttl: number; }
interface Redirect { id: string; source_domain: string; source_path: string; dest_url: string; type: number; www_handling: string; }

const RECORD_TYPES = ['All','A','AAAA','CNAME','MX','TXT','NS','CAA'];

export default function Dns() {
  const { ok, err } = useToast();
  const [tab, setTab] = useState<'dns'|'redirects'>('dns');

  // DNS
  const [zones, setZones] = useState<DnsZone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [selectedZone, setSelectedZone] = useState<DnsZone | null>(null);
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState('All');
  const [addZoneOpen, setAddZoneOpen] = useState(false);
  const [newZone, setNewZone] = useState('');
  const [addRecordOpen, setAddRecordOpen] = useState(false);
  const [recordForm, setRecordForm] = useState({ name: '@', type: 'A', content: '', ttl: 300 });
  const [savingZone, setSavingZone] = useState(false);
  const [savingRecord, setSavingRecord] = useState(false);

  // Redirects
  const [redirects, setRedirects] = useState<Redirect[]>([]);
  const [redirectsLoading, setRedirectsLoading] = useState(false);
  const [addRedirectOpen, setAddRedirectOpen] = useState(false);
  const [redirectForm, setRedirectForm] = useState({ source_domain: '', source_path: '/', dest_url: '', type: 301, www_handling: 'both' });
  const [savingRedirect, setSavingRedirect] = useState(false);

  const loadZones = useCallback(async () => {
    try { const r = await apiGet<DnsZone[]>('dns/zones'); setZones(r); }
    catch { err('Failed to load DNS zones'); } finally { setZonesLoading(false); }
  }, []);

  const loadRecords = async (zone: DnsZone) => {
    setSelectedZone(zone); setRecordsLoading(true); setTypeFilter('All');
    try { const r = await apiGet<DnsRecord[]>(`dns/zones/${zone.name}/records`); setRecords(r); }
    catch { err('Failed to load records'); } finally { setRecordsLoading(false); }
  };

  const loadRedirects = useCallback(async () => {
    setRedirectsLoading(true);
    try { const r = await apiGet<Redirect[]>('redirects'); setRedirects(r); }
    catch { err('Failed to load redirects'); } finally { setRedirectsLoading(false); }
  }, []);

  useEffect(() => { loadZones(); }, [loadZones]);

  const addZone = async () => {
    if (!newZone.trim()) return;
    setSavingZone(true);
    try { await apiPost('dns/zones', { name: newZone.trim() }); ok(`Zone ${newZone} created`); setAddZoneOpen(false); setNewZone(''); loadZones(); }
    catch (e: any) { err(e.message || 'Failed'); } finally { setSavingZone(false); }
  };

  const deleteZone = async (name: string) => {
    try { await apiDelete(`dns/zones/${name}`); ok(`Zone ${name} deleted`); if (selectedZone?.name === name) { setSelectedZone(null); setRecords([]); } loadZones(); }
    catch { err('Delete failed'); }
  };

  const addRecord = async () => {
    if (!selectedZone) return;
    setSavingRecord(true);
    try { await apiPost(`dns/zones/${selectedZone.name}/records`, recordForm); ok('Record added'); setAddRecordOpen(false); setRecordForm({ name:'@', type:'A', content:'', ttl:300 }); loadRecords(selectedZone); }
    catch (e: any) { err(e.message || 'Failed'); } finally { setSavingRecord(false); }
  };

  const deleteRecord = async (id: string) => {
    if (!selectedZone) return;
    try { await apiDelete(`dns/zones/${selectedZone.name}/records/${id}`); ok('Record deleted'); loadRecords(selectedZone); }
    catch { err('Delete failed'); }
  };

  const addRedirect = async () => {
    setSavingRedirect(true);
    try { await apiPost('redirects', redirectForm); ok('Redirect created'); setAddRedirectOpen(false); setRedirectForm({ source_domain:'', source_path:'/', dest_url:'', type:301, www_handling:'both' }); loadRedirects(); }
    catch (e: any) { err(e.message || 'Failed'); } finally { setSavingRedirect(false); }
  };

  const filteredRecords = typeFilter === 'All' ? records : records.filter(r => r.type === typeFilter);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">DNS & Redirects</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['dns','redirects'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); if (t==='redirects') loadRedirects(); }}
              style={{ padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: tab===t ? 'var(--accent-dim)' : 'transparent', color: tab===t ? 'var(--accent)' : 'var(--text-2)', cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-ui)' }}>
              {t === 'dns' ? 'DNS Zones' : 'Redirects'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'dns' && (
        <>
          {!selectedZone ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                <Button variant="primary" size="sm" icon={<Plus size={13} strokeWidth={1.5} />} onClick={() => setAddZoneOpen(true)}>Add Zone</Button>
              </div>
              {zonesLoading ? <PageSpinner /> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Zone</th><th>Serial</th><th>Actions</th></tr></thead>
                    <tbody>
                      {zones.length === 0 && <tr><td colSpan={3}><div className="empty"><div className="empty-title">No DNS zones</div></div></td></tr>}
                      {zones.map(z => (
                        <tr key={z.name} style={{ cursor: 'pointer' }}>
                          <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => loadRecords(z)}>
                            <Globe size={13} strokeWidth={1.5} color="var(--accent)" />
                            <span className="mono" style={{ color: 'var(--accent)' }}>{z.name}</span>
                          </div></td>
                          <td className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{z.serial}</td>
                          <td><Button variant="danger" size="sm" icon={<Trash2 size={12} strokeWidth={1.5} />} onClick={() => deleteZone(z.name)} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Button variant="ghost" size="sm" icon={<ChevronLeft size={13} strokeWidth={1.5} />} onClick={() => { setSelectedZone(null); setRecords([]); }}>Zones</Button>
                  <span className="mono" style={{ fontSize: 13, color: 'var(--text)' }}>{selectedZone.name}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {RECORD_TYPES.map(t => (
                      <button key={t} onClick={() => setTypeFilter(t)}
                        style={{ padding: '3px 8px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: typeFilter===t ? 'var(--accent-dim)' : 'transparent', color: typeFilter===t ? 'var(--accent)' : 'var(--text-2)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <Button variant="primary" size="sm" icon={<Plus size={13} strokeWidth={1.5} />} onClick={() => setAddRecordOpen(true)}>Add Record</Button>
              </div>
              {recordsLoading ? <PageSpinner /> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Name</th><th>Type</th><th>Content</th><th>TTL</th><th></th></tr></thead>
                    <tbody>
                      {filteredRecords.length === 0 && <tr><td colSpan={5}><div className="empty"><div className="empty-title">No records</div></div></td></tr>}
                      {filteredRecords.map(r => (
                        <tr key={r.id}>
                          <td className="mono">{r.name}</td>
                          <td><span className="badge badge-dim" style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{r.type}</span></td>
                          <td className="mono" style={{ fontSize: 11, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.content}</td>
                          <td className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{r.ttl}</td>
                          <td><Button variant="danger" size="sm" icon={<Trash2 size={12} strokeWidth={1.5} />} onClick={() => deleteRecord(r.id)} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

      {tab === 'redirects' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <Button variant="primary" size="sm" icon={<Plus size={13} strokeWidth={1.5} />} onClick={() => setAddRedirectOpen(true)}>Add Redirect</Button>
          </div>
          {redirectsLoading ? <PageSpinner /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Source</th><th>Destination</th><th>Type</th><th></th></tr></thead>
                <tbody>
                  {redirects.length === 0 && <tr><td colSpan={4}><div className="empty"><div className="empty-title">No redirects</div></div></td></tr>}
                  {redirects.map(r => (
                    <tr key={r.id}>
                      <td className="mono" style={{ fontSize: 11 }}>{r.source_domain}{r.source_path}</td>
                      <td className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{r.dest_url}</td>
                      <td><span className="badge badge-dim">{r.type}</span></td>
                      <td><Button variant="danger" size="sm" icon={<Trash2 size={12} strokeWidth={1.5} />} onClick={async () => { try { await apiDelete(`redirects/${r.id}`); ok('Deleted'); loadRedirects(); } catch { err('Failed'); } }} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <Modal open={addZoneOpen} onClose={() => { setAddZoneOpen(false); setNewZone(''); }} title="Add DNS Zone" width={360}
        footer={<><Button variant="ghost" onClick={() => { setAddZoneOpen(false); setNewZone(''); }}>Cancel</Button><Button variant="primary" loading={savingZone} onClick={addZone}>Create</Button></>}>
        <div className="field"><label>Domain</label><input value={newZone} onChange={e => setNewZone(e.target.value)} placeholder="example.com" autoFocus onKeyDown={e => e.key === 'Enter' && addZone()} /></div>
      </Modal>

      <Modal open={addRecordOpen} onClose={() => setAddRecordOpen(false)} title="Add DNS Record" width={440}
        footer={<><Button variant="ghost" onClick={() => setAddRecordOpen(false)}>Cancel</Button><Button variant="primary" loading={savingRecord} onClick={addRecord}>Add</Button></>}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="field"><label>Name</label><input value={recordForm.name} onChange={e => setRecordForm(f => ({...f, name: e.target.value}))} /></div>
          <div className="field"><label>Type</label><select value={recordForm.type} onChange={e => setRecordForm(f => ({...f, type: e.target.value}))}>{['A','AAAA','CNAME','MX','TXT','NS','CAA'].map(t => <option key={t}>{t}</option>)}</select></div>
          <div className="field" style={{ gridColumn: '1/-1' }}><label>Content</label><input value={recordForm.content} onChange={e => setRecordForm(f => ({...f, content: e.target.value}))} /></div>
          <div className="field"><label>TTL (seconds)</label><input type="number" value={recordForm.ttl} onChange={e => setRecordForm(f => ({...f, ttl: Number(e.target.value)}))} /></div>
        </div>
      </Modal>

      <Modal open={addRedirectOpen} onClose={() => setAddRedirectOpen(false)} title="Add Redirect" width={460}
        footer={<><Button variant="ghost" onClick={() => setAddRedirectOpen(false)}>Cancel</Button><Button variant="primary" loading={savingRedirect} onClick={addRedirect}>Create</Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field"><label>Source Domain</label><input value={redirectForm.source_domain} onChange={e => setRedirectForm(f => ({...f, source_domain: e.target.value}))} placeholder="example.com" autoFocus /></div>
            <div className="field"><label>Source Path</label><input value={redirectForm.source_path} onChange={e => setRedirectForm(f => ({...f, source_path: e.target.value}))} /></div>
          </div>
          <div className="field"><label>Destination URL</label><input value={redirectForm.dest_url} onChange={e => setRedirectForm(f => ({...f, dest_url: e.target.value}))} placeholder="https://newsite.com" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field"><label>Type</label><select value={redirectForm.type} onChange={e => setRedirectForm(f => ({...f, type: Number(e.target.value)}))}><option value={301}>301 Permanent</option><option value={302}>302 Temporary</option></select></div>
            <div className="field"><label>WWW Handling</label><select value={redirectForm.www_handling} onChange={e => setRedirectForm(f => ({...f, www_handling: e.target.value}))}><option value="both">Both</option><option value="www">WWW only</option><option value="non-www">Non-WWW only</option></select></div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
