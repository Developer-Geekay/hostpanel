import { Component, inject, signal, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { DomainService, Domain, DomainDetail, Subdomain, DomainResources } from '../../services/domain.service';

@Component({
  selector: 'app-domains',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatMenuModule,
    MatTooltipModule,
    MatChipsModule,
    MatSnackBarModule,
    MatCardModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
  ],
  templateUrl: './domains.html',
  styleUrl: './domains.css',
})
export class DomainsComponent implements OnInit {
  private snackBar = inject(MatSnackBar);
  private fb = inject(FormBuilder);
  private domainService = inject(DomainService);

  columns = ['domain_name', 'username', 'document_root', 'status', 'https_forced', 'actions'];

  // List view
  domains = signal<Domain[]>([]);
  isLoading = signal(false);
  error = signal<string | null>(null);

  // Manage view
  selectedDomain = signal<DomainDetail | null>(null);
  isLoadingDetail = signal(false);
  isTogglingHttps = signal(false);

  // Inline https toggle (list view)
  togglingHttpsInline = signal<string | null>(null);

  // Add dialog
  showAddDialog = signal(false);
  isSubmitting = signal(false);
  addForm = this.fb.group({
    domain_name: ['', [Validators.required, Validators.pattern(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+$/)]],
  });

  // Delete dialog
  showDeleteDialog = signal(false);
  domainToDelete = signal<Domain | null>(null);
  domainResources = signal<DomainResources | null>(null);
  isLoadingResources = signal(false);
  isDeleting = signal(false);

  // Subdomains
  subdomains = signal<Subdomain[]>([]);
  isLoadingSubdomains = signal(false);
  showAddSubdomainDialog = signal(false);
  isSubmittingSubdomain = signal(false);
  addSubdomainForm = this.fb.group({
    subdomain: ['', [Validators.required, Validators.pattern(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/)]],
  });

  ngOnInit() {
    this.loadDomains();
  }

  loadDomains() {
    this.isLoading.set(true);
    this.error.set(null);
    this.domainService.getDomains().subscribe({
      next: (data) => { this.domains.set(data); this.isLoading.set(false); },
      error: () => { this.error.set('Failed to load websites.'); this.isLoading.set(false); }
    });
  }

  openManage(domain: Domain) {
    this.isLoadingDetail.set(true);
    this.selectedDomain.set({ ...domain, https_forced: false });
    this.subdomains.set([]);
    this.domainService.getDomain(domain.domain_name).subscribe({
      next: (detail) => { this.selectedDomain.set(detail); this.isLoadingDetail.set(false); },
      error: () => { this.isLoadingDetail.set(false); this.snackBar.open('Failed to load domain details.', 'Dismiss', { duration: 3000 }); }
    });
    this.loadSubdomains(domain.domain_name);
  }

  backToList() {
    this.selectedDomain.set(null);
    this.subdomains.set([]);
  }

  loadSubdomains(domainName: string) {
    this.isLoadingSubdomains.set(true);
    this.domainService.getSubdomains(domainName).subscribe({
      next: (data) => { this.subdomains.set(data); this.isLoadingSubdomains.set(false); },
      error: () => { this.isLoadingSubdomains.set(false); }
    });
  }

  openAddSubdomain() {
    this.addSubdomainForm.reset();
    this.showAddSubdomainDialog.set(true);
  }

  submitAddSubdomain() {
    const domain = this.selectedDomain();
    if (!domain || this.addSubdomainForm.invalid) return;
    this.isSubmittingSubdomain.set(true);
    this.domainService.addSubdomain(domain.domain_name, this.addSubdomainForm.value.subdomain!).subscribe({
      next: (sub) => {
        this.showAddSubdomainDialog.set(false);
        this.isSubmittingSubdomain.set(false);
        this.subdomains.update(list => [...list, sub]);
        this.snackBar.open(`${sub.fqdn} created`, 'Dismiss', { duration: 3000 });
      },
      error: (err) => {
        this.isSubmittingSubdomain.set(false);
        const detail = err.error?.detail || 'Failed to create subdomain.';
        this.snackBar.open(detail, 'Dismiss', { duration: 5000 });
      }
    });
  }

