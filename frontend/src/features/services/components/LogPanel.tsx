import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiGet } from '../../../lib/api';
import { useToast } from '../../../components/ui/Toast';
import { Button } from '../../../components/ui/Button';
import { Toggle } from '../../../components/ui/Toggle';
import type { LogResponse, LineCount } from '../types';

function colorLine(line: string): string {
  const l = line.toLowerCase();
  if (l.includes('error') || l.includes('fail') || l.includes('crit')) return 'log-line-err';
  if (l.includes('warn')) return 'log-line-warn';
  if (l.includes('start') || l.includes('ok') || l.includes('success')) return 'log-line-ok';
  return '';
}

interface Props { name: string; }

export function LogPanel({ name }: Props) {
  const toast = useToast();
  const [lines, setLines]           = useState<string[]>([]);
  const [lineCount, setLineCount]   = useState<LineCount>(200);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loading, setLoading]       = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async (count: LineCount) => {
    try {
      const data = await apiGet<LogResponse>(`services/${name}/logs?lines=${count}`);
      setLines(data.lines);
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  }, [name, toast]);

  useEffect(() => { setLoading(true); fetchLogs(lineCount); }, [lineCount, fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => fetchLogs(lineCount), 3000);
    return () => clearInterval(id);
  }, [autoRefresh, lineCount, fetchLogs]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  return (
    <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-2)' }}>
          Logs — {name}
        </span>
        <select
          value={lineCount}
          onChange={e => setLineCount(Number(e.target.value) as LineCount)}
          style={{ width: 80, padding: '4px 8px', fontSize: 12 }}
        >
          <option value={200}>200</option>
          <option value={500}>500</option>
          <option value={1000}>1000</option>
        </select>
        <Toggle checked={autoRefresh} onChange={setAutoRefresh} label="Auto-refresh" />
        <Button variant="ghost" size="sm" icon={<RefreshCw size={12} strokeWidth={1.5} />} onClick={() => fetchLogs(lineCount)}>
          Refresh
        </Button>
      </div>
      {loading
        ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-2)', fontSize: 12 }}>Loading…</div>
        : lines.length === 0
          ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>No log output</div>
          : (
            <pre className="log-output" style={{ maxHeight: 320 }}>
              {lines.map((line, i) => (
                <span key={i} className={colorLine(line)}>{line}{'\n'}</span>
              ))}
              <div ref={bottomRef} />
            </pre>
          )
      }
    </div>
  );
}
