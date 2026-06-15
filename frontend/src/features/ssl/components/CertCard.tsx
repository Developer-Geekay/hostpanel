import { CheckCircle2, Circle, Edit2, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { SslStatusBadge } from './SslStatusBadge';
import type { SslCert } from '../types';

interface Props {
  cert: SslCert;
  onIssue: (rootDomain: string) => void;
  onEdit: (cert: SslCert) => void;
  onRenew: (rootDomain: string) => void;
  onDelete: (rootDomain: string) => void;
}

export function CertCard({ cert, onIssue, onEdit, onRenew, onDelete }: Props) {
  const hasCert = ['valid', 'expiring_soon', 'expired'].includes(cert.status);
  const canEdit = cert.id !== null && cert.status !== 'pending';

  return (
    <div className="card" style={{ padding: '14px 18px' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="mono" style={{ fontWeight: 600, fontSize: 14, flexShrink: 0 }}>
          {cert.root_domain}
        </span>

        <SslStatusBadge cert={cert} />

        {cert.status === 'pending' && (
          <Loader2 size={12} strokeWidth={1.5}
            style={{ animation: 'spin 1s linear infinite', color: '#3b82f6', flexShrink: 0 }} />
        )}

        {cert.expires_at && (
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 2 }}>
            exp. {cert.expires_at.slice(0, 10)}
          </span>
        )}

        {/* Actions pushed to the right */}
        <div className="actions" style={{ marginLeft: 'auto' }}>
          {cert.status === 'pending' && (
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>In progress…</span>
          )}
          {(cert.status === 'none') && (
            <Button variant="ghost" size="sm" icon={<Plus size={12} strokeWidth={1.5} />}
              onClick={() => onIssue(cert.root_domain)}>
              Issue
            </Button>
          )}
          {cert.status === 'failed' && (
            <>
              <Button variant="ghost" size="sm" icon={<RefreshCw size={12} strokeWidth={1.5} />}
                onClick={() => onEdit(cert)}>
                Retry
              </Button>
              <Button variant="ghost" size="sm" icon={<Plus size={12} strokeWidth={1.5} />}
                onClick={() => onIssue(cert.root_domain)}>
                Reissue
              </Button>
            </>
          )}
          {hasCert && canEdit && (
            <Button variant="ghost" size="sm" icon={<Edit2 size={12} strokeWidth={1.5} />}
              onClick={() => onEdit(cert)}>
              Edit Domains
            </Button>
          )}
          {(hasCert || cert.status === 'failed') && cert.id !== null && (
            <>
              {hasCert && (
                <Button variant="ghost" size="sm" icon={<RefreshCw size={12} strokeWidth={1.5} />}
                  onClick={() => onRenew(cert.root_domain)}>
                  Renew
                </Button>
              )}
              <Button variant="danger" size="sm"
                icon={<Trash2 size={12} strokeWidth={1.5} />}
                onClick={() => onDelete(cert.root_domain)} />
            </>
          )}
        </div>
      </div>

      {/* Domain list */}
      {cert.domains.length > 0 && (
        <div style={{
          marginTop: 10, paddingTop: 10,
          borderTop: '1px solid var(--border)',
          display: 'flex', flexWrap: 'wrap', gap: '4px 16px',
        }}>
          {cert.domains.map(d => (
            <div key={d.domain}
              style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {d.in_cert
                ? <CheckCircle2 size={11} strokeWidth={1.5} style={{ color: 'var(--ok)', flexShrink: 0 }} />
                : <Circle       size={11} strokeWidth={1.5} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
              <span className="mono" style={{
                fontSize: 11,
                color: d.in_cert ? 'var(--text)' : 'var(--text-3)',
              }}>
                {d.domain}
                {d.is_primary && (
                  <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--text-3)' }}>
                    (primary)
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
