import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ThemeKey =
  | 'material'
  | 'midnight'
  | 'ocean'
  | 'forest'
  | 'rose'
  | 'sand'
  | 'slate'
  | 'liquid-glass';

export type ColorKey =
  | 'indigo'
  | 'blue'
  | 'purple'
  | 'teal'
  | 'cyan'
  | 'green'
  | 'amber'
  | 'rose'
  | 'slate';

export interface Theme {
  key: ThemeKey;
  label: string;
  description: string;
  dark: boolean;
  preview: { bg: string; surface: string; accent: string };
}

export interface Color {
  key: ColorKey;
  label: string;
  value: string;
  fg: string;
  textColor: string;
}

export const THEMES: Theme[] = [
  {
    key: 'material',
    label: 'Material',
    description: 'Dark elevated',
    dark: true,
    preview: { bg: '#09090b', surface: '#111113', accent: '#6366f1' },
  },
  {
    key: 'midnight',
    label: 'Midnight',
    description: 'Deep indigo dark',
    dark: true,
    preview: { bg: '#060609', surface: '#111118', accent: '#8b5cf6' },
  },
  {
    key: 'ocean',
    label: 'Ocean',
    description: 'Deep blue-teal',
    dark: true,
    preview: { bg: '#050e18', surface: '#10202e', accent: '#06b6d4' },
  },
  {
    key: 'forest',
    label: 'Forest',
    description: 'Deep emerald',
    dark: true,
    preview: { bg: '#060c07', surface: '#111a11', accent: '#10b981' },
  },
  {
    key: 'rose',
    label: 'Rose',
    description: 'Deep crimson',
    dark: true,
    preview: { bg: '#0d0407', surface: '#1c0e14', accent: '#f43f5e' },
  },
  {
    key: 'sand',
    label: 'Sand',
    description: 'Warm parchment',
    dark: false,
    preview: { bg: '#faf8f2', surface: '#ffffff', accent: '#d97706' },
  },
  {
    key: 'slate',
    label: 'Slate',
    description: 'Cool grey-blue',
    dark: false,
    preview: { bg: '#eef2f7', surface: '#ffffff', accent: '#0ea5e9' },
  },
  {
    key: 'liquid-glass',
    label: 'Liquid Glass',
    description: 'Frosted translucent',
    dark: true,
    preview: { bg: '#0a0a0f', surface: 'rgba(255,255,255,0.08)', accent: '#6366f1' },
  },
];

export const COLORS: Color[] = [
  { key: 'indigo', label: 'Indigo',  value: '#6366f1', fg: '#818cf8', textColor: '#fff'    },
  { key: 'blue',   label: 'Blue',    value: '#3b82f6', fg: '#60a5fa', textColor: '#fff'    },
  { key: 'purple', label: 'Purple',  value: '#8b5cf6', fg: '#a78bfa', textColor: '#fff'    },
  { key: 'teal',   label: 'Teal',    value: '#0d9488', fg: '#2dd4bf', textColor: '#fff'    },
  { key: 'cyan',   label: 'Cyan',    value: '#06b6d4', fg: '#22d3ee', textColor: '#020b0f' },
  { key: 'green',  label: 'Green',   value: '#10b981', fg: '#34d399', textColor: '#031505' },
  { key: 'amber',  label: 'Amber',   value: '#f59e0b', fg: '#fbbf24', textColor: '#0a0500' },
  { key: 'rose',   label: 'Rose',    value: '#f43f5e', fg: '#fb7185', textColor: '#fff'    },
  { key: 'slate',  label: 'Slate',   value: '#94a3b8', fg: '#cbd5e1', textColor: '#0a0b0d' },
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
    // migrate old 'blue' → 'blue', map removed 'neumorphic' → 'material'
    if (stored === 'neumorphic' as string) return 'indigo';
    return stored && COLORS.some(c => c.key === stored) ? stored : 'indigo';
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
