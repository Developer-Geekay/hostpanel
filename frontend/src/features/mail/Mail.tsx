import { useState, useEffect, useCallback } from 'react';
import { Mail as MailIcon, Plus, Trash2, KeyRound, AlertTriangle, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { PageSpinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';
import { apiGet, apiPost, apiDelete } from '../../lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface MailAccount { email: string; domain: string; owner: string; quota_mb: number; created_at: string; }
interface MailAlias   { alias: string; target: string; domain: string; owner: string; created_at: string; }

type Tab = 'accounts' | 'forwarders';

// ── Helpers ────────────────────────────────────────────────────────────────────

function genPassword(len = 16): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%';
  return Array.from(crypto.getRandomValues(new Uint8Array(len)))
    .map(b => chars[b % chars.length]).join('');
}

// ── Tab bar ────────────────────────────────────────────────────────────────────

function TabBar({ tab, onChange }: { tab: Tab; onChange(t: Tab): void }) {
  const labels: Record<Tab, string> = { accounts: 'Accounts', forwarders: 'Forwarders' };
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {(['accounts', 'forwarders'] as Tab[]).map(t => (
        <button key={t} onClick={() => onChange(t)} style={{
          padding: '5px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          background: tab === t ? 'var(--accent-dim)' : 'transparent',
          color: tab === t ? 'var(--accent)' : 'var(--text-2)',
          cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-ui)', transition: 'all var(--transition)',
        }}>{labels[t]}</button>
      ))}
    </div>
  );
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

// ── Split email input ──────────────────────────────────────────────────────────

function EmailInput({
  username, domain, domains, onUsername, onDomain,
}: {
  username: string; domain: string; domains: string[];
  onUsername(v: string): void; onDomain(v: string): void;
}) {
  return (
    <div style={{
      display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
      overflow: 'hidden', background: 'var(--input-bg, var(--surface-2))',
    }}>
      <input
        value={username}
        onChange={e => onUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._+-]/g, ''))}
        placeholder="username"
        autoFocus
        style={{
          flex: 1, border: 'none', background: 'transparent', outline: 'none',
          padding: '7px 10px', fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-mono)',
          minWidth: 0,
        }}
      />
      <div style={{
        display: 'flex', alignItems: 'center',
        borderLeft: '1px solid var(--border)', background: 'var(--surface-3, var(--surface-2))',
        paddingLeft: 2,
      }}>
        <span style={{ fontSize: 13, color: 'var(--text-2)', padding: '0 4px 0 8px', userSelect: 'none' }}>@</span>
        <select
          value={domain}
          onChange={e => onDomain(e.target.value)}
          style={{
            border: 'none', background: 'transparent', outline: 'none',
            padding: '7px 10px 7px 2px', fontSize: 13, color: 'var(--text)',
            cursor: 'pointer', fontFamily: 'var(--font-mono)',
          }}
        >
          {domains.length === 0 && <option value="">No domains</option>}
          {domains.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
    </div>
  );
}

// ── Password input with show/hide + generate ───────────────────────────────────

