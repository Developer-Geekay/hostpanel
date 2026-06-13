import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, RefreshCw, ShieldCheck, ChevronRight, ChevronDown, Loader2, Key } from 'lucide-react';
import { apiGet, apiPost, apiPut, apiDelete } from '../../lib/api';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import { Toggle } from '../../components/ui/Toggle';
import { useToast } from '../../components/ui/Toast';

interface CertLog {
  log: string;
  status: 'running' | 'success' | 'error' | 'no_log';
}

interface CertStatus {
  domain: string;
  status: 'none' | 'pending' | 'failed' | 'valid' | 'expiring_soon' | 'expired' | 'revoked';
  expiry: string | null;
  days_remaining: number | null;
  issuer: string | null;
  sans: string[];
  https_forced: boolean;
  is_wildcard: boolean;
}

interface DnsCreds {
  configured: boolean;
  provider: string | null;
}

function StatusBadge({ cert }: { cert: CertStatus }) {
  switch (cert.status) {
    case 'none':          return <span className="badge badge-dim">No cert</span>;
    case 'pending':       return <span className="badge" style={{ background: '#3b82f622', color: '#3b82f6', border: '1px solid #3b82f644' }}>Pending</span>;
    case 'failed':        return <span className="badge badge-err">Failed</span>;
    case 'revoked':       return <span className="badge badge-dim">Revoked</span>;
    case 'expired':       return <span className="badge badge-err">Expired</span>;
    case 'expiring_soon': return <span className="badge badge-warn">{cert.days_remaining}d left</span>;
    case 'valid':         return <span className="badge badge-ok">{cert.days_remaining}d left</span>;
    default:              return <span className="badge badge-dim">{cert.status}</span>;
  }
}

