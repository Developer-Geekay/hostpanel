import { useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Toggle } from '../../../components/ui/Toggle';
import type { CertLog } from '../types';

interface Props {
  open: boolean;
  mode: 'issue' | 'renew';
  domain: string;
  setDomain: (v: string) => void;
  useWildcard: boolean;
  setUseWildcard: (v: boolean) => void;
  submitting: boolean;
  certLog: CertLog | null;
  logBoxRef: React.RefObject<HTMLPreElement>;
  onClose: () => void;
  onSubmitIssue: () => void;
  onSubmitRenew: () => void;
}

export function IssueProgressModal({
  open, mode, domain, setDomain,
  useWildcard, setUseWildcard,
  submitting, certLog, logBoxRef,
  onClose, onSubmitIssue, onSubmitRenew,
}: Props) {
  const inProgress = certLog !== null;
  const title = inProgress
    ? `${mode === 'renew' ? 'Renewing' : 'Issuing'} — ${domain}`
    : mode === 'renew' ? 'Renew Certificate' : 'Issue Certificate';

  return (
    <Modal
      open={open}
      onClose={inProgress ? () => {} : onClose}
      title={title}
      width={inProgress ? 600 : 420}
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
                  ✓ Certificate {mode === 'renew' ? 'renewed' : 'issued'} successfully
                </span>
              )}
              {certLog?.status === 'error' && (
                <span style={{ fontSize: 12, color: 'var(--err)', marginRight: 'auto' }}>
                  ✕ Failed — see log above
                </span>
              )}
              <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
            </>
          ) : mode === 'renew' ? (
            <>
              <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>Cancel</Button>
              <Button variant="primary" size="sm" loading={submitting} onClick={onSubmitRenew}>Renew Now</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>Cancel</Button>
              <Button variant="primary" size="sm" loading={submitting} disabled={!domain.trim()} onClick={onSubmitIssue}>
                Issue
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
            background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            padding: '12px 14px', fontSize: 11.5, fontFamily: 'var(--font-mono)', lineHeight: 1.6,
            color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            maxHeight: 340, overflowY: 'auto', margin: 0,
          }}
        >
          {certLog?.log || 'Waiting for certbot output…'}
        </pre>
      ) : mode === 'renew' ? (
        <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
          Force-renew the certificate for <strong style={{ color: 'var(--text)' }}>{domain}</strong>?
          Certbot will request a new certificate regardless of expiry. The process runs in the background.
        </p>
      ) : (
        <>
          <div className="field">
            <label>Domain</label>
            <input
              type="text"
              value={domain}
              onChange={e => setDomain(e.target.value)}
              placeholder="example.com"
              autoFocus
              disabled={submitting}
              onKeyDown={e => { if (e.key === 'Enter' && !useWildcard) onSubmitIssue(); }}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 14, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={useWildcard}
              onChange={e => setUseWildcard(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                Include wildcard (*.{domain || 'domain.com'})
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 2 }}>
                Uses DNS-01 via local PowerDNS — covers all subdomains
              </div>
            </div>
          </label>

          <p style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 12, lineHeight: 1.5 }}>
            {useWildcard
              ? 'Certbot will create a DNS TXT record in PowerDNS to validate ownership, then remove it automatically.'
              : 'DNS must already point to this server. Issuance runs in the background and may take up to a minute.'}
          </p>
        </>
      )}
    </Modal>
  );
}