function PasswordInput({ value, onChange }: { value: string; onChange(v: string): void }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{
      display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
      overflow: 'hidden', background: 'var(--input-bg, var(--surface-2))',
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
        padding: '0 8px', color: 'var(--text-2)', display: 'flex', alignItems: 'center',
        borderLeft: '1px solid var(--border)',
      }}>
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
      <button type="button" onClick={() => onChange(genPassword())} title="Generate password" style={{
        border: 'none', background: 'transparent', cursor: 'pointer',
        padding: '0 8px', color: 'var(--text-2)', display: 'flex', alignItems: 'center',
        borderLeft: '1px solid var(--border)', fontSize: 11, gap: 4,
        whiteSpace: 'nowrap',
      }}>
        <RefreshCw size={12} />
        Generate
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Mail() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('accounts');
  const [configured, setConfigured] = useState<boolean | null>(null);

  // DNS domains for dropdowns
  const [dnsDomains, setDnsDomains] = useState<string[]>([]);

  // accounts
  const [accounts,        setAccounts]        = useState<MailAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [addAccountOpen,  setAddAccountOpen]  = useState(false);
  const [accUsername,     setAccUsername]     = useState('');
  const [accDomain,       setAccDomain]       = useState('');
  const [accPassword,     setAccPassword]     = useState('');
  const [accQuota,        setAccQuota]        = useState(2048);
  const [showQuota,       setShowQuota]       = useState(false);
  const [savingAccount,   setSavingAccount]   = useState(false);
  const [deleteAccount,   setDeleteAccount]   = useState('');
  const [pwdTarget,       setPwdTarget]       = useState('');
  const [newPwd,          setNewPwd]          = useState('');
  const [savingPwd,       setSavingPwd]       = useState(false);

  // forwarders
  const [aliases,        setAliases]        = useState<MailAlias[]>([]);
  const [aliasesLoading, setAliasesLoading] = useState(false);
  const [addAliasOpen,   setAddAliasOpen]   = useState(false);
  const [aliasUsername,  setAliasUsername]  = useState('');
  const [aliasDomain,    setAliasDomain]    = useState('');
  const [aliasTarget,    setAliasTarget]    = useState('');
  const [savingAlias,    setSavingAlias]    = useState(false);
  const [deleteAlias,    setDeleteAlias]    = useState('');

  // ── Loaders ──────────────────────────────────────────────────────────────────

  const checkConfigured = useCallback(async () => {
    try {
      const r = await apiGet<{ configured: boolean }>('mail/configured');
      setConfigured(r.configured);
    } catch { setConfigured(false); }
  }, []);

