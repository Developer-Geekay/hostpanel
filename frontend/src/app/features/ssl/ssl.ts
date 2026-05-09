import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { SslService, CertStatus } from '../../services/ssl.service';
import { DomainService } from '../../services/domain.service';

@Component({
  selector: 'app-ssl',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatChipsModule,
    MatSnackBarModule,
    MatCardModule,
    MatTooltipModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
  ],
  templateUrl: './ssl.html',
  styleUrl: './ssl.css',
})
export class SslComponent implements OnInit, OnDestroy {
  private snackBar    = inject(MatSnackBar);
  private fb          = inject(FormBuilder);
  private sslService  = inject(SslService);
  private domainService = inject(DomainService);

  columns = ['domain', 'status', 'expiry', 'days', 'https_forced', 'actions'];

  certs     = signal<CertStatus[]>([]);
  domains   = signal<string[]>([]);
  isLoading = signal(false);
  error     = signal<string | null>(null);

  validCount       = computed(() => this.certs().filter(c => c.status === 'valid').length);
  expiringSoonCount = computed(() => this.certs().filter(c => c.status === 'expiring_soon').length);
  noneCount        = computed(() => this.certs().filter(c => c.status === 'none' || c.status === 'expired').length);

  // Issue dialog
  showIssueDialog    = signal(false);
  isIssuing          = signal(false);
  availableSubdomains = signal<string[]>([]);
  isLoadingSubdomains = signal(false);
  issueForm = this.fb.group({
    domain: ['', Validators.required],
    additionalDomains: [[] as string[]],
  });

  // Revoke dialog
  showRevokeDialog  = signal(false);
  domainToRevoke    = signal<string | null>(null);
  isRevoking        = signal(false);

  // Auto-renewal
  autoRenewal        = signal(false);
  isTogglingRenewal  = signal(false);

  // HTTPS toggle tracking
  togglingDomain = signal<string | null>(null);

  private pollInterval: ReturnType<typeof setInterval> | null = null;

  ngOnInit() {
    this.loadCerts();
    this.domainService.getDomains().subscribe({
      next: (list) => this.domains.set(list.map(d => d.domain_name))
    });
    this.sslService.getAutoRenewal().subscribe({
      next: (data) => this.autoRenewal.set(data.enabled)
    });

    // Load subdomains when domain selection changes
    this.issueForm.get('domain')?.valueChanges.subscribe(domain => {
      this.availableSubdomains.set([]);
      this.issueForm.get('additionalDomains')?.setValue([]);
      if (domain) {
        this.isLoadingSubdomains.set(true);
        this.domainService.getSubdomains(domain).subscribe({
          next: (subs) => {
            this.availableSubdomains.set(subs.map(s => s.fqdn));
            this.isLoadingSubdomains.set(false);
          },
          error: () => this.isLoadingSubdomains.set(false),
        });
      }
    });
  }

  ngOnDestroy() {
    this.stopPolling();
  }

  loadCerts() {
    this.isLoading.set(true);
    this.error.set(null);
    this.sslService.getCerts().subscribe({
      next: (data) => {
        this.certs.set(data);
        this.isLoading.set(false);
        if (data.some(c => c.status === 'pending')) {
          this.startPolling();
        } else {
          this.stopPolling();
        }
      },
      error: () => {
        this.error.set('Failed to load certificate status.');
        this.isLoading.set(false);
      }
    });
  }

  private startPolling() {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(() => {
      this.sslService.getCerts().subscribe({
        next: (data) => {
          this.certs.set(data);
          if (!data.some(c => c.status === 'pending')) {
            this.stopPolling();
          }
        }
      });
    }, 5000);
  }

  private stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  openIssue(domain = '') {
    this.issueForm.reset({ domain, additionalDomains: [] });
    this.availableSubdomains.set([]);
    this.showIssueDialog.set(true);
  }

