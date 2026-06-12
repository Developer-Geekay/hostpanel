import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, RefreshCw, ShieldCheck } from 'lucide-react';
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
  status: 'none' | 'valid' | 'expiring_soon' | 'expired';
  expiry: string | null;
  days_remaining: number | null;
  issuer: string | null;
  https_forced: boolean;
}

function statusBadge(cert: CertStatus) {
  if (cert.status === 'none') return <span className="badge badge-dim">No cert</span>;
  if (cert.status === 'expired') return <span className="badge badge-err">Expired</span>;
  if (cert.status === 'expiring_soon') return <span className="badge badge-warn">{cert.days_remaining}d left</span>;
  return <span className="badge badge-ok">{cert.days_remaining}d left</span>;
}

export default function Ssl() {
  const toast = useToast();
  const [certs, setCerts] = useState<CertStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRenew, setAutoRenew] = useState(false);

  const [issueOpen, setIssueOpen] = useState(false);
  const [issueDomain, setIssueDomain] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [certLog, setCertLog] = useState<CertLog | null>(null);
  const logPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logBoxRef = useRef<HTMLPreElement>(null);

  const [deleteTarget, setDeleteTarget] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [togglingHttps, setTogglingHttps] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [certsData, renewalData] = await Promise.all([
        apiGet<CertStatus[]>('ssl'),
        apiGet<{ enabled: boolean }>('ssl/renewal'),
      ]);
      setCerts(certsData);
      setAutoRenew(renewalData.enabled);
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to load SSL data');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  function stopLogPolling() {
    if (logPollRef.current) {
      clearInterval(logPollRef.current);
      logPollRef.current = null;
    }
  }

  function startLogPolling(domain: string) {
    stopLogPolling();
    const poll = async () => {
      try {
        const data = await apiGet<CertLog>(`ssl/${domain}/log`);
        setCertLog(data);
        // Auto-scroll log box to bottom
        if (logBoxRef.current) {
          logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
        }
        if (data.status === 'success') {
          stopLogPolling();
          load(); // refresh cert list
        } else if (data.status === 'error') {
          stopLogPolling();
        }
      } catch {
        // server may be temporarily unavailable — keep polling
      }
    };
    poll(); // immediate first check
    logPollRef.current = setInterval(poll, 2000);
  }

  // Clean up poll interval when modal closes
  function closeIssueModal() {
    stopLogPolling();
    setIssueOpen(false);
    setIssueDomain('');
    setCertLog(null);
  }

  async function issueCert() {
    if (!issueDomain.trim()) return;
    setIssuing(true);
    try {
      await apiPost('ssl/issue', { domain: issueDomain.trim() });
      setCertLog({ log: 'Certbot started — waiting for output…', status: 'running' });
      startLogPolling(issueDomain.trim());
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to issue certificate');
    } finally {
      setIssuing(false);
    }
  }

  async function revokeCert() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`ssl/${deleteTarget}`);
      toast.ok(`Certificate for ${deleteTarget} revoked`);
      setDeleteTarget('');
      load();
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

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">SSL Certificates</div>
          <div className="page-desc">Let's Encrypt TLS certificates</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-2)', cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}>
            <Toggle checked={autoRenew} onChange={toggleAutoRenew} />
            Auto-renew
          </label>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={13} strokeWidth={1.5} />}
            onClick={() => { setCertLog(null); setIssueDomain(''); setIssueOpen(true); }}
          >
            Issue Certificate
          </Button>
        </div>
      </div>

      {loading ? (
        <PageSpinner />
      ) : certs.length === 0 ? (
        <div className="empty">
          <ShieldCheck size={32} strokeWidth={1.5} className="empty-icon" />
          <div className="empty-title">No domains provisioned</div>
          <div className="empty-desc">Add a domain in Web Server first, then issue a certificate here.</div>
        </div>
      ) : (
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
              {certs.map(c => (
                <tr key={c.domain}>
                  <td className="mono" style={{ fontWeight: 500 }}>{c.domain}</td>
                  <td>{statusBadge(c)}</td>
                  <td className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>
                    {c.expiry ?? '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{c.issuer ?? '—'}</td>
                  <td>
                    <Toggle
                      checked={c.https_forced}
                      onChange={() => toggleForceHttps(c)}
                      disabled={c.status === 'none' || togglingHttps === c.domain}
                    />
                  </td>
                  <td>
                    <div className="actions">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<RefreshCw size={12} strokeWidth={1.5} />}
                        onClick={() => { setCertLog(null); setIssueDomain(c.domain); setIssueOpen(true); }}
                        disabled={c.status === 'none' && false}
                      >
                        {c.status === 'none' ? 'Issue' : 'Renew'}
                      </Button>
                      {c.status !== 'none' && (
                        <Button
                          variant="danger"
                          size="sm"
                          icon={<Trash2 size={12} strokeWidth={1.5} />}
                          onClick={() => setDeleteTarget(c.domain)}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Issue / Renew modal */}
      <Modal
        open={issueOpen}
        onClose={certLog ? () => {} : () => closeIssueModal()}
        title={certLog ? `Issuing certificate — ${issueDomain}` : 'Issue Certificate'}
        width={certLog ? 600 : 400}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            {certLog ? (
              <>
                {certLog.status === 'running' && (
                  <span style={{ fontSize: 12, color: 'var(--text-2)', marginRight: 'auto' }}>
                    ⟳ Running…
                  </span>
                )}
                {certLog.status === 'success' && (
                  <span style={{ fontSize: 12, color: 'var(--ok)', marginRight: 'auto' }}>
                    ✓ Certificate issued successfully
                  </span>
                )}
                {certLog.status === 'error' && (
                  <span style={{ fontSize: 12, color: 'var(--err)', marginRight: 'auto' }}>
                    ✕ Issuance failed — see log above
                  </span>
                )}
                <Button variant="ghost" size="sm" onClick={closeIssueModal}>Close</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={closeIssueModal} disabled={issuing}>Cancel</Button>
                <Button variant="primary" size="sm" loading={issuing} disabled={!issueDomain.trim()} onClick={issueCert}>Issue</Button>
              </>
            )}
          </div>
        }
      >
        {certLog ? (
          <pre
            ref={logBoxRef}
            style={{
              background: 'var(--bg-3)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '12px 14px',
              fontSize: 11.5, fontFamily: 'var(--font-mono)', lineHeight: 1.6,
              color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              maxHeight: 340, overflowY: 'auto', margin: 0,
            }}
          >
            {certLog.log || 'Waiting for certbot output…'}
          </pre>
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
                disabled={issuing}
                onKeyDown={e => { if (e.key === 'Enter') issueCert(); }}
              />
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 10, lineHeight: 1.5 }}>
              DNS must already point to this server. Issuance runs in the background and may take up to a minute.
            </p>
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
