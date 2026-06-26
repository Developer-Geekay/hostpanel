import { useState, useEffect, useRef } from 'react';
import { RefreshCw, Search, Download } from 'lucide-react';
import { apiGet } from '../../../lib/api';
import { useToast } from '../../../components/ui/Toast';
import { Button } from '../../../components/ui/Button';
import { Toggle } from '../../../components/ui/Toggle';
import type { LogResponse, LineCount } from '../types';

function renderLogLine(line: string, i: number) {
  // Try to parse out timestamp (e.g., "2026-06-26 21:04:12") at start of line
  const match = line.match(/^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})\s+(.*)$/);
  if (match) {
    const ts = match[1];
    const rest = match[2];
    let contentClass = 't-txt';
    const restLower = rest.toLowerCase();

    if (restLower.includes('error') || restLower.includes('fail') || restLower.includes('crit')) {
      contentClass = 't-err';
    } else if (restLower.includes('warn') || restLower.includes('warning')) {
      contentClass = 't-warn';
    } else if (restLower.includes('notice') || restLower.includes('start') || restLower.includes('success') || restLower.includes('ok')) {
      contentClass = 't-ok';
    } else if (restLower.includes('info')) {
      contentClass = 't-info';
    }

    return (
      <div key={i}>
        <span className="t-ts">{ts}</span> <span className={contentClass}>{rest}</span>
      </div>
    );
  }

  // Fallback color matching for the whole line
  let lineClass = 't-txt';
  const l = line.toLowerCase();
  if (l.includes('error') || l.includes('fail') || l.includes('crit')) lineClass = 't-err';
  else if (l.includes('warn') || l.includes('warning')) lineClass = 't-warn';
  else if (l.includes('start') || l.includes('ok') || l.includes('success') || l.includes('notice')) lineClass = 't-ok';
  else if (l.includes('info')) lineClass = 't-info';

  return (
    <div key={i} className={lineClass}>
      {line}
    </div>
  );
}

interface Props {
  name: string;
}

export function LogPanel({ name }: Props) {
  const toast = useToast();
  const [lines, setLines] = useState<string[]>([]);
  const [lineCount, setLineCount] = useState<LineCount>(200);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loading, setLoading] = useState(true);
  const [logFilter, setLogFilter] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async (count: LineCount, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiGet<LogResponse>(`services/${name}/logs?lines=${count}`);
      setLines(data.lines || []);
    } catch (err: unknown) {
      if (!silent) {
        toast.err(err instanceof Error ? err.message : 'Failed to fetch logs');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(lineCount);
  }, [name, lineCount]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => fetchLogs(lineCount, true), 3000);
    return () => clearInterval(id);
  }, [autoRefresh, lineCount, name]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  const handleDownload = () => {
    const element = document.createElement("a");
    const file = new Blob([lines.join("\n")], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${name}_service.log`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const filteredLines = lines.filter(line =>
    line.toLowerCase().includes(logFilter.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Log Tools Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '180px', maxWidth: '280px' }}>
          <Search style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: 'var(--text-3)' }} />
          <input
            className="form-input"
            type="text"
            placeholder="Filter logs..."
            value={logFilter}
            onChange={e => setLogFilter(e.target.value)}
            style={{ paddingLeft: '28px', height: '30px', fontSize: '11.5px', background: 'var(--surface, var(--bg-2))', border: '1px solid var(--border)' }}
          />
        </div>

        <select
          className="form-select"
          value={lineCount}
          onChange={e => setLineCount(Number(e.target.value) as LineCount)}
          style={{ width: 100, height: '30px', padding: '0 8px', fontSize: '11.5px', background: 'var(--surface, var(--bg-2))', border: '1px solid var(--border)' }}
        >
          <option value={200}>200 lines</option>
          <option value={500}>500 lines</option>
          <option value={1000}>1000 lines</option>
        </select>

        <Toggle checked={autoRefresh} onChange={setAutoRefresh} label="Tail live" />

        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshCw size={11} />}
          onClick={() => fetchLogs(lineCount)}
          style={{ height: '30px', fontSize: '11.5px' }}
        >
          Refresh
        </Button>

        <Button
          variant="ghost"
          size="sm"
          icon={<Download size={11} />}
          onClick={handleDownload}
          style={{ height: '30px', fontSize: '11.5px', marginLeft: 'auto' }}
        >
          Download
        </Button>
      </div>

      {/* Terminal View */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>Loading logs...</div>
      ) : filteredLines.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 12, background: '#060608', border: '1px solid var(--border)', borderRadius: '10px' }}>
          No log output matching filter
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div className="terminal" style={{ flex: 1, overflowY: 'auto', maxHeight: '350px' }}>
            {filteredLines.map((line, i) => renderLogLine(line, i))}
            <div ref={bottomRef} />
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-3)', marginTop: '6px', textAlign: 'right' }}>
            Showing {filteredLines.length} lines of {lines.length} lines fetched
          </div>
        </div>
      )}
    </div>
  );
}
