import { useState } from 'react';
import { Plus, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { PageSpinner } from '../../components/ui/Spinner';
import { Toggle } from '../../components/ui/Toggle';
import { useSsl } from './hooks/useSsl';
import { CertStatusRow } from './components/CertStatusRow';
import { IssueProgressModal } from './components/IssueProgressModal';
import { ImportCertModal } from './components/ImportCertModal';

export default function Ssl() {
  const ssl = useSsl();
  const [expanded, setExpanded] = useState<string | null>(null);

  function toggleExpand(domain: string) {
    setExpanded(prev => (prev === domain ? null : domain));
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">SSL Certificates</div>
          <div className="page-desc">Let's Encrypt TLS certificates</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-2)', cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}>
            <Toggle checked={ssl.autoRenew} onChange={ssl.toggleAutoRenew} />
            Auto-renew
          </label>
          <Button variant="primary" size="sm" icon={<Plus size={13} strokeWidth={1.5} />} onClick={() => ssl.openIssue()}>
            Issue Certificate
          </Button>
        </div>
      </div>

      {/* Table */}
      {ssl.loading ? (
        <PageSpinner />
      ) : ssl.certs.length === 0 ? (
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
                {ssl.certs.map(cert => (
                  <CertStatusRow
                    key={cert.domain}
                    cert={cert}
                    expanded={expanded === cert.domain}
                    togglingHttps={ssl.togglingHttps}
                    onToggleExpand={() => toggleExpand(cert.domain)}
                    onToggleHttps={ssl.toggleForceHttps}
                    onIssue={ssl.openIssue}
                    onRenew={ssl.openRenew}
                    onImport={ssl.openImport}
                    onDelete={ssl.setDeleteTarget}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Issue / Renew + progress modal */}
      <IssueProgressModal
        open={ssl.modalOpen}
        mode={ssl.modalMode}
        domain={ssl.issueDomain}
        setDomain={ssl.setIssueDomain}
        useWildcard={ssl.useWildcard}
        setUseWildcard={ssl.setUseWildcard}
        submitting={ssl.submitting}
        certLog={ssl.certLog}
        logBoxRef={ssl.logBoxRef}
        onClose={ssl.closeModal}
        onSubmitIssue={ssl.submitIssue}
        onSubmitRenew={ssl.submitRenew}
      />

      {/* Import modal */}
      <ImportCertModal
        domain={ssl.importDomain}
        cert={ssl.importCert}
        setCert={ssl.setImportCert}
        privKey={ssl.importKey}
        setPrivKey={ssl.setImportKey}
        chain={ssl.importChain}
        setChain={ssl.setImportChain}
        importing={ssl.importing}
        onClose={ssl.closeImport}
        onSubmit={ssl.submitImport}
      />

      {/* Revoke confirm modal */}
      <Modal
        open={!!ssl.deleteTarget}
        onClose={() => { if (!ssl.deleting) ssl.setDeleteTarget(''); }}
        title="Revoke Certificate"
        width={340}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => ssl.setDeleteTarget('')} disabled={ssl.deleting}>Cancel</Button>
            <Button variant="danger" size="sm" loading={ssl.deleting} onClick={ssl.revokeCert}>Revoke</Button>
          </div>
        }
      >
        <p style={{ fontSize: 13, color: 'var(--text-2)' }}>
          Revoke certificate for <strong style={{ color: 'var(--text)' }}>{ssl.deleteTarget}</strong>?
          HTTPS will stop working until a new certificate is issued.
        </p>
      </Modal>
    </div>
  );
}
