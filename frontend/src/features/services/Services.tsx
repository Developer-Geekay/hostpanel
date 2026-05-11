import { useState, useEffect, useCallback, useRef } from 'react';
import {
  RefreshCw,
  Play,
  Square,
  RotateCcw,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { apiGet, apiPost } from '../../lib/api';
import { useToast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import { Toggle } from '../../components/ui/Toggle';

interface Service {
  name: string;
  unit: string;
  status: string;
  label: string;
  icon?: string;
  can_reload: boolean;
}

interface LogResponse {
  lines: string[];
}

type LineCount = 200 | 500 | 1000;

function statusBadge(status: string) {
  if (status === 'running' || status === 'active')
    return <span className="badge badge-ok"><span className="dot dot-ok" />{status}</span>;
  if (status === 'failed' || status === 'error')
    return <span className="badge badge-err"><span className="dot dot-err" />{status}</span>;
  return <span className="badge badge-dim"><span className="dot dot-dim" />{status}</span>;
}

interface LogPanelProps {
  name: string;
}

function LogPanel({ name }: LogPanelProps) {
  const toast = useToast();
  const [lines, setLines] = useState<string[]>([]);
  const [lineCount, setLineCount] = useState<LineCount>(200);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    setLoading(true);
    fetchLogs(lineCount);
  }, [lineCount, fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => fetchLogs(lineCount), 3000);
    return () => clearInterval(id);
  }, [autoRefresh, lineCount, fetchLogs]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  function colorLine(line: string): string {
    const l = line.toLowerCase();
    if (l.includes('error') || l.includes('fail') || l.includes('crit')) return 'log-line-err';
    if (l.includes('warn')) return 'log-line-warn';
    if (l.includes('start') || l.includes('ok') || l.includes('success')) return 'log-line-ok';
    return '';
  }

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
        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshCw size={12} strokeWidth={1.5} />}
          onClick={() => fetchLogs(lineCount)}
        >
          Refresh
        </Button>
      </div>
      {loading ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-2)', fontSize: 12 }}>Loading…</div>
      ) : lines.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>No log output</div>
      ) : (
        <pre className="log-output" style={{ maxHeight: 320 }}>
          {lines.map((line, i) => (
            <span key={i} className={colorLine(line)}>
              {line}{'\n'}
            </span>
          ))}
          <div ref={bottomRef} />
        </pre>
      )}
    </div>
  );
}

export default function Services() {
  const toast = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const fetchServices = useCallback(async () => {
    try {
      const data = await apiGet<Service[]>('services');
      setServices(data);
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to load services');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchServices();
    const id = setInterval(fetchServices, 5000);
    return () => clearInterval(id);
  }, [fetchServices]);

  async function serviceAction(name: string, action: 'start' | 'stop' | 'restart' | 'reload') {
    setActingOn(name);
    try {
      await apiPost(`services/${name}/${action}`);
      toast.ok(`${name} ${action}ed`);
      await fetchServices();
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : `Failed to ${action} ${name}`);
    } finally {
      setActingOn(null);
    }
  }

  function toggleLog(name: string) {
    setExpandedLog(prev => (prev === name ? null : name));
  }

  if (loading) return <PageSpinner />;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Services</div>
          <div className="page-desc">Manage system services</div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshCw size={13} strokeWidth={1.5} />}
          onClick={fetchServices}
        >
          Refresh
        </Button>
      </div>

      {services.length === 0 ? (
        <div className="empty">
          <FileText size={32} strokeWidth={1.5} className="empty-icon" />
          <div className="empty-title">No services found</div>
          <div className="empty-desc">No services are configured on this server.</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Service</th>
                <th>Status</th>
                <th>Unit</th>
                <th>Actions</th>
                <th>Logs</th>
              </tr>
            </thead>
            <tbody>
              {services.map(svc => {
                const busy = actingOn === svc.name;
                const logOpen = expandedLog === svc.name;
                const isRunning = svc.status === 'running' || svc.status === 'active';
                return (
                  <>
                    <tr key={svc.name}>
                      <td>
                        <span style={{ fontWeight: 500, color: 'var(--text)' }}>{svc.label || svc.name}</span>
                      </td>
                      <td>{statusBadge(svc.status)}</td>
                      <td className="mono" style={{ color: 'var(--text-2)', fontSize: 11.5 }}>{svc.unit}</td>
                      <td>
                        <div className="actions">
                          {!isRunning ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              loading={busy}
                              disabled={busy}
                              icon={<Play size={12} strokeWidth={1.5} />}
                              onClick={() => serviceAction(svc.name, 'start')}
                            >
                              Start
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              loading={busy}
                              disabled={busy}
                              icon={<Square size={12} strokeWidth={1.5} />}
                              onClick={() => serviceAction(svc.name, 'stop')}
                            >
                              Stop
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={busy}
                            disabled={busy}
                            icon={<RotateCcw size={12} strokeWidth={1.5} />}
                            onClick={() => serviceAction(svc.name, 'restart')}
                          >
                            Restart
                          </Button>
                          {svc.can_reload && (
                            <Button
                              variant="ghost"
                              size="sm"
                              loading={busy}
                              disabled={busy}
                              icon={<RefreshCw size={12} strokeWidth={1.5} />}
                              onClick={() => serviceAction(svc.name, 'reload')}
                            >
                              Reload
                            </Button>
                          )}
                        </div>
                      </td>
                      <td>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={logOpen ? <ChevronUp size={12} strokeWidth={1.5} /> : <ChevronDown size={12} strokeWidth={1.5} />}
                          onClick={() => toggleLog(svc.name)}
                        >
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
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