const loadDnsDomains = useCallback(async () => {
    try {
      const r = await apiGet<{ domains: string[] }>('mail/available-domains');
      setDnsDomains(r.domains);
      if (r.domains.length && !accDomain) setAccDomain(r.domains[0]);
      if (r.domains.length && !aliasDomain) setAliasDomain(r.domains[0]);
    } catch { /* silent */ }
  }, [accDomain, aliasDomain]);

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try { setAccounts((await apiGet<{ accounts: MailAccount[] }>('mail/accounts')).accounts); }
    catch (e) { toast.err(e instanceof Error ? e.message : 'Failed to load accounts'); }
    finally { setAccountsLoading(false); }
  }, [toast]);

  const loadAliases = useCallback(async () => {
    setAliasesLoading(true);
    try { setAliases((await apiGet<{ aliases: MailAlias[] }>('mail/aliases')).aliases); }
    catch (e) { toast.err(e instanceof Error ? e.message : 'Failed to load aliases'); }
    finally { setAliasesLoading(false); }
  }, [toast]);

  useEffect(() => { checkConfigured(); loadDnsDomains(); }, [checkConfigured, loadDnsDomains]);
  useEffect(() => { if (tab === 'accounts')   loadAccounts(); }, [tab, loadAccounts]);
  useEffect(() => { if (tab === 'forwarders') loadAliases();  }, [tab, loadAliases]);

  // ── Setup ──────────────────────────────────────────────────────────────────────

  async function runSetup() {
    try {
      const r = await apiPost<{ ok: boolean; errors: string[] }>('mail/setup');
      if (r.ok) { toast.ok('Mail server configured'); setConfigured(true); }
      else       toast.err(r.errors.join('; ') || 'Setup had errors');
    } catch (e) { toast.err(e instanceof Error ? e.message : 'Setup failed'); }
  }

  // ── Open account modal ────────────────────────────────────────────────────────

  function openAddAccount() {
    setAccUsername(''); setAccPassword(''); setAccQuota(2048); setShowQuota(false);
    if (dnsDomains.length) setAccDomain(dnsDomains[0]);
    loadDnsDomains();
    setAddAccountOpen(true);
  }

  // ── Account actions ───────────────────────────────────────────────────────────

  async function addAccount() {
    if (!accUsername.trim()) return toast.err('Enter a username');
    if (!accDomain)          return toast.err('Select a domain');
    if (accPassword.length < 8) return toast.err('Password must be at least 8 characters');
    setSavingAccount(true);
    try {
      const email = `${accUsername.trim()}@${accDomain}`;
      await apiPost('mail/accounts', { email, password: accPassword, quota_mb: accQuota });
      toast.ok(`Account ${email} created`);
      setAddAccountOpen(false); loadAccounts();
    } catch (e) { toast.err(e instanceof Error ? e.message : 'Failed to create account'); }
    finally { setSavingAccount(false); }
  }

  async function confirmDeleteAccount() {
    try {
      await apiDelete(`mail/accounts/${encodeURIComponent(deleteAccount)}`);
      toast.ok(`Account ${deleteAccount} deleted`);
      setDeleteAccount(''); loadAccounts();
    } catch (e) { toast.err(e instanceof Error ? e.message : 'Failed to delete account'); }
  }

  async function changePassword() {
    setSavingPwd(true);
    try {
      await apiPost(`mail/accounts/${encodeURIComponent(pwdTarget)}/password`, { password: newPwd });
      toast.ok('Password updated'); setPwdTarget(''); setNewPwd('');
    } catch (e) { toast.err(e instanceof Error ? e.message : 'Failed to update password'); }
    finally { setSavingPwd(false); }
  }

  // ── Alias actions ─────────────────────────────────────────────────────────────

  function openAddAlias() {
    setAliasUsername(''); setAliasTarget('');
    if (dnsDomains.length) setAliasDomain(dnsDomains[0]);
    loadDnsDomains();
    setAddAliasOpen(true);
  }

  async function addAlias() {
    if (!aliasUsername.trim()) return toast.err('Enter an alias username');
    if (!aliasDomain)          return toast.err('Select a domain');
    if (!aliasTarget.trim())   return toast.err('Enter a target address');
    setSavingAlias(true);
    try {
      const alias = `${aliasUsername.trim()}@${aliasDomain}`;
      await apiPost('mail/aliases', { alias, target: aliasTarget.trim() });
      toast.ok(`Alias ${alias} created`);
      setAddAliasOpen(false); loadAliases();
    } catch (e) { toast.err(e instanceof Error ? e.message : 'Failed to create alias'); }
    finally { setSavingAlias(false); }
  }

  async function confirmDeleteAlias() {
    try {
      await apiDelete(`mail/aliases/${encodeURIComponent(deleteAlias)}`);
      toast.ok(`Alias ${deleteAlias} deleted`);
      setDeleteAlias(''); loadAliases();
    } catch (e) { toast.err(e instanceof Error ? e.message : 'Failed to delete alias'); }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const addBtn = (label: string, onClick: () => void) => (
    <Button variant="primary" size="sm" icon={<Plus size={13} strokeWidth={1.5} />} onClick={onClick}>{label}</Button>
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Mail</div>
          <div className="page-desc">Virtual mailboxes — Postfix + Dovecot</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TabBar tab={tab} onChange={setTab} />
          <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
          {tab === 'accounts'   && addBtn('Add Account',   openAddAccount)}
          {tab === 'forwarders' && addBtn('Add Forwarder', openAddAlias)}
        </div>
      </div>

      {configured === false && <SetupBanner onSetup={runSetup} />}

      {/* ── Accounts tab ── */}
      {tab === 'accounts' && (
        accountsLoading ? <PageSpinner /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Email</th><th>Domain</th><th>Quota</th><th>Added</th><th></th></tr>
              </thead>
              <tbody>
                {accounts.length === 0 && (
                  <tr><td colSpan={5}>
                    <div className="empty">
                      <MailIcon size={28} strokeWidth={1.5} className="empty-icon" />
                      <div className="empty-title">No mail accounts</div>
                      <div className="empty-desc">Click Add Account to create your first email address.</div>
                    </div>
                  </td></tr>
                )}
                {accounts.map(a => (
                  <tr key={a.email}>
                    <td className="mono" style={{ fontSize: 12 }}>{a.email}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{a.domain}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-2)' }}>{a.quota_mb} MB</td>
                    <td style={{ fontSize: 11, color: 'var(--text-2)' }}>{a.created_at.slice(0, 10)}</td>
                    <td style={{ display: 'flex', gap: 4 }}>
                      <Button variant="ghost" size="sm" icon={<KeyRound size={12} strokeWidth={1.5} />}
                        onClick={() => { setPwdTarget(a.email); setNewPwd(''); }} />
                      <Button variant="danger" size="sm" icon={<Trash2 size={12} strokeWidth={1.5} />}
                        onClick={() => setDeleteAccount(a.email)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── Forwarders tab ── */}
      {tab === 'forwarders' && (
        aliasesLoading ? <PageSpinner /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Alias</th><th>Target</th><th>Added</th><th></th></tr>
              </thead>
              <tbody>
                {aliases.length === 0 && (
                  <tr><td colSpan={4}>
                    <div className="empty">
                      <MailIcon size={28} strokeWidth={1.5} className="empty-icon" />
                      <div className="empty-title">No forwarders</div>
                      <div className="empty-desc">Create a forwarder to route email to another address.</div>
                    </div>
                  </td></tr>
                )}
                {aliases.map(a => (
                  <tr key={a.alias}>
                    <td className="mono" style={{ fontSize: 12 }}>{a.alias}</td>
                    <td className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>{a.target}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-2)' }}>{a.created_at.slice(0, 10)}</td>
                    <td>
                      <Button variant="danger" size="sm" icon={<Trash2 size={12} strokeWidth={1.5} />}
                        onClick={() => setDeleteAlias(a.alias)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── Create Account modal ── */}
      <Modal open={addAccountOpen} onClose={() => setAddAccountOpen(false)}
        title="Create Email Account" width={460}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => setAddAccountOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" loading={savingAccount} onClick={addAccount}>
              Create Account
            </Button>
          </div>
        }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Email address */}
          <div className="field">
            <label>Username</label>
            <EmailInput
              username={accUsername} domain={accDomain} domains={dnsDomains}
              onUsername={setAccUsername} onDomain={setAccDomain}
            />
            {accUsername && accDomain && (
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 4 }}>
                Full address: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                  {accUsername}@{accDomain}
                </span>
              </div>
            )}
          </div>

          {/* Password */}
          <div className="field">
            <label>Password</label>
            <PasswordInput value={accPassword} onChange={setAccPassword} />
          </div>

          {/* Optional: Quota */}
          <div>
            <button type="button" onClick={() => setShowQuota(s => !s)} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: 'var(--accent)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4,
            }}>
              {showQuota ? '▾' : '▸'} Optional settings
            </button>
            {showQuota && (
              <div className="field" style={{ marginTop: 10 }}>
                <label>Mailbox quota (MB)</label>
                <input type="number" value={accQuota}
                  onChange={e => setAccQuota(Number(e.target.value))}
                  min={1} max={102400} />
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* ── Delete Account modal ── */}
      <Modal open={!!deleteAccount} onClose={() => setDeleteAccount('')}
        title="Delete Mail Account" width={340}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => setDeleteAccount('')}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={confirmDeleteAccount}>Delete</Button>
          </div>
        }>
        <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
          Delete <strong style={{ color: 'var(--text)' }}>{deleteAccount}</strong>?
          Stored mail will remain on disk until manually removed.
        </p>
      </Modal>

      {/* ── Change Password modal ── */}
      <Modal open={!!pwdTarget} onClose={() => { if (!savingPwd) { setPwdTarget(''); setNewPwd(''); } }}
        title="Change Password" width={380}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => { setPwdTarget(''); setNewPwd(''); }} disabled={savingPwd}>Cancel</Button>
            <Button variant="primary" size="sm" loading={savingPwd} onClick={changePassword}>Update</Button>
          </div>
        }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
            {pwdTarget}
          </div>
          <div className="field">
            <label>New password</label>
            <PasswordInput value={newPwd} onChange={setNewPwd} />
          </div>
        </div>
      </Modal>

      {/* ── Create Forwarder modal ── */}
      <Modal open={addAliasOpen} onClose={() => setAddAliasOpen(false)}
        title="Create Forwarder" width={460}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => setAddAliasOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" loading={savingAlias} onClick={addAlias}>Create Forwarder</Button>
          </div>
        }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label>Forward from</label>
            <EmailInput
              username={aliasUsername} domain={aliasDomain} domains={dnsDomains}
              onUsername={setAliasUsername} onDomain={setAliasDomain}
            />
          </div>
          <div className="field">
            <label>Forward to</label>
            <input value={aliasTarget}
              onChange={e => setAliasTarget(e.target.value)}
              placeholder="user@example.com" />
          </div>
        </div>
      </Modal>

      {/* ── Delete Forwarder modal ── */}
      <Modal open={!!deleteAlias} onClose={() => setDeleteAlias('')}
        title="Delete Forwarder" width={340}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => setDeleteAlias('')}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={confirmDeleteAlias}>Delete</Button>
          </div>
        }>
        <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
          Delete forwarder <strong style={{ color: 'var(--text)' }}>{deleteAlias}</strong>?
        </p>
      </Modal>
    </div>
  );
}
