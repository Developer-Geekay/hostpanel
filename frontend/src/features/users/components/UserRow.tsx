import { KeyRound, Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Toggle } from '../../../components/ui/Toggle';
import type { HostUser } from '../types';

interface Props {
  user: HostUser;
  onPasswordClick: (username: string) => void;
  onDeleteClick: (username: string) => void;
  onToggleSuspend: (u: HostUser) => void;
  onToggleFtp: (u: HostUser) => void;
}

export function UserRow({ user, onPasswordClick, onDeleteClick, onToggleSuspend, onToggleFtp }: Props) {
  const suspended = user.status === 'suspended';
  return (
    <tr>
      <td className="mono" style={{ fontWeight: 500 }}>{user.username}</td>
      <td style={{ fontSize: 11, color: 'var(--text-2)' }}>{user.home_dir}</td>
      <td>
        <span className={`badge ${suspended ? 'badge-err' : 'badge-ok'}`}>
          {suspended ? 'Suspended' : 'Active'}
        </span>
      </td>
      <td><Toggle checked={user.ftp_enabled} onChange={() => onToggleFtp(user)} /></td>
      <td><Toggle checked={suspended} onChange={() => onToggleSuspend(user)} /></td>
      <td>
        <div className="actions">
          <Button variant="ghost" size="sm" icon={<KeyRound size={12} strokeWidth={1.5} />}
            onClick={() => onPasswordClick(user.username)}>
            Password
          </Button>
          <Button variant="danger" size="sm" icon={<Trash2 size={12} strokeWidth={1.5} />}
            onClick={() => onDeleteClick(user.username)} />
        </div>
      </td>
    </tr>
  );
}
