import { useState, useRef, useEffect } from 'react';
import { Palette, Check, X } from 'lucide-react';
import { useTheme, THEMES, COLORS, ThemeKey, ColorKey, Theme } from '../../lib/theme';

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

  // For compact view (Rail and Topbar), we show a dropdown anchored to the button
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
          <div className="animate-fade-in theme-popup open" style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 300,
          }}>
            <div className="tp-header">
              <span className="tp-title">Appearance</span>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-3)', display: 'grid', placeItems: 'center',
                  width: '22px', height: '22px', borderRadius: '5px'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2, var(--bg-3))'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <X size={12} strokeWidth={2} />
              </button>
            </div>
            <div style={{ padding: '4px 2px 6px', maxHeight: '350px', overflowY: 'auto' }}>
              <div className="tp-section">Dark</div>
              {THEMES.filter(t => t.dark).map(t => (
                <div
                  key={t.key}
                  className={`tp-row ${theme.key === t.key ? 'active' : ''}`}
                  onClick={() => setTheme(t.key)}
                >
                  <SwatchPreview theme={t} />
                  <div style={{ flex: 1 }}>
                    <div className="tp-name">{t.label}</div>
                    <div className="tp-sub">{t.description}</div>
                  </div>
                  <div className="tp-check">
                    <Check size={9} strokeWidth={3} color="#fff" />
                  </div>
                </div>
              ))}
              <div className="tp-divider" />
              <div className="tp-section">Light</div>
              {THEMES.filter(t => !t.dark).map(t => (
                <div
                  key={t.key}
                  className={`tp-row ${theme.key === t.key ? 'active' : ''}`}
                  onClick={() => setTheme(t.key)}
                >
                  <SwatchPreview theme={t} />
                  <div style={{ flex: 1 }}>
                    <div className="tp-name">{t.label}</div>
                    <div className="tp-sub">{t.description}</div>
                  </div>
                  <div className="tp-check">
                    <Check size={9} strokeWidth={3} color="#fff" />
                  </div>
                </div>
              ))}
              <div className="tp-divider" />
              <div className="tp-section">Accent Color</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 12px 10px' }}>
                {COLORS.map(c => (
                  <button
                    key={c.key}
                    onClick={() => setColor(c.key)}
                    title={c.label}
                    style={{
                      width: 20, height: 20, borderRadius: '50%',
                      background: c.value, border: 'none', cursor: 'pointer',
                      outline: color.key === c.key
                        ? `2px solid ${c.value}`
                        : '2px solid transparent',
                      outlineOffset: 2,
                      transition: 'outline-color 0.15s, transform 0.1s',
                      transform: color.key === c.key ? 'scale(1.15)' : 'scale(1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {color.key === c.key && (
                      <Check size={10} strokeWidth={3} color={c.textColor} />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Sidebar theme picker (default mode)
  return (
    <div ref={ref} style={{ position: 'relative', marginLeft: 'auto' }}>
      <button
        id="theme-palette-btn"
        onClick={() => setOpen(v => !v)}
        title="Change theme"
        style={{
          width: '30px', height: '30px', borderRadius: '7px',
          background: 'var(--surface2, var(--bg-3))', border: '1px solid var(--border2, var(--border))',
          display: 'grid', placeItems: 'center', cursor: 'pointer',
          transition: 'all 0.12s', flexShrink: 0
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-dim)'}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--surface2, var(--bg-3))'}
      >
        <Palette size={13} strokeWidth={1.5} color="var(--text-3)" />
      </button>

      {open && (
        <>
          <div className="theme-popup-overlay open" onClick={() => setOpen(false)} />
          <div className="theme-popup open" style={{ left: '228px', top: '12px' }}>
            <div className="tp-header">
              <span className="tp-title">Appearance</span>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-3)', display: 'grid', placeItems: 'center',
                  width: '22px', height: '22px', borderRadius: '5px'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2, var(--bg-3))'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <X size={12} strokeWidth={2} />
              </button>
            </div>
            <div style={{ padding: '4px 2px 6px', maxHeight: '80vh', overflowY: 'auto' }}>
              <div className="tp-section">Dark</div>
              {THEMES.filter(t => t.dark).map(t => (
                <div
                  key={t.key}
                  className={`tp-row ${theme.key === t.key ? 'active' : ''}`}
                  onClick={() => setTheme(t.key)}
                >
                  <SwatchPreview theme={t} />
                  <div style={{ flex: 1 }}>
                    <div className="tp-name">{t.label}</div>
                    <div className="tp-sub">{t.description}</div>
                  </div>
                  <div className="tp-check">
                    <Check size={9} strokeWidth={3} color="#fff" />
                  </div>
                </div>
              ))}
              <div className="tp-divider" />
              <div className="tp-section">Light</div>
              {THEMES.filter(t => !t.dark).map(t => (
                <div
                  key={t.key}
                  className={`tp-row ${theme.key === t.key ? 'active' : ''}`}
                  onClick={() => setTheme(t.key)}
                >
                  <SwatchPreview theme={t} />
                  <div style={{ flex: 1 }}>
                    <div className="tp-name">{t.label}</div>
                    <div className="tp-sub">{t.description}</div>
                  </div>
                  <div className="tp-check">
                    <Check size={9} strokeWidth={3} color="#fff" />
                  </div>
                </div>
              ))}
              <div className="tp-divider" />
              <div className="tp-section">Accent Color</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 12px 10px' }}>
                {COLORS.map(c => (
                  <button
                    key={c.key}
                    onClick={() => setColor(c.key)}
                    title={c.label}
                    style={{
                      width: 20, height: 20, borderRadius: '50%',
                      background: c.value, border: 'none', cursor: 'pointer',
                      outline: color.key === c.key
                        ? `2px solid ${c.value}`
                        : '2px solid transparent',
                      outlineOffset: 2,
                      transition: 'outline-color 0.15s, transform 0.1s',
                      transform: color.key === c.key ? 'scale(1.15)' : 'scale(1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {color.key === c.key && (
                      <Check size={10} strokeWidth={3} color={c.textColor} />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SwatchPreview({ theme }: { theme: Theme }) {
  const isDark = theme.dark;
  const accentColor = theme.preview.accent;
  const bg = theme.preview.bg;
  const surface = theme.preview.surface;
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const textMuted = isDark ? '#3f3f46' : '#d4d4d8';

  return (
    <div className="tp-preview" style={{ background: bg, border: `1px solid ${border}` }}>
      {/* Sidebar */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 13,
        background: surface, borderRight: `1px solid ${border}`
      }} />
      {/* Header */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 0, height: 7,
        background: surface, borderBottom: `1px solid ${border}`
      }} />
      {/* Text lines */}
      <div style={{
        position: 'absolute', left: 17, top: 11, right: 5,
        display: 'flex', flexDirection: 'column', gap: 3
      }}>
        <div style={{ height: 2, borderRadius: 2, background: textMuted, width: '75%' }} />
        <div style={{ height: 2, borderRadius: 2, background: textMuted, width: '55%', opacity: 0.6 }} />
        <div style={{ height: 2, borderRadius: 2, background: textMuted, width: '85%', opacity: 0.4 }} />
      </div>
      {/* Accent card */}
      <div style={{
        position: 'absolute', right: 5, bottom: 5, width: 20, height: 5,
        borderRadius: 3, background: accentColor
      }} />
      {/* Accent sidebar dot/line */}
      <div style={{
        position: 'absolute', left: 3, top: 10, width: 7, height: 2,
        borderRadius: 1, background: accentColor, opacity: 0.7
      }} />
      <div style={{
        position: 'absolute', left: 3, top: 15, width: 7, height: 2,
        borderRadius: 1, background: textMuted, opacity: 0.5
      }} />
      <div style={{
        position: 'absolute', left: 3, top: 20, width: 7, height: 2,
        borderRadius: 1, background: textMuted, opacity: 0.5
      }} />
    </div>
  );
}
