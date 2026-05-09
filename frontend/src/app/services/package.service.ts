import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface NavItem {
  nav_route: string;
  nav_label: string;
  nav_icon: string;
  nav_section: string;
  admin_only: boolean;
}

export interface HostPanelPackage {
  name: string;
  version: string;
  module: string;
  description?: string;
  nav_items?: NavItem[];
  requires_core?: number[] | null;
  compatible?: boolean;
}

export interface PackageResponse {
  status: string;
  message?: string;
  data?: HostPanelPackage[];
  logs?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PackageService {
  private http = inject(HttpClient);
  private apiUrl = '/cpanelapi/packages';

  getInstalledPackages(): Observable<PackageResponse> {
    return this.http.get<PackageResponse>(`${this.apiUrl}/installed`);
  }

  installPackage(packageSource: string): Observable<PackageResponse> {
    return this.http.post<PackageResponse>(`${this.apiUrl}/install`, { package_source: packageSource });
  }

  uploadPackage(file: File): Observable<PackageResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<PackageResponse>(`${this.apiUrl}/upload`, formData);
  }

  uninstallPackage(packageName: string, force: boolean = false): Observable<PackageResponse> {
    return this.http.post<PackageResponse>(`${this.apiUrl}/uninstall`, { package_name: packageName, force });
  }
}
