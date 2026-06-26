import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Cpu, MemoryStick, HardDrive, Clock, AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { usePlugins, DashboardBlock } from '../../lib/plugins';
import { useDashboard } from './hooks/useDashboard';
import { apiGet } from '../../lib/api';
import type { Service } from '../services/types';
import type { AuditEntry } from '../audit/types';
import type { SslCert } from '../ssl/types';
import { PageSpinner } from '../../components/ui/Spinner';
import { StatCard } from './components/StatCard';
import { DashboardBlocks } from './components/DashboardBlocks';

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(1) + ' GB';
  if (bytes >= 1_048_576)    return (bytes / 1_048_576).toFixed(0) + ' MB';
  if (bytes >= 1024)         return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}

function formatUptime(uptime: number): string {
  const d = Math.floor(uptime / 86400);
  const h = Math.floor((uptime % 86400) / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function timeAgo(ts: string): string {
  try {
    const d = new Date(ts.endsWith('Z') ? ts : ts + 'Z');
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);

    if (days > 0) return `${days}d ago`;
    if (hrs > 0) return `${hrs}h ago`;
    if (mins > 0) return `${mins}m ago`;
    return 'Just now';
  } catch {
    return ts;
  }
}

function PackageStatChip({ block }: { block: DashboardBlock }) {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!block.endpoint) return;
    apiGet<any>(block.endpoint)
      .then(setData)
      .catch(() => {});
  }, [block.endpoint]);

  const count = data ? (data.count !== undefined ? data.count : data.value ?? '0') : '…';

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '8px',
      background: 'var(--surface2, var(--bg-3))', border: '1px solid var(--border2, var(--border))',
      borderRadius: '20px', padding: '6px 14px', fontSize: '12px', color: 'var(--text-2)'
    }}>
      <span style={{ fontWeight: 600, fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-3)' }}>
        {block.label}:
      </span>
      <span className="chip chip-accent" style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>
        {count}
      </span>
    </div>
  );
}

