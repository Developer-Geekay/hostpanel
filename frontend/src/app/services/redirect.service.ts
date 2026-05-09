import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export interface Redirect {
  id: string;
  source_domain: string;
  source_path: string;
  destination: string;
  type: 301 | 302;
  www_handling: string;
}

export interface CreateRedirectRequest {
  source_domain: string;
  source_path: string;
  destination: string;
  type: 301 | 302;
  www_handling: string;
}

@Injectable({ providedIn: 'root' })
export class RedirectService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  getRedirects(): Observable<Redirect[]> {
    return this.http.get<Redirect[]>('/cpanelapi/redirects', { headers: this.auth.getAuthHeaders() });
  }

  createRedirect(req: CreateRedirectRequest): Observable<Redirect> {
    return this.http.post<Redirect>('/cpanelapi/redirects', req, { headers: this.auth.getAuthHeaders() });
  }

  deleteRedirect(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/cpanelapi/redirects/${id}`, { headers: this.auth.getAuthHeaders() });
  }
}
