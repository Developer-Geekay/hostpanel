export interface AuditEntry {
  id: number;
  ts: string;
  actor: string;
  action: string;
  resource: string | null;
  detail: string | null;
  status: string;
}
