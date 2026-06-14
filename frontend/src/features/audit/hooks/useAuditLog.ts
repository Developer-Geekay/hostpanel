import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiDelete } from '../../../lib/api';
import type { AuditEntry } from '../types';

export const AUDIT_LIMIT = 100;

export function useAuditLog() {
  const [entries, setEntries]   = useState<AuditEntry[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [offset, setOffset]     = useState(0);
  const [clearing, setClearing] = useState(false);
  const [error, setError]       = useState('');

  const load = useCallback(async (off: number) => {
    setLoading(true);
    setError('');
    try {
      const [rows, cnt] = await Promise.all([
        apiGet<AuditEntry[]>(`audit?limit=${AUDIT_LIMIT}&offset=${off}`),
        apiGet<{ total: number }>('audit/count'),
      ]);
      setEntries(rows);
      setTotal(cnt.total);
      setOffset(off);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(0); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClear = async () => {
    if (!confirm('Clear all audit log entries? This cannot be undone.')) return;
    setClearing(true);
    try {
      await apiDelete('audit');
      await load(0);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to clear');
    } finally {
      setClearing(false);
    }
  };

  const pages = Math.ceil(total / AUDIT_LIMIT);
  const page  = Math.floor(offset / AUDIT_LIMIT);

  return { entries, total, loading, offset, clearing, error, pages, page, load, handleClear };
}
