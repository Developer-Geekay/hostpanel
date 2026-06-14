import { UserPlus, Users as UsersIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { useUsers } from './hooks/useUsers';
import { UserRow } from './components/UserRow';

export default function Users() {
  const u = useUsers();

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Users</div>
          <div className="page-desc">Manage hosting users and system access</div>
        </div>
        <Button variant="primary" size="sm" icon={<UserPlus size={13} strokeWidth={1.5} />}
          onClick={() => u.setAddOpen(true)}>
          Add User
        </Button>
      </div>

      {u.loading ? <PageSpinner /> : u.users.length === 0 ? (
        <div className="empty">
          <UsersIcon size={32} strokeWidth={1.5} className="empty-icon" />
          <div className="empty-title">No users</div>
          <div className="empty-desc">Create the first hosting user account.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Home</th>
                  <th>Status</th>
                  <th>FTP</th>
                  <th>Suspended</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {u.users.map(user => (
                  <UserRow
                    key={user.username}
                    user={user}
                    onPasswordClick={u.openPwModal}
                    onDeleteClick={u.setDeleteTarget}
                    onToggleSuspend={u.toggleSuspend}
                    onToggleFtp={u.toggleFtp}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add User */}
      <Modal open={u.addOpen} onClose={() => { if (!u.saving) u.setAddOpen(false); }}
        title="Add User" width={380}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => u.setAddOpen(false)} disabled={u.saving}>Cancel</Button>
            <Button variant="primary" size="sm" loading={u.saving}
              disabled={!u.form.username.trim() || !u.form.password} onClick={u.addUser}>
              Create
            </Button>
          </div>
        }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label>Username</label>
            <input value={u.form.username} autoFocus disabled={u.saving}
              onChange={e => u.setForm(f => ({ ...f, username: e.target.value }))} />
          </div>
          <div className="field">
            <label>System Password</label>
            <input type="password" value={u.form.password} disabled={u.saving}
              onChange={e => u.setForm(f => ({ ...f, password: e.target.value }))} />
          </div>
          <div className="field">
            <label>Panel Password <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(optional)</span></label>
            <input type="password" value={u.form.portal_password} disabled={u.saving}
              placeholder="Leave blank for system-only access"
              onChange={e => u.setForm(f => ({ ...f, portal_password: e.target.value }))} />
          </div>
        </div>
      </Modal>

      {/* Change Password */}
      <Modal open={u.pwOpen} onClose={() => { if (!u.saving) { u.setPwOpen(false); u.setNewPw(''); } }}
        title={`Change password — ${u.pwUser}`} width={360}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => { u.setPwOpen(false); u.setNewPw(''); }} disabled={u.saving}>Cancel</Button>
            <Button variant="primary" size="sm" loading={u.saving} disabled={!u.newPw.trim()} onClick={u.changePw}>Update</Button>
          </div>
        }>
        <div className="field">
          <label>New Password</label>
          <input type="password" value={u.newPw} autoFocus disabled={u.saving}
            onChange={e => u.setNewPw(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') u.changePw(); }} />
        </div>
      </Modal>

      {/* Delete User */}
      <Modal open={!!u.deleteTarget} onClose={() => { if (!u.deleting) u.setDeleteTarget(''); }}
        title="Delete User" width={340}
        footer={
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => u.setDeleteTarget('')} disabled={u.deleting}>Cancel</Button>
            <Button variant="danger" size="sm" loading={u.deleting} onClick={u.deleteUser}>Delete</Button>
          </div>
        }>
        <p style={{ fontSize: 13, color: 'var(--text-2)' }}>
          Delete <strong style={{ color: 'var(--text)' }}>{u.deleteTarget}</strong> and all associated resources? This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
