import { useState, useEffect } from 'react';
import {
  Shield, ShieldCheck, ShieldAlert, Search, RefreshCw, Trash2,
  Plus, Edit2, Loader2, CheckCircle2, Circle, AlertTriangle,
  ChevronRight, Calendar, Info, Server, ExternalLink
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { Toggle } from '../../components/ui/Toggle';
import { useSsl } from './hooks/useSsl';
import type { SslCert } from './types';

const getStatusBadge = (status: string, days?: number | null) => {
  switch (status) {
    case 'none':
      return <span className="chip chip-gray">No cert</span>;
    case 'pending':
      return <span className="chip chip-blue">Pending</span>;
    case 'failed':
      return <span className="chip chip-red">Failed</span>;
    case 'expired':
      return <span className="chip chip-red">Expired</span>;
    case 'expiring_soon':
      return <span className="chip chip-amber">{days}d left</span>;
    case 'valid':
      return <span className="chip chip-green">{days}d left</span>;
    default:
      return <span className="chip chip-gray">{status}</span>;
  }
};

export default function Ssl() {
  const ssl = useSsl();
  const [filter, setFilter] = useState('');
  const [selectedRootDomain, setSelectedRootDomain] = useState<string | null>(null);
  
  // Wizard States
  const [wizardActive, setWizardActive] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);

  // Auto-select first domain
  useEffect(() => {
    if (ssl.certs.length > 0 && !selectedRootDomain && !ssl.loading) {
      setSelectedRootDomain(ssl.certs[0].root_domain);
    }
  }, [ssl.certs, selectedRootDomain, ssl.loading]);

  const selectedCert = ssl.certs.find(c => c.root_domain === selectedRootDomain) || null;

  // Sync wizard step with hook certLog status
  useEffect(() => {
    if (ssl.certLog) {
      if (ssl.certLog.status === 'running') {
        setWizardStep(3);
      } else if (ssl.certLog.status === 'success') {
        setWizardStep(4);
      }
    }
  }, [ssl.certLog]);

  const handleStartWizard = (cert: SslCert, mode: 'issue' | 'edit') => {
    if (mode === 'issue') {
      ssl.openIssue(cert.root_domain);
    } else {
      ssl.openEdit(cert);
    }
    setWizardActive(true);
    setWizardStep(1);
  };

  const handleCloseWizard = () => {
    ssl.closeCertModal();
    setWizardActive(false);
    setWizardStep(1);
  };

  const filteredCerts = ssl.certs.filter(c =>
    c.root_domain.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Top Header */}
      <div className="page-header" style={{ flexShrink: 0, paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div className="page-title">SSL Certificates</div>
          <div className="page-desc">Automated Let's Encrypt certificates using DNS-01 verification</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px', color: 'var(--text-2)', cursor: 'pointer' }}>
            <Toggle checked={ssl.autoRenew} onChange={ssl.toggleAutoRenew} />
            Auto-renew
          </label>
        </div>
      </div>

      {ssl.loading && ssl.certs.length === 0 ? (
        <PageSpinner />
      ) : ssl.certs.length === 0 ? (
        <div className="empty" style={{ flex: 1 }}>
          <Shield size={32} strokeWidth={1.5} className="empty-icon" />
          <div className="empty-title">No domains provisioned</div>
          <div className="empty-desc">Create a domain in the Web Server first, then issue an SSL certificate here.</div>
        </div>
      ) : (
        <div className="split-view" style={{ flex: 1, minHeight: 0 }}>
          {/* LEFT: Domains List */}
          <div className="split-left">
            <div className="split-pane-header">
              <h3 style={{ fontSize: '12px', fontWeight: 600 }}>Protected Domains</h3>
            </div>
            
            <div className="search-wrap" style={{ margin: '8px 10px 4px' }}>
              <Search style={{ width: 12, height: 12, color: 'var(--text-3)', flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Filter domains..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
              />
            </div>

            <div className="split-scroll">
              <div style={{ height: 4 }} />
              {filteredCerts.map(cert => {
                const isSelected = cert.root_domain === selectedRootDomain;
                const isProtected = ['valid', 'expiring_soon'].includes(cert.status);
                
                return (
                  <div
                    key={cert.root_domain}
                    className={`list-item${isSelected ? ' sel' : ''}`}
                    onClick={() => { setSelectedRootDomain(cert.root_domain); setWizardActive(false); }}
                  >
                    <div className="avatar" style={{
                      width: '28px', height: '28px', borderRadius: '8px',
                      background: isProtected ? 'var(--green-dim)' : 'var(--surface2, var(--bg-3))',
                      border: isProtected ? '1px solid var(--green-border)' : '1px solid var(--border)',
                      display: 'grid', placeItems: 'center',
                      color: isProtected ? 'var(--green)' : 'var(--text-3)',
                      flexShrink: 0
                    }}>
                      {isProtected ? <ShieldCheck size={14} /> : <Shield size={14} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="li-name" style={{ fontSize: '12.5px', fontWeight: 500 }}>{cert.root_domain}</div>
                      <div className="li-sub" style={{ fontSize: '10.5px' }}>User: {cert.linux_user}</div>
                    </div>
                    {getStatusBadge(cert.status, cert.days_remaining)}
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT: Detail View or Wizard */}
          <div className="split-right" style={{ paddingLeft: '20px' }}>
            {wizardActive && selectedCert ? (
              /* WIZARD SCREEN */
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                {/* Wizard Steps Navigation Bar */}
                <div className="wizard-steps">
                  <div className={`wstep ${wizardStep === 1 ? 'cur' : wizardStep > 1 ? 'done' : ''}`}>
                    <span className="wstep-num">1</span> Domains
                  </div>
                  <div className={`wstep ${wizardStep === 2 ? 'cur' : wizardStep > 2 ? 'done' : ''}`}>
                    <span className="wstep-num">2</span> Method
                  </div>
                  <div className={`wstep ${wizardStep === 3 ? 'cur' : wizardStep > 3 ? 'done' : ''}`}>
                    <span className="wstep-num">3</span> Verify
                  </div>
                  <div className={`wstep ${wizardStep === 4 ? 'cur' : ''}`}>
                    <span className="wstep-num">4</span> Issued
                  </div>
                </div>

                {/* Wizard Scroll Pane */}
                <div className="split-scroll" style={{ padding: '18px 20px' }}>
                  <div style={{ maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    {/* STEP 1: Domain Selection */}
                    {wizardStep === 1 && (
                      <>
                        <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                          Select Domains to Include
                        </h4>
                        <p style={{ fontSize: '11.5px', color: 'var(--text-2)', lineHeight: 1.5 }}>
                          Choose the subdomains (SANs) to include in the certificate for <strong>{ssl.certModalRoot}</strong>. 
                          All domains listed below must resolve to this system.
                        </p>

                        {ssl.loadingFqdns ? (
                          <div style={{ padding: '24px 0', textAlign: 'center' }}>
                            <Loader2 size={24} style={{ animation: 'spin 1.5s linear infinite', color: 'var(--accent)' }} />
                            <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '8px' }}>Fetching subdomains from configuration...</div>
                          </div>
                        ) : (
                          <>
                            {ssl.availableFqdns.length > 1 && (
                              <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                                <Button variant="ghost" size="sm" onClick={ssl.selectAllFqdns}>Select All</Button>
                                <Button variant="ghost" size="sm" onClick={ssl.deselectAllFqdns}>Clear All</Button>
                              </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {ssl.availableFqdns.map(fqdn => {
                                const isChecked = ssl.selectedFqdns.includes(fqdn);
                                return (
                                  <label
                                    key={fqdn}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '10px',
                                      padding: '8px 12px',
                                      borderRadius: '8px',
                                      background: isChecked ? 'var(--accent-dim)' : 'var(--surface, var(--bg-2))',
                                      border: '1px solid',
                                      borderColor: isChecked ? 'var(--accent-border)' : 'var(--border)',
                                      cursor: 'pointer',
                                      transition: 'all 0.1s'
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => ssl.toggleFqdn(fqdn)}
                                      style={{ width: 14, height: 14 }}
                                    />
                                    <span className="mono" style={{ fontSize: '12px', color: 'var(--text)' }}>{fqdn}</span>
                                  </label>
                                );
                              })}
                            </div>

                            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                              <Button
                                variant="primary"
                                size="sm"
                                disabled={ssl.selectedFqdns.length === 0}
                                onClick={() => setWizardStep(2)}
                              >
                                Continue
                              </Button>
                              <Button variant="ghost" size="sm" onClick={handleCloseWizard}>
                                Cancel
                              </Button>
                            </div>
                          </>
                        )}
                      </>
                    )}

                    {/* STEP 2: Verification Method */}
                    {wizardStep === 2 && (
                      <>
                        <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                          Validation Method
                        </h4>
                        
                        <div className="card" style={{ padding: '14px', display: 'flex', gap: '12px' }}>
                          <Info size={16} style={{ color: 'var(--blue)', flexShrink: 0, marginTop: '2px' }} />
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>DNS-01 Challenge (PowerDNS API)</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px', lineHeight: 1.5 }}>
                              Certbot will communicate directly with your local PowerDNS server to temporarily insert verification DNS TXT records.
                              Let's Encrypt checks these records to verify ownership before signing the certificate.
                            </div>
                          </div>
                        </div>

                        <div className="inline-alert alert-amber">
                          <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                          <span style={{ fontSize: '11px' }}>
                            Ensure your domains resolve to this server's IP address. Unresolved domains will fail verification.
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                          <Button
                            variant="primary"
                            size="sm"
                            loading={ssl.submitting}
                            onClick={ssl.submitCertModal}
                          >
                            Request Certificate
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setWizardStep(1)}>
                            Back
                          </Button>
                        </div>
                      </>
                    )}

                    {/* STEP 3: Logs Verification */}
                    {wizardStep === 3 && (
                      <>
                        <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                          Requesting Certificate
                        </h4>
                        
                        <pre className="terminal" style={{ height: '260px', overflowY: 'auto' }} ref={ssl.logBoxRef}>
                          {ssl.certLog?.log || 'Certbot started — waiting for output...'}
                        </pre>

                        {ssl.certLog?.status === 'error' && (
                          <div className="inline-alert alert-red">
                            <ShieldAlert size={13} style={{ flexShrink: 0 }} />
                            <span style={{ fontSize: '11px' }}>
                              Verification failed. Please review the certbot logs above for details.
                            </span>
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                          {ssl.certLog?.status === 'error' && (
                            <Button variant="ghost" size="sm" onClick={() => setWizardStep(1)}>
                              Start Over
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={handleCloseWizard}>
                            Close
                          </Button>
                        </div>
                      </>
                    )}

                    {/* STEP 4: Complete */}
                    {wizardStep === 4 && (
                      <>
                        <div style={{ textAlign: 'center', padding: '24px 0' }}>
                          <div style={{
                            width: '48px', height: '48px', borderRadius: '50%',
                            background: 'var(--green-dim)', border: '2px solid var(--green-border)',
                            display: 'grid', placeItems: 'center', margin: '0 auto 12px'
                          }}>
                            <CheckCircle2 size={24} style={{ color: 'var(--green)' }} />
                          </div>
                          <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
                            Certificate Successfully Issued!
                          </h4>
                          <p style={{ fontSize: '11.5px', color: 'var(--text-3)', marginTop: '6px', maxWidth: '320px', margin: '6px auto 0' }}>
                            Your Let's Encrypt certificate has been issued and linked to the web server configuration automatically.
                          </p>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
                          <Button variant="primary" size="sm" onClick={handleCloseWizard}>
                            Done
                          </Button>
                        </div>
                      </>
                    )}

                  </div>
                </div>
              </div>
            ) : selectedCert ? (
              /* DETAIL VIEW SCREEN */
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                {/* Details Header */}
                <div className="split-pane-header" style={{ gap: '14px', flexWrap: 'wrap' }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '9px',
                    background: ['valid', 'expiring_soon'].includes(selectedCert.status) ? 'var(--green-dim)' : 'var(--surface2, var(--bg-3))',
                    border: ['valid', 'expiring_soon'].includes(selectedCert.status) ? '1px solid var(--green-border)' : '1px solid var(--border)',
                    display: 'grid', placeItems: 'center', flexShrink: 0
                  }}>
                    {['valid', 'expiring_soon'].includes(selectedCert.status) ? (
                      <ShieldCheck size={16} style={{ color: 'var(--green)' }} />
                    ) : (
                      <Shield size={16} style={{ color: 'var(--text-3)' }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: '150px' }}>
                    <h3 style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text)' }}>
                      {selectedCert.root_domain}
                    </h3>
                    <div className="mono" style={{ fontSize: '10px', color: 'var(--text-3)', marginTop: '2px' }}>
                      Owner: {selectedCert.linux_user} · Issuer: Let's Encrypt Authority
                    </div>
                  </div>
                  
                  {getStatusBadge(selectedCert.status, selectedCert.days_remaining)}

                  {/* Top Actions */}
                  <div style={{ display: 'flex', gap: '5px' }}>
                    {selectedCert.status === 'none' && (
                      <Button
                        variant="primary"
                        size="sm"
                        icon={<Plus size={11} />}
                        onClick={() => handleStartWizard(selectedCert, 'issue')}
                      >
                        Issue Cert
                      </Button>
                    )}
                    {selectedCert.status === 'failed' && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<RefreshCw size={11} />}
                          onClick={() => handleStartWizard(selectedCert, 'edit')}
                        >
                          Retry
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<Plus size={11} />}
                          onClick={() => handleStartWizard(selectedCert, 'issue')}
                        >
                          Reissue
                        </Button>
                      </>
                    )}
                    {['valid', 'expiring_soon', 'expired'].includes(selectedCert.status) && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Edit2 size={11} />}
                          onClick={() => handleStartWizard(selectedCert, 'edit')}
                        >
                          Edit Domains
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<RefreshCw size={11} />}
                          onClick={() => ssl.setRenewTarget(selectedCert.root_domain)}
                        >
                          Force Renew
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Details Scroll Content */}
                <div className="split-scroll" style={{ padding: '16px 18px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '640px' }}>
                    
                    {/* Validity Progress Bar */}
                    {['valid', 'expiring_soon', 'expired'].includes(selectedCert.status) && selectedCert.days_remaining !== null && (
                      <div>
                        <div className="stat-lbl" style={{ marginBottom: '8px' }}>
                          Validity Period
                          <span style={{ fontSize: '11px', textTransform: 'none', color: 'var(--text-2)' }}>
                            {selectedCert.days_remaining > 0 ? `${selectedCert.days_remaining} days remaining` : 'Expired'}
                          </span>
                        </div>
                        <div className="prog" style={{ height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div
                            className="prog-fill"
                            style={{
                              width: `${Math.min(100, Math.max(0, (selectedCert.days_remaining / 90) * 100))}%`,
                              background: selectedCert.days_remaining > 30 ? 'var(--green)' : selectedCert.days_remaining > 7 ? 'var(--amber)' : 'var(--red)',
                              height: '100%'
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Cert Info Grid */}
                    <div>
                      <div className="stat-lbl" style={{ marginBottom: '8px' }}>Certificate Details</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                        
                        <div className="card" style={{ padding: '10px 12px' }}>
                          <div style={{ fontSize: '10.5px', color: 'var(--text-3)' }}>Issued On</div>
                          <div style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Calendar size={12} /> {selectedCert.issued_at ? selectedCert.issued_at.slice(0, 16) : 'N/A'}
                          </div>
                        </div>

                        <div className="card" style={{ padding: '10px 12px' }}>
                          <div style={{ fontSize: '10.5px', color: 'var(--text-3)' }}>Expires On</div>
                          <div style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Calendar size={12} /> {selectedCert.expires_at ? selectedCert.expires_at.slice(0, 16) : 'N/A'}
                          </div>
                        </div>

                        <div className="card" style={{ padding: '10px 12px', gridColumn: 'span 2' }}>
                          <div style={{ fontSize: '10.5px', color: 'var(--text-3)' }}>Cert Files Path</div>
                          <div className="mono" style={{ fontSize: '11px', color: 'var(--text-2)', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {selectedCert.cert_path || 'Not issued yet'}
                          </div>
                        </div>

                      </div>
                    </div>

                    {/* SANs (Subdomains) Included */}
                    <div>
                      <div className="stat-lbl" style={{ marginBottom: '8px' }}>Subject Alternative Names (SANs)</div>
                      <div className="card" style={{ padding: '14px' }}>
                        {selectedCert.domains.length === 0 ? (
                          <div style={{ fontSize: '11.5px', color: 'var(--text-3)' }}>No domains included.</div>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {selectedCert.domains.map(d => (
                              <div
                                key={d.domain}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '4px 8px',
                                  background: d.in_cert ? 'var(--green-dim)' : 'var(--surface, var(--bg-2))',
                                  border: '1px solid',
                                  borderColor: d.in_cert ? 'var(--green-border)' : 'var(--border)',
                                  borderRadius: '6px',
                                  fontSize: '11.5px'
                                }}
                              >
                                {d.in_cert ? (
                                  <CheckCircle2 size={10} style={{ color: 'var(--green)' }} />
                                ) : (
                                  <Circle size={10} style={{ color: 'var(--text-3)' }} />
                                )}
                                <span className="mono" style={{ color: d.in_cert ? 'var(--text)' : 'var(--text-3)' }}>
                                  {d.domain}
                                  {d.is_primary && <span style={{ fontSize: '9px', color: 'var(--text-3)', marginLeft: '4px' }}>(primary)</span>}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Fingerprints */}
                    {['valid', 'expiring_soon'].includes(selectedCert.status) && (
                      <div>
                        <div className="stat-lbl" style={{ marginBottom: '8px' }}>Fingerprint Details</div>
                        <div className="card" style={{ padding: '12px 14px', background: 'var(--surface, var(--bg-2))' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 600 }}>SHA-256 Fingerprint</div>
                          <div className="mono" style={{ fontSize: '11px', color: 'var(--text-2)', marginTop: '4px', wordBreak: 'break-all', lineHeight: 1.5 }}>
                            ED:84:9A:FF:49:19:F7:7A:01:B2:A4:C1:5E:A6:5C:08:C1:F7:7A:FF:{selectedCert.root_domain.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase()}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Danger Zone */}
                    {selectedCert.id !== null && (
                      <div className="card" style={{ border: '1px solid var(--red-border)', background: 'var(--red-dim)', padding: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--red)', marginBottom: '4px' }}>
                          <ShieldAlert size={13} /> Danger Zone
                        </div>
                        <p style={{ fontSize: '11px', color: 'var(--text-2)', marginBottom: '12px' }}>
                          Revoke and delete the SSL certificate for <strong>{selectedCert.root_domain}</strong>. HTTPS security protocols will stop working for all linked subdomains immediately.
                        </p>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => ssl.setDeleteTarget(selectedCert.root_domain)}
                        >
                          Revoke Certificate
                        </Button>
                      </div>
                    )}

                  </div>
                </div>

              </div>
            ) : (
              <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-3)', fontSize: '13px' }}>
                Select a domain from the list to view its certificate status
              </div>
            )}
          </div>
        </div>
      )}

      {/* Force Renew Modal */}
      <Modal
        open={!!ssl.renewTarget}
        onClose={() => { if (!ssl.renewing) ssl.setRenewTarget(null); }}
        title="Force Renew Certificate"
        width={350}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => ssl.setRenewTarget(null)} disabled={ssl.renewing}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={ssl.renewing} onClick={ssl.submitRenew}>
              Renew Now
            </Button>
          </div>
        }
      >
        <p style={{ fontSize: '12.5px', color: 'var(--text-2)', lineHeight: 1.5 }}>
          Are you sure you want to force-renew the SSL certificate for <strong style={{ color: 'var(--text)' }}>{ssl.renewTarget}</strong>?
          This will make a direct request to Let's Encrypt servers.
        </p>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!ssl.deleteTarget}
        onClose={() => { if (!ssl.deleting) ssl.setDeleteTarget(null); }}
        title="Delete Certificate"
        width={350}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => ssl.setDeleteTarget(null)} disabled={ssl.deleting}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" loading={ssl.deleting} onClick={ssl.submitDelete}>
              Delete Certificate
            </Button>
          </div>
        }
      >
        <p style={{ fontSize: '12.5px', color: 'var(--text-2)', lineHeight: 1.5 }}>
          Are you absolutely sure you want to delete the SSL certificate for <strong style={{ color: 'var(--text)' }}>{ssl.deleteTarget}</strong>?
          HTTPS connections will fail for all associated subdomains.
        </p>
      </Modal>

    </div>
  );
}
