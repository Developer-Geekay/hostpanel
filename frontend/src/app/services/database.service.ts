import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export interface DbRecord {
  name: string;
  db_user: string;
  size: string;
  created_at: string;
}

export interface CreateDbResponse extends DbRecord {
  password: string;
}

@Injectable({ providedIn: 'root' })
export class DatabaseService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  listMysql(): Observable<DbRecord[]> {
    return this.http.get<DbRecord[]>('/cpanelapi/databases/mysql', { headers: this.auth.getAuthHeaders() });
  }

  createMysql(name: string): Observable<CreateDbResponse> {
    return this.http.post<CreateDbResponse>('/cpanelapi/databases/mysql', { name }, { headers: this.auth.getAuthHeaders() });
  }

  deleteMysql(name: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/cpanelapi/databases/mysql/${name}`, { headers: this.auth.getAuthHeaders() });
  }
}
