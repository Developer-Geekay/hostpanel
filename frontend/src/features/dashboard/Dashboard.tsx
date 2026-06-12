import { useState, useEffect, useCallback, useRef } from 'react';
import { Cpu, MemoryStick, HardDrive, Server } from 'lucide-react';
import { apiGet } from '../../lib/api';
import { usePlugins, DashboardBlock } from '../../lib/plugins';
import { useToast } from '../../components/ui/Toast';
import { PageSpinner } from '../../components/ui/Spinner';

interface SystemStats {
  cpu: number;
  memory: { total: number; available: number; percent: number };
  disk: { total: number; used: number; free: number; percent: number };
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(1) + ' GB';
  if (bytes >= 1_048_576)    return (bytes / 1_048_576).toFixed(0) + ' MB';
  if (bytes >= 1024)         return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}

function progressClass(pct: number) {
  if (pct >= 80) return 'err';
  if (pct >= 60) return 'warn';
  return '';
}

function StatCard({ label, icon, value, sub, pct }: {
  label: string; icon: React.ReactNode;
  value: string; sub: string; pct: number;
}) {
  const cls = progressClass(pct);
  return (
    <div className="stat-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="stat-label">{label}</span>
        <span style={{ color: 'var(--text-3)' }}>{icon}</span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-sub">{sub}</div>
      <div className="progress" style={{ marginTop: 10 }}>
        <div className={`progress-fill ${cls}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
        <span className={`badge badge-${cls === 'err' ? 'err' : cls === 'warn' ? 'warn' : 'ok'}`} style={{ fontSize: 10.5 }}>
          {pct.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

function SystemStatsZone() {
  const toast = useToast();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    try {
      const data = await apiGet<SystemStats>('system/stats');
      setStats(data);
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to load system stats');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, 5000);
    return () => clearInterval(id);
  }, [fetch_]);

  if (loading) return <PageSpinner />;

  const memUsed = stats ? stats.memory.total - stats.memory.available : 0;

  return (
    <>
      {stats ? (
        <div className="grid-3">
          <StatCard label="CPU Usage" icon={<Cpu size={16} strokeWidth={1.5} />}
            value={`${stats.cpu.toFixed(1)}%`} sub="Processor load" pct={stats.cpu} />
          <StatCard label="Memory" icon={<MemoryStick size={16} strokeWidth={1.5} />}
            value={formatBytes(memUsed)} sub={`of ${formatBytes(stats.memory.total)} total`}
            pct={stats.memory.percent} />
          <StatCard label="Disk" icon={<HardDrive size={16} strokeWidth={1.5} />}
            value={formatBytes(stats.disk.used)}
            sub={`of ${formatBytes(stats.disk.total)} total · ${formatBytes(stats.disk.free)} free`}
            pct={stats.disk.percent} />
        </div>
      ) : (
        <div className="empty">
          <div className="empty-title">No data available</div>
          <div className="empty-desc">System stats could not be loaded.</div>
        </div>
      )}
    </>
  );
}

interface PkgApi {
  get(path: string): Promise<unknown>;
  post(path: string, body: unknown): Promise<unknown>;
  delete(path: string): Promise<unknown>;
  raw(method: string, path: string): Promise<Response>;
}

function buildPkgApi(slug: string): PkgApi {
  const base = `/cpanelapi/${slug}`;
  const auth = () => `Bearer ${localStorage.getItem('auth_token') ?? ''}`;
  return {
    async get(path)        { const r = await fetch(`${base}/${path}`, { headers: { Authorization: auth() } }); if (!r.ok) throw new Error(await r.text()); return r.json(); },
    async post(path, body) { const r = await fetch(`${base}/${path}`, { method: 'POST', headers: { Authorization: auth(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(await r.text()); return r.json(); },
    async delete(path)     { const r = await fetch(`${base}/${path}`, { method: 'DELETE', headers: { Authorization: auth() } }); if (!r.ok) throw new Error(await r.text()); return r.json(); },
    raw: (method, path)    => fetch(`${base}/${path}`, { method, headers: { Authorization: auth() } }),
  };
}

interface StatResponse {
  count?: number;
  value?: string;
  label?: string;
}

function StatBlock({ block }: { block: DashboardBlock }) {
  const [data, setData] = useState<StatResponse | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!block.endpoint) { setErr('No endpoint'); return; }
    apiGet<StatResponse>(block.endpoint)
      .then(setData)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : 'Error'));
  }, [block.endpoint]);

  const displayValue = data
    ? (data.count !== undefined ? String(data.count) : data.value ?? '—')
    : err ? '!' : '…';
  const subLabel = data?.label ?? block.label;

  return (
    <div className="stat-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="stat-label">{block.label}</span>
        <span style={{ color: 'var(--text-3)' }}><Server size={15} strokeWidth={1.5} /></span>
      </div>
      <div className="stat-value" style={err ? { color: 'var(--err)', fontSize: 14 } : {}}>
        {displayValue}
      </div>
      <div className="stat-sub">{err || subLabel}</div>
    </div>
  );
}

function WidgetBlock({ block }: { block: DashboardBlock }) {
  const elRef = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!elRef.current) return;
    const el = elRef.current;
    const api = buildPkgApi(block.slug);

    const init = () => {
      const pkg = window.__hpkg?.[block.slug];
      if (pkg?.dashboard) {
        pkg.dashboard(el, api);
      } else {
        setErr(`Package "${block.slug}" has no dashboard() export`);
      }
    };

    if (window.__hpkg?.[block.slug]) { init(); return; }

    const script = document.createElement('script');
    script.src = `/packages/${block.slug}/main.js`;
    script.onload = init;
    script.onerror = () => setErr(`/packages/${block.slug}/main.js not found`);
    document.head.appendChild(script);

    return () => {
      window.__hpkg?.[block.slug]?.destroy?.();
      el.replaceChildren();
    };
  }, [block.slug]);

  return (
    <div className="stat-card" style={block.size === 'lg' ? { gridColumn: '1/-1' } : {}}>
      {err ? (
        <>
          <div className="stat-label">{block.label}</div>
          <div className="stat-sub" style={{ color: 'var(--err)', marginTop: 8 }}>{err}</div>
        </>
      ) : (
        <div ref={elRef} style={{ minHeight: 60 }} />
      )}
    </div>
  );
}

function DashboardBlocks({ blocks }: { blocks: DashboardBlock[] }) {
  const smBlocks = blocks.filter(b => b.size !== 'lg');
  const lgBlocks = blocks.filter(b => b.size === 'lg');

  const renderBlock = (block: DashboardBlock) =>
    block.type === 'stat'
      ? <StatBlock key={`${block.slug}-${block.label}`} block={block} />
      : <WidgetBlock key={`${block.slug}-${block.label}`} block={block} />;

  return (
    <div>
      <div className="page-header" style={{ marginTop: 28 }}>
        <div className="page-title" style={{ fontSize: 14 }}>Packages</div>
      </div>
      {smBlocks.length > 0 && <div className="grid-3" style={{ marginBottom: 16 }}>{smBlocks.map(renderBlock)}</div>}
      {lgBlocks.map(renderBlock)}
    </div>
  );
}

export default function Dashboard() {
  const { dashboardBlocks } = usePlugins();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => { setLastUpdated(new Date()); }, []);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-desc">System resource usage</div>
        </div>
        {lastUpdated && (
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>
      <SystemStatsZone />
      {dashboardBlocks.length > 0 && <DashboardBlocks blocks={dashboardBlocks} />}
    </div>
  );
}
