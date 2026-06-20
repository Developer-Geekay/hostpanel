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

export interface RecordForm {
  name: string;
  type: string;
  content: string;
  ttl: number;
}

export const RECORD_TYPES = ['All', 'A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'CAA'] as const;
