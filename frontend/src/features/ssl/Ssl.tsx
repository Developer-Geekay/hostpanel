import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, RefreshCw, ShieldCheck } from 'lucide-react';
import { apiGet, apiPost, apiDelete } from '../../lib/api';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import { Toggle } from '../../components/ui/Toggle';
import { useToast } from '../../components/ui/Toast';

interface Cert {
  domain: string;
  valid_from: string;
  valid_to: string;
  issuer: string;
  auto_renew: boolean;
}

function daysUntil(dateStr: string): number {
  return Math.floor((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

function expiryBadge(dateStr: string) {
  const days = daysUntil(dateStr);
  if (days < 0) return <span className="badge badge-err">Expired</span>;
  if (days < 30) return <span className="badge badge-warn">{days}d left</span>;
  return <span className="badge badge-ok">{days}d left</span>;
}

export default function Ssl() {
  const toast = useToast();
  const [certs, setCerts] = useState<Cert[]>([]);
  const [loading, setLoading] = useState(true);
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueDomain, setIssueDomain] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiGet<Cert[]>('ssl');
      setCerts(r);
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to load certificates');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function issueCert() {
    if (!issueDomain.trim()) return;
    setIssuing(true);
    try {
      await apiPost('ssl/issue', { domain: issueDomain.trim() });
      toast.ok(`Certificate issued for ${issueDomain}`);
      setIssueOpen(false);
      setIssueDomain('');
      load();
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
      toast.ok(`Revoked ${deleteTarget}`);
      setDeleteTarget('');
      load();
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to revoke certificate');
    } finally {
      setDeleting(false);
    }
  }

  async function toggleAutoRenew(cert: Cert) {
    try {
      await apiPost('ssl/renewal', { domain: cert.domain, enabled: !cert.auto_renew });
      load();
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
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={13} strokeWidth={1.5} />}
          onClick={() => { setIssueDomain(''); setIssueOpen(true); }}
        >
          Issue Certificate
        </Button>
      </div>

      {loading ? (
        <PageSpinner />
      ) : certs.length === 0 ? (
        <div className="empty">
          <ShieldCheck size={32} strokeWidth={1.5} className="empty-icon" />
          <div className="empty-title">No certificates</div>
          <div className="empty-desc">Issue your first SSL certificate to enable HTTPS.</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Domain</th>
                <th>Issuer</th>
                <th>Valid From</th>
                <th>Expiry</th>
                <th>Auto-Renew</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {certs.map(c => (
                <tr key={c.domain}>
                  <td className="mono" style={{ fontWeight: 500 }}>{c.domain}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{c.issuer}</td>
                  <td className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>
                    {c.valid_from?.slice(0, 10)}
                  </td>
                  <td>{expiryBadge(c.valid_to)}</td>
                  <td>
                    <Toggle checked={c.auto_renew} onChange={() => toggleAutoRenew(c)} />
                  </td>
                  <td>
                    <div className="actions">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<RefreshCw size={12} strokeWidth={1.5} />}
                        onClick={() => { setIssueDomain(c.domain); setIssueOpen(true); }}
                      >
                        Renew
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        icon={<Trash2 size={12} strokeWidth={1.5} />}
                        onClick={() => setDeleteTarget(c.domain)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Issue Certificate modal */}
      <Modal
        open={issueOpen}
        onClose={() => { if (!issuing) { setIssueOpen(false); setIssueDomain(''); } }}
        title="Issue Certificate"
        width={380}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => { setIssueOpen(false); setIssueDomain(''); }} disabled={issuing}>Cancel</Button>
            <Button variant="primary" size="sm" loading={issuing} disabled={!issueDomain.trim()} onClick={issueCert}>Issue</Button>
          </>
        }
      >
        <div className="field">
          <label>Domain</label>
          <input
            value={issueDomain}
            onChange={e => setIssueDomain(e.target.value)}
            placeholder="example.com"
            autoFocus
            disabled={issuing}
            onKeyDown={e => { if (e.key === 'Enter') issueCert(); }}
          />
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 10, lineHeight: 1.5 }}>
          DNS must already point to this server. Certificate issuance via Let's Encrypt may take a moment.
        </p>
      </Modal>

      {/* Revoke modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => { if (!deleting) setDeleteTarget(''); }}
        title="Revoke Certificate"
        width={340}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setDeleteTarget('')} disabled={deleting}>Cancel</Button>
            <Button variant="danger" size="sm" loading={deleting} onClick={revokeCert}>Revoke</Button>
          </>
        }
      >
        <p style={{ fontSize: 13, color: 'var(--text-2)' }}>
          Revoke certificate for <strong style={{ color: 'var(--text)' }}>{deleteTarget}</strong>?
          HTTPS will stop working for this domain until a new certificate is issued.
        </p>
      </Modal>
    </div>
  );
}
