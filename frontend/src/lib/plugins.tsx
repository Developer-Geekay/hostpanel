import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { apiGet } from './api';
import { CORE_SECTIONS, NavSection, NavItem } from './nav';
import { useAuth } from './auth';

export type { NavSection, NavItem };

export interface DashboardBlock {
  slug: string;
  type: 'stat' | 'widget';
  label: string;
  icon: string;
  size: 'sm' | 'lg';
  endpoint?: string;
}

export interface PluginRoute {
  path: string;
  slug: string;
  isNative: boolean;
}

interface PluginsCtx {
  sections: NavSection[];
  pluginRoutes: PluginRoute[];
  dashboardBlocks: DashboardBlock[];
  refresh(): Promise<void>;
}

const PluginsContext = createContext<PluginsCtx>({
  sections: CORE_SECTIONS,
  pluginRoutes: [],
  dashboardBlocks: [],
  refresh: async () => {},
});

interface RawNavItem {
  nav_route: string;
  nav_label: string;
  nav_icon: string;
  nav_section: string;
  nav_section_label?: string;
  nav_section_order?: number;
  admin_only: boolean;
}

interface RawDashboardBlock {
  type: 'stat' | 'widget';
  label: string;
  icon: string;
  size?: 'sm' | 'lg';
  endpoint?: string;
}

interface PackageData {
  name: string;
  nav_items?: RawNavItem[];
  dashboard_blocks?: RawDashboardBlock[];
}

const NATIVE_ROUTES = new Set(['dashboard', 'services', 'packages', 'users', 'dns', 'ssh', 'ssl']);

function mergeSections(packages: PackageData[]): NavSection[] {
  const sectionMap = new Map<string, NavSection>(
    CORE_SECTIONS.map(s => [s.key, { ...s, items: [...s.items] }])
  );

  for (const pkg of packages) {
    for (const item of pkg.nav_items ?? []) {
      if (!item.nav_route) continue;
      const navItem: NavItem = {
        route: item.nav_route,
        label: item.nav_label,
        icon: item.nav_icon,
        adminOnly: item.admin_only,
      };
      if (sectionMap.has(item.nav_section)) {
        sectionMap.get(item.nav_section)!.items.push(navItem);
      } else {
        sectionMap.set(item.nav_section, {
          key: item.nav_section,
          label: item.nav_section_label ?? item.nav_section,
          order: item.nav_section_order ?? 50,
          adminOnly: item.admin_only,
          items: [navItem],
        });
      }
    }
  }

  return Array.from(sectionMap.values()).sort((a, b) => a.order - b.order);
}

function extractBlocks(packages: PackageData[]): DashboardBlock[] {
  const blocks: DashboardBlock[] = [];
  for (const pkg of packages) {
    const slug = pkg.name.replace(/^hostpanel-/, '');
    for (const b of pkg.dashboard_blocks ?? []) {
      blocks.push({
        slug,
        type: b.type,
        label: b.label,
        icon: b.icon,
        size: b.size ?? 'sm',
        endpoint: b.endpoint,
      });
    }
  }
  return blocks;
}

export function PluginsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [sections, setSections] = useState<NavSection[]>(CORE_SECTIONS);
  const [pluginRoutes, setPluginRoutes] = useState<PluginRoute[]>([]);
  const [dashboardBlocks, setDashboardBlocks] = useState<DashboardBlock[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await apiGet<{ data: PackageData[] }>('packages/installed');
      const pkgs = res.data ?? [];
      setSections(mergeSections(pkgs));
      setDashboardBlocks(extractBlocks(pkgs));
      const routes: PluginRoute[] = [];
      for (const pkg of pkgs) {
        for (const item of pkg.nav_items ?? []) {
          if (!item.nav_route) continue;
          routes.push({
            path: item.nav_route,
            slug: item.nav_route,
            isNative: NATIVE_ROUTES.has(item.nav_route),
          });
        }
      }
      setPluginRoutes(routes);
    } catch { /* non-fatal */ }
  }, []);

  // Re-fetch whenever the logged-in user changes (covers first login and token refresh)
  useEffect(() => {
    if (user) {
      refresh();
    } else {
      setSections(CORE_SECTIONS);
      setPluginRoutes([]);
      setDashboardBlocks([]);
    }
  }, [user, refresh]);

  return (
    <PluginsContext.Provider value={{ sections, pluginRoutes, dashboardBlocks, refresh }}>
      {children}
    </PluginsContext.Provider>
  );
}

export function usePlugins(): PluginsCtx {
  return useContext(PluginsContext);
}

export function usePluginRoutes(): PluginRoute[] {
  return useContext(PluginsContext).pluginRoutes;
}

export interface NavItemWithSection extends NavItem {
  section: string;
}

/** Backward-compat shim: returns a flat list of plugin-only nav items with section key. */
export function usePluginNav(): NavItemWithSection[] {
  const { sections } = useContext(PluginsContext);
  const coreRoutes = new Set(CORE_SECTIONS.flatMap(s => s.items.map(i => i.route)));
  const result: NavItemWithSection[] = [];
  for (const section of sections) {
    for (const item of section.items) {
      if (!coreRoutes.has(item.route)) {
        result.push({ ...item, section: section.key });
      }
    }
  }
  return result;
}
