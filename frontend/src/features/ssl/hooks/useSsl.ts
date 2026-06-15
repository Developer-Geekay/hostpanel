import { useState, useEffect, useCallback, useRef } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../../../lib/api';
import { useToast } from '../../../components/ui/Toast';
import type { SslCert, CertLog } from '../types';

export function useSsl() {
  const toast = useToast();

  // ── Core data ──────────────────────────────────────────────────────────────
  const [certs, setCerts]         = useState<SslCert[]>([]);
  const [loading, setLoading]     = useState(true);
  const [autoRenew, setAutoRenew] = useState(false);

  // ── Cert domain modal (issue / edit domains) ───────────────────────────────
  const [certModalOpen, setCertModalOpen]   = useState(false);
  const [certModalMode, setCertModalMode]   = useState<'issue' | 'edit'>('issue');
  const [certModalRoot, setCertModalRoot]   = useState('');
  const [certModalIsNew, setCertModalIsNew] = useState(true);  // true = POST /issue, false = PUT /domains
  const [availableFqdns, setAvailableFqdns] = useState<string[]>([]);
  const [selectedFqdns, setSelectedFqdns]   = useState<string[]>([]);
  const [loadingFqdns, setLoadingFqdns]     = useState(false);
  const [submitting, setSubmitting]         = useState(false);
  const [certLog, setCertLog]               = useState<CertLog | null>(null);
  const logBoxRef                           = useRef<HTMLPreElement>(null);
  const logPollRef                          = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Renew / Delete ─────────────────────────────────────────────────────────
  const [renewTarget, setRenewTarget]   = useState<string | null>(null);
  const [renewing, setRenewing]         = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting]         = useState(false);

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const [certsData, renewalData] = await Promise.all([
        apiGet<SslCert[]>('ssl'),
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

  // Auto-poll every 5s while any cert is pending
  useEffect(() => {
    if (!certs.some(c => c.status === 'pending')) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [certs, load]);

  // ── Log polling ────────────────────────────────────────────────────────────
  function stopLogPolling() {
    if (logPollRef.current) { clearInterval(logPollRef.current); logPollRef.current = null; }
  }

  function startLogPolling(rootDomain: string) {
    stopLogPolling();
    const poll = async () => {
      try {
        const data = await apiGet<CertLog>(`ssl/${rootDomain}/log`);
        setCertLog(data);
        if (logBoxRef.current)
          logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
        if (data.status === 'success') { stopLogPolling(); load(); }
        else if (data.status === 'error') { stopLogPolling(); }
      } catch { /* keep polling on transient errors */ }
    };
    poll();
    logPollRef.current = setInterval(poll, 2000);
  }

  // ── Fetch available FQDNs ──────────────────────────────────────────────────
  async function fetchAvailableFqdns(rootDomain: string): Promise<string[]> {
    try {
      const data = await apiGet<{ root_domain: string; fqdns: string[] }>(
        `ssl/${rootDomain}/available-domains`
      );
      return data.fqdns;
    } catch {
      return [rootDomain];
    }
  }

  // ── Issue modal (no existing DB record) ───────────────────────────────────
  async function openIssue(rootDomain: string) {
    setCertModalRoot(rootDomain);
    setCertModalMode('issue');
    setCertModalIsNew(true);
    setCertLog(null);
    setLoadingFqdns(true);
    setCertModalOpen(true);

    const fqdns = await fetchAvailableFqdns(rootDomain);
    setAvailableFqdns(fqdns);
    setSelectedFqdns([...fqdns]); // pre-check all
    setLoadingFqdns(false);
  }

  // ── Edit domains modal (existing cert, any status) ─────────────────────────
  async function openEdit(cert: SslCert) {
    setCertModalRoot(cert.root_domain);
    setCertModalMode('edit');
    setCertModalIsNew(false);
    setCertLog(null);
    setLoadingFqdns(true);
    setCertModalOpen(true);

    const fqdns = await fetchAvailableFqdns(cert.root_domain);
    setAvailableFqdns(fqdns);
    // Pre-check currently in-cert domains; untracked ones default to checked
    const inCert = new Set(cert.domains.filter(d => d.in_cert).map(d => d.domain));
    setSelectedFqdns(fqdns.filter(f => inCert.size === 0 || inCert.has(f)));
    setLoadingFqdns(false);
  }

  function closeCertModal() {
    stopLogPolling();
    setCertModalOpen(false);
    setAvailableFqdns([]);
    setSelectedFqdns([]);
    setCertLog(null);
  }

  function toggleFqdn(fqdn: string) {
    setSelectedFqdns(prev =>
      prev.includes(fqdn) ? prev.filter(f => f !== fqdn) : [...prev, fqdn]
    );
  }

  function selectAllFqdns() { setSelectedFqdns([...availableFqdns]); }
  function deselectAllFqdns() { setSelectedFqdns([]); }

  async function submitCertModal() {
    if (!selectedFqdns.length) return;
    setSubmitting(true);
    try {
      if (certModalIsNew) {
        await apiPost('ssl/issue', { root_domain: certModalRoot, domains: selectedFqdns });
      } else {
        await apiPut(`ssl/${certModalRoot}/domains`, { domains: selectedFqdns });
      }
      setCertLog({ log: 'Certbot started — waiting for output…', status: 'running' });
      startLogPolling(certModalRoot);
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to start certbot');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Renew ──────────────────────────────────────────────────────────────────
  async function submitRenew() {
    if (!renewTarget) return;
    setRenewing(true);
    try {
      await apiPost(`ssl/${renewTarget}/renew`, {});
      toast.ok(`Renew started for ${renewTarget}`);
      setRenewTarget(null);
      load();
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to renew certificate');
    } finally {
      setRenewing(false);
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function submitDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`ssl/${deleteTarget}`);
      toast.ok(`Certificate for ${deleteTarget} deleted`);
      setDeleteTarget(null);
      load();
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to delete certificate');
    } finally {
      setDeleting(false);
    }
  }

  // ── Auto-renew timer ───────────────────────────────────────────────────────
  async function toggleAutoRenew() {
    try {
      await apiPut('ssl/renewal', { enabled: !autoRenew });
      setAutoRenew(v => !v);
      toast.ok(`Auto-renew ${!autoRenew ? 'enabled' : 'disabled'}`);
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to update auto-renew');
    }
  }

  return {
    // data
    certs, loading, autoRenew,
    // cert domain modal
    certModalOpen, certModalMode, certModalRoot,
    availableFqdns, selectedFqdns, loadingFqdns,
    submitting, certLog, logBoxRef,
    openIssue, openEdit, closeCertModal,
    toggleFqdn, selectAllFqdns, deselectAllFqdns, submitCertModal,
    // renew
    renewTarget, setRenewTarget, renewing, submitRenew,
    // delete
    deleteTarget, setDeleteTarget, deleting, submitDelete,
    // auto-renew
    toggleAutoRenew,
  };
}
