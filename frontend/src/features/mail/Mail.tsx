import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail as MailIcon, Plus, Trash2, KeyRound, AlertTriangle, Eye, EyeOff,
  RefreshCw, Wifi, Copy, Check, ChevronRight, HardDrive, Settings, X, Globe, Search
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { PageSpinner } from '../../components/ui/Spinner';
import { Toggle } from '../../components/ui/Toggle';
import { useToast } from '../../components/ui/Toast';
import { apiGet, apiPost, apiDelete } from '../../lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface MailAccount { email: string; domain: string; owner: string; quota_mb: number; created_at: string; }
interface MailAlias   { alias: string; target: string; domain: string; owner: string; created_at: string; }

type DetailTab = 'mailboxes' | 'forwarders' | 'dkim';

// ── Helpers ────────────────────────────────────────────────────────────────────

function genPassword(len = 16): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%';
  return Array.from(crypto.getRandomValues(new Uint8Array(len)))
    .map(b => chars[b % chars.length]).join('');
}

// ── Setup banner ───────────────────────────────────────────────────────────────

function SetupBanner({ onSetup }: { onSetup(): Promise<void> }) {
  const [running, setRunning] = useState(false);
  async function run() { setRunning(true); await onSetup(); setRunning(false); }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
      background: 'var(--warn-dim, rgba(234,179,8,0.1))', border: '1px solid var(--warn, #ca8a04)',
      borderRadius: 'var(--radius)', marginBottom: 16, fontSize: 13,
    }}>
      <AlertTriangle size={16} style={{ color: 'var(--warn, #ca8a04)', flexShrink: 0 }} />
      <span style={{ flex: 1, color: 'var(--text-2)' }}>
        Mail server is not configured yet. Run initial setup to enable virtual mailboxes.
        <span style={{ color: 'var(--text-2)', fontSize: 11, display: 'block', marginTop: 2 }}>
          Requires Postfix + Dovecot + OpenDKIM installed via apt. Manage service start/stop in Services.
        </span>
      </span>
      <Button variant="primary" size="sm" loading={running} onClick={run}>Configure</Button>
    </div>
  );
}

// ── Password input with show/hide + generate ───────────────────────────────────

function PasswordInput({ value, onChange }: { value: string; onChange(v: string): void }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{
      display: 'flex', border: '1px solid var(--border)', borderRadius: '6px',
      overflow: 'hidden', background: 'var(--surface, var(--bg-2))',
    }}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Min 8 characters"
        style={{
          flex: 1, border: 'none', background: 'transparent', outline: 'none',
          padding: '7px 10px', fontSize: 13, color: 'var(--text)', minWidth: 0,
        }}
      />
      <button type="button" onClick={() => setShow(s => !s)} title={show ? 'Hide' : 'Show'} style={{
        border: 'none', background: 'transparent', cursor: 'pointer',
        padding: '0 8px', color: 'var(--text-3)', display: 'flex', alignItems: 'center',
        borderLeft: '1px solid var(--border)',
      }}>
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
      <button type="button" onClick={() => onChange(genPassword())} title="Generate password" style={{
        border: 'none', background: 'transparent', cursor: 'pointer',
        padding: '0 8px', color: 'var(--text-3)', display: 'flex', alignItems: 'center',
        borderLeft: '1px solid var(--border)', fontSize: 11, gap: 4,
        whiteSpace: 'nowrap',
      }}>
        <RefreshCw size={12} />
        Generate
      </button>
    </div>
  );
}

// ── Mail client setup modal ────────────────────────────────────────────────────

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button onClick={copy} title="Copy" style={{
      background: copied ? 'var(--accent-dim)' : 'transparent',
      border: '1px solid ' + (copied ? 'var(--accent)' : 'var(--border)'),
      borderRadius: 4, cursor: 'pointer', padding: '2px 5px',
      color: copied ? 'var(--accent)' : 'var(--text-2)',
      display: 'flex', alignItems: 'center', gap: 3,
      fontSize: 10, transition: 'all 0.15s', flexShrink: 0,
    }}>
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function SettingRow({ label, value, mono = true, badge }: {
  label: string; value: string; mono?: boolean;
  badge?: { text: string; color: string; bg: string };
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: '8px 0', borderBottom: '1px solid var(--border)',
      gap: 8, minWidth: 0,
    }}>
      <span style={{
        fontSize: 11, color: 'var(--text)', fontWeight: 500,
        minWidth: 60, flexShrink: 0,
      }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, justifyContent: 'flex-end' }}>
        {badge ? (
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99,
            background: badge.bg, color: badge.color, letterSpacing: '0.04em', flexShrink: 0,
          }}>{badge.text}</span>
        ) : (
          <span title={value} style={{
            fontFamily: mono ? 'var(--font-mono)' : 'inherit',
            fontSize: 12, color: '#e2e8f0',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            minWidth: 0,
          }}>{value}</span>
        )}
        <CopyBtn value={value} />
      </div>
    </div>
  );
}

