import { Play, Square, RotateCcw, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { LogPanel } from './LogPanel';
import type { Service } from '../types';

function StatusBadge({ status }: { status: string }) {
  if (status === 'running' || status === 'active')
    return <span className="badge badge-ok"><span className="dot dot-ok" />{status}</span>;
  if (status === 'failed' || status === 'error')
    return <span className="badge badge-err"><span className="dot dot-err" />{status}</span>;
  return <span className="badge badge-dim"><span className="dot dot-dim" />{status}</span>;
}

interface Props {
  svc: Service;
  busy: boolean;
  logOpen: boolean;
  onAction: (name: string, action: 'start' | 'stop' | 'restart' | 'reload') => void;
  onToggleLog: (name: string) => void;
}

export function ServiceRow({ svc, busy, logOpen, onAction, onToggleLog }: Props) {
  const isRunning = svc.status === 'running' || svc.status === 'active';

  return (
    <>
      <tr>
        <td>
          <span style={{ fontWeight: 500, color: 'var(--text)' }}>{svc.label || svc.name}</span>
        </td>
        <td><StatusBadge status={svc.status} /></td>
        <td className="mono" style={{ color: 'var(--text-2)', fontSize: 11.5 }}>{svc.unit}</td>
        <td>
          <div className="actions">
            {!isRunning ? (
              <Button variant="ghost" size="sm" loading={busy} disabled={busy}
                icon={<Play size={12} strokeWidth={1.5} />}
                onClick={() => onAction(svc.name, 'start')}>Start</Button>
            ) : (
              <Button variant="ghost" size="sm" loading={busy} disabled={busy}
                icon={<Square size={12} strokeWidth={1.5} />}
                onClick={() => onAction(svc.name, 'stop')}>Stop</Button>
            )}
            <Button variant="ghost" size="sm" loading={busy} disabled={busy}
              icon={<RotateCcw size={12} strokeWidth={1.5} />}
              onClick={() => onAction(svc.name, 'restart')}>Restart</Button>
            {svc.can_reload && (
              <Button variant="ghost" size="sm" loading={busy} disabled={busy}
                icon={<RefreshCw size={12} strokeWidth={1.5} />}
                onClick={() => onAction(svc.name, 'reload')}>Reload</Button>
            )}
          </div>
        </td>
        <td>
          <Button variant="ghost" size="sm"
            icon={logOpen ? <ChevronUp size={12} strokeWidth={1.5} /> : <ChevronDown size={12} strokeWidth={1.5} />}
            onClick={() => onToggleLog(svc.name)}>
            {logOpen ? 'Hide' : 'Logs'}
          </Button>
        </td>
      </tr>
      {logOpen && (
        <tr key={`${svc.name}-logs`}>
          <td colSpan={5} style={{ padding: 0 }}>
            <LogPanel name={svc.name} />
          </td>
        </tr>
      )}
    </>
  );
}