  deleteSubdomain(sub: Subdomain) {
    const domain = this.selectedDomain();
    if (!domain) return;
    this.domainService.deleteSubdomain(domain.domain_name, sub.subdomain).subscribe({
      next: () => {
        this.subdomains.update(list => list.filter(s => s.fqdn !== sub.fqdn));
        this.snackBar.open(`${sub.fqdn} deleted`, 'Dismiss', { duration: 3000 });
      },
      error: (err) => {
        const detail = err.error?.detail || 'Failed to delete subdomain.';
        this.snackBar.open(detail, 'Dismiss', { duration: 4000 });
      }
    });
  }

  toggleForceHttps(enabled: boolean) {
    const domain = this.selectedDomain();
    if (!domain) return;
    this.isTogglingHttps.set(true);
    this.domainService.toggleForceHttps(domain.domain_name, enabled).subscribe({
      next: (res) => {
        this.selectedDomain.set({ ...domain, https_forced: res.https_forced });
        this.isTogglingHttps.set(false);
        this.snackBar.open(`Force HTTPS ${enabled ? 'enabled' : 'disabled'}`, 'Dismiss', { duration: 2500 });
      },
      error: (err) => {
        this.isTogglingHttps.set(false);
        const detail = err.error?.detail || 'Failed to update HTTPS setting.';
        this.snackBar.open(detail, 'Dismiss', { duration: 4000 });
      }
    });
  }

  toggleHttpsInline(domain: Domain, enabled: boolean) {
    this.togglingHttpsInline.set(domain.domain_name);
    this.domainService.toggleForceHttps(domain.domain_name, enabled).subscribe({
      next: () => {
        this.domains.update(list => list.map(d =>
          d.domain_name === domain.domain_name ? { ...d, https_forced: enabled } : d
        ));
        this.togglingHttpsInline.set(null);
        this.snackBar.open(`Force HTTPS ${enabled ? 'enabled' : 'disabled'}`, 'Dismiss', { duration: 2500 });
      },
      error: (err) => {
        this.togglingHttpsInline.set(null);
        const detail = err.error?.detail || 'Failed to update HTTPS setting.';
        this.snackBar.open(detail, 'Dismiss', { duration: 4000 });
      }
    });
  }

  openAdd() {
    this.addForm.reset();
    this.showAddDialog.set(true);
  }

  submitAdd() {
    if (this.addForm.invalid) return;
    this.isSubmitting.set(true);
    this.domainService.addDomain({ domain_name: this.addForm.value.domain_name! }).subscribe({
      next: (newDomain) => {
        this.showAddDialog.set(false);
        this.isSubmitting.set(false);
        this.snackBar.open(`${newDomain.domain_name} added successfully`, 'Dismiss', { duration: 3000 });
        this.loadDomains();
      },
      error: (err) => {
        this.isSubmitting.set(false);
        const detail = err.error?.detail || 'Failed to add website.';
        this.snackBar.open(detail, 'Dismiss', { duration: 5000 });
      }
    });
  }

  confirmDelete(domain: Domain) {
    this.domainToDelete.set(domain);
    this.domainResources.set(null);
    this.showDeleteDialog.set(true);
    this.isLoadingResources.set(true);
    this.domainService.getDomainResources(domain.domain_name).subscribe({
      next: (resources) => {
        this.domainResources.set(resources);
        this.isLoadingResources.set(false);
      },
      error: () => this.isLoadingResources.set(false),
    });
  }

  executeDelete() {
    const domain = this.domainToDelete();
    if (!domain) return;
    this.isDeleting.set(true);
    this.domainService.deleteDomain(domain.domain_name).subscribe({
      next: () => {
        this.isDeleting.set(false);
        this.showDeleteDialog.set(false);
        this.selectedDomain.set(null);
        this.subdomains.set([]);
        this.snackBar.open(`${domain.domain_name} deleted`, 'Dismiss', { duration: 3000 });
        this.loadDomains();
      },
      error: (err) => {
        this.isDeleting.set(false);
        this.showDeleteDialog.set(false);
        const detail = err.error?.detail || 'Failed to delete website.';
        this.snackBar.open(detail, 'Dismiss', { duration: 4000 });
      }
    });
  }
}
