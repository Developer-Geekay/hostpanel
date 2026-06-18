import { useState, useEffect, useCallback } from 'react';
import { Mail as MailIcon, Plus, Trash2, RefreshCw, KeyRound, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { PageSpinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';
import { apiGet, apiPost, apiDelete } from '../../lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface MailStatus { postfix: boolean; dovecot: boolean; }
interface MailDomain { domain: string; owner: string; created_at: string; }
interface MailAccount { email: string; domain: string; owner: string; quota_mb: number; created_at: string; }
interface MailAlias   { alias: string; target: string; domain: string; owner: string; created_at: string; }

type Tab = 'server' | 'domains' | 'accounts' | 'aliases';

// ── Small tab bar ──────────────────────────────────────────────────────────────

function TabBar({ tab, onChange }: { tab: Tab; onChange(t: Tab): void }) {
  const tabs: { key: Tab; label: string }[] = [
    { key: 'server',   label: 'Server' },
    { key: 'domains',  label: 'Domains' },
    { key: 'accounts', label: 'Accounts' },
    { key: 'aliases',  label: 'Aliases' },
  ];
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          padding: '5px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          background: tab === t.key ? 'var(--accent-dim)' : 'transparent',
          color: tab === t.key ? 'var(--accent)' : 'var(--text-2)',
          cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-ui)', transition: 'all var(--transition)',
        }}>{t.label}</button>
      ))}
    </div>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────────

