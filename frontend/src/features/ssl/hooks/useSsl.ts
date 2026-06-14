import { useState, useEffect, useCallback, useRef } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../../../lib/api';
import { useToast } from '../../../components/ui/Toast';
import type { CertStatus, CertLog, IssueRequest, ImportRequest } from '../types';

export function useSsl() {
  const toast = useToast();

  // ── Core data ──────────────────────────────────────────────────────────────
  const [certs, setCerts]         = useState<CertStatus[]>([]);
  const [loading, setLoading]     = useState(true);
  const [autoRenew, setAutoRenew] = useState(false);

  // ── Issue / Renew modal ────────────────────────────────────────────────────
  const [modalOpen, setModalOpen]     = useState(false);
  const [modalMode, setModalMode]     = useState<'issue' | 'renew'>('issue');
  const [issueDomain, setIssueDomain] = useState('');
  const [useWildcard, setUseWildcard] = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [certLog, setCertLog]         = useState<CertLog | null>(null);
  const logPollRef                    = useRef<ReturnType<typeof setInterval> | null>(null);
  const logBoxRef                     = useRef<HTMLPreElement>(null);

  // ── Delete ─────────────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState('');
  const [deleting, setDeleting]         = useState(false);

  // ── Force HTTPS ────────────────────────────────────────────────────────────
  const [togglingHttps, setTogglingHttps] = useState<string | null>(null);

  // ── Import modal ───────────────────────────────────────────────────────────
  const [importDomain, setImportDomain] = useState('');
  const [importCert, setImportCert]     = useState('');
  const [importKey, setImportKey]       = useState('');
  const [importChain, setImportChain]   = useState('');
  const [importing, setImporting]       = useState(false);

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const [certsData, renewalData] = await Promise.all([
        apiGet<CertStatus[]>('ssl'),
        apiGet<{ enabled: boolean }>('ssl/renewal'),
      ]);
      setCerts(certsData);
      setAutoRenew(renewalData.enabled);
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to load SSL data');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Auto-poll table every 5s while any cert is pending
  useEffect(() => {
    if (!certs.some(c => c.status === 'pending')) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [certs, load]);

  // ── Log polling ────────────────────────────────────────────────────────────
  function stopLogPolling() {
    if (logPollRef.current) { clearInterval(logPollRef.current); logPollRef.current = null; }
  }

  function startLogPolling(domain: string) {
    stopLogPolling();
    const poll = async () => {
      try {
        const data = await apiGet<CertLog>(`ssl/${domain}/log`);
        setCertLog(data);
        if (logBoxRef.current) logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
        if (data.status === 'success') { stopLogPolling(); load(); }
        else if (data.status === 'error') { stopLogPolling(); }
      } catch { /* keep polling on transient network errors */ }
    };
    poll();
    logPollRef.current = setInterval(poll, 2000);
  }

  // ── Issue / Renew modal actions ────────────────────────────────────────────
  function openIssue(domain = '') {
    setCertLog(null); setIssueDomain(domain); setUseWildcard(false);
    setModalMode('issue'); setModalOpen(true);
  }

  function openRenew(domain: string) {
    setCertLog(null); setIssueDomain(domain); setUseWildcard(false);
    setModalMode('renew'); setModalOpen(true);
  }

  function closeModal() {
    stopLogPolling();
    setModalOpen(false);
    setIssueDomain('');
    setUseWildcard(false);
    setCertLog(null);
  }

  async function submitIssue() {
    if (!issueDomain.trim()) return;
    setSubmitting(true);
    try {
      const req: IssueRequest = { domain: issueDomain.trim(), wildcard: useWildcard };
      await apiPost('ssl/issue', req);
      setCertLog({ log: 'Certbot started — waiting for output…', status: 'running' });
      startLogPolling(issueDomain.trim());
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to issue certificate');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitRenew() {
    setSubmitting(true);
    try {
      await apiPost(`ssl/${issueDomain}/renew`, {});
      setCertLog({ log: 'Certbot renew started — waiting for output…', status: 'running' });
      startLogPolling(issueDomain);
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to renew certificate');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function revokeCert() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`ssl/${deleteTarget}`);
      toast.ok(`Certificate for ${deleteTarget} revoked`);
      setDeleteTarget('');
      load();
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to revoke certificate');
    } finally {
      setDeleting(false);
    }
  }

  // ── Force HTTPS ────────────────────────────────────────────────────────────
  async function toggleForceHttps(cert: CertStatus) {
    setTogglingHttps(cert.domain);
    try {
      await apiPut(`ssl/${cert.domain}/force-https`, { enabled: !cert.https_forced });
      setCerts(cs => cs.map(c =>
        c.domain === cert.domain ? { ...c, https_forced: !c.https_forced } : c
      ));
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to update Force HTTPS');
    } finally {
      setTogglingHttps(null);
    }
  }

  // ── Auto-renew ─────────────────────────────────────────────────────────────
  async function toggleAutoRenew() {
    try {
      await apiPut('ssl/renewal', { enabled: !autoRenew });
      setAutoRenew(v => !v);
      toast.ok(`Auto-renew ${!autoRenew ? 'enabled' : 'disabled'}`);
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to update auto-renew');
    }
  }

  // ── Import ─────────────────────────────────────────────────────────────────
  function openImport(domain: string) {
    setImportDomain(domain); setImportCert(''); setImportKey(''); setImportChain('');
  }

  function closeImport() {
    setImportDomain(''); setImportCert(''); setImportKey(''); setImportChain('');
  }

  async function submitImport() {
    setImporting(true);
    try {
      const req: ImportRequest = {
        cert_pem: importCert.trim(),
        key_pem: importKey.trim(),
        chain_pem: importChain.trim(),
      };
      await apiPost(`ssl/${importDomain}/import`, req);
      toast.ok(`Certificate for ${importDomain} imported`);
      closeImport();
      load();
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to import certificate');
    } finally {
      setImporting(false);
    }
  }

  return {
    // data
    certs, loading, autoRenew,
    // issue/renew modal
    modalOpen, modalMode, issueDomain, setIssueDomain,
    useWildcard, setUseWildcard,
    submitting, certLog, logBoxRef,
    openIssue, openRenew, closeModal, submitIssue, submitRenew,
    // delete
    deleteTarget, setDeleteTarget, deleting, revokeCert,
    // force https
    togglingHttps, toggleForceHttps,
    // auto-renew
    toggleAutoRenew,
    // import
    importDomain, importCert, setImportCert,
    importKey, setImportKey,
    importChain, setImportChain,
    importing,
    openImport, closeImport, submitImport,
  };
}
