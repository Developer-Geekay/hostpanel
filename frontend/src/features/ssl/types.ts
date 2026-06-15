export interface SslDomainItem {
  domain: string;
  is_primary: boolean;
  in_cert: boolean;
}

export interface SslCert {
  id: number | null;
  root_domain: string;
  linux_user: string;
  status: 'none' | 'pending' | 'failed' | 'valid' | 'expiring_soon' | 'expired';
  cert_path: string | null;
  issued_at: string | null;
  expires_at: string | null;
  updated_at: string;
  days_remaining: number | null;
  domains: SslDomainItem[];
}

export interface CertLog {
  log: string;
  status: 'running' | 'success' | 'error' | 'no_log';
}
