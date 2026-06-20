import { Cpu, MemoryStick, HardDrive, Network } from 'lucide-react';
import { PageSpinner } from '../../components/ui/Spinner';
import { usePlugins } from '../../lib/plugins';
import { useDashboard } from './hooks/useDashboard';
import { StatCard, ChartCard } from './components/StatCard';
import { DashboardBlocks } from './components/DashboardBlocks';

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(1) + ' GB';
  if (bytes >= 1_048_576)    return (bytes / 1_048_576).toFixed(0) + ' MB';
  if (bytes >= 1024)         return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}

function formatRate(bps: number): string {
  return formatBytes(bps) + '/s';
}

export default function Dashboard() {
  const { dashboardBlocks } = usePlugins();
  const { stats, history, connected, lastUpdated } = useDashboard();

  const memUsed = stats ? stats.memory.total - stats.memory.available : 0;
  const netSent = stats?.network?.bytes_sent ?? 0;
  const netRecv = stats?.network?.bytes_recv ?? 0;
  const netMax  = Math.max(netSent, netRecv);
  const netPct  = netMax > 0 ? Math.min((netMax / (125_000_000)) * 100, 100) : 0; // 1 Gbps reference

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-desc">System resource usage</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: connected ? 'var(--ok)' : 'var(--text-3)',
            display: 'inline-block',
          }} />
          {lastUpdated && (
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {!stats
        ? <PageSpinner />
        : (
          <>
            <div className="grid-3">
              <ChartCard
                label="CPU Usage"
                icon={<Cpu size={16} strokeWidth={1.5} />}
                value={`${stats.cpu.toFixed(1)}%`}
                sub="Processor load"
                pct={stats.cpu}
                history={history.cpu}
                gradientId="grad-cpu"
              />
              <ChartCard
                label="Memory"
                icon={<MemoryStick size={16} strokeWidth={1.5} />}
                value={formatBytes(memUsed)}
                sub={`of ${formatBytes(stats.memory.total)} · ${stats.memory.percent.toFixed(1)}% used`}
                pct={stats.memory.percent}
                history={history.mem}
                gradientId="grad-mem"
              />
              <ChartCard
                label="Network"
                icon={<Network size={16} strokeWidth={1.5} />}
                value={`↓ ${formatRate(netRecv)}`}
                sub={`↑ ${formatRate(netSent)} upload`}
                pct={netPct}
                history={history.netRecv}
                color="var(--accent)"
                gradientId="grad-net"
                badge={`↓${formatRate(netRecv)}`}
              />
            </div>
            {stats.disks && stats.disks.length > 0 && (
              <div className={stats.disks.length > 1 ? 'grid-3' : ''} style={{ marginTop: 16 }}>
                {stats.disks.map(d => (
                  <StatCard
                    key={d.mountpoint}
                    label={`Disk — ${d.mountpoint}`}
                    icon={<HardDrive size={16} strokeWidth={1.5} />}
                    value={formatBytes(d.used)}
                    sub={`of ${formatBytes(d.total)} total · ${formatBytes(d.free)} free`}
                    pct={d.percent}
                  />
                ))}
              </div>
            )}
          </>
        )
      }

      {dashboardBlocks.length > 0 && <DashboardBlocks blocks={dashboardBlocks} />}
    </div>
  );
}
