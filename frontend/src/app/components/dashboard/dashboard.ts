import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';

interface SystemStats {
  cpu: number;
  memory: { total: number; available: number; percent: number };
  disk: { total: number; used: number; free: number; percent: number };
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    MatCardModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class DashboardComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);

  stats = signal<SystemStats | null>(null);
  isRefreshing = signal(false);
  lastUpdated = signal<Date | null>(null);
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  ngOnInit() {
    this.fetchStats();
    this.refreshInterval = setInterval(() => this.fetchStats(), 5000);
  }

  ngOnDestroy() {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
  }

  fetchStats() {
    this.isRefreshing.set(true);
    this.http.get<SystemStats>('/cpanelapi/system/stats').subscribe({
      next: data => {
        this.stats.set(data);
        this.lastUpdated.set(new Date());
        this.isRefreshing.set(false);
      },
      error: () => this.isRefreshing.set(false),
    });
  }

  formatBytes(bytes: number, decimals = 1): string {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
  }

  cpuColor(pct: number): string {
    if (pct < 50) return 'primary';
    if (pct < 80) return 'accent';
    return 'warn';
  }
}
