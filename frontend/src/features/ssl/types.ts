export interface CertStatus {
  domain: string;
  status: 'none' | 'pending' | 'failed' | 'valid' | 'expiring_soon' | 'expired' | 'revoked';
  expiry: string | null;
  days_remaining: number | null;
  issuer: string | null;
  sans: string[];
  https_forced: boolean;
  is_wildcard: boolean;
  source: 'none' | 'letsencrypt' | 'imported';
}

export interface CertLog {
  log: string;
  status: 'running' | 'success' | 'error' | 'no_log';
}

export interface IssueRequest {
  domain: string;
  wildcard?: boolean;
  force?: boolean;
  additional_domains?: string[];
}

export interface ImportRequest {
  cert_pem: string;
  key_pem: string;
  chain_pem: string;
}
