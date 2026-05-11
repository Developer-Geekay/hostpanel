import { useState } from 'react';
import { Palette, ChevronDown } from 'lucide-react';
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
          style={{ padding: '6px' }}
        >
          <Palette size={15} strokeWidth={1.5} />
        </button>
        {open && (
          <div className="animate-fade-in" style={{
            position: 'absolute', bottom: '110%', left: '50%',
            transform: 'translateX(-50%)', zIndex: 200,
          }}>
            <ThemeGrid onSelect={k => { setTheme(k); setOpen(false); }} current={theme.key} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '5px 6px',
          background: open ? 'var(--bg-3)' : 'transparent',
          border: '1px solid transparent', borderRadius: 'var(--radius-sm)',
          cursor: 'pointer', transition: 'background var(--transition)',
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'var(--bg-3)'; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent'; }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Palette size={13} strokeWidth={1.5} color="var(--text-3)" />
          <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-ui)' }}>Theme</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: theme.accent, border: '1px solid rgba(255,255,255,0.15)',
            flexShrink: 0,
          }} />
          <ChevronDown
            size={11} strokeWidth={2} color="var(--text-3)"
            style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
          />
        </span>
      </button>
      {open && (
        <div className="animate-fade-in" style={{ marginTop: 4 }}>
          <ThemeGrid onSelect={k => { setTheme(k); setOpen(false); }} current={theme.key} />
        </div>
      )}
    </div>
  );
}

function ThemeGrid({ onSelect, current }: { onSelect(k: ThemeKey): void; current: ThemeKey }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 2, padding: 5,
      background: 'var(--bg-3)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
    }}>
      {THEMES.map(t => (
        <button
          key={t.key}
          onClick={() => onSelect(t.key)}
          style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '6px 8px', borderRadius: 'var(--radius-sm)',
            border: current === t.key ? '1px solid var(--accent-border)' : '1px solid transparent',
            background: current === t.key ? 'var(--accent-dim)' : 'transparent',
            cursor: 'pointer', width: '100%', textAlign: 'left',
          }}
        >
          <span style={{
            width: 10, height: 10, borderRadius: '50%', background: t.accent,
            flexShrink: 0, border: '1px solid rgba(255,255,255,0.15)',
          }} />
          <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{t.label}</span>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--text-2)' }}>{t.description}</span>
          </span>
          {current === t.key && (
            <span style={{ color: 'var(--accent)', fontSize: 10, flexShrink: 0 }}>✓</span>
          )}
        </button>
      ))}
    </div>
  );
}
