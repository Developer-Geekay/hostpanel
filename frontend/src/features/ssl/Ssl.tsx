import { useState, useEffect } from 'react';
import { Plus, Trash2, RefreshCw, ShieldCheck } from 'lucide-react';
import { apiGet, apiPost, apiDelete } from '../../lib/api';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import { Toggle } from '../../components/ui/Toggle';
import { useToast } from '../../components/ui/Toast';

interface Cert { domain: string; valid_from: string; valid_to: string; issuer: string; auto_renew: boolean; }

function daysUntil(dateStr: string) {
  return Math.floor((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export default function Ssl() {
  const { ok, err } = useToast();
  const [certs, setCerts] = useState<Cert[]>([]);
  const [loading, setLoading] = useState(true);
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueDomain, setIssueDomain] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState('');

  const load = async () => {
    try { const r = await apiGet<Cert[]>('ssl'); setCerts(r); }
    catch { err('Failed to load certificates'); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const issueCert = async () => {
    if (!issueDomain.trim()) return;
    setIssuing(true);
    try { await apiPost('ssl/issue', { domain: issueDomain.trim() }); ok(`Certificate issued for ${issueDomain}`); setIssueOpen(false); setIssueDomain(''); load(); }
    catch (e: any) { err(e.message || 'Failed to issue certificate'); } finally { setIssuing(false); }
  };

  const deleteCert = async (domain: string) => {
    try { await apiDelete(`ssl/${domain}`); ok(`Revoked ${domain}`); setDeleteTarget(''); load(); }
    catch { err('Failed to revoke'); }
  };

  const toggleAutoRenew = async (cert: Cert) => {
    try { await apiPost('ssl/renewal', { domain: cert.domain, enabled: !cert.auto_renew }); load(); }
    catch { err('Failed'); }
  };

  const expiryBadge = (dateStr: string) => {
    const days = daysUntil(dateStr);
    if (days < 0)  return <span className="badge badge-err">Expired</span>;
    if (days < 30) return <span className="badge badge-warn">{days}d left</span>;
    return <span className="badge badge-ok">{days}d left</span>;
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">SSL Certificates</div><div className="page-desc">Let's Encrypt TLS certificates</div></div>
        <Button variant="primary" size="sm" icon={<Plus size={13} strokeWidth={1.5} />} onClick={() => setIssueOpen(true)}>Issue Certificate</Button>
      </div>

      {loading ? <PageSpinner /> : certs.length === 0 ? (
        <div className="empty">
          <ShieldCheck size={32} className="empty-icon" strokeWidth={1.5} />
          <div className="empty-title">No certificates</div>
          <div className="empty-desc">Issue your first SSL certificate to enable HTTPS</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Domain</th><th>Issuer</th><th>Valid From</th><th>Expiry</th><th>Auto-Renew</th><th>Actions</th></tr></thead>
            <tbody>
              {certs.map(c => (
                <tr key={c.domain}>
                  <td className="mono" style={{ fontWeight: 500 }}>{c.domain}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{c.issuer}</td>
                  <td className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{c.valid_from?.slice(0, 10)}</td>
                  <td>{expiryBadge(c.valid_to)}</td>
                  <td><Toggle checked={c.auto_renew} onChange={() => toggleAutoRenew(c)} /></td>
                  <td>
                    <div className="actions">
                      <Button variant="ghost" size="sm" icon={<RefreshCw size={12} strokeWidth={1.5} />} onClick={() => { setIssueDomain(c.domain); setIssueOpen(true); }}>Renew</Button>
                      <Button variant="danger" size="sm" icon={<Trash2 size={12} strokeWidth={1.5} />} onClick={() => setDeleteTarget(c.domain)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={issueOpen} onClose={() => { setIssueOpen(false); setIssueDomain(''); }} title="Issue Certificate" width={380}
        footer={<><Button variant="ghost" onClick={() => { setIssueOpen(false); setIssueDomain(''); }}>Cancel</Button><Button variant="primary" loading={issuing} onClick={issueCert}>Issue</Button></>}>
        <div className="field">
          <label>Domain</label>
          <input value={issueDomain} onChange={e => setIssueDomain(e.target.value)} placeholder="example.com" autoFocus onKeyDown={e => e.key === 'Enter' && issueCert()} />
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 10 }}>DNS must already point to this server. Certificate issuance may take a moment.</p>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget('')} title="Revoke Certificate" width={340}
        footer={<><Button variant="ghost" onClick={() => setDeleteTarget('')}>Cancel</Button><Button variant="danger" onClick={() => deleteCert(deleteTarget)}>Revoke</Button></>}>
        <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Revoke certificate for <strong>{deleteTarget}</strong>?</p>
      </Modal>
    </div>
  );
}
