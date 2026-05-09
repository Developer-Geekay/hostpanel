import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface DnsZone {
  name: string;
  kind: string;
  serial: number;
  record_count: number;
}

export interface DnsRecord {
  name: string;
  type: string;
  ttl: number;
  content: string;
}

@Injectable({ providedIn: 'root' })
export class DnsService {
  private http = inject(HttpClient);
  private base = '/cpanelapi/dns';

  getZones(): Observable<DnsZone[]> {
    return this.http.get<DnsZone[]>(`${this.base}/zones`);
  }

  createZone(name: string): Observable<any> {
    return this.http.post(`${this.base}/zones`, { name });
  }

  deleteZone(name: string): Observable<any> {
    return this.http.delete(`${this.base}/zones/${name}`);
  }

  getRecords(zoneName: string): Observable<DnsRecord[]> {
    return this.http.get<DnsRecord[]>(`${this.base}/zones/${zoneName}/records`);
  }

  addRecord(zoneName: string, record: { name: string; type: string; content: string; ttl: number }): Observable<any> {
    return this.http.post(`${this.base}/zones/${zoneName}/records`, record);
  }

  deleteRecord(zoneName: string, type: string, name: string): Observable<any> {
    return this.http.delete(`${this.base}/zones/${zoneName}/records/${type}/${name}`);
  }
}
