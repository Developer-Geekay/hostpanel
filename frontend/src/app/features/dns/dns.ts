import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { DnsService, DnsZone, DnsRecord } from '../../services/dns.service';
import { RedirectService, Redirect } from '../../services/redirect.service';
import { DomainService } from '../../services/domain.service';

@Component({
  selector: 'app-dns',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatMenuModule,
    MatSnackBarModule,
    MatCardModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatChipsModule,
  ],
  templateUrl: './dns.html',
  styleUrl: './dns.css',
})
export class DnsComponent implements OnInit {
  private snackBar       = inject(MatSnackBar);
  private fb             = inject(FormBuilder);
  private dnsService     = inject(DnsService);
  private redirectService = inject(RedirectService);
  private domainService  = inject(DomainService);

  // ── Tab ─────────────────────────────────────────────────────────────────────
  activeTab = signal<'dns' | 'redirects'>('dns');

  switchTab(tab: 'dns' | 'redirects') {
    this.activeTab.set(tab);
    if (tab === 'redirects' && this.redirects().length === 0 && !this.isLoadingRedirects()) {
      this.loadRedirects();
    }
    if (tab === 'redirects') {
      this.addRedirectForm.reset({ source_path: '', type: 301, www_handling: 'both' });
    }
  }

  // ── Zone list view ──────────────────────────────────────────────────────────
  zoneColumns = ['name', 'serial', 'actions'];
  zones = signal<DnsZone[]>([]);
  isLoadingZones = signal(false);
  zoneError = signal<string | null>(null);

  showAddZoneDialog = signal(false);
  isSubmittingZone = signal(false);
  addZoneForm = this.fb.group({
    name: ['', [Validators.required, Validators.pattern(/^[a-z0-9-]+\.[a-z]{2,}(\.[a-z]{2,})?$/)]]
  });

  showDeleteZoneDialog = signal(false);
  zoneToDelete = signal<DnsZone | null>(null);

  // ── Record view ─────────────────────────────────────────────────────────────
  recordColumns = ['name', 'type', 'ttl', 'content', 'actions'];
  selectedZone = signal<DnsZone | null>(null);
  records = signal<DnsRecord[]>([]);
  isLoadingRecords = signal(false);
  recordError = signal<string | null>(null);

  recordTypeFilter = signal('All');
  recordFilterTypes = ['All', 'A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'CAA'];
  filteredRecords = computed(() => {
    const f = this.recordTypeFilter();
    const recs = this.records();
    return f === 'All' ? recs : recs.filter(r => r.type === f);
  });

  showAddRecordDialog = signal(false);
  isSubmittingRecord = signal(false);
  addRecordForm = this.fb.group({
    name: ['', Validators.required],
    type: ['A', Validators.required],
    content: ['', Validators.required],
    ttl: [300, [Validators.required, Validators.min(60)]],
  });

  showDeleteRecordDialog = signal(false);
  recordToDelete = signal<DnsRecord | null>(null);

  recordTypes = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'CAA', 'SRV'];

  readonly ttlPresets = [
    { label: '5 min — fast propagation', value: 300  },
    { label: '1 hour — standard',        value: 3600 },
    { label: '24 hours — stable',        value: 86400 },
    { label: 'Custom…',                  value: -1   },
  ];
  selectedTtlPreset = signal<number>(300);

  onTtlPresetChange(v: number) {
    this.selectedTtlPreset.set(v);
    if (v !== -1) this.addRecordForm.patchValue({ ttl: v });
  }

  get contentMeta(): { placeholder: string; hint: string } {
    const type = this.addRecordForm.get('type')?.value ?? 'A';
    const zone = this.selectedZone()?.name ?? 'example.com';
    switch (type) {
      case 'A':    return { placeholder: '192.0.2.1',           hint: 'IPv4 address of your server' };
      case 'AAAA': return { placeholder: '2001:db8::1',         hint: 'IPv6 address of your server' };
      case 'CNAME': return { placeholder: zone,                 hint: 'Alias target FQDN — cannot be used at zone apex' };
      case 'MX':   return { placeholder: `10 mail.${zone}`,    hint: 'Priority + mail hostname — e.g. "10 mail.example.com"' };
      case 'TXT':  return { placeholder: 'v=spf1 ~all',        hint: 'SPF, DKIM, DMARC or ownership verification tokens' };
      case 'NS':   return { placeholder: 'ns1.provider.com.',  hint: 'Nameserver FQDN — must end with a dot' };
      case 'CAA':  return { placeholder: '0 issue "letsencrypt.org"', hint: 'flag + tag + value — controls which CAs may issue certs' };
      case 'SRV':  return { placeholder: '10 60 5060 sip.example.com', hint: 'priority weight port target' };
      default:     return { placeholder: '', hint: '' };
    }
  }

