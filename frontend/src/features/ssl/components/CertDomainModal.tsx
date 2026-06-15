import { Loader2 } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Spinner } from '../../../components/ui/Spinner';
import type { CertLog } from '../types';

interface Props {
  open: boolean;
  mode: 'issue' | 'edit';
  rootDomain: string;
  loadingFqdns: boolean;
  availableFqdns: string[];
  selectedFqdns: string[];
  submitting: boolean;
  certLog: CertLog | null;
  logBoxRef: React.RefObject<HTMLPreElement>;
  onToggleFqdn: (fqdn: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function CertDomainModal({
  open, mode, rootDomain,
  loadingFqdns, availableFqdns, selectedFqdns,
  submitting, certLog, logBoxRef,
  onToggleFqdn, onSelectAll, onDeselectAll, onClose, onSubmit,
}: Props) {
  const inProgress = certLog !== null;
  const title = inProgress
    ? (certLog?.status === 'success'
        ? `Certificate ${mode === 'issue' ? 'issued' : 'updated'} — ${rootDomain}`
        : `${mode === 'issue' ? 'Issuing' : 'Updating'} — ${rootDomain}`)
    : mode === 'issue'
      ? `Issue Certificate — ${rootDomain}`
      : `Edit Certificate Domains — ${rootDomain}`;

  const allChecked = availableFqdns.length > 0
    && availableFqdns.every(f => selectedFqdns.includes(f));

  return (
    <Modal
      open={open}
      onClose={inProgress && certLog?.status === 'running' ? () => {} : onClose}
      title={title}
      width={inProgress ? 600 : 440}
      footer={
        <div className="actions" style={{ justifyContent: 'flex-end' }}>
          {inProgress ? (
            <>
              {certLog?.status === 'running' && (
                <span style={{ fontSize: 12, color: 'var(--text-2)', marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Loader2 size={12} strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite' }} />
                  Running…
                </span>
              )}
              {certLog?.status === 'success' && (
                <span style={{ fontSize: 12, color: 'var(--ok)', marginRight: 'auto' }}>
                  ✓ Certificate {mode === 'issue' ? 'issued' : 'updated'} successfully
                </span>
              )}
              {certLog?.status === 'error' && (
                <span style={{ fontSize: 12, color: 'var(--err)', marginRight: 'auto' }}>
                  ✕ Failed — see log above
                </span>
              )}
              <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>Cancel</Button>
              <Button
                variant="primary" size="sm"
                loading={submitting}
                disabled={selectedFqdns.length === 0 || loadingFqdns}
                onClick={onSubmit}
              >
                {mode === 'issue' ? 'Issue' : 'Reissue'}
              </Button>
            </>
          )}
        </div>
      }
    >
      {inProgress ? (
        <pre
          ref={logBoxRef}
          style={{
            background: 'var(--bg-3)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '12px 14px',
            fontSize: 11.5, fontFamily: 'var(--font-mono)', lineHeight: 1.6,
            color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            maxHeight: 360, overflowY: 'auto', margin: 0,
          }}
        >
          {certLog?.log || 'Waiting for certbot output…'}
        </pre>
      ) : loadingFqdns ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <Spinner />
        </div>
      ) : (
        <>
          <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12, lineHeight: 1.5 }}>
            {mode === 'issue'
              ? 'Select the domains to include in the certificate. All listed domains must resolve in PowerDNS.'
              : 'Update the domain list. Certbot will reissue the certificate with the new SAN list.'}
          </p>

          {/* Select-all toggle */}
          {availableFqdns.length > 1 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-2)' }}>
              <input
                type="checkbox"
                checked={allChecked}
                onChange={() => allChecked ? onDeselectAll() : onSelectAll()}
                style={{ width: 14, height: 14 }}
              />
              Select all
            </label>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {availableFqdns.map(fqdn => (
              <label
                key={fqdn}
                style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '6px 10px', borderRadius: 'var(--radius)', background: selectedFqdns.includes(fqdn) ? 'var(--bg-2)' : 'transparent', border: '1px solid', borderColor: selectedFqdns.includes(fqdn) ? 'var(--border-2)' : 'transparent', transition: 'all 0.1s' }}
              >
                <input
                  type="checkbox"
                  checked={selectedFqdns.includes(fqdn)}
                  onChange={() => onToggleFqdn(fqdn)}
                  style={{ width: 14, height: 14, flexShrink: 0 }}
                />
                <span className="mono" style={{ fontSize: 12 }}>{fqdn}</span>
              </label>
            ))}
          </div>

          {availableFqdns.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '12px 0' }}>
              No FQDNs found for this domain.
            </p>
          )}

          <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 14, lineHeight: 1.5 }}>
            Certbot will create DNS TXT records in PowerDNS automatically to validate ownership.
            The process runs in the background and may take 1–2 minutes.
          </p>
        </>
      )}
    </Modal>
  );
}