export default function Ssl() {
  const toast = useToast();
  const [tab, setTab]               = useState<'certs' | 'dns'>('certs');
  const [certs, setCerts]           = useState<CertStatus[]>([]);
  const [loading, setLoading]       = useState(true);
  const [autoRenew, setAutoRenew]   = useState(false);
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [dnsCreds, setDnsCreds]     = useState<DnsCreds>({ configured: false, provider: null });

  // Issue/Renew modal
  const [modalOpen, setModalOpen]     = useState(false);
  const [modalMode, setModalMode]     = useState<'issue' | 'renew'>('issue');
  const [issueDomain, setIssueDomain] = useState('');
  const [useWildcard, setUseWildcard] = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [certLog, setCertLog]         = useState<CertLog | null>(null);
  const logPollRef                    = useRef<ReturnType<typeof setInterval> | null>(null);
  const logBoxRef                     = useRef<HTMLPreElement>(null);

  const [deleteTarget, setDeleteTarget] = useState('');
  const [deleting, setDeleting]         = useState(false);
  const [togglingHttps, setTogglingHttps] = useState<string | null>(null);

  // DNS Credentials form
  const [dnsProvider, setDnsProvider]   = useState('cloudflare');
  const [dnsToken, setDnsToken]         = useState('');
  const [savingDns, setSavingDns]       = useState(false);
  const [removingDns, setRemovingDns]   = useState(false);

  const load = useCallback(async () => {
    try {
      const [certsData, renewalData, dnsData] = await Promise.all([
        apiGet<CertStatus[]>('ssl'),
        apiGet<{ enabled: boolean }>('ssl/renewal'),
        apiGet<DnsCreds>('ssl/dns-credentials'),
      ]);
      setCerts(certsData);
      setAutoRenew(renewalData.enabled);
      setDnsCreds(dnsData);
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to load SSL data');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Auto-poll when any cert is pending
  useEffect(() => {
    if (!certs.some(c => c.status === 'pending')) return;
    const t = setInterval(() => load(), 5000);
    return () => clearInterval(t);
  }, [certs, load]);

  function stopLogPolling() {
    if (logPollRef.current) { clearInterval(logPollRef.current); logPollRef.current = null; }
  }

  function startLogPolling(domain: string) {
    stopLogPolling();
    const poll = async () => {
      try {
        const data = await apiGet<CertLog>(`ssl/${domain}/log`);
        setCertLog(data);
        if (logBoxRef.current) logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
        if (data.status === 'success') { stopLogPolling(); load(); }
        else if (data.status === 'error') { stopLogPolling(); }
      } catch { /* keep polling */ }
    };
    poll();
    logPollRef.current = setInterval(poll, 2000);
  }

  function closeModal() {
    stopLogPolling();
    setModalOpen(false);
    setIssueDomain('');
    setUseWildcard(false);
    setCertLog(null);
  }

  function openIssue(domain = '') {
    setCertLog(null); setIssueDomain(domain); setUseWildcard(false);
    setModalMode('issue'); setModalOpen(true);
  }

  function openRenew(domain: string) {
    setCertLog(null); setIssueDomain(domain); setUseWildcard(false);
    setModalMode('renew'); setModalOpen(true);
  }

  async function submitIssue() {
    if (!issueDomain.trim()) return;
    setSubmitting(true);
    const useDns = useWildcard && dnsCreds.configured;
    try {
      await apiPost('ssl/issue', {
        domain: issueDomain.trim(),
        validation_method: useDns ? 'dns-01' : 'http-01',
        wildcard: useWildcard,
      });
      setCertLog({ log: 'Certbot started — waiting for output…', status: 'running' });
      startLogPolling(issueDomain.trim());
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to issue certificate');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitRenew() {
    setSubmitting(true);
    try {
      await apiPost(`ssl/${issueDomain}/renew`, {});
      setCertLog({ log: 'Certbot renew started — waiting for output…', status: 'running' });
      startLogPolling(issueDomain);
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to renew certificate');
    } finally {
      setSubmitting(false);
    }
  }

  async function revokeCert() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`ssl/${deleteTarget}`);
      toast.ok(`Certificate for ${deleteTarget} revoked`);
      setDeleteTarget(''); load();
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to revoke certificate');
    } finally {
      setDeleting(false);
    }
  }

  async function toggleForceHttps(cert: CertStatus) {
    setTogglingHttps(cert.domain);
    try {
      await apiPut(`ssl/${cert.domain}/force-https`, { enabled: !cert.https_forced });
      setCerts(cs => cs.map(c => c.domain === cert.domain ? { ...c, https_forced: !c.https_forced } : c));
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to update Force HTTPS');
    } finally {
      setTogglingHttps(null);
    }
  }

  async function toggleAutoRenew() {
    try {
      await apiPut('ssl/renewal', { enabled: !autoRenew });
      setAutoRenew(v => !v);
      toast.ok(`Auto-renew ${!autoRenew ? 'enabled' : 'disabled'}`);
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to update auto-renew');
    }
  }

  async function saveDnsCreds() {
    if (!dnsToken.trim()) return;
    setSavingDns(true);
    try {
      const result = await apiPut<DnsCreds>('ssl/dns-credentials', { provider: dnsProvider, api_token: dnsToken.trim() });
      setDnsCreds(result);
      setDnsToken('');
      toast.ok('DNS credentials saved');
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to save credentials');
    } finally {
      setSavingDns(false);
    }
  }

  async function removeDnsCreds() {
    if (!confirm('Remove DNS credentials? Wildcard certificates will no longer be issuable.')) return;
    setRemovingDns(true);
    try {
      const result = await apiDelete<DnsCreds>('ssl/dns-credentials');
      setDnsCreds(result);
      toast.ok('DNS credentials removed');
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to remove credentials');
    } finally {
      setRemovingDns(false);
    }
  }

  const inProgress = certLog !== null;
  const modalTitle = inProgress
    ? `${modalMode === 'renew' ? 'Renewing' : 'Issuing'} — ${issueDomain}`
    : modalMode === 'renew' ? 'Renew Certificate' : 'Issue Certificate';

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">SSL Certificates</div>
          <div className="page-desc">Let's Encrypt TLS certificates</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {tab === 'certs' && (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-2)', cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}>
                <Toggle checked={autoRenew} onChange={toggleAutoRenew} />
                Auto-renew
              </label>
              <Button variant="primary" size="sm" icon={<Plus size={13} strokeWidth={1.5} />} onClick={() => openIssue()}>
                Issue Certificate
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {(['certs', 'dns'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '6px 14px', borderRadius: 'var(--radius)', fontSize: 12, fontWeight: 500,
              border: '1px solid var(--border-2)', cursor: 'pointer',
              background: tab === t ? 'var(--accent)' : 'transparent',
              color: tab === t ? '#000' : 'var(--text-2)',
            }}
          >
            {t === 'certs' ? 'Certificates' : 'DNS Credentials'}
            {t === 'dns' && dnsCreds.configured && (
              <span style={{ marginLeft: 6, width: 6, height: 6, borderRadius: '50%', background: 'var(--ok)', display: 'inline-block', verticalAlign: 'middle' }} />
            )}
          </button>
        ))}
      </div>

      {/* ── Certificates tab ── */}
      {tab === 'certs' && (
        loading ? <PageSpinner /> :
        certs.length === 0 ? (
          <div className="empty">
            <ShieldCheck size={32} strokeWidth={1.5} className="empty-icon" />
            <div className="empty-title">No domains provisioned</div>
            <div className="empty-desc">Add a domain in Web Server first, then issue a certificate here.</div>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Domain</th>
                    <th>Status</th>
                    <th>Expiry</th>
                    <th>Issuer</th>
                    <th>Force HTTPS</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {certs.map(c => {
                    const isExpanded = expanded === c.domain;
                    const hasSans = c.sans && c.sans.length > 0;
                    return [
                      <tr key={c.domain}>
                        <td className="mono" style={{ fontWeight: 500 }}>
                          <button
                            onClick={() => setExpanded(isExpanded ? null : c.domain)}
                            disabled={!hasSans}
                            style={{ background: 'none', border: 'none', cursor: hasSans ? 'pointer' : 'default', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4, color: 'inherit', fontFamily: 'inherit', fontWeight: 'inherit', fontSize: 'inherit' }}
                          >
                            {hasSans
                              ? (isExpanded ? <ChevronDown size={12} strokeWidth={1.5} /> : <ChevronRight size={12} strokeWidth={1.5} />)
                              : <span style={{ width: 16 }} />}
                            {c.domain}
                          </button>
                          {c.is_wildcard && (
                            <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 3, padding: '1px 5px', verticalAlign: 'middle' }}>wildcard</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <StatusBadge cert={c} />
                            {c.status === 'pending' && <Loader2 size={12} strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite', color: '#3b82f6' }} />}
                          </div>
                        </td>
                        <td className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{c.expiry ?? '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{c.issuer ?? '—'}</td>
                        <td>
                          <Toggle
                            checked={c.https_forced}
                            onChange={() => toggleForceHttps(c)}
                            disabled={['none', 'pending', 'failed', 'revoked'].includes(c.status) || togglingHttps === c.domain}
                          />
                        </td>
                        <td>
                          <div className="actions">
                            {c.status === 'pending' && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>In progress…</span>}
                            {(c.status === 'none' || c.status === 'revoked') && (
                              <Button variant="ghost" size="sm" icon={<Plus size={12} strokeWidth={1.5} />} onClick={() => openIssue(c.domain)}>Issue</Button>
                            )}
                            {c.status === 'failed' && (
                              <Button variant="ghost" size="sm" icon={<RefreshCw size={12} strokeWidth={1.5} />} onClick={() => openIssue(c.domain)}>Retry</Button>
                            )}
                            {(c.status === 'valid' || c.status === 'expiring_soon' || c.status === 'expired') && (
                              <>
                                <Button variant="ghost" size="sm" icon={<RefreshCw size={12} strokeWidth={1.5} />} onClick={() => openRenew(c.domain)}>Renew</Button>
                                <Button variant="danger" size="sm" icon={<Trash2 size={12} strokeWidth={1.5} />} onClick={() => setDeleteTarget(c.domain)} />
                              </>
                            )}
                          </div>
                        </td>
                      </tr>,
                      isExpanded && hasSans && (
                        <tr key={`${c.domain}-sans`} style={{ background: 'var(--bg-2)' }}>
                          <td colSpan={6} style={{ paddingLeft: 32, paddingTop: 6, paddingBottom: 10 }}>
                            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>Subject Alternative Names</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px' }}>
                              {c.sans.map(san => (
                                <span key={san} className="mono" style={{ fontSize: 11, background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 4, padding: '2px 7px' }}>{san}</span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* ── DNS Credentials tab ── */}
      {tab === 'dns' && (
        <div className="card" style={{ maxWidth: 480 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Key size={16} strokeWidth={1.5} style={{ color: 'var(--accent)' }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>DNS Provider Credentials</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Required for wildcard certificates via DNS-01 challenge</div>
            </div>
          </div>

          {dnsCreds.configured ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--bg-2)', borderRadius: 'var(--radius)', marginBottom: 16, border: '1px solid var(--border-2)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)', flexShrink: 0 }} />
                <span style={{ fontSize: 13 }}>
                  <strong>{dnsCreds.provider}</strong> configured — API token stored
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="ghost" size="sm" onClick={() => setDnsCreds({ configured: false, provider: null })}>Replace token</Button>
                <Button variant="danger" size="sm" loading={removingDns} onClick={removeDnsCreds}>Remove</Button>
              </div>
            </div>
          ) : (
            <div>
              <div className="field" style={{ marginBottom: 12 }}>
                <label>Provider</label>
                <select value={dnsProvider} onChange={e => setDnsProvider(e.target.value)} style={{ width: '100%' }}>
                  <option value="cloudflare">Cloudflare</option>
                </select>
              </div>
              <div className="field" style={{ marginBottom: 16 }}>
                <label>API Token</label>
                <input
                  type="password"
                  value={dnsToken}
                  onChange={e => setDnsToken(e.target.value)}
                  placeholder="Cloudflare API token with Zone:DNS:Edit permission"
                  onKeyDown={e => { if (e.key === 'Enter') saveDnsCreds(); }}
                />
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--text-2)', marginBottom: 14, lineHeight: 1.5 }}>
                Create a scoped token at Cloudflare → My Profile → API Tokens with <strong>Zone → DNS → Edit</strong> permission for your domain zone.
              </p>
              <Button variant="primary" size="sm" loading={savingDns} disabled={!dnsToken.trim()} onClick={saveDnsCreds}>
                Save Credentials
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Issue / Renew modal */}
      <Modal
        open={modalOpen}
        onClose={inProgress ? () => {} : closeModal}
        title={modalTitle}
        width={inProgress ? 600 : 420}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            {inProgress ? (
              <>
                {certLog?.status === 'running' && (
                  <span style={{ fontSize: 12, color: 'var(--text-2)', marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Loader2 size={12} strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite' }} /> Running…
                  </span>
                )}
                {certLog?.status === 'success' && <span style={{ fontSize: 12, color: 'var(--ok)', marginRight: 'auto' }}>✓ Certificate {modalMode === 'renew' ? 'renewed' : 'issued'} successfully</span>}
                {certLog?.status === 'error' && <span style={{ fontSize: 12, color: 'var(--err)', marginRight: 'auto' }}>✕ Failed — see log above</span>}
                <Button variant="ghost" size="sm" onClick={closeModal}>Close</Button>
              </>
            ) : modalMode === 'renew' ? (
              <>
                <Button variant="ghost" size="sm" onClick={closeModal} disabled={submitting}>Cancel</Button>
                <Button variant="primary" size="sm" loading={submitting} onClick={submitRenew}>Renew Now</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={closeModal} disabled={submitting}>Cancel</Button>
                <Button variant="primary" size="sm" loading={submitting} disabled={!issueDomain.trim()} onClick={submitIssue}>Issue</Button>
              </>
            )}
          </div>
        }
      >
        {inProgress ? (
          <pre ref={logBoxRef} style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px', fontSize: 11.5, fontFamily: 'var(--font-mono)', lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 340, overflowY: 'auto', margin: 0 }}>
            {certLog?.log || 'Waiting for certbot output…'}
          </pre>
        ) : modalMode === 'renew' ? (
          <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
            Force-renew the certificate for <strong style={{ color: 'var(--text)' }}>{issueDomain}</strong>?
            Certbot will request a new certificate regardless of expiry. The process runs in the background.
          </p>
        ) : (
          <>
            <div className="field">
              <label>Domain</label>
              <input
                type="text"
                value={issueDomain}
                onChange={e => setIssueDomain(e.target.value)}
                placeholder="example.com"
                autoFocus
                disabled={submitting}
                onKeyDown={e => { if (e.key === 'Enter' && !useWildcard) submitIssue(); }}
              />
            </div>

            {dnsCreds.configured && (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 14, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={useWildcard}
                  onChange={e => setUseWildcard(e.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Include wildcard (*.{issueDomain || 'domain.com'})</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 2 }}>Uses DNS-01 via {dnsCreds.provider} — covers all subdomains</div>
                </div>
              </label>
            )}

            {!dnsCreds.configured && (
              <p style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 10, lineHeight: 1.5 }}>
                DNS must already point to this server. Issuance runs in the background and may take up to a minute.
                <br />
                <span style={{ color: 'var(--text-3)' }}>For wildcard certs, configure DNS credentials in the <strong>DNS Credentials</strong> tab first.</span>
              </p>
            )}
            {dnsCreds.configured && !useWildcard && (
              <p style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 10, lineHeight: 1.5 }}>
                DNS must already point to this server. Issuance runs in the background and may take up to a minute.
              </p>
            )}
            {dnsCreds.configured && useWildcard && (
              <p style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 10, lineHeight: 1.5 }}>
                Certbot will create a DNS TXT record via Cloudflare to validate ownership. This may take ~30s for DNS propagation.
              </p>
            )}
          </>
        )}
      </Modal>

      {/* Revoke modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => { if (!deleting) setDeleteTarget(''); }}
        title="Revoke Certificate"
        width={340}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => setDeleteTarget('')} disabled={deleting}>Cancel</Button>
            <Button variant="danger" size="sm" loading={deleting} onClick={revokeCert}>Revoke</Button>
          </div>
        }
      >
        <p style={{ fontSize: 13, color: 'var(--text-2)' }}>
          Revoke certificate for <strong style={{ color: 'var(--text)' }}>{deleteTarget}</strong>?
          HTTPS will stop working until a new certificate is issued.
        </p>
      </Modal>
    </div>
  );
}
