import { ChevronRight, ChevronDown, Loader2, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Toggle } from '../../../components/ui/Toggle';
import { SslStatusBadge } from './SslStatusBadge';
import type { CertStatus } from '../types';

interface Props {
  cert: CertStatus;
  expanded: boolean;
  togglingHttps: string | null;
  onToggleExpand: () => void;
  onToggleHttps: (cert: CertStatus) => void;
  onIssue: (domain: string) => void;
  onRenew: (domain: string) => void;
  onImport: (domain: string) => void;
  onDelete: (domain: string) => void;
}

export function CertStatusRow({
  cert, expanded, togglingHttps,
  onToggleExpand, onToggleHttps,
  onIssue, onRenew, onImport, onDelete,
}: Props) {
  const hasSans = cert.sans && cert.sans.length > 0;

  return (
    <>
      <tr>
        {/* Domain */}
        <td className="mono" style={{ fontWeight: 500 }}>
          <button
            onClick={onToggleExpand}
            disabled={!hasSans}
            style={{
              background: 'none', border: 'none', padding: 0,
              cursor: hasSans ? 'pointer' : 'default',
              display: 'inline-flex', alignItems: 'center', gap: 4,
              color: 'inherit', fontFamily: 'inherit', fontWeight: 'inherit', fontSize: 'inherit',
            }}
          >
            {hasSans
              ? (expanded ? <ChevronDown size={12} strokeWidth={1.5} /> : <ChevronRight size={12} strokeWidth={1.5} />)
              : <span style={{ width: 16 }} />}
            {cert.domain}
          </button>
          {cert.is_wildcard && (
            <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 3, padding: '1px 5px', verticalAlign: 'middle' }}>
              wildcard
            </span>
          )}
        </td>

        {/* Status */}
        <td>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <SslStatusBadge cert={cert} />
            {cert.status === 'pending' && (
              <Loader2 size={12} strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite', color: '#3b82f6' }} />
            )}
          </div>
        </td>

        {/* Expiry */}
        <td className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{cert.expiry ?? '—'}</td>

        {/* Issuer */}
        <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{cert.issuer ?? '—'}</td>

        {/* Force HTTPS toggle */}
        <td>
          <Toggle
            checked={cert.https_forced}
            onChange={() => onToggleHttps(cert)}
            disabled={
              ['none', 'pending', 'failed', 'revoked'].includes(cert.status) ||
              togglingHttps === cert.domain
            }
          />
        </td>

        {/* Actions */}
        <td>
          <div className="actions">
            {cert.status === 'pending' && (
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>In progress…</span>
            )}
            {(cert.status === 'none' || cert.status === 'revoked') && (
              <>
                <Button variant="ghost" size="sm" icon={<Plus size={12} strokeWidth={1.5} />} onClick={() => onIssue(cert.domain)}>Issue</Button>
                <Button variant="ghost" size="sm" icon={<Upload size={12} strokeWidth={1.5} />} onClick={() => onImport(cert.domain)}>Import</Button>
              </>
            )}
            {cert.status === 'failed' && (
              <>
                <Button variant="ghost" size="sm" icon={<RefreshCw size={12} strokeWidth={1.5} />} onClick={() => onIssue(cert.domain)}>Retry</Button>
                <Button variant="ghost" size="sm" icon={<Upload size={12} strokeWidth={1.5} />} onClick={() => onImport(cert.domain)}>Import</Button>
              </>
            )}
            {(cert.status === 'valid' || cert.status === 'expiring_soon' || cert.status === 'expired') && (
              <>
                {cert.source === 'letsencrypt' && (
                  <Button variant="ghost" size="sm" icon={<RefreshCw size={12} strokeWidth={1.5} />} onClick={() => onRenew(cert.domain)}>Renew</Button>
                )}
                {cert.source === 'imported' && (
                  <Button variant="ghost" size="sm" icon={<Upload size={12} strokeWidth={1.5} />} onClick={() => onImport(cert.domain)}>Replace</Button>
                )}
                <Button variant="danger" size="sm" icon={<Trash2 size={12} strokeWidth={1.5} />} onClick={() => onDelete(cert.domain)} />
              </>
            )}
          </div>
        </td>
      </tr>

      {/* Expanded SAN row */}
      {expanded && hasSans && (
        <tr style={{ background: 'var(--bg-2)' }}>
          <td colSpan={6} style={{ paddingLeft: 32, paddingTop: 6, paddingBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Subject Alternative Names</span>
              {cert.source === 'letsencrypt' && (
                <span style={{ fontSize: 10, color: '#3b82f6', border: '1px solid #3b82f644', background: '#3b82f611', borderRadius: 3, padding: '1px 5px' }}>
                  Let's Encrypt
                </span>
              )}
              {cert.source === 'imported' && (
                <span style={{ fontSize: 10, color: '#a855f7', border: '1px solid #a855f744', background: '#a855f711', borderRadius: 3, padding: '1px 5px' }}>
                  Custom
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px' }}>
              {cert.sans.map(san => (
                <span key={san} className="mono" style={{ fontSize: 11, background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 4, padding: '2px 7px' }}>
                  {san}
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
