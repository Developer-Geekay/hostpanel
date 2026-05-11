import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { apiGet } from './api';

export interface NavItem {
  route: string;
  label: string;
  icon: string;
  section: string;
  adminOnly: boolean;
}

export interface PluginRoute {
  path: string;
  slug: string;
  isNative: boolean;
}

interface PluginsCtx {
  navItems: NavItem[];
  pluginRoutes: PluginRoute[];
  refresh(): Promise<void>;
}

const NATIVE_ROUTES = new Set(['ftp', 'domains', 'websites', 'nginx']);

const PluginsContext = createContext<PluginsCtx>({ navItems: [], pluginRoutes: [], refresh: async () => {} });

interface PackageData {
  nav_items?: { nav_route: string; nav_label: string; nav_icon: string; nav_section: string; admin_only: boolean }[];
}

export function PluginsProvider({ children }: { children: ReactNode }) {
  const [navItems, setNavItems] = useState<NavItem[]>([]);
  const [pluginRoutes, setPluginRoutes] = useState<PluginRoute[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await apiGet<{ data: PackageData[] }>('packages/installed');
      const items: NavItem[] = [];
      const routes: PluginRoute[] = [];
      for (const pkg of res.data ?? []) {
        for (const item of pkg.nav_items ?? []) {
          if (!item.nav_route) continue;
          const isNative = NATIVE_ROUTES.has(item.nav_route);
          if (!isNative) {
            items.push({ route: item.nav_route, label: item.nav_label, icon: item.nav_icon, section: item.nav_section, adminOnly: item.admin_only });
          }
          routes.push({ path: item.nav_route, slug: item.nav_route, isNative });
        }
      }
      setNavItems(items);
      setPluginRoutes(routes);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return <PluginsContext.Provider value={{ navItems, pluginRoutes, refresh }}>{children}</PluginsContext.Provider>;
}

export function usePluginNav(): NavItem[] {
  return useContext(PluginsContext).navItems;
}

export function usePluginRoutes(): PluginRoute[] {
  return useContext(PluginsContext).pluginRoutes;
}
