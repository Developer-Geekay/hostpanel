import { Component, inject, signal, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewChecked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../services/auth.service';

interface Service {
  name: string;
  unit: string;
  status: 'running' | 'stopped' | 'failed' | 'unknown';
}

interface LogResponse {
  name: string;
  unit: string;
  lines: string[];
}

const SERVICE_LABELS: Record<string, { label: string; icon: string; canReload: boolean }> = {
  nginx:  { label: 'Web Server',  icon: 'public',    canReload: true  },
  api:    { label: 'Panel API',   icon: 'api',        canReload: false },
  dns:    { label: 'DNS Server',  icon: 'dns',        canReload: false },
  ftp:    { label: 'FTP Server',  icon: 'swap_vert',  canReload: false },
  mysql:  { label: 'MySQL',       icon: 'storage',    canReload: false },
};

@Component({
  selector: 'app-services',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  templateUrl: './services.html',
  styleUrl: './services.css',
})
export class ServicesComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('logOutput') logOutput?: ElementRef<HTMLElement>;

  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private snackBar = inject(MatSnackBar);

  services = signal<Service[]>([]);
  isLoading = signal(true);
  actingOn = signal<string | null>(null);

  // Log view
  selectedLog = signal<Service | null>(null);
  logLines = signal<string[]>([]);
  logLoading = signal(false);
  logLinesCount = signal(200);
  autoRefresh = signal(true);
  private shouldScrollToBottom = false;

  private pollInterval?: ReturnType<typeof setInterval>;
  private logPollInterval?: ReturnType<typeof setInterval>;
  private readonly API = '/cpanelapi';

  private headers() { return this.authService.getAuthHeaders(); }

  serviceLabel(n: string) { return SERVICE_LABELS[n]?.label ?? n; }
  serviceIcon(n: string)  { return SERVICE_LABELS[n]?.icon ?? 'settings'; }
  canReload(n: string)    { return SERVICE_LABELS[n]?.canReload ?? false; }

  ngOnInit() {
    this.load();
    this.pollInterval = setInterval(() => this.load(), 5000);
  }

  ngOnDestroy() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.logPollInterval) clearInterval(this.logPollInterval);
  }

  ngAfterViewChecked() {
    if (this.shouldScrollToBottom && this.logOutput) {
      const el = this.logOutput.nativeElement;
      el.scrollTop = el.scrollHeight;
      this.shouldScrollToBottom = false;
    }
  }

  load() {
    this.http.get<Service[]>(`${this.API}/services`, { headers: this.headers() }).subscribe({
      next: (data) => {
        this.services.set(data);
        this.isLoading.set(false);
        if (this.selectedLog()) {
          const updated = data.find(s => s.name === this.selectedLog()!.name);
          if (updated) this.selectedLog.set(updated);
        }
      },
      error: () => this.isLoading.set(false),
    });
  }

  openLogs(svc: Service) {
    this.selectedLog.set(svc);
    this.logLines.set([]);
    this.fetchLogs();
    if (this.autoRefresh()) this.startLogPoll();
  }

  closeLogs() {
    this.selectedLog.set(null);
    this.logLines.set([]);
    if (this.logPollInterval) { clearInterval(this.logPollInterval); this.logPollInterval = undefined; }
  }

  fetchLogs() {
    const svc = this.selectedLog();
    if (!svc) return;
    this.logLoading.set(true);
    this.http.get<LogResponse>(
      `${this.API}/services/${svc.name}/logs?lines=${this.logLinesCount()}`,
      { headers: this.headers() }
    ).subscribe({
      next: (res) => {
        this.logLines.set(res.lines);
        this.logLoading.set(false);
        this.shouldScrollToBottom = true;
      },
      error: () => this.logLoading.set(false),
    });
  }

  onLinesChange() {
    this.fetchLogs();
  }

  toggleAutoRefresh(enabled: boolean) {
    this.autoRefresh.set(enabled);
    if (enabled) {
      this.startLogPoll();
    } else {
      if (this.logPollInterval) { clearInterval(this.logPollInterval); this.logPollInterval = undefined; }
    }
  }

  private startLogPoll() {
    if (this.logPollInterval) clearInterval(this.logPollInterval);
    this.logPollInterval = setInterval(() => this.fetchLogs(), 5000);
  }

  logLineClass(line: string): string {
    const lower = line.toLowerCase();
    if (/\berror\b|exception|fatal|crit/.test(lower)) return 'log-error';
    if (/\bwarn(ing)?\b/.test(lower)) return 'log-warn';
    if (/\bnotice\b|started|stopped|reloaded|listening/.test(lower)) return 'log-notice';
    if (/\bdebug\b/.test(lower)) return 'log-debug';
    return 'log-default';
  }

  action(name: string, act: 'start' | 'stop' | 'restart' | 'reload') {
    this.actingOn.set(name);
    this.http.post<{ name: string; status: string }>(
      `${this.API}/services/${name}/${act}`, {},
      { headers: this.headers() }
    ).subscribe({
      next: (res) => {
        this.services.update(list =>
          list.map(s => s.name === name ? { ...s, status: res.status as Service['status'] } : s)
        );
        if (this.selectedLog()?.name === name) {
          this.selectedLog.update(s => s ? { ...s, status: res.status as Service['status'] } : s);
        }
        this.actingOn.set(null);
        this.snackBar.open(`${this.serviceLabel(name)} ${act}ed`, 'Dismiss', { duration: 2500 });
      },
      error: (err) => {
        this.actingOn.set(null);
        this.snackBar.open(err.error?.detail || `Failed to ${act} service.`, 'Dismiss', { duration: 4000 });
      }
    });
  }
}
