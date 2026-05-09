import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Domain {
  domain_name: string;
  username: string;
  document_root: string;
  status: 'active' | 'suspended';
  https_forced?: boolean;
}

export interface DomainDetail extends Domain {
  https_forced: boolean;
}

export interface Subdomain {
  fqdn: string;
  subdomain: string;
  parent_domain: string;
  document_root: string;
  username: string;
  status: string;
}

export interface DomainResources {
  domain: string;
  username: string;
  ssl_cert: boolean;
  ftp_account: boolean;
  databases: string[];
  subdomains: string[];
  will_delete_user: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class DomainService {
  private http = inject(HttpClient);
  private apiUrl = '/cpanelapi/domains';

  getDomains(): Observable<Domain[]> {
    return this.http.get<Domain[]>(this.apiUrl);
  }

  getDomain(domainName: string): Observable<DomainDetail> {
    return this.http.get<DomainDetail>(`${this.apiUrl}/${domainName}`);
  }

  addDomain(data: any): Observable<Domain> {
    return this.http.post<Domain>(this.apiUrl, data);
  }

  toggleForceHttps(domainName: string, enabled: boolean): Observable<any> {
    return this.http.put(`${this.apiUrl}/${domainName}/force-https`, { enabled });
  }

  deleteDomain(domainName: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${domainName}`);
  }

  getSubdomains(domainName: string): Observable<Subdomain[]> {
    return this.http.get<Subdomain[]>(`${this.apiUrl}/${domainName}/subdomains`);
  }

  addSubdomain(domainName: string, subdomain: string): Observable<Subdomain> {
    return this.http.post<Subdomain>(`${this.apiUrl}/${domainName}/subdomains`, { subdomain });
  }

  deleteSubdomain(domainName: string, subdomain: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${domainName}/subdomains/${subdomain}`);
  }

  getDomainResources(domainName: string): Observable<DomainResources> {
    return this.http.get<DomainResources>(`${this.apiUrl}/${domainName}/resources`);
  }
}