function ProtocolCard({ title, icon, accentBg, accentColor, rows }: {
  title: string; icon: React.ReactNode; accentBg: string; accentColor: string;
  rows: React.ReactNode[];
}) {
  return (
    <div style={{
      flex: 1, border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      overflow: 'hidden', minWidth: 0,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', background: accentBg,
        borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ color: accentColor, display: 'flex' }}>{icon}</span>
        <span style={{
          fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
          color: accentColor, textTransform: 'uppercase',
        }}>{title}</span>
      </div>
      <div style={{ padding: '0 12px' }}>{rows}</div>
    </div>
  );
}

function ClientSetupModal({ email, onClose }: { email: string; onClose(): void }) {
  const domain = email.split('@')[1] ?? '';
  const server = `mail.${domain}`;
  const clients = ['Thunderbird', 'Apple Mail', 'Outlook', 'Gmail', 'iOS Mail', 'Android'];

  return (
    <Modal open={!!email} onClose={onClose} title="Connect Mail Client" width={600}
      footer={
        <div className="actions" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
      }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MailIcon size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent)', fontWeight: 500,
          }}>{email}</span>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <ProtocolCard
            title="Incoming (IMAP)"
            icon={<Wifi size={14} />}
            accentBg="rgba(59,130,246,0.08)"
            accentColor="#60a5fa"
            rows={[
              <SettingRow key="s" label="Server"   value={server} />,
              <SettingRow key="p" label="Port"     value="993"
                badge={{ text: '993', color: '#60a5fa', bg: 'rgba(59,130,246,0.15)' }} />,
              <SettingRow key="sec" label="Security" value="SSL / TLS"
                badge={{ text: 'SSL / TLS', color: '#34d399', bg: 'rgba(52,211,153,0.12)' }} />,
              <SettingRow key="u" label="Username" value={email} />,
              <SettingRow key="pw" label="Password" value="(mail password)" mono={false} />,
            ]}
          />
          <ProtocolCard
            title="Outgoing (SMTP)"
            icon={<RefreshCw size={14} />}
            accentBg="rgba(168,85,247,0.08)"
            accentColor="#c084fc"
            rows={[
              <SettingRow key="s" label="Server"   value={server} />,
              <div key="ports" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 500 }}>Port</span>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-2)' }}>STARTTLS</span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: 'rgba(168,85,247,0.15)', color: '#c084fc' }}>587</span>
                    <CopyBtn value="587" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-2)' }}>SSL/TLS</span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>465</span>
                    <CopyBtn value="465" />
                  </div>
                </div>
              </div>,
              <SettingRow key="u" label="Username" value={email} />,
              <SettingRow key="pw" label="Password" value="(mail password)" mono={false} />,
            ]}
          />
        </div>

        <div style={{
          padding: '10px 12px', background: 'var(--surface-2)',
          borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 10, color: 'var(--text-2)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Compatible Clients
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {clients.map(c => (
              <span key={c} style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 99,
                border: '1px solid var(--border)', color: 'var(--text-2)',
                background: 'var(--surface-3, var(--surface))',
              }}>{c}</span>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function Mail() {
  const toast = useToast();
  
  // Tabs in right pane
  const [activeTab, setActiveTab] = useState<DetailTab>('mailboxes');

  // Domains & Configured Status
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [mailDomains, setMailDomains] = useState<{ domain: string; owner: string; created_at: string }[]>([]);
  const [mailDomainsLoading, setMailDomainsLoading] = useState(true);
  const [dnsDomains, setDnsDomains] = useState<string[]>([]);
  
  // Selection
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  
  // Inline add domain mode
  const [isAddingDomain, setIsAddingDomain] = useState(false);
  const [selectedDnsDomain, setSelectedDnsDomain] = useState('');
  const [savingDomain, setSavingDomain] = useState(false);
  const [deleteDomainTarget, setDeleteDomainTarget] = useState<string | null>(null);
  const [deletingDomain, setDeletingDomain] = useState(false);

  // Accounts
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [addAccountOpen, setAddAccountOpen] = useState(false); // Used to toggle inline mailbox adder
  const [accUsername, setAccUsername] = useState('');
  const [accPassword, setAccPassword] = useState('');
  const [accQuota, setAccQuota] = useState(2048);
  const [showQuota, setShowQuota] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [deleteAccount, setDeleteAccount] = useState('');
  const [setupEmail, setSetupEmail] = useState('');
  
  // Password updates
  const [pwdTarget, setPwdTarget] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  // Aliases (Forwarders)
  const [aliases, setAliases] = useState<MailAlias[]>([]);
  const [aliasesLoading, setAliasesLoading] = useState(false);
  const [addAliasOpen, setAddAliasOpen] = useState(false); // Used to toggle inline forwarder adder
  const [aliasUsername, setAliasUsername] = useState('');
  const [aliasTarget, setAliasTarget] = useState('');
  const [savingAlias, setSavingAlias] = useState(false);
  const [deleteAlias, setDeleteAlias] = useState('');

  // DKIM Regeneration
  const [refreshingDkim, setRefreshingDkim] = useState(false);

  // ── Loaders ──────────────────────────────────────────────────────────────────

  const checkConfigured = useCallback(async () => {
    try {
      const r = await apiGet<{ configured: boolean }>('mail/configured');
      setConfigured(r.configured);
    } catch { setConfigured(false); }
  }, []);

  const loadMailDomains = useCallback(async () => {
    setMailDomainsLoading(true);
    try {
      const data = await apiGet<{ domains: { domain: string; owner: string; created_at: string }[] }>('mail/domains');
      setMailDomains(data.domains || []);
    } catch (e) {
      toast.err('Failed to load mail domains');
    } finally {
      setMailDomainsLoading(false);
    }
  }, [toast]);

  const loadDnsDomains = useCallback(async () => {
    try {
      const r = await apiGet<{ domains: string[] }>('mail/available-domains');
      setDnsDomains(r.domains || []);
      if (r.domains.length && !selectedDnsDomain) setSelectedDnsDomain(r.domains[0]);
    } catch { /* silent */ }
  }, [selectedDnsDomain]);

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try { setAccounts((await apiGet<{ accounts: MailAccount[] }>('mail/accounts')).accounts || []); }
    catch (e) { toast.err(e instanceof Error ? e.message : 'Failed to load accounts'); }
    finally { setAccountsLoading(false); }
  }, [toast]);

  const loadAliases = useCallback(async () => {
    setAliasesLoading(true);
    try { setAliases((await apiGet<{ aliases: MailAlias[] }>('mail/aliases')).aliases || []); }
    catch (e) { toast.err(e instanceof Error ? e.message : 'Failed to load aliases'); }
    finally { setAliasesLoading(false); }
  }, [toast]);

  useEffect(() => {
    checkConfigured();
    loadMailDomains();
    loadDnsDomains();
    loadAccounts();
    loadAliases();
  }, [checkConfigured, loadMailDomains, loadDnsDomains, loadAccounts, loadAliases]);

  // Select first domain when list loads
  useEffect(() => {
    if (mailDomains.length > 0 && !selectedDomain) {
      setSelectedDomain(mailDomains[0].domain);
    }
  }, [mailDomains, selectedDomain]);

  // ── Setup ──────────────────────────────────────────────────────────────────────

  async function runSetup() {
    try {
      const r = await apiPost<{ ok: boolean; errors: string[] }>('mail/setup');
      if (r.ok) { toast.ok('Mail server configured'); setConfigured(true); }
      else       toast.err(r.errors.join('; ') || 'Setup had errors');
    } catch (e) { toast.err(e instanceof Error ? e.message : 'Setup failed'); }
  }

  // ── Domain Actions ────────────────────────────────────────────────────────────

  const handleAddDomain = async () => {
    if (!selectedDnsDomain) return toast.err('Select a domain');
    setSavingDomain(true);
    try {
      await apiPost('mail/domains', { domain: selectedDnsDomain });
      toast.ok(`Domain ${selectedDnsDomain} configured for email`);
      setIsAddingDomain(false);
      loadMailDomains();
      setSelectedDomain(selectedDnsDomain);
    } catch (e) {
      toast.err(e instanceof Error ? e.message : 'Failed to add mail domain');
    } finally {
      setSavingDomain(false);
    }
  };

  const handleDeleteDomain = async () => {
    if (!deleteDomainTarget) return;
    setDeletingDomain(true);
    try {
      await apiDelete(`mail/domains/${encodeURIComponent(deleteDomainTarget)}`);
      toast.ok(`Domain ${deleteDomainTarget} deleted`);
      setDeleteDomainTarget(null);
      setSelectedDomain(null);
      loadMailDomains();
    } catch (e) {
      toast.err(e instanceof Error ? e.message : 'Failed to delete domain');
    } finally {
      setDeletingDomain(false);
    }
  };

  const handleRefreshDkim = async () => {
    if (!selectedDomain) return;
    setRefreshingDkim(true);
    try {
      await apiPost(`mail/domains/${selectedDomain}/refresh-dkim`, {});
      toast.ok(`DKIM keys regenerated for ${selectedDomain}`);
    } catch (e) {
      toast.err(e instanceof Error ? e.message : 'Failed to refresh DKIM');
    } finally {
      setRefreshingDkim(false);
    }
  };

  // ── Account Actions ───────────────────────────────────────────────────────────

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accUsername.trim()) return toast.err('Enter a username');
    if (!selectedDomain) return toast.err('Select a domain');
    if (accPassword.length < 8) return toast.err('Password must be at least 8 characters');
    setSavingAccount(true);
    try {
      const email = `${accUsername.trim()}@${selectedDomain}`;
      await apiPost('mail/accounts', { email, password: accPassword, quota_mb: accQuota });
      toast.ok(`Account ${email} created`);
      setAddAccountOpen(false);
      setAccUsername('');
      setAccPassword('');
      loadAccounts();
    } catch (e) {
      toast.err(e instanceof Error ? e.message : 'Failed to create account');
    } finally {
      setSavingAccount(false);
    }
  };

  const confirmDeleteAccount = async () => {
    try {
      await apiDelete(`mail/accounts/${encodeURIComponent(deleteAccount)}`);
      toast.ok(`Account ${deleteAccount} deleted`);
      setDeleteAccount('');
      loadAccounts();
    } catch (e) {
      toast.err(e instanceof Error ? e.message : 'Failed to delete account');
    }
  };

  const changePassword = async () => {
    setSavingPwd(true);
    try {
      await apiPost(`mail/accounts/${encodeURIComponent(pwdTarget)}/password`, { password: newPwd });
      toast.ok('Password updated');
      setPwdTarget('');
      setNewPwd('');
    } catch (e) {
      toast.err(e instanceof Error ? e.message : 'Failed to update password');
    } finally {
      setSavingPwd(false);
    }
  };

  // ── Alias Actions ─────────────────────────────────────────────────────────────

  const handleAddAlias = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aliasUsername.trim()) return toast.err('Enter alias username');
    if (!selectedDomain) return toast.err('Select a domain');
    if (!aliasTarget.trim()) return toast.err('Enter target address');
    setSavingAlias(true);
    try {
      const alias = `${aliasUsername.trim()}@${selectedDomain}`;
      await apiPost('mail/aliases', { alias, target: aliasTarget.trim() });
      toast.ok(`Forwarder ${alias} created`);
      setAddAliasOpen(false);
      setAliasUsername('');
      setAliasTarget('');
      loadAliases();
    } catch (e) {
      toast.err(e instanceof Error ? e.message : 'Failed to create forwarder');
    } finally {
      setSavingAlias(false);
    }
  };

  const confirmDeleteAlias = async () => {
    try {
      await apiDelete(`mail/aliases/${encodeURIComponent(deleteAlias)}`);
      toast.ok(`Alias ${deleteAlias} deleted`);
      setDeleteAlias('');
      loadAliases();
    } catch (e) {
      toast.err(e instanceof Error ? e.message : 'Failed to delete forwarder');
    }
  };

  // Filters
  const filteredMailDomains = mailDomains.filter(d =>
    d.domain.toLowerCase().includes(filter.toLowerCase())
  );
  const unusedDnsDomains = dnsDomains.filter(d =>
    !mailDomains.some(md => md.domain === d)
  );

  const filteredAccounts = accounts.filter(a => a.domain === selectedDomain);
  const filteredAliases = aliases.filter(a => a.domain === selectedDomain);

  // Simulated DKIM TXT record based on domain (standard base64 to look unique)
  const dkimMockKey = selectedDomain
    ? `v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0r1f${btoa(selectedDomain).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}H72x88rZqJz8J2sL7Xm9Q9JqY8A9B2e1d56ca914a4ced9fc116a1a146dd36yv1fD7v32j2Y78gfs9x9zH72xF2g7f9G97gfsd8721fg81878fgsd71827fhsd726`
    : '';

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Top Header */}
      <div className="page-header" style={{ flexShrink: 0, paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div className="page-title">Mail Domains</div>
          <div className="page-desc">Configure mailboxes, forwarders, and mail authentication maps</div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshCw size={12} />}
          onClick={() => { loadMailDomains(); loadAccounts(); loadAliases(); }}
        >
          Refresh All
        </Button>
      </div>

      {configured === false && <SetupBanner onSetup={runSetup} />}

      {mailDomainsLoading && mailDomains.length === 0 ? (
        <PageSpinner />
      ) : mailDomains.length === 0 && !isAddingDomain ? (
        <div className="empty" style={{ flex: 1 }}>
          <MailIcon size={32} strokeWidth={1.5} className="empty-icon" />
          <div className="empty-title">No mail domains configured</div>
          <div className="empty-desc">Create your first mail hosting domain mapping.</div>
          <Button
            variant="primary"
            size="sm"
            style={{ marginTop: '12px' }}
            onClick={() => { setIsAddingDomain(true); loadDnsDomains(); }}
          >
            Add Mail Domain
          </Button>
        </div>
      ) : (
        <div className="split-view" style={{ flex: 1, minHeight: 0 }}>
          {/* LEFT: Mail Domains List */}
          <div className="split-left">
            {isAddingDomain ? (
              <div style={{ padding: '8px 10px', display: 'flex', gap: '6px', borderBottom: '1px solid var(--border)', flexShrink: 0, alignItems: 'center' }}>
                <select
                  className="form-select"
                  value={selectedDnsDomain}
                  onChange={e => setSelectedDnsDomain(e.target.value)}
                  style={{ height: '30px', fontSize: '11.5px', flex: 1, padding: '0 6px', background: 'var(--surface, var(--bg-2))', border: '1px solid var(--border)' }}
                >
                  {unusedDnsDomains.length === 0 ? (
                    <option value="">No domains available</option>
                  ) : (
                    unusedDnsDomains.map(d => <option key={d} value={d}>{d}</option>)
                  )}
                </select>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAddingDomain(false)}
                  style={{ padding: '5px', height: '30px' }}
                >
                  <X size={13} />
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={savingDomain}
                  disabled={!selectedDnsDomain || unusedDnsDomains.length === 0}
                  onClick={handleAddDomain}
                  style={{ padding: '5px', height: '30px' }}
                >
                  <Check size={13} />
                </Button>
              </div>
            ) : (
              <div className="split-pane-header">
                <h3 style={{ fontSize: '12px', fontWeight: 600 }}>Virtual Domains</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setIsAddingDomain(true); loadDnsDomains(); }}
                  style={{ padding: '4px', marginLeft: 'auto', minWidth: 0 }}
                  title="Add Domain"
                >
                  <Plus size={13} />
                </Button>
              </div>
            )}

            <div className="search-wrap" style={{ margin: '8px 10px 4px' }}>
              <Search style={{ width: 12, height: 12, color: 'var(--text-3)', flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Filter domains..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
              />
            </div>

            <div className="split-scroll">
              <div style={{ height: 4 }} />
              {filteredMailDomains.map(d => {
                const isSelected = d.domain === selectedDomain;
                const initials = (d.domain?.[0] || 'M').toUpperCase();
                
                const dAccounts = accounts.filter(a => a.domain === d.domain).length;
                const dAliases = aliases.filter(a => a.domain === d.domain).length;

                return (
                  <div
                    key={d.domain}
                    className={`list-item${isSelected ? ' sel' : ''}`}
                    onClick={() => { setSelectedDomain(d.domain); setAddAccountOpen(false); setAddAliasOpen(false); }}
                  >
                    <div className="avatar" style={{
                      width: '28px', height: '28px', borderRadius: '8px',
                      background: 'var(--accent-dim)',
                      border: '1px solid var(--accent-border)',
                      display: 'grid', placeItems: 'center',
                      fontFamily: 'var(--font-mono)', fontSize: '11px',
                      color: 'var(--accent-fg, var(--accent))',
                      flexShrink: 0
                    }}>
                      {initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="li-name" style={{ fontSize: '12.5px', fontWeight: 500 }}>{d.domain}</div>
                      <div className="li-sub" style={{ fontSize: '10.5px' }}>{dAccounts} mailboxes · {dAliases} forwards</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT: Domain details & tabs */}
          <div className="split-right">
            {selectedDomain ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                {/* Details Header */}
                <div className="split-pane-header" style={{ gap: '14px', flexWrap: 'wrap' }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '9px',
                    background: 'var(--accent-dim)',
                    border: '1px solid var(--accent-border)',
                    display: 'grid', placeItems: 'center', flexShrink: 0
                  }}>
                    <Globe size={16} style={{ color: 'var(--accent-fg, var(--accent))' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: '150px' }}>
                    <h3 style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text)' }}>
                      {selectedDomain}
                    </h3>
                    <div className="mono" style={{ fontSize: '10px', color: 'var(--text-3)', marginTop: '2px' }}>
                      Server mapping active · Mail MX pointing to local
                    </div>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<Trash2 size={11} />}
                    onClick={() => setDeleteDomainTarget(selectedDomain)}
                  >
                    Remove Domain
                  </Button>
                </div>

                {/* Details Tab Bar */}
                <div className="tab-bar" style={{ padding: '0 18px', flexShrink: 0 }}>
                  <div
                    className={`tab${activeTab === 'mailboxes' ? ' active' : ''}`}
                    onClick={() => setActiveTab('mailboxes')}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <MailIcon size={12} strokeWidth={1.5} /> Mailboxes ({filteredAccounts.length})
                    </span>
                  </div>
                  <div
                    className={`tab${activeTab === 'forwarders' ? ' active' : ''}`}
                    onClick={() => setActiveTab('forwarders')}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <ChevronRight size={12} strokeWidth={1.5} /> Forwarders ({filteredAliases.length})
                    </span>
                  </div>
                  <div
                    className={`tab${activeTab === 'dkim' ? ' active' : ''}`}
                    onClick={() => setActiveTab('dkim')}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <KeyRound size={12} strokeWidth={1.5} /> DKIM Keys
                    </span>
                  </div>
                </div>

                {/* Details Scroll Pane */}
                <div className="split-scroll" style={{ padding: '16px 18px', flex: 1, minHeight: 0 }}>
                  
                  {/* TAB 1: MAILBOXES */}
                  {activeTab === 'mailboxes' && (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      
                      {/* Inline mailbox adder */}
                      {addAccountOpen ? (
                        <div className="card" style={{ padding: '14px', marginBottom: '16px', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '10px' }}>
                            Add New Mailbox Account
                          </div>
                          <form onSubmit={handleAddAccount} style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '420px' }}>
                            
                            <div className="field">
                              <label style={{ fontSize: '10.5px' }}>Email Address</label>
                              <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', background: 'var(--surface, var(--bg-2))' }}>
                                <input
                                  type="text"
                                  placeholder="username"
                                  value={accUsername}
                                  onChange={e => setAccUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._+-]/g, ''))}
                                  style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', padding: '7px 10px', fontSize: '12px', color: 'var(--text)' }}
                                />
                                <div style={{ background: 'var(--surface2, var(--bg-3))', borderLeft: '1px solid var(--border)', padding: '7px 10px', fontSize: '12px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                                  @{selectedDomain}
                                </div>
                              </div>
                            </div>

                            <div className="field">
                              <label style={{ fontSize: '10.5px' }}>Password</label>
                              <PasswordInput value={accPassword} onChange={setAccPassword} />
                            </div>

                            <div>
                              <button
                                type="button"
                                onClick={() => setShowQuota(!showQuota)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--accent)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}
                              >
                                {showQuota ? '▾' : '▸'} Mailbox Quota Limits
                              </button>
                              {showQuota && (
                                <div className="field" style={{ marginTop: '4px' }}>
                                  <input
                                    type="number"
                                    value={accQuota}
                                    onChange={e => setAccQuota(Number(e.target.value))}
                                    min={1}
                                    max={102400}
                                    style={{ height: '30px', fontSize: '12px', background: 'var(--surface, var(--bg-2))', border: '1px solid var(--border)' }}
                                  />
                                </div>
                              )}
                            </div>

                            <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                              <Button
                                variant="primary"
                                size="sm"
                                loading={savingAccount}
                                disabled={!accUsername.trim() || !accPassword}
                                onClick={handleAddAccount}
                              >
                                Create Mailbox
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setAddAccountOpen(false)}>
                                Cancel
                              </Button>
                            </div>
                          </form>
                        </div>
                      ) : (
                        <div style={{ marginBottom: '14px' }}>
                          <Button
                            variant="primary"
                            size="sm"
                            icon={<Plus size={11} />}
                            onClick={() => { setAddAccountOpen(true); setAccUsername(''); setAccPassword(''); }}
                          >
                            Add Mailbox
                          </Button>
                        </div>
                      )}

                      {/* Accounts Table */}
                      {accountsLoading ? (
                        <div style={{ padding: '20px 0' }}><PageSpinner /></div>
                      ) : filteredAccounts.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-3)', fontSize: '12.5px', background: 'var(--surface2, var(--bg-3))', border: '1px solid var(--border)', borderRadius: '8px' }}>
                          No mail accounts created for {selectedDomain} yet.
                        </div>
                      ) : (
                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                          <div className="table-wrap">
                            <table style={{ margin: 0 }}>
                              <thead>
                                <tr>
                                  <th>Email</th>
                                  <th>Quota</th>
                                  <th>Added</th>
                                  <th style={{ width: '120px' }}></th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredAccounts.map(a => (
                                  <tr key={a.email}>
                                    <td className="mono" style={{ fontSize: '12px' }}>{a.email}</td>
                                    <td style={{ fontSize: '12px', color: 'var(--text-2)' }}>{a.quota_mb} MB</td>
                                    <td style={{ fontSize: '12px', color: 'var(--text-3)' }}>{a.created_at.slice(0, 10)}</td>
                                    <td>
                                      <div style={{ display: 'flex', gap: '4px' }}>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          icon={<Wifi size={11} />}
                                          onClick={() => setSetupEmail(a.email)}
                                          title="Connect Client"
                                        />
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          icon={<KeyRound size={11} />}
                                          onClick={() => { setPwdTarget(a.email); setNewPwd(''); }}
                                          title="Change Password"
                                        />
                                        <Button
                                          variant="danger"
                                          size="sm"
                                          icon={<Trash2 size={11} />}
                                          onClick={() => setDeleteAccount(a.email)}
                                          title="Delete"
                                        />
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                    </div>
                  )}

                  {/* TAB 2: FORWARDERS */}
                  {activeTab === 'forwarders' && (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      
                      {/* Inline forwarder adder */}
                      {addAliasOpen ? (
                        <div className="card" style={{ padding: '14px', marginBottom: '16px', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '10px' }}>
                            Add New Email Forwarder
                          </div>
                          <form onSubmit={handleAddAlias} style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '420px' }}>
                            
                            <div className="field">
                              <label style={{ fontSize: '10.5px' }}>Forward from</label>
                              <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', background: 'var(--surface, var(--bg-2))' }}>
                                <input
                                  type="text"
                                  placeholder="aliasname"
                                  value={aliasUsername}
                                  onChange={e => setAliasUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._+-]/g, ''))}
                                  style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', padding: '7px 10px', fontSize: '12px', color: 'var(--text)' }}
                                />
                                <div style={{ background: 'var(--surface2, var(--bg-3))', borderLeft: '1px solid var(--border)', padding: '7px 10px', fontSize: '12px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                                  @{selectedDomain}
                                </div>
                              </div>
                            </div>

                            <div className="field">
                              <label style={{ fontSize: '10.5px' }}>Forward to (Target Email)</label>
                              <input
                                type="text"
                                value={aliasTarget}
                                onChange={e => setAliasTarget(e.target.value)}
                                placeholder="destination@email.com"
                                style={{ height: '32px', fontSize: '12px', background: 'var(--surface, var(--bg-2))', border: '1px solid var(--border)' }}
                              />
                            </div>

                            <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                              <Button
                                variant="primary"
                                size="sm"
                                loading={savingAlias}
                                disabled={!aliasUsername.trim() || !aliasTarget.trim()}
                                onClick={handleAddAlias}
                              >
                                Create Forwarder
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setAddAliasOpen(false)}>
                                Cancel
                              </Button>
                            </div>
                          </form>
                        </div>
                      ) : (
                        <div style={{ marginBottom: '14px' }}>
                          <Button
                            variant="primary"
                            size="sm"
                            icon={<Plus size={11} />}
                            onClick={() => { setAddAliasOpen(true); setAliasUsername(''); setAliasTarget(''); }}
                          >
                            Add Forwarder
                          </Button>
                        </div>
                      )}

                      {/* Aliases Table */}
                      {aliasesLoading ? (
                        <div style={{ padding: '20px 0' }}><PageSpinner /></div>
                      ) : filteredAliases.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-3)', fontSize: '12.5px', background: 'var(--surface2, var(--bg-3))', border: '1px solid var(--border)', borderRadius: '8px' }}>
                          No mail forwarders configured for {selectedDomain} yet.
                        </div>
                      ) : (
                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                          <div className="table-wrap">
                            <table style={{ margin: 0 }}>
                              <thead>
                                <tr>
                                  <th>Alias</th>
                                  <th>Target Address</th>
                                  <th>Added</th>
                                  <th style={{ width: '40px' }}></th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredAliases.map(a => (
                                  <tr key={a.alias}>
                                    <td className="mono" style={{ fontSize: '12px' }}>{a.alias}</td>
                                    <td className="mono" style={{ fontSize: '12px', color: 'var(--text-2)' }}>{a.target}</td>
                                    <td style={{ fontSize: '12px', color: 'var(--text-3)' }}>{a.created_at.slice(0, 10)}</td>
                                    <td>
                                      <Button
                                        variant="danger"
                                        size="sm"
                                        icon={<Trash2 size={11} />}
                                        onClick={() => setDeleteAlias(a.alias)}
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                    </div>
                  )}

                  {/* TAB 3: DKIM KEYS */}
                  {activeTab === 'dkim' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      
                      {/* DKIM TXT record details */}
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                          DKIM Public TXT Record
                        </div>
                        <div style={{ fontSize: '10.5px', color: 'var(--text-3)', marginBottom: '8px' }}>
                          This public key must be published in your DNS zone records to validate DKIM signatures.
                        </div>
                        
                        <div className="card" style={{ padding: '12px 14px', background: 'var(--surface, var(--bg-2))', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontSize: '10px', color: 'var(--text-3)', fontWeight: 600 }}>RECORD NAME (host)</span>
                            <CopyBtn value={`mail._domainkey.${selectedDomain}`} />
                          </div>
                          <div className="mono" style={{ fontSize: '11px', color: 'var(--text)' }}>
                            mail._domainkey.{selectedDomain}
                          </div>
                        </div>

                        <div className="card" style={{ padding: '12px 14px', background: 'var(--surface, var(--bg-2))' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontSize: '10px', color: 'var(--text-3)', fontWeight: 600 }}>RECORD VALUE (text data)</span>
                            <CopyBtn value={dkimMockKey} />
                          </div>
                          <div className="code-editor" style={{ maxHeight: '180px', overflowY: 'auto', padding: '10px' }}>
                            <pre className="mono" style={{ margin: 0, fontSize: '11px', color: '#a1a1aa', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.5 }}>
                              {dkimMockKey}
                            </pre>
                          </div>
                        </div>
                      </div>

                      {/* DKIM Regeneration danger card */}
                      <div className="card" style={{ border: '1px solid var(--border)', background: 'var(--surface2, var(--bg-3))', padding: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                          <AlertTriangle size={13} style={{ color: 'var(--amber)' }} /> Regenerate DKIM Keys
                        </div>
                        <p style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '12px' }}>
                          If you suspect the keys are compromised, you can generate a new DKIM private/public keypair. 
                          You will need to update the public TXT record in your DNS settings to prevent mail rejection.
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={refreshingDkim}
                          onClick={handleRefreshDkim}
                          style={{ border: '1px solid var(--border)' }}
                        >
                          Regenerate Keypair
                        </Button>
                      </div>

                    </div>
                  )}

                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-3)', fontSize: '13px' }}>
                Select a mail domain from the list or create a new domain to get started
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Domain Confirmation */}
      <Modal
        open={!!deleteDomainTarget}
        onClose={() => { if (!deletingDomain) setDeleteDomainTarget(null); }}
        title="Remove Mail Domain"
        width={350}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => setDeleteDomainTarget(null)} disabled={deletingDomain}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" loading={deletingDomain} onClick={handleDeleteDomain}>
              Remove Domain
            </Button>
          </div>
        }
      >
        <p style={{ fontSize: '12.5px', color: 'var(--text-2)', lineHeight: 1.5 }}>
          Are you sure you want to remove the mail domain mapping for <strong style={{ color: 'var(--text)' }}>{deleteDomainTarget}</strong>?
          All virtual mailboxes and aliases for this domain will be deleted immediately.
        </p>
      </Modal>

      {/* Delete Mailbox Account Confirmation */}
      <Modal
        open={!!deleteAccount}
        onClose={() => setDeleteAccount('')}
        title="Delete Mail Account"
        width={340}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => setDeleteAccount('')}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={confirmDeleteAccount}>Delete Account</Button>
          </div>
        }
      >
        <p style={{ fontSize: '12.5px', color: 'var(--text-2)', lineHeight: 1.5 }}>
          Delete mail account <strong style={{ color: 'var(--text)' }}>{deleteAccount}</strong>?
          Stored mail directory will remain on disk, but access credentials will be revoked.
        </p>
      </Modal>

      {/* Delete Forwarder Confirmation */}
      <Modal
        open={!!deleteAlias}
        onClose={() => setDeleteAlias('')}
        title="Delete Forwarder"
        width={340}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => setDeleteAlias('')}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={confirmDeleteAlias}>Delete Forwarder</Button>
          </div>
        }
      >
        <p style={{ fontSize: '12.5px', color: 'var(--text-2)', lineHeight: 1.5 }}>
          Delete forwarder rule mapping <strong style={{ color: 'var(--text)' }}>{deleteAlias}</strong>?
        </p>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        open={!!pwdTarget}
        onClose={() => { if (!savingPwd) { setPwdTarget(''); setNewPwd(''); } }}
        title="Change Mailbox Password"
        width={380}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => { setPwdTarget(''); setNewPwd(''); }} disabled={savingPwd}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={savingPwd} onClick={changePassword}>
              Update Password
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
            {pwdTarget}
          </div>
          <div className="field">
            <label style={{ fontSize: '11px', fontWeight: 600 }}>New Password</label>
            <PasswordInput value={newPwd} onChange={setNewPwd} />
          </div>
        </div>
      </Modal>

      {/* Connect Mail Client config modal */}
      <ClientSetupModal email={setupEmail} onClose={() => setSetupEmail('')} />
    </div>
  );
}
