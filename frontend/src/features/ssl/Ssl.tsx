import { ShieldCheck } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { PageSpinner } from '../../components/ui/Spinner';
import { Toggle } from '../../components/ui/Toggle';
import { useSsl } from './hooks/useSsl';
import { CertCard } from './components/CertCard';
import { CertDomainModal } from './components/CertDomainModal';

export default function Ssl() {
  const ssl = useSsl();

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">SSL Certificates</div>
          <div className="page-desc">DNS-01 certificates via Let's Encrypt + PowerDNS</div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-2)', cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}>
          <Toggle checked={ssl.autoRenew} onChange={ssl.toggleAutoRenew} />
          Auto-renew
        </label>
      </div>

      {/* Content */}
      {ssl.loading ? (
        <PageSpinner />
      ) : ssl.certs.length === 0 ? (
        <div className="empty">
          <ShieldCheck size={32} strokeWidth={1.5} className="empty-icon" />
          <div className="empty-title">No domains provisioned</div>
          <div className="empty-desc">Add a domain in Web Server first, then issue a certificate here.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ssl.certs.map(cert => (
            <CertCard
              key={cert.root_domain}
              cert={cert}
              onIssue={ssl.openIssue}
              onEdit={ssl.openEdit}
              onRenew={ssl.setRenewTarget}
              onDelete={ssl.setDeleteTarget}
            />
          ))}
        </div>
      )}

      {/* Domain selector + certbot log modal */}
      <CertDomainModal
        open={ssl.certModalOpen}
        mode={ssl.certModalMode}
        rootDomain={ssl.certModalRoot}
        loadingFqdns={ssl.loadingFqdns}
        availableFqdns={ssl.availableFqdns}
        selectedFqdns={ssl.selectedFqdns}
        submitting={ssl.submitting}
        certLog={ssl.certLog}
        logBoxRef={ssl.logBoxRef}
        onToggleFqdn={ssl.toggleFqdn}
        onSelectAll={ssl.selectAllFqdns}
        onDeselectAll={ssl.deselectAllFqdns}
        onClose={ssl.closeCertModal}
        onSubmit={ssl.submitCertModal}
      />

      {/* Renew confirm */}
      <Modal
        open={!!ssl.renewTarget}
        onClose={() => { if (!ssl.renewing) ssl.setRenewTarget(null); }}
        title="Force Renew Certificate"
        width={340}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => ssl.setRenewTarget(null)} disabled={ssl.renewing}>Cancel</Button>
            <Button variant="primary" size="sm" loading={ssl.renewing} onClick={ssl.submitRenew}>Renew Now</Button>
          </div>
        }
      >
        <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
          Force-renew the certificate for{' '}
          <strong style={{ color: 'var(--text)' }}>{ssl.renewTarget}</strong>?
          Certbot will request a new certificate regardless of expiry.
        </p>
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={!!ssl.deleteTarget}
        onClose={() => { if (!ssl.deleting) ssl.setDeleteTarget(null); }}
        title="Delete Certificate"
        width={340}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => ssl.setDeleteTarget(null)} disabled={ssl.deleting}>Cancel</Button>
            <Button variant="danger" size="sm" loading={ssl.deleting} onClick={ssl.submitDelete}>Delete</Button>
          </div>
        }
      >
        <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
          Delete certificate for{' '}
          <strong style={{ color: 'var(--text)' }}>{ssl.deleteTarget}</strong>?
          HTTPS will stop working until a new certificate is issued.
        </p>
      </Modal>
    </div>
  );
}