  hasARecord = computed(() => this.records().some(r => r.type === 'A'));

  formatTtl(seconds: number): string {
    if (seconds >= 86400 && seconds % 86400 === 0) return `${seconds / 86400}d`;
    if (seconds >= 3600  && seconds % 3600  === 0) return `${seconds / 3600}h`;
    if (seconds >= 60    && seconds % 60    === 0) return `${seconds / 60}m`;
    return `${seconds}s`;
  }

  // ── Redirects ───────────────────────────────────────────────────────────────
  redirectColumns = ['source', 'destination', 'type', 'actions'];
  redirects = signal<Redirect[]>([]);
  redirectDomains = signal<string[]>([]);
  isLoadingRedirects = signal(false);
  redirectError = signal<string | null>(null);

  isCreatingRedirect = signal(false);
  deletingRedirectId = signal<string | null>(null);

  addRedirectForm = this.fb.group({
    source_domain: ['', Validators.required],
    source_path:   ['/', Validators.required],
    destination:   ['', Validators.required],
    type:          [301 as 301 | 302, Validators.required],
    www_handling:  ['both'],
  });

  ngOnInit() {
    this.loadZones();
    this.domainService.getDomains().subscribe({
      next: (list) => this.redirectDomains.set(list.map(d => d.domain_name))
    });
  }

  // ── Zones ───────────────────────────────────────────────────────────────────

  loadZones() {
    this.isLoadingZones.set(true);
    this.zoneError.set(null);
    this.dnsService.getZones().subscribe({
      next: (zones) => { this.zones.set(zones); this.isLoadingZones.set(false); },
      error: (err) => {
        this.zoneError.set(err.error?.detail || 'Failed to load DNS zones.');
        this.isLoadingZones.set(false);
      }
    });
  }

  openAddZone() {
    this.addZoneForm.reset({ name: '' });
    this.showAddZoneDialog.set(true);
  }

  submitAddZone() {
    if (this.addZoneForm.invalid) return;
    this.isSubmittingZone.set(true);
    const name = this.addZoneForm.value.name!;
    this.dnsService.createZone(name).subscribe({
      next: () => {
        this.showAddZoneDialog.set(false);
        this.isSubmittingZone.set(false);
        this.snackBar.open(`Zone ${name} created`, 'Dismiss', { duration: 3000 });
        this.loadZones();
      },
      error: (err) => {
        this.isSubmittingZone.set(false);
        this.snackBar.open(err.error?.detail || 'Failed to create zone.', 'Dismiss', { duration: 4000 });
      }
    });
  }

  confirmDeleteZone(zone: DnsZone) {
    this.zoneToDelete.set(zone);
    this.showDeleteZoneDialog.set(true);
  }

  executeDeleteZone() {
    const zone = this.zoneToDelete();
    if (!zone) return;
    this.dnsService.deleteZone(zone.name).subscribe({
      next: () => {
        this.showDeleteZoneDialog.set(false);
        this.snackBar.open(`Zone ${zone.name} deleted`, 'Dismiss', { duration: 3000 });
        if (this.selectedZone()?.name === zone.name) this.selectedZone.set(null);
        this.loadZones();
      },
      error: (err) => {
        this.showDeleteZoneDialog.set(false);
        this.snackBar.open(err.error?.detail || 'Failed to delete zone.', 'Dismiss', { duration: 4000 });
      }
    });
  }

  // ── Records ─────────────────────────────────────────────────────────────────

  openZone(zone: DnsZone) {
    this.selectedZone.set(zone);
    this.loadRecords(zone.name);
  }

  backToZones() {
    this.selectedZone.set(null);
    this.records.set([]);
    this.recordTypeFilter.set('All');
  }

