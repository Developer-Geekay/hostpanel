import { Component, inject, signal, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DatabaseService, DbRecord, CreateDbResponse } from '../../services/database.service';

@Component({
  selector: 'app-databases',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatChipsModule,
    MatSnackBarModule,
    MatCardModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './databases.html',
  styleUrl: './databases.css',
})
export class DatabasesComponent implements OnInit {
  private snackBar  = inject(MatSnackBar);
  private fb        = inject(FormBuilder);
  private dbService = inject(DatabaseService);

  columns = ['name', 'db_user', 'size', 'created_at', 'actions'];

  databases  = signal<DbRecord[]>([]);
  isLoading  = signal(false);
  error      = signal<string | null>(null);
  deletingDb = signal<string | null>(null);

  // Create dialog
  showAddDialog = signal(false);
  isCreating    = signal(false);

  // Credentials reveal
  newCredentials = signal<CreateDbResponse | null>(null);

  addForm = this.fb.group({
    name: ['', [Validators.required, Validators.pattern(/^[a-z0-9_]{1,64}$/)]],
  });

  ngOnInit() {
    this.load();
  }

  load() {
    this.isLoading.set(true);
    this.error.set(null);
    this.dbService.listMysql().subscribe({
      next: (data) => { this.databases.set(data); this.isLoading.set(false); },
      error: () => { this.error.set('Failed to load databases.'); this.isLoading.set(false); }
    });
  }

  openAdd() {
    this.addForm.reset();
    this.newCredentials.set(null);
    this.showAddDialog.set(true);
  }

  submitAdd() {
    if (this.addForm.invalid) return;
    const name = this.addForm.value.name!;
    this.isCreating.set(true);
    this.dbService.createMysql(name).subscribe({
      next: (res) => {
        this.databases.update(list => [...list, { name: res.name, db_user: res.db_user, size: res.size, created_at: res.created_at }]);
        this.showAddDialog.set(false);
        this.isCreating.set(false);
        this.newCredentials.set(res);
      },
      error: (err) => {
        this.isCreating.set(false);
        const detail = err.error?.detail || 'Failed to create database.';
        this.snackBar.open(detail, 'Dismiss', { duration: 5000 });
      }
    });
  }

  deleteDb(name: string) {
    this.deletingDb.set(name);
    this.dbService.deleteMysql(name).subscribe({
      next: () => {
        this.databases.update(list => list.filter(d => d.name !== name));
        this.deletingDb.set(null);
        this.snackBar.open(`Database ${name} deleted`, 'Dismiss', { duration: 3000 });
      },
      error: () => {
        this.deletingDb.set(null);
        this.snackBar.open('Failed to delete database.', 'Dismiss', { duration: 4000 });
      }
    });
  }

  copyToClipboard(value: string, label: string) {
    navigator.clipboard.writeText(value).then(() => {
      this.snackBar.open(`${label} copied`, 'Dismiss', { duration: 2000 });
    });
  }

  dismissCredentials() {
    this.newCredentials.set(null);
  }
}