function SvcBadge({ running, label }: { running: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
      {running
        ? <CheckCircle2 size={14} style={{ color: 'var(--green)' }} />
        : <XCircle      size={14} style={{ color: 'var(--red)' }} />}
      <span style={{ color: 'var(--text-2)' }}>{label}</span>
      <span className={`badge ${running ? 'badge-ok' : 'badge-err'}`}>{running ? 'running' : 'stopped'}</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Mail() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('server');

  // server
  const [status,       setStatus]       = useState<MailStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [setting, setSetting] = useState(false);

  // domains
  const [domains,        setDomains]        = useState<MailDomain[]>([]);
  const [domainsLoading, setDomainsLoading] = useState(false);
  const [addDomainOpen,  setAddDomainOpen]  = useState(false);
  const [newDomain,      setNewDomain]      = useState('');
  const [savingDomain,   setSavingDomain]   = useState(false);
  const [deleteDomain,   setDeleteDomain]   = useState('');

  // accounts
  const [accounts,        setAccounts]        = useState<MailAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [addAccountOpen,  setAddAccountOpen]  = useState(false);
  const [accountForm,     setAccountForm]     = useState({ email: '', password: '', quota_mb: 1024 });
  const [savingAccount,   setSavingAccount]   = useState(false);
  const [deleteAccount,   setDeleteAccount]   = useState('');
  const [pwdTarget,       setPwdTarget]       = useState('');
  const [newPwd,          setNewPwd]          = useState('');
  const [savingPwd,       setSavingPwd]       = useState(false);

  // aliases
  const [aliases,        setAliases]        = useState<MailAlias[]>([]);
  const [aliasesLoading, setAliasesLoading] = useState(false);
  const [addAliasOpen,   setAddAliasOpen]   = useState(false);
  const [aliasForm,      setAliasForm]      = useState({ alias: '', target: '' });
  const [savingAlias,    setSavingAlias]    = useState(false);
  const [deleteAlias,    setDeleteAlias]    = useState('');

  // ── Loaders ──────────────────────────────────────────────────────────────────

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try { setStatus(await apiGet<MailStatus>('mail/status')); }
    catch { setStatus(null); }
    finally { setStatusLoading(false); }
  }, []);

  const loadDomains = useCallback(async () => {
    setDomainsLoading(true);
    try { setDomains((await apiGet<{ domains: MailDomain[] }>('mail/domains')).domains); }
    catch (e) { toast.err(e instanceof Error ? e.message : 'Failed to load domains'); }
    finally { setDomainsLoading(false); }
  }, [toast]);

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

  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => { if (tab === 'domains')  loadDomains();  }, [tab, loadDomains]);
  useEffect(() => { if (tab === 'accounts') loadAccounts(); }, [tab, loadAccounts]);
  useEffect(() => { if (tab === 'aliases')  loadAliases();  }, [tab, loadAliases]);

  // ── Actions ───────────────────────────────────────────────────────────────────

  async function runSetup() {
    setSetting(true);
    try {
      const r = await apiPost<MailStatus & { ok: boolean; errors: string[] }>('mail/setup');
      setStatus({ postfix: r.postfix, dovecot: r.dovecot });
      if (r.ok) toast.ok('Mail server configured');
      else      toast.err(r.errors.join('; ') || 'Setup had errors');
    } catch (e) { toast.err(e instanceof Error ? e.message : 'Setup failed'); }
    finally { setSetting(false); }
  }

  async function addDomain() {
    setSavingDomain(true);
    try {
      await apiPost('mail/domains', { domain: newDomain.trim().toLowerCase() });
      toast.ok(`Domain ${newDomain} added`);
      setAddDomainOpen(false); setNewDomain('');
      loadDomains();
    } catch (e) { toast.err(e instanceof Error ? e.message : 'Failed to add domain'); }
    finally { setSavingDomain(false); }
  }

  async function confirmDeleteDomain() {
    try {
      await apiDelete(`mail/domains/${deleteDomain}`);
      toast.ok(`Domain ${deleteDomain} removed`);
      setDeleteDomain(''); loadDomains();
    } catch (e) { toast.err(e instanceof Error ? e.message : 'Failed to remove domain'); }
  }

  async function addAccount() {
    setSavingAccount(true);
    try {
      await apiPost('mail/accounts', accountForm);
      toast.ok(`Account ${accountForm.email} created`);
      setAddAccountOpen(false); setAccountForm({ email: '', password: '', quota_mb: 1024 });
      loadAccounts();
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
      toast.ok('Password updated');
      setPwdTarget(''); setNewPwd('');
    } catch (e) { toast.err(e instanceof Error ? e.message : 'Failed to update password'); }
    finally { setSavingPwd(false); }
  }

  async function addAlias() {
    setSavingAlias(true);
    try {
      await apiPost('mail/aliases', aliasForm);
      toast.ok(`Alias ${aliasForm.alias} created`);
      setAddAliasOpen(false); setAliasForm({ alias: '', target: '' });
      loadAliases();
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
          <div className="page-title">Mail Server</div>
          <div className="page-desc">Postfix + Dovecot virtual mailboxes</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TabBar tab={tab} onChange={setTab} />
          <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
          {tab === 'domains'  && addBtn('Add Domain',  () => setAddDomainOpen(true))}
          {tab === 'accounts' && addBtn('Add Account', () => setAddAccountOpen(true))}
          {tab === 'aliases'  && addBtn('Add Alias',   () => setAddAliasOpen(true))}
        </div>
      </div>

      {/* ── Server tab ── */}
      {tab === 'server' && (
        statusLoading ? <PageSpinner /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 500 }}>
            <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Service Status</div>
              <SvcBadge running={status?.postfix ?? false} label="Postfix (SMTP)" />
              <SvcBadge running={status?.dovecot ?? false} label="Dovecot (IMAP/POP3)" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="primary" size="sm" loading={setting} onClick={runSetup}>
                Configure Mail Server
              </Button>
              <Button variant="ghost" size="sm" icon={<RefreshCw size={13} strokeWidth={1.5} />}
                onClick={loadStatus}>
                Refresh
              </Button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>
              Run <strong>Configure</strong> once after installing Postfix &amp; Dovecot via apt.
              It writes virtual mailbox maps and restarts both services.
              Safe to run multiple times.
            </p>
          </div>
        )
      )}

      {/* ── Domains tab ── */}
      {tab === 'domains' && (
        domainsLoading ? <PageSpinner /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Domain</th><th>Owner</th><th>Added</th><th></th></tr>
              </thead>
              <tbody>
                {domains.length === 0 && (
                  <tr><td colSpan={4}>
                    <div className="empty">
                      <MailIcon size={28} strokeWidth={1.5} className="empty-icon" />
                      <div className="empty-title">No mail domains</div>
                      <div className="empty-desc">Add a domain to start creating email accounts.</div>
                    </div>
                  </td></tr>
                )}
                {domains.map(d => (
                  <tr key={d.domain}>
                    <td className="mono" style={{ fontSize: 12 }}>{d.domain}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{d.owner}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-2)' }}>{d.created_at.slice(0, 10)}</td>
                    <td>
                      <Button variant="danger" size="sm" icon={<Trash2 size={12} strokeWidth={1.5} />}
                        onClick={() => setDeleteDomain(d.domain)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

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
                      <div className="empty-desc">Add a domain first, then create accounts.</div>
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

      {/* ── Aliases tab ── */}
      {tab === 'aliases' && (
        aliasesLoading ? <PageSpinner /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Alias</th><th>Target</th><th>Domain</th><th>Added</th><th></th></tr>
              </thead>
              <tbody>
                {aliases.length === 0 && (
                  <tr><td colSpan={5}>
                    <div className="empty">
                      <MailIcon size={28} strokeWidth={1.5} className="empty-icon" />
                      <div className="empty-title">No aliases</div>
                      <div className="empty-desc">Create an alias to forward email to another address.</div>
                    </div>
                  </td></tr>
                )}
                {aliases.map(a => (
                  <tr key={a.alias}>
                    <td className="mono" style={{ fontSize: 12 }}>{a.alias}</td>
                    <td className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>{a.target}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{a.domain}</td>
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

      {/* ── Modals ── */}

      {/* Add Domain */}
      <Modal open={addDomainOpen} onClose={() => { setAddDomainOpen(false); setNewDomain(''); }}
        title="Add Mail Domain" width={380}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => { setAddDomainOpen(false); setNewDomain(''); }}>Cancel</Button>
            <Button variant="primary" size="sm" loading={savingDomain} onClick={addDomain}>Add</Button>
          </div>
        }>
        <div className="field">
          <label>Domain name</label>
          <input value={newDomain} onChange={e => setNewDomain(e.target.value)}
            placeholder="example.com" autoFocus
            onKeyDown={e => e.key === 'Enter' && addDomain()} />
        </div>
      </Modal>

      {/* Delete Domain */}
      <Modal open={!!deleteDomain} onClose={() => setDeleteDomain('')}
        title="Remove Mail Domain" width={340}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => setDeleteDomain('')}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={confirmDeleteDomain}>Remove</Button>
          </div>
        }>
        <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
          Remove <strong style={{ color: 'var(--text)' }}>{deleteDomain}</strong>?
          All accounts and aliases for this domain will be deleted.
        </p>
      </Modal>

      {/* Add Account */}
      <Modal open={addAccountOpen} onClose={() => { setAddAccountOpen(false); setAccountForm({ email: '', password: '', quota_mb: 1024 }); }}
        title="Create Mail Account" width={420}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => setAddAccountOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" loading={savingAccount} onClick={addAccount}>Create</Button>
          </div>
        }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label>Email address</label>
            <input value={accountForm.email}
              onChange={e => setAccountForm(f => ({ ...f, email: e.target.value }))}
              placeholder="user@example.com" autoFocus />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={accountForm.password}
              onChange={e => setAccountForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Min 8 characters" />
          </div>
          <div className="field">
            <label>Quota (MB)</label>
            <input type="number" value={accountForm.quota_mb}
              onChange={e => setAccountForm(f => ({ ...f, quota_mb: Number(e.target.value) }))}
              min={1} max={102400} />
          </div>
        </div>
      </Modal>

      {/* Delete Account */}
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

      {/* Change Password */}
      <Modal open={!!pwdTarget} onClose={() => { if (!savingPwd) { setPwdTarget(''); setNewPwd(''); } }}
        title="Change Password" width={360}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => { setPwdTarget(''); setNewPwd(''); }} disabled={savingPwd}>Cancel</Button>
            <Button variant="primary" size="sm" loading={savingPwd} onClick={changePassword}>Update</Button>
          </div>
        }>
        <div className="field">
          <label>New password for {pwdTarget}</label>
          <input type="password" value={newPwd}
            onChange={e => setNewPwd(e.target.value)}
            placeholder="Min 8 characters" autoFocus />
        </div>
      </Modal>

      {/* Add Alias */}
      <Modal open={addAliasOpen} onClose={() => { setAddAliasOpen(false); setAliasForm({ alias: '', target: '' }); }}
        title="Create Alias" width={420}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => setAddAliasOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" loading={savingAlias} onClick={addAlias}>Create</Button>
          </div>
        }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label>Alias address</label>
            <input value={aliasForm.alias}
              onChange={e => setAliasForm(f => ({ ...f, alias: e.target.value }))}
              placeholder="info@example.com" autoFocus />
          </div>
          <div className="field">
            <label>Forward to</label>
            <input value={aliasForm.target}
              onChange={e => setAliasForm(f => ({ ...f, target: e.target.value }))}
              placeholder="user@example.com" />
          </div>
        </div>
      </Modal>

      {/* Delete Alias */}
      <Modal open={!!deleteAlias} onClose={() => setDeleteAlias('')}
        title="Delete Alias" width={340}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => setDeleteAlias('')}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={confirmDeleteAlias}>Delete</Button>
          </div>
        }>
        <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
          Delete alias <strong style={{ color: 'var(--text)' }}>{deleteAlias}</strong>?
        </p>
      </Modal>
    </div>
  );
}
