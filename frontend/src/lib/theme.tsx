import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ThemeKey = 'material' | 'neumorphic';
export type ColorKey = 'blue' | 'purple' | 'teal' | 'amber' | 'green' | 'rose' | 'cyan' | 'slate';

export interface Theme {
  key: ThemeKey;
  label: string;
  description: string;
  preview: { bg: string; card: string };
}

export interface Color {
  key: ColorKey;
  label: string;
  value: string;
  textColor: string;
}

export const THEMES: Theme[] = [
  { key: 'material',   label: 'Material',    description: 'Dark elevated',  preview: { bg: '#0f1117', card: '#161b22' } },
  { key: 'neumorphic', label: 'Neumorphic',  description: 'Soft light',     preview: { bg: '#e4e9f0', card: '#e4e9f0' } },
];

export const COLORS: Color[] = [
  { key: 'blue',   label: 'Blue',   value: '#3b82f6', textColor: '#fff'     },
  { key: 'purple', label: 'Purple', value: '#7c3aed', textColor: '#fff'     },
  { key: 'teal',   label: 'Teal',   value: '#0d9488', textColor: '#fff'     },
  { key: 'amber',  label: 'Amber',  value: '#f59e0b', textColor: '#0a0500'  },
  { key: 'green',  label: 'Green',  value: '#22c55e', textColor: '#031505'  },
  { key: 'rose',   label: 'Rose',   value: '#f43f5e', textColor: '#fff'     },
  { key: 'cyan',   label: 'Cyan',   value: '#06b6d4', textColor: '#020b0f'  },
  { key: 'slate',  label: 'Slate',  value: '#94a3b8', textColor: '#0a0b0d'  },
];

interface ThemeCtx {
  theme: Theme;
  color: Color;
  setTheme(key: ThemeKey): void;
  setColor(key: ColorKey): void;
}

const ThemeContext = createContext<ThemeCtx>({
  theme: THEMES[0],
  color: COLORS[0],
  setTheme: () => {},
  setColor: () => {},
});

function applyTheme(themeKey: ThemeKey, colorKey: ColorKey) {
  document.documentElement.setAttribute('data-theme', themeKey);
  document.documentElement.setAttribute('data-color', colorKey);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeKey, setThemeKey] = useState<ThemeKey>(() => {
    const stored = localStorage.getItem('hp_theme') as ThemeKey | null;
    return stored && THEMES.some(t => t.key === stored) ? stored : 'material';
  });
  const [colorKey, setColorKey] = useState<ColorKey>(() => {
    const stored = localStorage.getItem('hp_color') as ColorKey | null;
    return stored && COLORS.some(c => c.key === stored) ? stored : 'blue';
  });

  useEffect(() => { applyTheme(themeKey, colorKey); }, [themeKey, colorKey]);

  const setTheme = (key: ThemeKey) => {
    setThemeKey(key);
    localStorage.setItem('hp_theme', key);
  };
  const setColor = (key: ColorKey) => {
    setColorKey(key);
    localStorage.setItem('hp_color', key);
  };

  const theme = THEMES.find(t => t.key === themeKey) ?? THEMES[0];
  const color = COLORS.find(c => c.key === colorKey) ?? COLORS[0];

  return (
    <ThemeContext.Provider value={{ theme, color, setTheme, setColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeCtx {
  return useContext(ThemeContext);
}