export default function Dashboard() {
  const { dashboardBlocks } = usePlugins();
  const { stats, connected, lastUpdated } = useDashboard();

  const [services, setServices] = useState<Service[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [certs, setCerts] = useState<SslCert[]>([]);
  const [loadingExtras, setLoadingExtras] = useState(true);
  const [dismissedAlert, setDismissedAlert] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchExtras = useCallback(async () => {
    setRefreshing(true);
    try {
      const [servicesData, auditData, certsData] = await Promise.all([
        apiGet<Service[]>('services'),
        apiGet<AuditEntry[]>('audit?limit=5'),
        apiGet<SslCert[]>('ssl'),
      ]);
      setServices(servicesData);
      setAuditLog(auditData);
      setCerts(certsData);
    } catch (e) {
      console.error("Failed to load dashboard extras:", e);
    } finally {
      setLoadingExtras(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchExtras();
    const timer = setInterval(fetchExtras, 5000);
    return () => clearInterval(timer);
  }, [fetchExtras]);

  // Derived dashboard state
  const memUsed = stats ? stats.memory.total - stats.memory.available : 0;
  const rootDisk = stats?.disks?.find(d => d.mountpoint === '/') ?? stats?.disks?.[0];
  const diskPct = rootDisk?.percent ?? 0;

  const stoppedServices = services.filter(s => s.status !== 'running' && s.status !== 'active');
  const systemStatus = stoppedServices.length === 0
    ? { text: 'All systems operational', type: 'green' }
    : { text: `${stoppedServices.length} service${stoppedServices.length > 1 ? 's' : ''} offline`, type: 'red' };

  const expiringCert = certs.find(c => c.days_remaining !== null && c.days_remaining <= 7);

  const handleRefreshClick = () => {
    fetchExtras();
  };

  if (!stats && loadingExtras) {
    return <PageSpinner />;
  }

  const statBlocks = dashboardBlocks.filter(b => b.type === 'stat');
  const otherBlocks = dashboardBlocks.filter(b => b.type !== 'stat');

  return (
    <div className="page">
      {/* Topbar */}
      <div className="topbar" style={{ padding: '0 20px', height: '56px', background: 'var(--bg-2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text)', flex: 1 }}>
          Dashboard
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className={`chip chip-${systemStatus.type}`}>
            {systemStatus.text}
          </span>
          <button
            className="btn btn-outline btn-sm"
            onClick={handleRefreshClick}
            disabled={refreshing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={12} className={refreshing ? 'spin-icon' : ''} style={{ strokeWidth: 1.5 }} />
            Refresh
          </button>
        </div>
      </div>

      <div className="content-scroll" style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
        {/* SSL Expiring Warning Banner */}
        {expiringCert && !dismissedAlert && (
          <div className="inline-alert alert-amber" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertTriangle size={14} color="var(--amber)" style={{ strokeWidth: 1.5, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>
              <strong style={{ color: 'var(--amber)' }}>SSL expiring:</strong> {expiringCert.root_domain} expires in {expiringCert.days_remaining} days. {' '}
              <Link to="/app/ssl" style={{ color: 'var(--accent-fg)', textDecoration: 'underline' }}>
                Renew now →
              </Link>
            </span>
            <button className="btn btn-ghost btn-xs" onClick={() => setDismissedAlert(true)}>
              Dismiss
            </button>
          </div>
        )}

        {/* System Information - NOW ON TOP */}
        <div className="card" style={{ padding: '14px 16px', marginBottom: '14px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '12px' }}>
            System Information
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: '2px' }}>Hostname</div>
              <div className="mono" style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>{stats?.hostname || 'localhost'}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: '2px' }}>OS</div>
              <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>{stats?.os || 'Linux'}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: '2px' }}>Kernel</div>
              <div className="mono" style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-2)' }}>{stats?.kernel || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: '2px' }}>Load Average</div>
              <div className="mono" style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>
                {stats?.load_avg ? stats.load_avg.join(', ') : '0.00, 0.00, 0.00'}
              </div>
            </div>
          </div>
        </div>

        {/* Packages Chip-Style Info (In place of Quick Actions) */}
        {statBlocks.length > 0 && (
          <div className="card" style={{ padding: '14px 16px', marginBottom: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '12px' }}>
              Packages Summary
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {statBlocks.map(block => (
                <PackageStatChip key={`${block.slug}-${block.label}`} block={block} />
              ))}
            </div>
          </div>
        )}

        {/* 4-Column Stat Grid */}
        {stats && (
          <div className="stat-grid-4" style={{ marginBottom: '14px' }}>
            <StatCard
              label="CPU"
              icon={<Cpu size={12} strokeWidth={1.5} />}
              value={`${stats.cpu.toFixed(1)}%`}
              pct={stats.cpu}
              sub="Processor load"
            />
            <StatCard
              label="Memory"
              icon={<MemoryStick size={12} strokeWidth={1.5} />}
              value={formatBytes(memUsed)}
              pct={stats.memory.percent}
              sub={`${stats.memory.percent.toFixed(1)}% of ${formatBytes(stats.memory.total)}`}
            />
            <StatCard
              label="Disk"
              icon={<HardDrive size={12} strokeWidth={1.5} />}
              value={formatBytes(rootDisk?.used ?? 0)}
              pct={diskPct}
              sub={`${diskPct.toFixed(1)}% of ${formatBytes(rootDisk?.total ?? 0)} total`}
            />
            <StatCard
              label="Uptime"
              icon={<Clock size={12} strokeWidth={1.5} />}
              value={stats.uptime ? formatUptime(stats.uptime) : '—'}
              pct={99.9}
              sub="99.9% availability"
              barColor="var(--green)"
            />
          </div>
        )}

        {/* Services Status & Recent Activity (grid-2 left/right, stacks on mobile) */}
        <div className="grid-2" style={{ marginBottom: '14px' }}>
          {/* Service Status */}
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '13px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>Service Status</span>
              <Link to="/app/services" style={{ fontSize: '11px', color: 'var(--text-3)', textDecoration: 'none' }}>
                View all →
              </Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {services.length === 0 ? (
                <div style={{ fontSize: '12.5px', color: 'var(--text-3)', padding: '10px 0' }}>No services available</div>
              ) : (
                services.map(s => {
                  const isRunning = s.status === 'running' || s.status === 'active';
                  const isWarning = s.status === 'warning' || s.status === 'degraded';
                  const dotColor = isRunning ? 'var(--green)' : isWarning ? 'var(--amber)' : 'var(--red)';
                  const chipClass = isRunning ? 'chip-green' : isWarning ? 'chip-amber' : 'chip-red';

                  return (
                    <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' }}>
                      <span style={{
                        width: '6px', height: '6px', borderRadius: '50%',
                        background: dotColor, flexShrink: 0,
                        boxShadow: `0 0 5px ${dotColor}`
                      }} />
                      <span style={{ fontSize: '12.5px', color: 'var(--text-2)', flex: 1 }}>{s.label || s.name}</span>
                      <span className="mono" style={{ fontSize: '10.5px', color: 'var(--text-3)' }}>{s.unit}</span>
                      <span className={`chip ${chipClass}`}>{s.status}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>Recent Activity</span>
              <Link to="/app/audit" style={{ fontSize: '11px', color: 'var(--text-3)', textDecoration: 'none' }}>
                Audit log →
              </Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {auditLog.length === 0 ? (
                <div style={{ fontSize: '12.5px', color: 'var(--text-3)', padding: '10px 0' }}>No recent activity</div>
              ) : (
                auditLog.map((e, idx) => {
                  const isSuccess = e.status === 'ok';
                  const dotColor = isSuccess ? 'var(--green)' : 'var(--red)';
                  const actionClass = e.action.split('.')[0];
                  const actionColor = actionClass === 'ssl' ? 'var(--amber)' : actionClass === 'service' ? 'var(--green)' : actionClass === 'user' ? 'var(--accent)' : 'var(--blue)';

                  return (
                    <div key={e.id} className="log-row" style={{ display: 'flex', gap: '10px', padding: '9px 0', borderBottom: idx === auditLog.length - 1 ? 'none' : '1px solid var(--border)', alignItems: 'flex-start' }}>
                      <div className="log-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0, marginTop: '5px', background: dotColor }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '12.5px', color: 'var(--text-2)' }}>
                          <span style={{ fontWeight: 600, color: actionColor, marginRight: '4px' }}>{e.action}</span>
                          {e.resource && <span>on <span className="mono" style={{ fontSize: '11.5px' }}>{e.resource}</span></span>}
                          {e.detail && <span style={{ color: 'var(--text-3)', marginLeft: '6px' }}>— {e.detail}</span>}
                        </div>
                        <div className="mono" style={{ fontSize: '10px', color: 'var(--text-3)', marginTop: '2px' }}>
                          {timeAgo(e.ts)} · {e.actor}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Large widget blocks from packages if they exist */}
        {otherBlocks.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <DashboardBlocks blocks={otherBlocks} />
          </div>
        )}
      </div>
    </div>
  );
}
