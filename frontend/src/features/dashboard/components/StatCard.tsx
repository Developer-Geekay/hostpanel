function progressClass(pct: number) {
  if (pct >= 80) return 'err';
  if (pct >= 60) return 'warn';
  return '';
}

interface Props {
  label: string;
  icon: React.ReactNode;
  value: string;
  sub: string;
  pct: number;
}

export function StatCard({ label, icon, value, sub, pct }: Props) {
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
