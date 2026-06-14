import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { useDns } from './hooks/useDns';
import { ZoneList } from './components/ZoneList';
import { RecordTable } from './components/RecordTable';
import { AddZoneModal } from './components/AddZoneModal';
import { AddRecordModal } from './components/AddRecordModal';

export default function Dns() {
  const dns = useDns();

  const tabBtn = (key: 'dns' | 'redirects', label: string) => (
    <button
      key={key}
      onClick={() => dns.switchTab(key)}
      style={{
        padding: '5px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
        background: dns.tab === key ? 'var(--accent-dim)' : 'transparent',
        color: dns.tab === key ? 'var(--accent)' : 'var(--text-2)',
        cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-ui)', transition: 'all var(--transition)',
      }}
    >{label}</button>
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
          {dns.tab === 'dns' && !dns.selectedZone && (
            <Button variant="primary" size="sm" icon={<Plus size={13} strokeWidth={1.5} />}
              onClick={() => { dns.setNewZone(''); dns.setAddZoneOpen(true); }}>Add Zone</Button>
          )}
          {dns.tab === 'dns' && dns.selectedZone && (
            <Button variant="primary" size="sm" icon={<Plus size={13} strokeWidth={1.5} />}
              onClick={() => dns.setAddRecordOpen(true)}>Add Record</Button>
          )}
          {dns.tab === 'redirects' && (
            <Button variant="primary" size="sm" icon={<Plus size={13} strokeWidth={1.5} />}
              onClick={() => dns.setAddRedirectOpen(true)}>Add Redirect</Button>
          )}
        </div>
      </div>

      {dns.tab === 'dns' && (
        <>
          {!dns.selectedZone ? (
            dns.zonesLoading ? <PageSpinner /> : (
              <ZoneList
                zones={dns.zones}
                deleteTarget={dns.deleteZoneTarget}
                onSelect={dns.loadRecords}
                onDeleteClick={dns.setDeleteZoneTarget}
                onDeleteConfirm={dns.confirmDeleteZone}
                onDeleteCancel={() => dns.setDeleteZoneTarget('')}
              />
            )
          ) : (
            dns.recordsLoading ? <PageSpinner /> : (
              <RecordTable
                zone={dns.selectedZone}
                records={dns.filteredRecords}
                typeFilter={dns.typeFilter}
                deleteTarget={dns.deleteRecordTarget}
                onBack={() => { dns.setSelectedZone(null); dns.setRecords([]); }}
                onFilterChange={dns.setTypeFilter}
                onDeleteClick={dns.setDeleteRecordTarget}
                onDeleteConfirm={dns.confirmDeleteRecord}
                onDeleteCancel={() => dns.setDeleteRecordTarget('')}
              />
            )
          )}
        </>
      )}

      {dns.tab === 'redirects' && (
        dns.redirectsLoading ? <PageSpinner /> : (
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
                {dns.redirects.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty">
                        <div className="empty-title">No redirects</div>
                        <div className="empty-desc">Create a redirect rule to forward traffic.</div>
                      </div>
                    </td>
                  </tr>
                )}
                {dns.redirects.map(r => (
                  <tr key={r.id}>
                    <td className="mono" style={{ fontSize: 11 }}>{r.source_domain}{r.source_path}</td>
                    <td className="mono" style={{
                      fontSize: 11, color: 'var(--text-2)', maxWidth: 240,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{r.dest_url}</td>
                    <td><span className="badge badge-dim">{r.type}</span></td>
                    <td style={{ fontSize: 11, color: 'var(--text-2)' }}>{r.www_handling}</td>
                    <td>
                      <Button variant="danger" size="sm" icon={<Trash2 size={12} strokeWidth={1.5} />}
                        onClick={() => dns.deleteRedirect(r.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      <AddZoneModal
        open={dns.addZoneOpen}
        value={dns.newZone}
        saving={dns.savingZone}
        onChange={dns.setNewZone}
        onClose={() => { dns.setAddZoneOpen(false); dns.setNewZone(''); }}
        onSubmit={dns.addZone}
      />

      <AddRecordModal
        open={dns.addRecordOpen}
        form={dns.recordForm}
        saving={dns.savingRecord}
        onChange={dns.setRecordForm}
        onClose={() => dns.setAddRecordOpen(false)}
        onSubmit={dns.addRecord}
      />

      {/* Add Redirect modal — kept inline, no dedicated component needed */}
      <Modal open={dns.addRedirectOpen} onClose={() => dns.setAddRedirectOpen(false)}
        title="Add Redirect" width={460}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => dns.setAddRedirectOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" loading={dns.savingRedirect} onClick={dns.addRedirect}>Create</Button>
          </div>
        }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field">
              <label>Source Domain</label>
              <input
                value={dns.redirectForm.source_domain}
                onChange={e => dns.setRedirectForm(f => ({ ...f, source_domain: e.target.value }))}
                placeholder="example.com" autoFocus
              />
            </div>
            <div className="field">
              <label>Source Path</label>
              <input
                value={dns.redirectForm.source_path}
                onChange={e => dns.setRedirectForm(f => ({ ...f, source_path: e.target.value }))}
              />
            </div>
          </div>
          <div className="field">
            <label>Destination URL</label>
            <input
              value={dns.redirectForm.dest_url}
              onChange={e => dns.setRedirectForm(f => ({ ...f, dest_url: e.target.value }))}
              placeholder="https://newsite.com"
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field">
              <label>Type</label>
              <select value={dns.redirectForm.type}
                onChange={e => dns.setRedirectForm(f => ({ ...f, type: Number(e.target.value) }))}>
                <option value={301}>301 Permanent</option>
                <option value={302}>302 Temporary</option>
              </select>
            </div>
            <div className="field">
              <label>WWW Handling</label>
              <select value={dns.redirectForm.www_handling}
                onChange={e => dns.setRedirectForm(f => ({ ...f, www_handling: e.target.value }))}>
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
