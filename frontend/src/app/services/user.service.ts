import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface HostUser {
  username: string;
  home_dir: string;
  shell: string;
  status: 'active' | 'suspended';
  ftp_enabled: boolean;
}

export interface UserResources {
  username: string;
  domains: string[];
  ssl_certs: string[];
  databases: string[];
  ftp_account: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private http = inject(HttpClient);
  private apiUrl = '/cpanelapi/users';

  getUsers(): Observable<HostUser[]> {
    return this.http.get<HostUser[]>(this.apiUrl);
  }

  createUser(username: string, password?: string, portal_password?: string): Observable<any> {
    return this.http.post(this.apiUrl, { username, password, portal_password });
  }

  deleteUser(username: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${username}?remove_home=true`);
  }

  changePassword(username: string, new_password: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/${username}/password`, { new_password });
  }

  setSuspend(username: string, suspend: boolean): Observable<any> {
    return this.http.put(`${this.apiUrl}/${username}/suspend?suspend=${suspend}`, {});
  }

  enableFtp(username: string, password: string, directory?: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/${username}/ftp/enable`, { password, directory });
  }

  disableFtp(username: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${username}/ftp`);
  }

  getUserResources(username: string): Observable<UserResources> {
    return this.http.get<UserResources>(`${this.apiUrl}/${username}/resources`);
  }
}
