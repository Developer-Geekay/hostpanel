import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CertStatus {
  domain: string;
  status: 'valid' | 'expiring_soon' | 'expired' | 'pending' | 'none';
  expiry: string | null;
  days_remaining: number | null;
  issuer: string | null;
  https_forced: boolean;
}

@Injectable({ providedIn: 'root' })
export class SslService {
  private http = inject(HttpClient);
  private apiUrl = '/cpanelapi/ssl';

  getCerts(): Observable<CertStatus[]> {
    return this.http.get<CertStatus[]>(this.apiUrl);
  }

  issueCert(domain: string, force = false, additionalDomains: string[] = []): Observable<any> {
    return this.http.post(`${this.apiUrl}/issue`, { domain, force, additional_domains: additionalDomains });
  }

  revokeCert(domain: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${domain}`);
  }

  toggleForceHttps(domain: string, enabled: boolean): Observable<any> {
    return this.http.put(`${this.apiUrl}/${domain}/force-https`, { enabled });
  }

  getAutoRenewal(): Observable<{ enabled: boolean }> {
    return this.http.get<{ enabled: boolean }>(`${this.apiUrl}/renewal`);
  }

  setAutoRenewal(enabled: boolean): Observable<any> {
    return this.http.put(`${this.apiUrl}/renewal`, { enabled });
  }
}
