import { useState, useEffect, useCallback } from 'react';
import { Cpu, MemoryStick, HardDrive } from 'lucide-react';
import { apiGet } from '../../lib/api';
import { useToast } from '../../components/ui/Toast';
import { PageSpinner } from '../../components/ui/Spinner';

interface SystemStats {
  cpu: number;
  memory: {
    total: number;
    available: number;
    percent: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    percent: number;
  };
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(1) + ' GB';
  if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(0) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}

function progressClass(pct: number): string {
  if (pct >= 80) return 'err';
  if (pct >= 60) return 'warn';
  return '';
}

interface StatCardProps {
  label: string;
  value: string;
  sub: string;
  pct: number;
  icon: React.ReactNode;
}

function StatCard({ label, icon, value, sub, pct }: StatCardProps) {
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
        <div
          className={`progress-fill ${cls}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
        <span
          className={`badge badge-${cls === 'err' ? 'err' : cls === 'warn' ? 'warn' : 'ok'}`}
          style={{ fontSize: 10.5 }}
        >
          {pct.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const toast = useToast();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const data = await apiGet<SystemStats>('system/stats');
      setStats(data);
      setLastUpdated(new Date());
    } catch (err: unknown) {
      toast.err(err instanceof Error ? err.message : 'Failed to load system stats');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, 5000);
    return () => clearInterval(id);
  }, [fetchStats]);

  if (loading) return <PageSpinner />;

  const memUsed = stats ? stats.memory.total - stats.memory.available : 0;

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

      {stats ? (
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
      ) : (
        <div className="empty">
          <div className="empty-title">No data available</div>
          <div className="empty-desc">System stats could not be loaded.</div>
        </div>
      )}
    </div>
  );
}
