import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap, catchError, of } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private http = inject(HttpClient);
    private router = inject(Router);
    private apiUrl = '/cpanelapi'; // Using relative path for Nginx proxy
    private tokenKey = 'auth_token';

    // Signals for reactive state
    currentUser = signal<string | null>(localStorage.getItem('user_name'));
    currentRole = signal<'admin' | 'user' | null>(localStorage.getItem('user_role') as 'admin' | 'user' | null);
    isAuthenticated = signal<boolean>(!!this.getToken());
    isAdminSignal = computed(() => this.currentRole() === 'admin');

    constructor() { }

    login(username: string, password: string) {
        const formData = new FormData();
        formData.append('username', username);
        formData.append('password', password);

        return this.http.post<{ access_token: string, token_type: string }>(`${this.apiUrl}/token`, formData).pipe(
            tap(response => {
                this.setSession(response.access_token, username);
            })
        );
    }

    logout() {
        localStorage.removeItem(this.tokenKey);
        localStorage.removeItem('user_name');
        localStorage.removeItem('user_role');
        this.currentUser.set(null);
        this.currentRole.set(null);
        this.isAuthenticated.set(false);
        this.router.navigate(['/login']);
    }

    isLoggedIn(): boolean {
        return !!this.getToken();
    }

    getToken(): string | null {
        return localStorage.getItem(this.tokenKey);
    }

    getAuthHeaders(): HttpHeaders {
        const token = this.getToken();
        return new HttpHeaders({
            'Authorization': `Bearer ${token}`
        });
    }

    private decodeTokenRole(token: string): 'admin' | 'user' {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.role === 'admin' ? 'admin' : 'user';
        } catch {
            return 'user';
        }
    }

    private setSession(token: string, username: string) {
        const role = this.decodeTokenRole(token);
        localStorage.setItem(this.tokenKey, token);
        localStorage.setItem('user_name', username);
        localStorage.setItem('user_role', role);
        this.currentUser.set(username);
        this.currentRole.set(role);
        this.isAuthenticated.set(true);
    }
}
