import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, ChevronLeft, Globe } from 'lucide-react';
import { apiGet, apiPost, apiDelete } from '../../lib/api';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';

interface DnsZone {
  name: string;
  serial: string;
}

interface DnsRecord {
  id: string;
  name: string;
  type: string;
  content: string;
  ttl: number;
}

interface Redirect {
  id: string;
  source_domain: string;
  source_path: string;
  dest_url: string;
  type: number;
  www_handling: string;
}

const RECORD_TYPES = ['All', 'A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'CAA'];

export default function Dns() {
  const toast = useToast();
  const [tab, setTab] = useState<'dns' | 'redirects'>('dns');

  // DNS state
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
  const [deleteZoneTarget, setDeleteZoneTarget] = useState('');
  const [deleteRecordTarget, setDeleteRecordTarget] = useState('');

  // Redirects state
  const [redirects, setRedirects] = useState<Redirect[]>([]);
  const [redirectsLoading, setRedirectsLoading] = useState(false);
  const [addRedirectOpen, setAddRedirectOpen] = useState(false);
  const [redirectForm, setRedirectForm] = useState({
    source_domain: '',
    source_path: '/',
    dest_url: '',
    type: 301,
    www_handling: 'both',
  });
  const [savingRedirect, setSavingRedirect] = useState(false);

  const loadZones = useCallback(async () => {
    try {
      const r = await apiGet<DnsZone[]>('dns/zones');
      setZones(r);
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to load DNS zones');
    } finally {
      setZonesLoading(false);
    }
  }, [toast]);

  const loadRecords = useCallback(async (zone: DnsZone) => {
    setSelectedZone(zone);
    setRecordsLoading(true);
    setTypeFilter('All');
    try {
      const r = await apiGet<DnsRecord[]>(`dns/zones/${zone.name}/records`);
      setRecords(r);
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to load records');
    } finally {
      setRecordsLoading(false);
    }
  }, [toast]);

  const loadRedirects = useCallback(async () => {
    setRedirectsLoading(true);
    try {
      const r = await apiGet<Redirect[]>('redirects');
      setRedirects(r);
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to load redirects');
    } finally {
      setRedirectsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadZones();
  }, [loadZones]);

  async function addZone() {
    if (!newZone.trim()) return;
    setSavingZone(true);
    try {
      await apiPost('dns/zones', { name: newZone.trim() });
      toast.ok(`Zone ${newZone} created`);
      setAddZoneOpen(false);
      setNewZone('');
      loadZones();
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to create zone');
    } finally {
      setSavingZone(false);
    }
  }

  async function confirmDeleteZone(name: string) {
    try {
      await apiDelete(`dns/zones/${name}`);
      toast.ok(`Zone ${name} deleted`);
      if (selectedZone?.name === name) {
        setSelectedZone(null);
        setRecords([]);
      }
      setDeleteZoneTarget('');
      loadZones();
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  async function addRecord() {
    if (!selectedZone) return;
    setSavingRecord(true);
    try {
      await apiPost(`dns/zones/${selectedZone.name}/records`, recordForm);
      toast.ok('Record added');
      setAddRecordOpen(false);
      setRecordForm({ name: '@', type: 'A', content: '', ttl: 300 });
      loadRecords(selectedZone);
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to add record');
    } finally {
      setSavingRecord(false);
    }
  }

  async function confirmDeleteRecord(id: string) {
    if (!selectedZone) return;
    try {
      await apiDelete(`dns/zones/${selectedZone.name}/records/${id}`);
      toast.ok('Record deleted');
      setDeleteRecordTarget('');
      loadRecords(selectedZone);
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  async function addRedirect() {
    if (!redirectForm.source_domain.trim() || !redirectForm.dest_url.trim()) return;
    setSavingRedirect(true);
    try {
      await apiPost('redirects', redirectForm);
      toast.ok('Redirect created');
      setAddRedirectOpen(false);
      setRedirectForm({ source_domain: '', source_path: '/', dest_url: '', type: 301, www_handling: 'both' });
      loadRedirects();
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to create redirect');
    } finally {
      setSavingRedirect(false);
    }
  }

  async function deleteRedirect(id: string) {
    try {
      await apiDelete(`redirects/${id}`);
      toast.ok('Redirect deleted');
      loadRedirects();
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  const filteredRecords = typeFilter === 'All' ? records : records.filter(r => r.type === typeFilter);

  const tabBtn = (key: 'dns' | 'redirects', label: string) => (
    <button
      key={key}
      onClick={() => { setTab(key); if (key === 'redirects') loadRedirects(); }}
      style={{
        padding: '5px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
        background: tab === key ? 'var(--accent-dim)' : 'transparent',
        color: tab === key ? 'var(--accent)' : 'var(--text-2)',
        cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-ui)', transition: 'all var(--transition)',
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">DNS &amp; Redirects</div>
          <div className="page-desc">Manage DNS zones and URL redirects</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 3 }}>
            {tabBtn('dns', 'DNS Zones')}
            {tabBtn('redirects', 'Redirects')}
          </div>
          <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
          {tab === 'dns' && !selectedZone && (
            <Button variant="primary" size="sm" icon={<Plus size={13} strokeWidth={1.5} />}
              onClick={() => { setNewZone(''); setAddZoneOpen(true); }}>Add Zone</Button>
          )}
          {tab === 'dns' && selectedZone && (
            <Button variant="primary" size="sm" icon={<Plus size={13} strokeWidth={1.5} />}
              onClick={() => setAddRecordOpen(true)}>Add Record</Button>
          )}
          {tab === 'redirects' && (
            <Button variant="primary" size="sm" icon={<Plus size={13} strokeWidth={1.5} />}
              onClick={() => setAddRedirectOpen(true)}>Add Redirect</Button>
          )}
        </div>
      </div>

      {/* DNS tab */}
      {tab === 'dns' && (
        <>
          {!selectedZone ? (
            <>
              {zonesLoading ? (
                <PageSpinner />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Zone</th>
                        <th>Serial</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {zones.length === 0 && (
                        <tr>
                          <td colSpan={3}>
                            <div className="empty">
                              <Globe size={28} strokeWidth={1.5} className="empty-icon" />
                              <div className="empty-title">No DNS zones</div>
                              <div className="empty-desc">Add a zone to start managing DNS records.</div>
                            </div>
                          </td>
                        </tr>
                      )}
                      {zones.map(z => (
                        <tr key={z.name}>
                          <td>
                            <div
                              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                              onClick={() => loadRecords(z)}
                            >
                              <Globe size={13} strokeWidth={1.5} color="var(--accent)" />
                              <span className="mono" style={{ color: 'var(--accent)' }}>{z.name}</span>
                            </div>
                          </td>
                          <td className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{z.serial}</td>
                          <td>
                            <Button
                              variant="danger"
                              size="sm"
                              icon={<Trash2 size={12} strokeWidth={1.5} />}
                              onClick={() => setDeleteZoneTarget(z.name)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <Button
                  variant="ghost" size="sm"
                  icon={<ChevronLeft size={13} strokeWidth={1.5} />}
                  onClick={() => { setSelectedZone(null); setRecords([]); }}
                >
                  Zones
                </Button>
                <span style={{ color: 'var(--border)' }}>·</span>
                <span className="mono" style={{ fontSize: 13, color: 'var(--text)' }}>{selectedZone.name}</span>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginLeft: 4 }}>
                  {RECORD_TYPES.map(t => (
                    <button key={t} onClick={() => setTypeFilter(t)} style={{
                      padding: '3px 8px', fontSize: 11,
                      border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                      background: typeFilter === t ? 'var(--accent-dim)' : 'transparent',
                      color: typeFilter === t ? 'var(--accent)' : 'var(--text-2)',
                      cursor: 'pointer', fontFamily: 'var(--font-mono)',
                    }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {recordsLoading ? (
                <PageSpinner />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Content</th>
                        <th>TTL</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecords.length === 0 && (
                        <tr>
                          <td colSpan={5}>
                            <div className="empty">
                              <div className="empty-title">No records</div>
                              <div className="empty-desc">
                                {typeFilter !== 'All' ? `No ${typeFilter} records found.` : 'This zone has no records yet.'}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      {filteredRecords.map(r => (
                        <tr key={r.id}>
                          <td className="mono">{r.name}</td>
                          <td>
                            <span className="badge badge-dim" style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                              {r.type}
                            </span>
                          </td>
                          <td
                            className="mono"
                            style={{ fontSize: 11, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          >
                            {r.content}
                          </td>
                          <td className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{r.ttl}</td>
                          <td>
                            <Button
                              variant="danger"
                              size="sm"
                              icon={<Trash2 size={12} strokeWidth={1.5} />}
                              onClick={() => setDeleteRecordTarget(r.id)}
                            />
                          </td>
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

      {/* Redirects tab */}
      {tab === 'redirects' && (
        <>
          {redirectsLoading ? (
            <PageSpinner />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Destination</th>
                    <th>Type</th>
                    <th>WWW</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {redirects.length === 0 && (
                    <tr>
                      <td colSpan={5}>
                        <div className="empty">
                          <div className="empty-title">No redirects</div>
                          <div className="empty-desc">Create a redirect rule to forward traffic.</div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {redirects.map(r => (
                    <tr key={r.id}>
                      <td className="mono" style={{ fontSize: 11 }}>{r.source_domain}{r.source_path}</td>
                      <td
                        className="mono"
                        style={{ fontSize: 11, color: 'var(--text-2)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {r.dest_url}
                      </td>
                      <td><span className="badge badge-dim">{r.type}</span></td>
                      <td style={{ fontSize: 11, color: 'var(--text-2)' }}>{r.www_handling}</td>
                      <td>
                        <Button
                          variant="danger"
                          size="sm"
                          icon={<Trash2 size={12} strokeWidth={1.5} />}
                          onClick={() => deleteRedirect(r.id)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Add Zone modal */}
      <Modal
        open={addZoneOpen}
        onClose={() => { setAddZoneOpen(false); setNewZone(''); }}
        title="Add DNS Zone"
        width={360}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => { setAddZoneOpen(false); setNewZone(''); }}>Cancel</Button>
            <Button variant="primary" size="sm" loading={savingZone} onClick={addZone}>Create</Button>
          </>
        }
      >
        <div className="field">
          <label>Domain</label>
          <input
            value={newZone}
            onChange={e => setNewZone(e.target.value)}
            placeholder="example.com"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') addZone(); }}
          />
        </div>
      </Modal>

      {/* Add Record modal */}
      <Modal
        open={addRecordOpen}
        onClose={() => setAddRecordOpen(false)}
        title="Add DNS Record"
        width={440}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setAddRecordOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" loading={savingRecord} onClick={addRecord}>Add</Button>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="field">
            <label>Name</label>
            <input value={recordForm.name} onChange={e => setRecordForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="field">
            <label>Type</label>
            <select value={recordForm.type} onChange={e => setRecordForm(f => ({ ...f, type: e.target.value }))}>
              {['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'CAA'].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="field" style={{ gridColumn: '1/-1' }}>
            <label>Content</label>
            <input
              value={recordForm.content}
              onChange={e => setRecordForm(f => ({ ...f, content: e.target.value }))}
              placeholder="e.g. 1.2.3.4"
              autoFocus
            />
          </div>
          <div className="field">
            <label>TTL (seconds)</label>
            <input
              type="number"
              value={recordForm.ttl}
              onChange={e => setRecordForm(f => ({ ...f, ttl: Number(e.target.value) }))}
            />
          </div>
        </div>
      </Modal>

      {/* Delete Zone confirm */}
      <Modal
        open={!!deleteZoneTarget}
        onClose={() => setDeleteZoneTarget('')}
        title="Delete Zone"
        width={340}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setDeleteZoneTarget('')}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={() => confirmDeleteZone(deleteZoneTarget)}>Delete</Button>
          </>
        }
      >
        <p style={{ fontSize: 13, color: 'var(--text-2)' }}>
          Delete zone <strong style={{ color: 'var(--text)' }}>{deleteZoneTarget}</strong> and all its records?
        </p>
      </Modal>

      {/* Delete Record confirm */}
      <Modal
        open={!!deleteRecordTarget}
        onClose={() => setDeleteRecordTarget('')}
        title="Delete Record"
        width={340}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setDeleteRecordTarget('')}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={() => confirmDeleteRecord(deleteRecordTarget)}>Delete</Button>
          </>
        }
      >
        <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Delete this DNS record?</p>
      </Modal>

      {/* Add Redirect modal */}
      <Modal
        open={addRedirectOpen}
        onClose={() => setAddRedirectOpen(false)}
        title="Add Redirect"
        width={460}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setAddRedirectOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" loading={savingRedirect} onClick={addRedirect}>Create</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field">
              <label>Source Domain</label>
              <input
                value={redirectForm.source_domain}
                onChange={e => setRedirectForm(f => ({ ...f, source_domain: e.target.value }))}
                placeholder="example.com"
                autoFocus
              />
            </div>
            <div className="field">
              <label>Source Path</label>
              <input
                value={redirectForm.source_path}
                onChange={e => setRedirectForm(f => ({ ...f, source_path: e.target.value }))}
              />
            </div>
          </div>
          <div className="field">
            <label>Destination URL</label>
            <input
              value={redirectForm.dest_url}
              onChange={e => setRedirectForm(f => ({ ...f, dest_url: e.target.value }))}
              placeholder="https://newsite.com"
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field">
              <label>Type</label>
              <select value={redirectForm.type} onChange={e => setRedirectForm(f => ({ ...f, type: Number(e.target.value) }))}>
                <option value={301}>301 Permanent</option>
                <option value={302}>302 Temporary</option>
              </select>
            </div>
            <div className="field">
              <label>WWW Handling</label>
              <select value={redirectForm.www_handling} onChange={e => setRedirectForm(f => ({ ...f, www_handling: e.target.value }))}>
                <option value="both">Both</option>
                <option value="www">WWW only</option>
                <option value="non-www">Non-WWW only</option>
              </select>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
