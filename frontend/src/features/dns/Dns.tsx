import { useState, useEffect } from 'react';
import { Plus, Search, Trash2, Globe, RefreshCw, Check, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { useDns } from './hooks/useDns';
import { RECORD_TYPES } from './types';
import type { DnsZone } from './types';

const getRecordBadgeClass = (type: string) => {
  const t = type.toUpperCase();
  if (t === 'A') return 'chip-green';
  if (t === 'AAAA') return 'chip-blue';
  if (t === 'CNAME') return 'chip-accent';
  if (t === 'MX') return 'chip-amber';
  if (t === 'TXT') return 'chip-gray';
  if (t === 'NS') return 'chip-accent';
  if (t === 'CAA') return 'chip-red';
  return 'chip-gray';
};

export default function Dns() {
  const dns = useDns();
  const [filter, setFilter] = useState('');
  const [isAddingZone, setIsAddingZone] = useState(false);
  const [recordAddingOpen, setRecordAddingOpen] = useState(false);

  // Auto-select first zone on load
  useEffect(() => {
    if (dns.zones.length > 0 && !dns.selectedZone && !dns.zonesLoading) {
      dns.loadRecords(dns.zones[0]);
    }
  }, [dns.zones, dns.selectedZone, dns.zonesLoading]);

  const filteredZones = dns.zones.filter(zone =>
    zone.name.toLowerCase().includes(filter.toLowerCase())
  );

  const handleRecordFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dns.recordForm.content.trim()) return;
    dns.addRecord().then(() => {
      setRecordAddingOpen(false);
    });
  };

  const handleZoneSelect = (zone: DnsZone) => {
    dns.loadRecords(zone);
    setRecordAddingOpen(false);
  };

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Top Header */}
      <div className="page-header" style={{ flexShrink: 0, paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div className="page-title">DNS Zones</div>
          <div className="page-desc">Manage DNS zones, nameservers, and resource records</div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshCw size={12} />}
          onClick={dns.loadZones}
        >
          Refresh Zones
        </Button>
      </div>

      {dns.zonesLoading && dns.zones.length === 0 ? (
        <PageSpinner />
      ) : dns.zones.length === 0 && !isAddingZone ? (
        <div className="empty" style={{ flex: 1 }}>
          <Globe size={32} strokeWidth={1.5} className="empty-icon" />
          <div className="empty-title">No DNS zones found</div>
          <div className="empty-desc">Create your first DNS domain zone.</div>
          <Button
            variant="primary"
            size="sm"
            style={{ marginTop: '12px' }}
            onClick={() => setIsAddingZone(true)}
          >
            Create Zone
          </Button>
        </div>
      ) : (
        <div className="split-view" style={{ flex: 1, minHeight: 0 }}>
          {/* LEFT: Zone List */}
          <div className="split-left">
            {isAddingZone ? (
              <div style={{ padding: '8px 10px', display: 'flex', gap: '6px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <input
                  className="form-input"
                  type="text"
                  placeholder="domain.com"
                  value={dns.newZone}
                  autoFocus
                  onChange={e => dns.setNewZone(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      dns.addZone().then(() => setIsAddingZone(false));
                    }
                  }}
                  style={{ height: '30px', fontSize: '11.5px', flex: 1 }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setIsAddingZone(false); dns.setNewZone(''); }}
                  style={{ padding: '5px', height: '30px' }}
                >
                  <X size={13} />
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={dns.savingZone}
                  disabled={!dns.newZone.trim()}
                  onClick={() => dns.addZone().then(() => setIsAddingZone(false))}
                  style={{ padding: '5px', height: '30px' }}
                >
                  <Check size={13} />
                </Button>
              </div>
            ) : (
              <div className="split-pane-header">
                <h3 style={{ fontSize: '12px', fontWeight: 600 }}>Active Zones</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAddingZone(true)}
                  style={{ padding: '4px', marginLeft: 'auto', minWidth: 0 }}
                  title="Add Zone"
                >
                  <Plus size={13} />
                </Button>
              </div>
            )}

            <div className="search-wrap" style={{ margin: '8px 10px 4px' }}>
              <Search style={{ width: 12, height: 12, color: 'var(--text-3)', flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Filter zones..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
              />
            </div>

            <div className="split-scroll">
              <div style={{ height: 4 }} />
              {filteredZones.map(zone => {
                const isSelected = dns.selectedZone?.name === zone.name;
                const initials = (zone.name?.[0] || 'Z').toUpperCase();

                return (
                  <div
                    key={zone.name}
                    className={`list-item${isSelected ? ' sel' : ''}`}
                    onClick={() => handleZoneSelect(zone)}
                  >
                    <div className="avatar" style={{
                      width: '28px', height: '28px', borderRadius: '8px',
                      background: 'var(--accent-dim)',
                      border: '1px solid var(--accent-border)',
                      display: 'grid', placeItems: 'center',
                      fontFamily: 'var(--font-mono)', fontSize: '11px',
                      color: 'var(--accent-fg, var(--accent))',
                      flexShrink: 0
                    }}>
                      {initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="li-name" style={{ fontSize: '12.5px', fontWeight: 500 }}>{zone.name}</div>
                      <div className="li-sub" style={{ fontSize: '10.5px' }}>Serial: {zone.serial}</div>
                    </div>
                    {zone.record_count !== undefined && (
                      <span className="chip chip-gray" style={{ fontSize: '9px', padding: '1px 5px' }}>
                        {zone.record_count} recs
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT: Zone Details */}
          <div className="split-right">
            {dns.selectedZone ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                
                {/* Details Header */}
                <div className="split-pane-header" style={{ gap: '14px', flexWrap: 'wrap' }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '9px',
                    background: 'var(--accent-dim)',
                    border: '1px solid var(--accent-border)',
                    display: 'grid', placeItems: 'center', flexShrink: 0
                  }}>
                    <Globe size={16} style={{ color: 'var(--accent-fg, var(--accent))' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: '150px' }}>
                    <h3 style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text)' }}>
                      {dns.selectedZone.name}
                    </h3>
                    <div className="mono" style={{ fontSize: '10px', color: 'var(--text-3)', marginTop: '2px' }}>
                      Serial: {dns.selectedZone.serial} · Kind: {dns.selectedZone.kind || 'Native'}
                    </div>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<Trash2 size={11} />}
                    onClick={() => dns.setDeleteZoneTarget(dns.selectedZone!.name)}
                  >
                    Delete Zone
                  </Button>
                </div>

                {/* Main Scroll Pane */}
                <div className="split-scroll" style={{ padding: '16px 18px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    
                    {/* Inline Add Record Panel */}
                    {recordAddingOpen ? (
                      <div className="card" style={{ padding: '14px', marginBottom: '16px', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '10px' }}>
                          Add Resource Record
                        </div>
                        <form onSubmit={handleRecordFormSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px', alignItems: 'flex-end' }}>
                          
                          {/* Type */}
                          <div className="field" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-2)' }}>Type</label>
                            <select
                              className="form-select"
                              value={dns.recordForm.type}
                              onChange={e => dns.setRecordForm(f => ({ ...f, type: e.target.value }))}
                              style={{ height: '30px', fontSize: '11px', padding: '0 6px', background: 'var(--surface, var(--bg-2))', border: '1px solid var(--border)' }}
                            >
                              {RECORD_TYPES.filter(t => t !== 'All').map(t => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </div>

                          {/* Name */}
                          <div className="field" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-2)' }}>Name</label>
                            <input
                              type="text"
                              value={dns.recordForm.name}
                              onChange={e => dns.setRecordForm(f => ({ ...f, name: e.target.value }))}
                              placeholder="e.g. @ or www"
                              style={{ height: '30px', fontSize: '11px', background: 'var(--surface, var(--bg-2))', border: '1px solid var(--border)' }}
                            />
                          </div>

                          {/* TTL */}
                          <div className="field" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-2)' }}>TTL</label>
                            <input
                              type="number"
                              value={dns.recordForm.ttl}
                              onChange={e => dns.setRecordForm(f => ({ ...f, ttl: Number(e.target.value) }))}
                              style={{ height: '30px', fontSize: '11px', background: 'var(--surface, var(--bg-2))', border: '1px solid var(--border)' }}
                            />
                          </div>

                          {/* Content */}
                          <div className="field" style={{ gridColumn: 'span 2', marginBottom: 0 }}>
                            <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-2)' }}>Content</label>
                            <input
                              type="text"
                              value={dns.recordForm.content}
                              onChange={e => dns.setRecordForm(f => ({ ...f, content: e.target.value }))}
                              placeholder="e.g. 192.168.1.1 or web.host.com."
                              style={{ height: '30px', fontSize: '11px', background: 'var(--surface, var(--bg-2))', border: '1px solid var(--border)' }}
                            />
                          </div>

                          {/* Actions */}
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <Button
                              variant="primary"
                              size="sm"
                              loading={dns.savingRecord}
                              disabled={!dns.recordForm.content.trim()}
                              onClick={handleRecordFormSubmit}
                              style={{ height: '30px', flex: 1, fontSize: '11.5px' }}
                            >
                              Add
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRecordAddingOpen(false)}
                              style={{ height: '30px', fontSize: '11.5px' }}
                            >
                              Cancel
                            </Button>
                          </div>

                        </form>
                      </div>
                    ) : (
                      <div style={{ marginBottom: '14px' }}>
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<Plus size={11} />}
                          onClick={() => setRecordAddingOpen(true)}
                        >
                          Add DNS Record
                        </Button>
                      </div>
                    )}

                    {/* Filter Type Bar */}
                    <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginBottom: '12px' }}>
                      {RECORD_TYPES.map(t => {
                        const isActive = dns.typeFilter === t;
                        return (
                          <button
                            key={t}
                            onClick={() => dns.setTypeFilter(t)}
                            style={{
                              padding: '4px 10px',
                              fontSize: '11px',
                              border: '1px solid var(--border)',
                              borderRadius: '6px',
                              background: isActive ? 'var(--accent-dim)' : 'transparent',
                              color: isActive ? 'var(--accent-fg, var(--accent))' : 'var(--text-3)',
                              borderColor: isActive ? 'var(--accent-border)' : 'var(--border)',
                              cursor: 'pointer',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: isActive ? 600 : 500,
                              transition: 'all 0.1s'
                            }}
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>

                    {/* Record Table */}
                    {dns.recordsLoading ? (
                      <div style={{ padding: '20px 0' }}><PageSpinner /></div>
                    ) : dns.filteredRecords.length === 0 ? (
                      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-3)', fontSize: '12.5px', background: 'var(--surface2, var(--bg-3))', border: '1px solid var(--border)', borderRadius: '8px' }}>
                        {dns.typeFilter !== 'All' ? `No ${dns.typeFilter} records configures for this zone.` : 'This DNS zone has no records.'}
                      </div>
                    ) : (
                      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        <div className="table-wrap">
                          <table style={{ margin: 0 }}>
                            <thead>
                              <tr>
                                <th>Name</th>
                                <th>Type</th>
                                <th>Content</th>
                                <th>TTL</th>
                                <th style={{ width: '40px' }}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {dns.filteredRecords.map((r, i) => {
                                const id = `${r.type}/${r.name}`;
                                return (
                                  <tr key={i}>
                                    <td className="mono" style={{ fontSize: '12px' }}>{r.name}</td>
                                    <td>
                                      <span className={`chip ${getRecordBadgeClass(r.type)}`} style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', padding: '1px 5px' }}>
                                        {r.type}
                                      </span>
                                    </td>
                                    <td className="mono" style={{
                                      fontSize: '11.5px', maxWidth: 280, overflow: 'hidden',
                                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }} title={r.content}>{r.content}</td>
                                    <td className="mono" style={{ fontSize: '11.5px', color: 'var(--text-3)' }}>{r.ttl}</td>
                                    <td>
                                      <Button
                                        variant="danger"
                                        size="sm"
                                        icon={<Trash2 size={11} />}
                                        onClick={() => dns.setDeleteRecordTarget(id)}
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                  </div>
                </div>

              </div>
            ) : (
              <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-3)', fontSize: '13px' }}>
                Select a DNS zone from the list or add a new zone to get started
              </div>
            )}
          </div>

        </div>
      )}

      {/* Delete Zone Confirmation Modal */}
      <Modal
        open={!!dns.deleteZoneTarget}
        onClose={() => dns.setDeleteZoneTarget('')}
        title="Delete DNS Zone"
        width={350}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => dns.setDeleteZoneTarget('')}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={() => dns.confirmDeleteZone(dns.deleteZoneTarget)}>
              Delete Zone
            </Button>
          </div>
        }
      >
        <p style={{ fontSize: '12.5px', color: 'var(--text-2)', lineHeight: 1.5 }}>
          Are you sure you want to delete the DNS zone for <strong style={{ color: 'var(--text)' }}>{dns.deleteZoneTarget}</strong>? This will clear all records and cannot be undone.
        </p>
      </Modal>

      {/* Delete Record Confirmation Modal */}
      <Modal
        open={!!dns.deleteRecordTarget}
        onClose={() => dns.setDeleteRecordTarget('')}
        title="Delete DNS Record"
        width={340}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => dns.setDeleteRecordTarget('')}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={() => dns.confirmDeleteRecord(dns.deleteRecordTarget)}>
              Delete Record
            </Button>
          </div>
        }
      >
        <p style={{ fontSize: '12.5px', color: 'var(--text-2)', lineHeight: 1.5 }}>
          Are you sure you want to delete this DNS record? This action cannot be undone.
        </p>
      </Modal>

    </div>
  );
}
