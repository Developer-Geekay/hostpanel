import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../../../lib/api';
import { useToast } from '../../../components/ui/Toast';
import type { HostUser, UserForm } from '../types';

const EMPTY_FORM: UserForm = { username: '', password: '', portal_password: '' };

export function useUsers() {
  const toast = useToast();
  const [users, setUsers] = useState<HostUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwUser, setPwUser] = useState('');
  const [newPw, setNewPw] = useState('');
  const [deleteTarget, setDeleteTarget] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      setUsers(await apiGet<HostUser[]>('users'));
    } catch (e: unknown) {
      toast.err(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function addUser() {
    if (!form.username.trim() || !form.password) return;
    setSaving(true);
    try {
      await apiPost('users', {
        username: form.username.trim(),
        password: form.password,
        portal_password: form.portal_password || undefined,
      });
      toast.ok(`User ${form.username} created`);
      setAddOpen(false);
      setForm(EMPTY_FORM);
      load();
    } catch (e: unknown) {
      toast.err(e instanceof Error ? e.message : 'Failed to create user');
    } finally {
      setSaving(false);
    }
  }

  async function changePw() {
    if (!newPw.trim()) return;
    setSaving(true);
    try {
      await apiPut(`users/${pwUser}/password`, { new_password: newPw });
      toast.ok('Password changed');
      setPwOpen(false);
      setNewPw('');
    } catch (e: unknown) {
      toast.err(e instanceof Error ? e.message : 'Failed to change password');
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`users/${deleteTarget}`);
      toast.ok(`${deleteTarget} deleted`);
      setDeleteTarget('');
      load();
    } catch (e: unknown) {
      toast.err(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  async function toggleSuspend(u: HostUser) {
    const suspend = u.status !== 'suspended';
    try {
      await apiPut(`users/${u.username}/suspend?suspend=${suspend}`);
      load();
    } catch (e: unknown) {
      toast.err(e instanceof Error ? e.message : 'Failed to update suspension');
    }
  }

  async function toggleFtp(u: HostUser) {
    try {
      if (u.ftp_enabled) {
        await apiDelete(`users/${u.username}/ftp`);
      } else {
        await apiPut(`users/${u.username}/ftp/enable`, { password: 'changeme' });
      }
      load();
    } catch (e: unknown) {
      toast.err(e instanceof Error ? e.message : 'Failed to update FTP access');
    }
  }

  function openPwModal(username: string) {
    setPwUser(username);
    setNewPw('');
    setPwOpen(true);
  }

  return {
    users, loading,
    addOpen, setAddOpen, form, setForm, saving,
    addUser,
    pwOpen, setPwOpen, pwUser, newPw, setNewPw, openPwModal,
    changePw,
    deleteTarget, setDeleteTarget, deleting,
    deleteUser, toggleSuspend, toggleFtp,
  };
}
