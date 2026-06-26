import React from 'react';

interface StatCardProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  sub: string;
  pct: number;
  barColor?: string;
}

export function StatCard({ label, icon, value, sub, pct, barColor }: StatCardProps) {
  // Determine progress bar color based on usage percentage
  const background = barColor ?? (pct >= 80 ? 'var(--red)' : pct >= 60 ? 'var(--amber)' : 'var(--accent)');

  return (
    <div className="card stat-card" style={{ padding: '14px 16px' }}>
      <div className="stat-lbl" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: '12px', fontWeight: 600, color: 'var(--text-3)',
        textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px'
      }}>
        {label}
        <span style={{ color: 'var(--text-3)', display: 'inline-flex' }}>{icon}</span>
      </div>
      <div className="stat-val" style={{
        fontSize: '24px', fontWeight: 700, color: 'var(--text)',
        letterSpacing: '-0.02em', marginBottom: '8px'
      }}>
        {value}
      </div>
      <div className="prog" style={{ height: '4px', borderRadius: '2px', background: 'var(--surface2, var(--bg-3))', overflow: 'hidden' }}>
        <div
          className="prog-fill"
          style={{
            height: '100%', borderRadius: '2px', transition: 'width 0.4s ease',
            width: `${Math.min(pct, 100)}%`,
            background: background
          }}
        />
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '6px' }}>
        {sub}
      </div>
    </div>
  );
}