  submitIssue() {
    if (this.issueForm.invalid) return;
    const domain = this.issueForm.value.domain!;
    const additionalDomains = (this.issueForm.value.additionalDomains || []) as string[];
    this.isIssuing.set(true);
    this.sslService.issueCert(domain, false, additionalDomains).subscribe({
      next: () => {
        this.certs.update(list => {
          const existing = list.find(c => c.domain === domain);
          if (existing) {
            return list.map(c => c.domain === domain ? { ...c, status: 'pending' as const } : c);
          }
          return [...list, { domain, status: 'pending' as const, expiry: null, days_remaining: null, issuer: null, https_forced: false }];
        });
        this.showIssueDialog.set(false);
        this.isIssuing.set(false);
        const extra = additionalDomains.length ? ` (+${additionalDomains.length} subdomains)` : '';
        this.snackBar.open(`Certificate requested for ${domain}${extra} — polling for completion…`, 'Dismiss', { duration: 4000 });
        this.startPolling();
      },
      error: (err) => {
        this.isIssuing.set(false);
        const detail = err.error?.detail || 'Failed to request certificate.';
        this.snackBar.open(detail, 'Dismiss', { duration: 6000 });
      }
    });
  }

  confirmRevoke(domain: string) {
    this.domainToRevoke.set(domain);
    this.showRevokeDialog.set(true);
  }

  executeRevoke() {
    const domain = this.domainToRevoke();
    if (!domain) return;
    this.isRevoking.set(true);
    this.sslService.revokeCert(domain).subscribe({
      next: () => {
        this.isRevoking.set(false);
        this.showRevokeDialog.set(false);
        this.snackBar.open(`Certificate for ${domain} removed`, 'Dismiss', { duration: 3000 });
        this.loadCerts();
      },
      error: (err) => {
        this.isRevoking.set(false);
        this.showRevokeDialog.set(false);
        const detail = err.error?.detail || 'Failed to revoke certificate.';
        this.snackBar.open(detail, 'Dismiss', { duration: 5000 });
      }
    });
  }

  toggleForceHttps(domain: string, enabled: boolean) {
    this.togglingDomain.set(domain);
    this.sslService.toggleForceHttps(domain, enabled).subscribe({
      next: () => {
        this.certs.update(list => list.map(c => c.domain === domain ? { ...c, https_forced: enabled } : c));
        this.togglingDomain.set(null);
        this.snackBar.open(`Force HTTPS ${enabled ? 'enabled' : 'disabled'} for ${domain}`, 'Dismiss', { duration: 2500 });
      },
      error: (err) => {
        this.togglingDomain.set(null);
        const detail = err.error?.detail || 'Failed to update HTTPS setting.';
        this.snackBar.open(detail, 'Dismiss', { duration: 5000 });
      }
    });
  }

  toggleAutoRenewal(enabled: boolean) {
    this.isTogglingRenewal.set(true);
    this.sslService.setAutoRenewal(enabled).subscribe({
      next: () => {
        this.autoRenewal.set(enabled);
        this.isTogglingRenewal.set(false);
        this.snackBar.open(`Auto-renewal ${enabled ? 'enabled' : 'disabled'}`, 'Dismiss', { duration: 2500 });
      },
      error: (err) => {
        this.isTogglingRenewal.set(false);
        const detail = err.error?.detail || 'Failed to update auto-renewal.';
        this.snackBar.open(detail, 'Dismiss', { duration: 4000 });
      }
    });
  }

  statusClass(status: string): string {
    const map: Record<string, string> = {
      valid: 'chip-valid',
      expiring_soon: 'chip-expiring',
      expired: 'chip-expired',
      pending: 'chip-pending',
      none: 'chip-none',
    };
    return map[status] ?? 'chip-none';
  }

  statusLabel(status: string): string {
    return status === 'expiring_soon' ? 'Expiring' : status.charAt(0).toUpperCase() + status.slice(1);
  }

  daysColor(days: number | null): string {
    if (days === null || days < 0) return '#f87171';
    if (days < 30) return '#fbbf24';
    return '#34d399';
  }
}
