export interface DnsZone {
  name: string;
  serial: string;
  kind?: string;
  record_count?: number;
}

export interface DnsRecord {
  name: string;
  type: string;
  content: string;
  ttl: number;
}

export interface Redirect {
  id: string;
  source_domain: string;
  source_path: string;
  dest_url: string;
  type: number;
  www_handling: string;
}

export interface RecordForm {
  name: string;
  type: string;
  content: string;
  ttl: number;
}

export interface RedirectForm {
  source_domain: string;
  source_path: string;
  dest_url: string;
  type: number;
  www_handling: string;
}

export const RECORD_TYPES = ['All', 'A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'CAA'] as const;
