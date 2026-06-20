import React from 'react';

// ── Sparkline ──────────────────────────────────────────────────────────────────

interface SparkLineProps {
  data: number[];
  color: string;
  gradientId: string;
  height?: number;
}

export function SparkLine({ data, color, gradientId, height = 56 }: SparkLineProps) {
  if (data.length < 2) {
    return <div style={{ height }} />;
  }
  const max = Math.max(...data, 1);
  const W = 200;
  const H = height;
  const pad = 2;
  const step = (W - pad * 2) / (data.length - 1);
  const pts = data.map((v, i) => {
    const x = pad + i * step;
    const y = H - pad - ((v / max) * (H - pad * 2) * 0.92);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linePts = pts.join(' ');
  const areaPts = `${pad},${H} ${linePts} ${(pad + (data.length - 1) * step).toFixed(1)},${H}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height, display: 'block' }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={areaPts} fill={`url(#${gradientId})`} />
      <polyline
        points={linePts}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── ChartCard — CPU / Memory / Network ────────────────────────────────────────

interface ChartCardProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  sub: string;
  pct?: number;
  history: number[];
  color?: string;
  gradientId: string;
  badge?: string;
}

function lineColor(pct: number) {
  if (pct >= 80) return 'var(--err)';
  if (pct >= 60) return 'var(--warn)';
  return 'var(--accent)';
}

export function ChartCard({ label, icon, value, sub, pct, history, color, gradientId, badge }: ChartCardProps) {
  const clr = color ?? (pct !== undefined ? lineColor(pct) : 'var(--accent)');
  const badgeClass = pct !== undefined
    ? (pct >= 80 ? 'badge-err' : pct >= 60 ? 'badge-warn' : 'badge-ok')
    : 'badge-dim';

  return (
    <div className="stat-card" style={{ paddingBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span className="stat-label">{label}</span>
        <span style={{ color: 'var(--text-3)' }}>{icon}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div className="stat-value" style={{ marginBottom: 0 }}>{value}</div>
        {(badge || pct !== undefined) && (
          <span className={`badge ${badgeClass}`} style={{ fontSize: 10.5, flexShrink: 0 }}>
            {badge ?? `${pct!.toFixed(1)}%`}
          </span>
        )}
      </div>
      <div style={{ margin: '8px 0 4px', borderRadius: 4, overflow: 'hidden' }}>
        <SparkLine data={history} color={clr} gradientId={gradientId} height={56} />
      </div>
      <div className="stat-sub" style={{ marginTop: 2 }}>{sub}</div>
    </div>
  );
}

// ── StatCard — Disk (progress bar) ────────────────────────────────────────────

function progressClass(pct: number) {
  if (pct >= 80) return 'err';
  if (pct >= 60) return 'warn';
  return '';
}

interface StatCardProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  sub: string;
  pct: number;
}

export function StatCard({ label, icon, value, sub, pct }: StatCardProps) {
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
