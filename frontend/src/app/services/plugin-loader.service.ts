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

  private readonly PLUGIN_COMPONENT_MAP: Record<string, () => Promise<Type<unknown>>> = {
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
            if (routeKey && this.PLUGIN_COMPONENT_MAP[routeKey]) {
              pluginRoutes.push({
                path: routeKey,
                loadComponent: this.PLUGIN_COMPONENT_MAP[routeKey],
              });
              navItems.push({
                route: routeKey,
                label: item.nav_label,
                icon: item.nav_icon,
                section: item.nav_section,
                adminOnly: item.admin_only,
              });
            }
          }
        }

        if (pluginRoutes.length > 0) {
          const config = [...this.router.config];
          const appIdx = config.findIndex(r => r.path === 'app');
          if (appIdx !== -1 && config[appIdx].children) {
            const knownPluginPaths = new Set(Object.keys(this.PLUGIN_COMPONENT_MAP));
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
