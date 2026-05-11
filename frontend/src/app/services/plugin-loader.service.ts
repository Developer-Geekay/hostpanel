import { Injectable, inject, signal, Type } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { PackageResponse } from './package.service';

export interface PluginNavItem {
  route: string;
  label: string;
  icon: string;
  section: string;
  adminOnly: boolean;
}

@Injectable({ providedIn: 'root' })
export class PluginLoaderService {
  private router = inject(Router);
  private http = inject(HttpClient);

  pluginNavItems = signal<PluginNavItem[]>([]);

  // Native Angular components for packages that ship full Angular UIs
  private readonly NATIVE_COMPONENT_MAP: Record<string, () => Promise<Type<unknown>>> = {
    'ftp': () => import('../features/ftp/ftp').then(m => m.FtpComponent),
    'domains': () => import('../features/domains/domains').then(m => m.DomainsComponent),
  };

  loadPlugins(): void {
    this.http.get<PackageResponse>('/cpanelapi/packages/installed').subscribe({
      next: (res) => {
        const packages = res.data ?? [];
        const navItems: PluginNavItem[] = [];
        const pluginRoutes: Routes = [];

        for (const pkg of packages) {
          for (const item of pkg.nav_items ?? []) {
            const routeKey = item.nav_route;
            if (!routeKey) continue;

            if (this.NATIVE_COMPONENT_MAP[routeKey]) {
              // Package has a native Angular component bundled in the main app
              pluginRoutes.push({
                path: routeKey,
                loadComponent: this.NATIVE_COMPONENT_MAP[routeKey],
              });
            } else {
              // Package ships its own frontend/main.js — load it dynamically
              pluginRoutes.push({
                path: routeKey,
                loadComponent: () =>
                  import('../features/packages/shell/package-shell').then(m => m.PackageShellComponent),
                data: { slug: routeKey },
              });
            }

            navItems.push({
              route: routeKey,
              label: item.nav_label,
              icon: item.nav_icon,
              section: item.nav_section,
              adminOnly: item.admin_only,
            });
          }
        }

        if (pluginRoutes.length > 0) {
          const config = [...this.router.config];
          const appIdx = config.findIndex(r => r.path === 'app');
          if (appIdx !== -1 && config[appIdx].children) {
            const knownPluginPaths = new Set([
              ...Object.keys(this.NATIVE_COMPONENT_MAP),
              ...pluginRoutes.map(r => r.path ?? ''),
            ]);
            const coreChildren = (config[appIdx].children ?? []).filter(
              r => !knownPluginPaths.has(r.path ?? '')
            );
            config[appIdx] = { ...config[appIdx], children: [...coreChildren, ...pluginRoutes] };
            this.router.resetConfig(config);
          }
        }

        this.pluginNavItems.set(navItems);
      },
      error: () => { /* non-fatal: plugins simply won't appear */ }
    });
  }
}
