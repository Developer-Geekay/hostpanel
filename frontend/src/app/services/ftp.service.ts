import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface FtpAccount {
  username: string;
  home_dir: string;
}

@Injectable({
  providedIn: 'root'
})
export class FtpService {
  private http = inject(HttpClient);
  private apiUrl = '/cpanelapi/ftp';

  getAccounts(): Observable<FtpAccount[]> {
    return this.http.get<FtpAccount[]>(`${this.apiUrl}/accounts`);
  }

  createAccount(username: string, password: string, directory?: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/accounts`, { username, password, directory });
  }

  changePassword(username: string, new_password: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/accounts/${username}/password`, { new_password });
  }

  deleteAccount(username: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/accounts/${username}`);
  }
}
