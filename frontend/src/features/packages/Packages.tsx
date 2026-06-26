import React, { useState, useEffect } from 'react';
import {
  Package, Plus, Search, RefreshCw, Trash2, Upload, ShieldCheck, Check, AlertTriangle, X
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import { Toggle } from '../../components/ui/Toggle';
import { usePackages } from './hooks/usePackages';
import type { PackageItem, VersionEntry } from './types';

export default function Packages() {
  const p = usePackages();
  const [filter, setFilter] = useState('');
  const provisionData = p.provisionData;

  // Automatically select first package on load if nothing is selected or active
  useEffect(() => {
    if (!p.loading && p.packages.length > 0 && !p.updateTarget && !p.installOpen) {
      p.openUpdate(p.packages[0]);
    }
  }, [p.loading, p.packages, p.updateTarget, p.installOpen]);

  if (p.loading) return <PageSpinner />;

  const filteredPackages = p.packages.filter(pkg =>
    pkg.name.toLowerCase().includes(filter.toLowerCase()) ||
    pkg.description.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="split-view" style={{ flex: 1, minHeight: 0 }}>
      
      {/* LEFT PANE: Packages List */}
      <div className="split-left">
        <div className="split-pane-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '12px', fontWeight: 600 }}>Packages</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { p.openInstall(); p.closeUpdateModal(); }}
            style={{ padding: '4px', minWidth: 0 }}
            title="Install Package"
            disabled={p.restarting}
          >
            <Plus size={13} />
          </Button>
        </div>

        <div className="search-wrap" style={{ margin: '8px 10px 4px' }}>
          <Search style={{ width: 12, height: 12, color: 'var(--text-3)', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Filter packages..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            disabled={p.restarting}
          />
        </div>

        <div className="split-scroll">
          <div style={{ height: 4 }} />
          
          {/* Virtual Install Row inside list if install screen is active */}
          {p.installOpen && (
            <div className="list-item sel" style={{ marginBottom: 6 }}>
              <div className="avatar" style={{
                width: '28px', height: '28px', borderRadius: '8px',
                background: 'var(--accent-dim)', border: '1px solid var(--accent-border)',
                display: 'grid', placeItems: 'center', color: 'var(--accent)', flexShrink: 0
              }}>
                <Plus size={14} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="li-name" style={{ fontSize: '12.5px', fontWeight: 500 }}>Install Package</div>
                <div className="li-sub" style={{ fontSize: '10.5px' }}>Add new extension</div>
              </div>
            </div>
          )}

          {filteredPackages.length === 0 && !p.installOpen ? (
            <div style={{ padding: '20px 15px', textAlign: 'center', color: 'var(--text-3)', fontSize: '12.5px' }}>
              No packages found
            </div>
          ) : (
            filteredPackages.map(pkg => {
              const isSelected = p.updateTarget?.name === pkg.name && !p.installOpen;
              return (
                <div
                  key={pkg.name}
                  className={`list-item${isSelected ? ' sel' : ''}`}
                  onClick={() => { p.openUpdate(pkg); p.closeInstall(); }}
                >
                  <div className="avatar" style={{
                    width: '28px', height: '28px', borderRadius: '8px',
                    background: isSelected ? 'var(--accent-dim)' : 'var(--surface2, var(--bg-3))',
                    border: isSelected ? '1px solid var(--accent-border)' : '1px solid var(--border)',
                    display: 'grid', placeItems: 'center',
                    color: isSelected ? 'var(--accent)' : 'var(--text-3)',
                    flexShrink: 0
                  }}>
                    <Package size={14} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="li-name" style={{ fontSize: '12.5px', fontWeight: 500 }}>{pkg.name}</div>
                    <div className="li-sub" style={{ fontSize: '10.5px' }}>v{pkg.version}</div>
                  </div>
                  <div>
                    {pkg.compatible ? (
                      <span className="badge badge-ok" style={{ fontSize: '9px', padding: '1px 5px' }}>Compatible</span>
                    ) : (
                      <span className="badge badge-warn" style={{ fontSize: '9px', padding: '1px 5px' }}>Incompatible</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT PANE: Detail / Interactive view */}
      <div className="split-right">
        <div className="split-scroll" style={{ padding: '18px 20px' }}>
          
          {/* CASE 1: Restarting screen */}
          {p.restarting ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              height: '100%', minHeight: '300px', gap: 16, color: 'var(--text-2)'
            }}>
              <RefreshCw size={24} className="spin-icon" style={{ color: 'var(--accent)' }} />
              <div style={{ fontSize: '13px', fontWeight: 500 }}>Server is restarting — refreshing package list…</div>
            </div>
          ) : (
            <div style={{ maxWidth: '560px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Provisioning alert / Wizard */}
              {provisionData && (
                <div className="card" style={{ padding: '16px 20px', border: '1px solid var(--accent-border)', background: 'var(--accent-dim)', borderRadius: 'var(--radius)' }}>
                  <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text)' }}>
                    <ShieldCheck size={16} style={{ color: 'var(--accent)' }} />
                    Provision Websites
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: 14 }}>
                    The following DNS zones are not yet configured as websites. Select which ones to provision:
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
                    {provisionData.zones.map(zone => (
                      <div key={zone} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-2)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '12.5px', textTransform: 'none', letterSpacing: 0, color: 'var(--text)' }}>
                          <input
                            type="checkbox"
                            checked={p.provisionSelected[zone] ?? false}
                            onChange={e => {
                              p.setProvisionSelected(prev => ({ ...prev, [zone]: e.target.checked }));
                              if (!e.target.checked) p.setProvisionSsl(prev => ({ ...prev, [zone]: false }));
                            }}
                            style={{ width: 'auto' }}
                          />
                          <span className="mono" style={{ fontWeight: 500 }}>{zone}</span>
                          {zone === provisionData.default_domain && (
                            <span className="badge badge-dim" style={{ fontSize: '9px', padding: '1px 4px', marginLeft: 4 }}>default</span>
                          )}
                        </label>
                        {provisionData.certbot_available && (
                          <label style={{
                            display: 'flex', alignItems: 'center', gap: 6, fontSize: '11.5px',
                            color: p.provisionSelected[zone] ? 'var(--text-2)' : 'var(--text-3)',
                            cursor: p.provisionSelected[zone] ? 'pointer' : 'not-allowed',
                            textTransform: 'none', letterSpacing: 0
                          }}>
                            <Toggle
                              checked={p.provisionSsl[zone] ?? false}
                              onChange={() => { if (!p.provisionSelected[zone]) return; p.setProvisionSsl(prev => ({ ...prev, [zone]: !prev[zone] })); }}
                              disabled={!p.provisionSelected[zone]}
                            />
                            <ShieldCheck size={12} />
                            Issue SSL
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <Button variant="ghost" size="sm" onClick={p.skipProvision} disabled={p.provisioning}>Skip</Button>
                    <Button
                      variant="primary"
                      size="sm"
                      loading={p.provisioning}
                      disabled={p.provisioning || !provisionData.zones.some(z => p.provisionSelected[z])}
                      onClick={p.handleProvision}
                    >
                      Provision
                    </Button>
                  </div>
                </div>
              )}

              {/* Provisioning Results screen */}
              {p.provisionResults && (
                <div className="card" style={{ padding: '16px 20px', border: '1px solid var(--green-border)', background: 'var(--green-dim)', borderRadius: 'var(--radius)' }}>
                  <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text)' }}>
                    <Check size={16} style={{ color: 'var(--green)' }} />
                    Provisioning Complete
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                    {p.provisionResults.map(r => (
                      <div key={r.domain} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '12.5px' }}>
                        {r.status === 'provisioned' ? (
                          <span className="badge badge-ok">✓</span>
                        ) : r.status === 'already_provisioned' ? (
                          <span className="badge badge-dim">–</span>
                        ) : (
                          <span className="badge badge-err">✕</span>
                        )}
                        <span className="mono" style={{ flex: 1, color: 'var(--text)' }}>{r.domain}</span>
                        <span style={{ color: 'var(--text-2)', fontSize: '11.5px' }}>
                          {r.status === 'provisioned'
                            ? r.ssl_requested ? 'provisioned · SSL pending' : 'provisioned'
                            : r.status === 'already_provisioned' ? 'already active'
                            : r.error ?? 'error'}
                        </span>
                      </div>
                    ))}
                  </div>
                  {p.provisionResults.some(r => r.ssl_requested) && (
                    <p style={{ fontSize: '11px', color: 'var(--text-2)', marginBottom: 12 }}>
                      SSL certificate issuance is running in the background. Check the SSL page in a moment.
                    </p>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button variant="primary" size="sm" onClick={p.closeProvisionResults}>Done</Button>
                  </div>
                </div>
              )}

              {/* CASE 2: Install Package Screen */}
              {p.installOpen ? (
                <div className="card" style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>Install New Package</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={p.closeInstall}
                      style={{ padding: '4px', minWidth: 0, marginLeft: 'auto' }}
                      disabled={p.installing}
                    >
                      <X size={14} />
                    </Button>
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    <Button
                      variant={p.installMode === 'pip' ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => p.setInstallMode('pip')}
                      disabled={p.installing}
                    >
                      Pip / PyPI / Git URL
                    </Button>
                    <Button
                      variant={p.installMode === 'file' ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => p.setInstallMode('file')}
                      disabled={p.installing}
                    >
                      Upload ZIP/Whl File
                    </Button>
                  </div>

                  {p.installMode === 'pip' ? (
                    <div className="field">
                      <label style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 6 }}>
                        Package source (pip name, git URL, or path)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. hostpanel-package-nginx or https://github.com/..."
                        value={p.pipSource}
                        onChange={e => p.setPipSource(e.target.value)}
                        disabled={p.installing}
                        onKeyDown={e => { if (e.key === 'Enter') p.handleInstall(); }}
                        autoFocus
                        style={{ width: '100%', fontSize: '13px' }}
                      />
                    </div>
                  ) : (
                    <div className="field">
                      <label style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 6 }}>
                        Package file (.whl, .tar.gz, .zip)
                      </label>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => p.fileRef.current?.click()}
                          disabled={p.installing}
                        >
                          Choose file…
                        </Button>
                        <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>
                          {p.selectedFile ? p.selectedFile.name : 'No file selected'}
                        </span>
                      </div>
                      <input
                        ref={p.fileRef}
                        type="file"
                        accept=".whl,.tar.gz,.zip"
                        style={{ display: 'none' }}
                        onChange={e => p.setSelectedFile(e.target.files?.[0] ?? null)}
                      />
                    </div>
                  )}

                  {p.installLogs && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6, fontWeight: 600 }}>
                        Installation Logs
                      </div>
                      <pre className="log-output" style={{ maxHeight: 180, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px', fontSize: '11.5px', fontFamily: 'var(--font-mono)', overflowY: 'auto' }}>
                        {p.installLogs}
                      </pre>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
                    <Button variant="ghost" size="sm" onClick={p.closeInstall} disabled={p.installing}>Cancel</Button>
                    <Button
                      variant="primary"
                      size="sm"
                      loading={p.installing}
                      disabled={p.installing || (p.installMode === 'pip' ? !p.pipSource.trim() : !p.selectedFile)}
                      onClick={p.handleInstall}
                    >
                      Install Package
                    </Button>
                  </div>
                </div>
              ) : p.updateTarget ? (
                
                /* CASE 3: Selected Package Details View */
                <>
                  {/* Card 1: Header details */}
                  <div className="card" style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 14 }}>
                      <div className="avatar" style={{
                        width: '42px', height: '42px', borderRadius: '10px',
                        background: 'var(--accent-dim)', border: '1px solid var(--accent-border)',
                        display: 'grid', placeItems: 'center', color: 'var(--accent)', flexShrink: 0
                      }}>
                        <Package size={22} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text)' }}>
                            {p.updateTarget.name}
                          </h2>
                          <span className="badge badge-dim" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', padding: '2px 6px' }}>
                            v{p.updateTarget.version}
                          </span>
                        </div>
                        <p style={{ fontSize: '13px', color: 'var(--text-2)', marginTop: 4, lineHeight: 1.4 }}>
                          {p.updateTarget.description}
                        </p>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border)', margin: '14px 0' }} />

                    {/* Meta Fields */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                      <div>
                        <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-3)' }}>Service Link</div>
                        <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                          {p.updateTarget.service
                            ? (typeof p.updateTarget.service === 'object' ? p.updateTarget.service.name : p.updateTarget.service)
                            : '—'
                          }
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-3)' }}>Source Type</div>
                        <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)', marginTop: 2, textTransform: 'capitalize' }}>
                          {p.updateTarget.source_type ?? 'Upload'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-3)' }}>Compatibility</div>
                        <div style={{ marginTop: 2 }}>
                          {p.updateTarget.compatible ? (
                            <span className="badge badge-ok" style={{ fontSize: '10px', padding: '1px 5px' }}>Compatible</span>
                          ) : (
                            <span className="badge badge-warn" style={{ fontSize: '10px', padding: '1px 5px' }}>Incompatible</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Nav Items injected by this package */}
                    {p.updateTarget.nav_items && p.updateTarget.nav_items.length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-3)', marginBottom: 6 }}>
                          Sidebar Integrations
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {p.updateTarget.nav_items.map(item => (
                            <span key={item} className="badge badge-dim" style={{ fontSize: '11px', fontFamily: 'var(--font-ui)' }}>
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card 2: Update & Upgrade Management */}
                  <div className="card" style={{ padding: '20px' }}>
                    <h3 style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-3)', marginBottom: 12 }}>
                      Update & Upgrade
                    </h3>

                    {(!p.updateTarget.source_type || p.updateTarget.source_type === 'upload') && p.checkState === 'idle' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <p style={{ fontSize: '12px', color: 'var(--text-2)', lineHeight: 1.5 }}>
                          This package was installed manually. Enter a GitHub release URL or PyPI pip package name to enable automated update checks.
                        </p>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input
                            type="text"
                            value={p.linkSource}
                            onChange={e => p.setLinkSource(e.target.value)}
                            placeholder="https://github.com/… or package-name"
                            disabled={p.savingSource}
                            style={{ flex: 1, fontSize: '13px' }}
                            onKeyDown={e => { if (e.key === 'Enter') p.handleSaveAndCheck(); }}
                          />
                          <Button
                            variant="primary"
                            size="sm"
                            loading={p.savingSource}
                            disabled={!p.linkSource.trim()}
                            onClick={p.handleSaveAndCheck}
                          >
                            Save & Check
                          </Button>
                        </div>
                      </div>
                    ) : p.checkState === 'idle' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<RefreshCw size={12} strokeWidth={1.5} />}
                        onClick={p.handleCheckUpdate}
                      >
                        Check for Updates
                      </Button>
                    ) : p.checkState === 'checking' ? (
                      <div style={{ fontSize: '12.5px', color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <RefreshCw size={13} strokeWidth={1.5} className="spin-icon" /> Checking release repository…
                      </div>
                    ) : p.checkState === 'available' ? (
                      <div>
                        {/* Upgrade Path details */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                          <span className="badge badge-dim" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>v{p.checkResult?.current_version}</span>
                          <span style={{ color: 'var(--text-3)', fontSize: '13px' }}>→</span>
                          <span className="badge badge-ok" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                            v{p.checkResult?.available_versions?.find(v => v.tag === (p.selectedVersionTag ?? p.checkResult?.available_versions?.[0]?.tag))?.version ?? p.checkResult?.latest_version}
                          </span>
                        </div>

                        {/* Version selector if multiple versions */}
                        {p.checkResult?.available_versions && p.checkResult.available_versions.length > 1 && (
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: 6 }}>
                              Select release version to install:
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 150, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px' }}>
                              {p.checkResult.available_versions.map((v, idx) => {
                                const isTagSelected = (p.selectedVersionTag ?? p.checkResult?.available_versions?.[0]?.tag) === v.tag;
                                return (
                                  <label
                                    key={v.tag}
                                    style={{
                                      display: 'flex', alignItems: 'flex-start', gap: 8,
                                      padding: '6px 8px', borderRadius: 'var(--radius-sm)',
                                      background: isTagSelected ? 'var(--accent-dim)' : 'transparent',
                                      cursor: 'pointer', border: '1px solid transparent',
                                      borderColor: isTagSelected ? 'var(--accent-border)' : 'transparent'
                                    }}
                                  >
                                    <input
                                      type="radio"
                                      name="version-radio"
                                      value={v.tag}
                                      checked={isTagSelected}
                                      onChange={() => p.setSelectedVersionTag(v.tag)}
                                      style={{ marginTop: 2, accentColor: 'var(--accent)', flexShrink: 0 }}
                                    />
                                    <div style={{ flex: 1, minWidth: 0, color: 'var(--text)' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px' }}>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>v{v.version}</span>
                                        {idx === 0 && <span className="badge badge-ok" style={{ fontSize: '9px', padding: '1px 3px' }}>latest</span>}
                                      </div>
                                      {v.release_notes && (
                                        <div style={{ fontSize: '10.5px', color: 'var(--text-3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                          {v.release_notes.split('\n')[0]}
                                        </div>
                                      )}
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {p.checkResult?.available_versions?.length === 1 && p.checkResult.available_versions[0].release_notes && (
                          <p style={{ fontSize: '11.5px', color: 'var(--text-2)', marginBottom: 12, lineHeight: 1.5 }}>
                            {p.checkResult.available_versions[0].release_notes}
                          </p>
                        )}

                        {p.updateLogs ? (
                          <pre className="log-output" style={{ maxHeight: 120, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px', fontSize: '11px', fontFamily: 'var(--font-mono)', overflowY: 'auto', whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                            {p.updateLogs}
                          </pre>
                        ) : (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <Button variant="ghost" size="sm" onClick={p.closeUpdateModal}>Cancel</Button>
                            <Button
                              variant="primary"
                              size="sm"
                              loading={p.updating}
                              onClick={p.handleUpdateNow}
                              disabled={!p.checkResult?.download_url && !p.checkResult?.available_versions?.some(v => v.download_url)}
                            >
                              Apply Update
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : p.checkState === 'current' ? (
                      <div style={{ fontSize: '12.5px', color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        ✓ Already on latest version (v{p.checkResult?.current_version})
                      </div>
                    ) : (
                      <div style={{ fontSize: '12.5px', color: 'var(--warn)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        ⚠ {p.checkResult?.error ?? p.checkResult?.reason ?? 'Check failed'}
                        <Button variant="ghost" size="sm" onClick={p.handleCheckUpdate} style={{ marginLeft: 'auto' }}>Retry</Button>
                      </div>
                    )}

                    <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0' }} />

                    {/* Upload Update Manually section */}
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8, fontWeight: 600 }}>
                      Manual Upload Update
                    </div>

                    {p.uploadUpdateResult ? (
                      <div style={{ fontSize: '12.5px', padding: '6px 0' }}>
                        {p.uploadUpdateResult.is_upgrade ? (
                          <span style={{ color: 'var(--green)' }}>
                            ✓ Updated v{p.uploadUpdateResult.previous_version} → v{p.uploadUpdateResult.new_version}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--warn)' }}>
                            ⚠ Reapplied v{p.uploadUpdateResult.new_version} successfully
                          </span>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="file"
                          ref={p.updateFileRef}
                          accept=".zip,.tar.gz"
                          style={{ display: 'none' }}
                          onChange={e => p.setUpdateFile(e.target.files?.[0] ?? null)}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          icon={<Upload size={12} />}
                          onClick={() => p.updateFileRef.current?.click()}
                          disabled={p.uploadUpdating}
                        >
                          {p.updateFile ? p.updateFile.name : 'Choose package file (.whl, .zip)'}
                        </Button>
                        {p.updateFile && (
                          <Button variant="primary" size="sm" loading={p.uploadUpdating} onClick={p.handleUploadUpdate}>
                            Upload & Apply
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Card 3: Danger Zone */}
                  <div className="card" style={{
                    padding: '20px',
                    border: '1px solid var(--red-border, rgba(239,68,68,0.2))',
                    background: 'rgba(239,68,68,0.02)'
                  }}>
                    <h3 style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--red, #ef4444)', marginBottom: 12 }}>
                      Danger Zone
                    </h3>

                    {p.uninstallTarget ? (
                      /* Confirm uninstall block */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <p style={{ fontSize: '12.5px', color: 'var(--text-2)', lineHeight: 1.4 }}>
                          Are you sure you want to uninstall <strong style={{ color: 'var(--text)' }}>{p.uninstallTarget.name}</strong>?
                          This will remove all features and resources associated with this package.
                        </p>
                        
                        {p.forceUninstall && (
                          <div style={{
                            padding: '8px 12px', background: 'var(--warn-dim)', border: '1px solid var(--warn)',
                            borderRadius: '4px', fontSize: '11.5px', color: 'var(--warn)'
                          }}>
                            Conflict detected. Force uninstall will remove this package ignoring dependency warnings.
                          </div>
                        )}

                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '12.5px', color: 'var(--text)', textTransform: 'none', letterSpacing: 0 }}>
                          <input
                            type="checkbox"
                            checked={p.forceUninstall}
                            onChange={e => p.setForceUninstall(e.target.checked)}
                            style={{ width: 'auto' }}
                          />
                          Force uninstall (ignore conflicts)
                        </label>

                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                          <Button variant="ghost" size="sm" onClick={p.closeUninstall} disabled={p.uninstalling}>Cancel</Button>
                          <Button
                            variant="danger"
                            size="sm"
                            loading={p.uninstalling}
                            icon={<Trash2 size={12} />}
                            onClick={p.handleUninstall}
                          >
                            Confirm Uninstall
                          </Button>
                        </div>
                      </div>
                    ) : (
                      /* Standard card footer button */
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <p style={{ fontSize: '12px', color: 'var(--text-3)', margin: 0 }}>
                          Uninstall package from HostPanel console.
                        </p>
                        <Button
                          variant="danger"
                          size="sm"
                          icon={<Trash2 size={12} />}
                          onClick={() => p.openUninstall(p.updateTarget!)}
                          disabled={p.restarting}
                        >
                          Uninstall
                        </Button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* CASE 4: Blank state */
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  height: '100%', minHeight: '300px', gap: 12, color: 'var(--text-3)', textAlign: 'center'
                }}>
                  <Package size={32} strokeWidth={1.5} className="empty-icon" />
                  <div style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--text-2)' }}>No package selected</div>
                  <div style={{ fontSize: '12px', maxWidth: '280px' }}>
                    Select a package from the left list or install a new one to extend panel capabilities.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
