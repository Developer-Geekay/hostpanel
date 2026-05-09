import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export interface FileEntry {
  name: string;
  type: 'file' | 'dir';
  size: string;
  modified: string;
  permissions: string;
}

export interface DirNode {
  name: string;
  path: string;
  children?: DirNode[];
}

@Injectable({ providedIn: 'root' })
export class FileService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  listDirectory(path: string): Observable<FileEntry[]> {
    const params = new HttpParams().set('path', path);
    return this.http.get<FileEntry[]>('/cpanelapi/files/list', { headers: this.auth.getAuthHeaders(), params });
  }

  getTree(path = '/home'): Observable<DirNode> {
    const params = new HttpParams().set('path', path);
    return this.http.get<DirNode>('/cpanelapi/files/tree', { headers: this.auth.getAuthHeaders(), params });
  }

  readFile(path: string): Observable<{ path: string; content: string }> {
    const params = new HttpParams().set('path', path);
    return this.http.get<{ path: string; content: string }>('/cpanelapi/files/read', { headers: this.auth.getAuthHeaders(), params });
  }

  writeFile(path: string, content: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>('/cpanelapi/files/write', { path, content }, { headers: this.auth.getAuthHeaders() });
  }

  mkdir(path: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>('/cpanelapi/files/mkdir', { path }, { headers: this.auth.getAuthHeaders() });
  }

  delete(path: string): Observable<{ message: string }> {
    const params = new HttpParams().set('path', path);
    return this.http.delete<{ message: string }>('/cpanelapi/files/delete', { headers: this.auth.getAuthHeaders(), params });
  }

  upload(dirPath: string, file: File): Observable<{ message: string; path: string }> {
    const formData = new FormData();
    formData.append('path', dirPath);
    formData.append('file', file, file.name);
    return this.http.post<{ message: string; path: string }>('/cpanelapi/files/upload', formData, { headers: this.auth.getAuthHeaders() });
  }

  downloadUrl(path: string): string {
    return `/api/files/download?path=${encodeURIComponent(path)}`;
  }
}
