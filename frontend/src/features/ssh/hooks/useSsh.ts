import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiDelete } from '../../../lib/api';
import { useToast } from '../../../components/ui/Toast';
import type { SshKey } from '../types';

export function useSsh() {
  const toast = useToast();
  const [keys, setKeys]         = useState<SshKey[]>([]);
  const [loading, setLoading]   = useState(true);
  const [addOpen, setAddOpen]   = useState(false);
  const [keyText, setKeyText]   = useState('');
  const [label, setLabel]       = useState('');
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      const data = await apiGet<SshKey[]>('ssh/keys');
      setKeys(data);
    } catch (e: unknown) {
      toast.err(e instanceof Error ? e.message : 'Failed to load SSH keys');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  function openAdd() { setKeyText(''); setLabel(''); setAddOpen(true); }
  function closeAdd() { setAddOpen(false); }

  async function addKey() {
    if (!keyText.trim()) return;
    setSaving(true);
    try {
      await apiPost('ssh/keys', { public_key: keyText.trim(), label: label.trim() });
      toast.ok('SSH key added');
      setAddOpen(false);
      await fetchKeys();
    } catch (e: unknown) {
      toast.err(e instanceof Error ? e.message : 'Failed to add key');
    } finally {
      setSaving(false);
    }
  }

  async function deleteKey(id: string) {
    setDeleting(id);
    try {
      await apiDelete(`ssh/keys/${encodeURIComponent(id)}`);
      toast.ok('Key removed');
      await fetchKeys();
    } catch (e: unknown) {
      toast.err(e instanceof Error ? e.message : 'Failed to remove key');
    } finally {
      setDeleting(null);
    }
  }

  function copyFingerprint(fp: string) {
    navigator.clipboard.writeText(fp);
    toast.ok('Fingerprint copied');
  }

  return {
    keys, loading, addOpen, keyText, setKeyText, label, setLabel,
    saving, deleting, openAdd, closeAdd, addKey, deleteKey, copyFingerprint,
  };
}
