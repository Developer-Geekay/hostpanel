import { useState } from 'react';
import { Palette } from 'lucide-react';
import { useTheme, THEMES, ThemeKey } from '../../lib/theme';

interface ThemePickerProps {
  compact?: boolean;
}

export function ThemePicker({ compact }: ThemePickerProps) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  if (compact) {
    return (
      <div style={{ position: 'relative' }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setOpen(v => !v)}
          title="Change theme"
          style={{ padding: '6px', display: 'flex', alignItems: 'center', gap: 0 }}
        >
          <Palette size={15} strokeWidth={1.5} />
        </button>
        {open && (
          <div className="theme-dropdown animate-fade-in" style={{ position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)', zIndex: 100 }}>
            <ThemeGrid onSelect={k => { setTheme(k); setOpen(false); }} current={theme.key} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="theme-picker">
      <div className="card-title">Theme</div>
      <ThemeGrid onSelect={setTheme} current={theme.key} />
    </div>
  );
}

function ThemeGrid({ onSelect, current }: { onSelect(k: ThemeKey): void; current: ThemeKey }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 8, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', minWidth: 180 }}>
      {THEMES.map(t => (
        <button
          key={t.key}
          onClick={() => onSelect(t.key)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '7px 10px',
            borderRadius: 'var(--radius-sm)',
            border: current === t.key ? '1px solid var(--accent-border)' : '1px solid transparent',
            background: current === t.key ? 'var(--accent-dim)' : 'transparent',
            cursor: 'pointer',
            width: '100%',
            textAlign: 'left',
          }}
        >
          <span style={{ width: 14, height: 14, borderRadius: '50%', background: t.accent, flexShrink: 0, border: '1px solid rgba(255,255,255,0.15)' }} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ font: 'var(--font-ui)', fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{t.label}</span>
            <span style={{ font: 'var(--font-ui)', fontSize: 10, color: 'var(--text-2)' }}>{t.description}</span>
          </span>
          {current === t.key && (
            <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontSize: 11 }}>✓</span>
          )}
        </button>
      ))}
    </div>
  );
}
