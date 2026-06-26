import { useState, useRef, useEffect } from 'react';
import { Palette, Check } from 'lucide-react';
import { useTheme, THEMES, COLORS, ThemeKey, ColorKey } from '../../lib/theme';

interface ThemePickerProps {
  compact?: boolean;
}

export function ThemePicker({ compact }: ThemePickerProps) {
  const { theme, color, setTheme, setColor } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (compact) {
    return (
      <div ref={ref} style={{ position: 'relative' }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setOpen(v => !v)}
          title="Change theme"
          style={{ padding: '6px', position: 'relative' }}
        >
          <Palette size={15} strokeWidth={1.5} />
          <span style={{
            position: 'absolute', bottom: 4, right: 4,
            width: 6, height: 6, borderRadius: '50%',
            background: color.value,
            border: '1px solid var(--bg)',
          }} />
        </button>
        {open && (
          <div className="animate-fade-in" style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 300,
          }}>
            <ThemePanel
              currentTheme={theme.key}
              currentColor={color.key}
              onTheme={setTheme}
              onColor={(k) => setColor(k)}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '5px 6px',
          background: open ? 'var(--bg-3)' : 'transparent',
          border: '1px solid transparent', borderRadius: 'var(--radius-sm)',
          cursor: 'pointer', transition: 'background var(--transition)',
        }}
        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-3)'; }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Palette size={13} strokeWidth={1.5} color="var(--text-3)" />
          <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-ui)' }}>
            Theme
          </span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: color.value,
            border: '1px solid rgba(128,128,128,0.25)',
            flexShrink: 0,
          }} />
        </span>
      </button>
      {open && (
        <div className="animate-fade-in" style={{ marginTop: 4 }}>
          <ThemePanel
            currentTheme={theme.key}
            currentColor={color.key}
            onTheme={setTheme}
            onColor={setColor}
            inline
          />
        </div>
      )}
    </div>
  );
}

function ThemePanel({
  currentTheme, currentColor, onTheme, onColor, inline,
}: {
  currentTheme: ThemeKey;
  currentColor: ColorKey;
  onTheme(k: ThemeKey): void;
  onColor(k: ColorKey): void;
  inline?: boolean;
}) {
  const panelStyle: React.CSSProperties = inline
    ? { padding: '8px 4px' }
    : {
        background: 'var(--bg-3)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: 10, minWidth: 210,
        boxShadow: 'var(--shadow-md)',
      };

  return (
    <div style={panelStyle}>
      {/* Theme style section */}
      <div style={{ fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', marginBottom: 6, paddingLeft: 2 }}>
        Style
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
        {THEMES.map(t => (
          <button
            key={t.key}
            onClick={() => onTheme(t.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '6px 8px', borderRadius: 'var(--radius-sm)',
              border: currentTheme === t.key ? '1px solid var(--accent-border)' : '1px solid transparent',
              background: currentTheme === t.key ? 'var(--accent-dim)' : 'transparent',
              cursor: 'pointer', width: '100%', textAlign: 'left',
            }}
          >
            {/* Mini preview swatch */}
            <span style={{
              width: 28, height: 20, borderRadius: 4, flexShrink: 0, overflow: 'hidden',
              border: '1px solid rgba(128,128,128,0.2)',
              background: t.preview.bg, position: 'relative', display: 'flex',
            }}>
              <span style={{
                position: 'absolute', bottom: 3, right: 3,
                width: 14, height: 10, borderRadius: 2,
                background: t.preview.surface,
                border: '0.5px solid rgba(128,128,128,0.2)',
              }} />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', fontFamily: 'var(--font-ui)' }}>
                {t.label}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-ui)' }}>
                {t.description}
              </span>
            </span>
            {currentTheme === t.key && (
              <Check size={11} strokeWidth={2.5} color="var(--accent)" style={{ flexShrink: 0 }} />
            )}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border-2)', marginBottom: 8 }} />

      {/* Color section */}
      <div style={{ fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', marginBottom: 6, paddingLeft: 2 }}>
        Accent
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 2 }}>
        {COLORS.map(c => (
          <button
            key={c.key}
            onClick={() => onColor(c.key)}
            title={c.label}
            style={{
              width: 20, height: 20, borderRadius: '50%',
              background: c.value, border: 'none', cursor: 'pointer',
              outline: currentColor === c.key
                ? `2px solid ${c.value}`
                : '2px solid transparent',
              outlineOffset: 2,
              transition: 'outline-color 0.15s, transform 0.1s',
              transform: currentColor === c.key ? 'scale(1.15)' : 'scale(1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {currentColor === c.key && (
              <Check size={10} strokeWidth={3} color={c.textColor} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