  loadRecords(zoneName: string) {
    this.isLoadingRecords.set(true);
    this.recordError.set(null);
    this.dnsService.getRecords(zoneName).subscribe({
      next: (recs) => { this.records.set(recs); this.isLoadingRecords.set(false); },
      error: (err) => {
        this.recordError.set(err.error?.detail || 'Failed to load records.');
        this.isLoadingRecords.set(false);
      }
    });
  }

  openAddRecord() {
    this.addRecordForm.reset({ name: '', type: 'A', ttl: 300 });
    this.selectedTtlPreset.set(300);
    this.showAddRecordDialog.set(true);
  }

  submitAddRecord() {
    if (this.addRecordForm.invalid) return;
    const zone = this.selectedZone()!;
    this.isSubmittingRecord.set(true);
    const val = this.addRecordForm.value;
    // PowerDNS needs a real FQDN — resolve @ and empty to the zone apex
    const rawName = (val.name ?? '').trim();
    const resolvedName = (!rawName || rawName === '@') ? zone.name : rawName;
    this.dnsService.addRecord(zone.name, {
      name: resolvedName,
      type: val.type!,
      content: val.content!,
      ttl: val.ttl!,
    }).subscribe({
      next: () => {
        this.showAddRecordDialog.set(false);
        this.isSubmittingRecord.set(false);
        this.snackBar.open('Record added', 'Dismiss', { duration: 3000 });
        this.loadRecords(zone.name);
      },
      error: (err) => {
        this.isSubmittingRecord.set(false);
        this.snackBar.open(err.error?.detail || 'Failed to add record.', 'Dismiss', { duration: 4000 });
      }
    });
  }

  confirmDeleteRecord(record: DnsRecord) {
    this.recordToDelete.set(record);
    this.showDeleteRecordDialog.set(true);
  }

  executeDeleteRecord() {
    const rec = this.recordToDelete();
    const zone = this.selectedZone();
    if (!rec || !zone) return;
    this.dnsService.deleteRecord(zone.name, rec.type, rec.name).subscribe({
      next: () => {
        this.showDeleteRecordDialog.set(false);
        this.snackBar.open('Record deleted', 'Dismiss', { duration: 3000 });
        this.loadRecords(zone.name);
      },
      error: (err) => {
        this.showDeleteRecordDialog.set(false);
        this.snackBar.open(err.error?.detail || 'Failed to delete record.', 'Dismiss', { duration: 4000 });
      }
    });
  }

  // ── Redirects ───────────────────────────────────────────────────────────────

  loadRedirects() {
    this.isLoadingRedirects.set(true);
    this.redirectError.set(null);
    this.redirectService.getRedirects().subscribe({
      next: (data) => { this.redirects.set(data); this.isLoadingRedirects.set(false); },
      error: () => { this.redirectError.set('Failed to load redirects.'); this.isLoadingRedirects.set(false); }
    });
  }

  submitAddRedirect() {
    if (this.addRedirectForm.invalid) return;
    const v = this.addRedirectForm.value;
    const sourcePath = ('/' + (v.source_path || '').replace(/^\/+/, '')).replace(/\/+$/, '') || '/';
    this.isCreatingRedirect.set(true);
    this.redirectService.createRedirect({
      source_domain: v.source_domain!,
      source_path:   sourcePath,
      destination:   v.destination!,
      type:          v.type as 301 | 302,
      www_handling:  v.www_handling!,
    }).subscribe({
      next: (r) => {
        this.redirects.update(list => [...list, r]);
        this.isCreatingRedirect.set(false);
        this.addRedirectForm.reset({ source_path: '', type: 301, www_handling: 'both' });
        this.snackBar.open('Redirect created', 'Dismiss', { duration: 3000 });
      },
      error: (err) => {
        this.isCreatingRedirect.set(false);
        this.snackBar.open(err.error?.detail || 'Failed to create redirect.', 'Dismiss', { duration: 5000 });
      }
    });
  }

  deleteRedirect(id: string) {
    this.deletingRedirectId.set(id);
    this.redirectService.deleteRedirect(id).subscribe({
      next: () => {
        this.redirects.update(list => list.filter(r => r.id !== id));
        this.deletingRedirectId.set(null);
        this.snackBar.open('Redirect deleted', 'Dismiss', { duration: 2500 });
      },
      error: () => {
        this.deletingRedirectId.set(null);
        this.snackBar.open('Failed to delete redirect.', 'Dismiss', { duration: 4000 });
      }
    });
  }
}
