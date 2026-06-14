import { Copy, Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import type { SshKey } from '../types';

interface Props {
  sshKey: SshKey;
  deleting: boolean;
  onCopy: (fp: string) => void;
  onDelete: (id: string) => void;
}

export function KeyRow({ sshKey, deleting, onCopy, onDelete }: Props) {
  return (
    <tr>
      <td style={{ fontWeight: 500 }}>{sshKey.label || sshKey.type}</td>
      <td className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{sshKey.fingerprint}</td>
      <td className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{sshKey.added || '—'}</td>
      <td>
        <div className="actions">
          <Button variant="ghost" size="sm" icon={<Copy size={12} strokeWidth={1.5} />}
            onClick={() => onCopy(sshKey.fingerprint)}>
            Copy
          </Button>
          <Button variant="danger" size="sm" loading={deleting} disabled={deleting}
            icon={<Trash2 size={12} strokeWidth={1.5} />}
            onClick={() => onDelete(sshKey.id)} />
        </div>
      </td>
    </tr>
  );
}
