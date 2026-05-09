import { Component, inject, signal, OnInit } from '@angular/core';
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
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RedirectService, Redirect } from '../../services/redirect.service';
import { DomainService } from '../../services/domain.service';

@Component({
  selector: 'app-redirects',
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
    MatProgressSpinnerModule,
  ],
  templateUrl: './redirects.html',
  styleUrl: './redirects.css',
})
export class RedirectsComponent implements OnInit {
  private snackBar         = inject(MatSnackBar);
  private fb               = inject(FormBuilder);
  private redirectService  = inject(RedirectService);
  private domainService    = inject(DomainService);

  columns = ['source', 'destination', 'type', 'actions'];

  redirects  = signal<Redirect[]>([]);
  domains    = signal<string[]>([]);
  isLoading  = signal(false);
  error      = signal<string | null>(null);

  showAddDialog  = signal(false);
  isCreating     = signal(false);
  deletingId     = signal<string | null>(null);

  addForm = this.fb.group({
    source_domain:  ['', Validators.required],
    source_path:    ['/', Validators.required],
    destination:    ['', [Validators.required]],
    type:           [301 as 301 | 302, Validators.required],
    www_handling:   ['both'],
  });

  ngOnInit() {
    this.load();
    this.domainService.getDomains().subscribe({
      next: (list) => this.domains.set(list.map(d => d.domain_name))
    });
  }

  load() {
    this.isLoading.set(true);
    this.error.set(null);
    this.redirectService.getRedirects().subscribe({
      next: (data) => { this.redirects.set(data); this.isLoading.set(false); },
      error: () => { this.error.set('Failed to load redirects.'); this.isLoading.set(false); }
    });
  }

  openAdd() {
    this.addForm.reset({ source_path: '/', type: 301, www_handling: 'both' });
    this.showAddDialog.set(true);
  }

  submitAdd() {
    if (this.addForm.invalid) return;
    const v = this.addForm.value;
    this.isCreating.set(true);
    this.redirectService.createRedirect({
      source_domain: v.source_domain!,
      source_path:   v.source_path!,
      destination:   v.destination!,
      type:          v.type as 301 | 302,
      www_handling:  v.www_handling!,
    }).subscribe({
      next: (r) => {
        this.redirects.update(list => [...list, r]);
        this.showAddDialog.set(false);
        this.isCreating.set(false);
        this.snackBar.open('Redirect created', 'Dismiss', { duration: 3000 });
      },
      error: (err) => {
        this.isCreating.set(false);
        const detail = err.error?.detail || 'Failed to create redirect.';
        this.snackBar.open(detail, 'Dismiss', { duration: 5000 });
      }
    });
  }

  deleteRedirect(id: string) {
    this.deletingId.set(id);
    this.redirectService.deleteRedirect(id).subscribe({
      next: () => {
        this.redirects.update(list => list.filter(r => r.id !== id));
        this.deletingId.set(null);
        this.snackBar.open('Redirect deleted', 'Dismiss', { duration: 2500 });
      },
      error: () => {
        this.deletingId.set(null);
        this.snackBar.open('Failed to delete redirect.', 'Dismiss', { duration: 4000 });
      }
    });
  }

  typeLabel(type: number): string {
    return type === 301 ? '301 Permanent' : '302 Temporary';
  }
}
