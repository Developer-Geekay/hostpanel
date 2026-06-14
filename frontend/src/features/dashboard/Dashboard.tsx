import { Cpu, MemoryStick, HardDrive } from 'lucide-react';
import { PageSpinner } from '../../components/ui/Spinner';
import { usePlugins } from '../../lib/plugins';
import { useDashboard } from './hooks/useDashboard';
import { StatCard } from './components/StatCard';
import { DashboardBlocks } from './components/DashboardBlocks';

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(1) + ' GB';
  if (bytes >= 1_048_576)    return (bytes / 1_048_576).toFixed(0) + ' MB';
  if (bytes >= 1024)         return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}

export default function Dashboard() {
  const { dashboardBlocks } = usePlugins();
  const { stats, connected, lastUpdated } = useDashboard();

  const memUsed = stats ? stats.memory.total - stats.memory.available : 0;

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
          <div className="grid-3">
            <StatCard
              label="CPU Usage"
              icon={<Cpu size={16} strokeWidth={1.5} />}
              value={`${stats.cpu.toFixed(1)}%`}
              sub="Processor load"
              pct={stats.cpu}
            />
            <StatCard
              label="Memory"
              icon={<MemoryStick size={16} strokeWidth={1.5} />}
              value={formatBytes(memUsed)}
              sub={`of ${formatBytes(stats.memory.total)} total`}
              pct={stats.memory.percent}
            />
            <StatCard
              label="Disk"
              icon={<HardDrive size={16} strokeWidth={1.5} />}
              value={formatBytes(stats.disk.used)}
              sub={`of ${formatBytes(stats.disk.total)} total · ${formatBytes(stats.disk.free)} free`}
              pct={stats.disk.percent}
            />
          </div>
        )
      }

      {dashboardBlocks.length > 0 && <DashboardBlocks blocks={dashboardBlocks} />}
    </div>
  );
}
