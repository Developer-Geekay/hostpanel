import type { SslCert } from '../types';

export function SslStatusBadge({ cert }: { cert: SslCert }) {
  switch (cert.status) {
    case 'none':
      return <span className="badge badge-dim">No cert</span>;
    case 'pending':
      return <span className="badge" style={{ background: '#3b82f622', color: '#3b82f6', border: '1px solid #3b82f644' }}>Pending</span>;
    case 'failed':
      return <span className="badge badge-err">Failed</span>;
    case 'expired':
      return <span className="badge badge-err">Expired</span>;
    case 'expiring_soon':
      return <span className="badge badge-warn">{cert.days_remaining}d left</span>;
    case 'valid':
      return <span className="badge badge-ok">{cert.days_remaining}d left</span>;
    default:
      return <span className="badge badge-dim">{cert.status}</span>;
  }
}
