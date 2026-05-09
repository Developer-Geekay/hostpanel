import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FtpService, FtpAccount } from '../../services/ftp.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-ftp',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatMenuModule,
    MatSnackBarModule,
    MatCardModule,
    MatTooltipModule,
    MatDividerModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './ftp.html',
  styleUrl: './ftp.css',
})
export class FtpComponent implements OnInit {
  private snackBar = inject(MatSnackBar);
  private fb = inject(FormBuilder);
  private ftpService = inject(FtpService);
  private authService = inject(AuthService);

  isAdmin = this.authService.isAdminSignal;
  currentUsername = this.authService.currentUser;

  columns = ['username', 'home_dir', 'actions'];

  accounts = signal<FtpAccount[]>([]);
  isLoading = signal(false);
  error = signal<string | null>(null);

  showAddDialog = signal(false);
  isSubmitting = signal(false);
  addForm = this.fb.group({
    username:     ['', [Validators.required, Validators.pattern(/^[a-z_][a-z0-9_-]{0,30}$/)]],
    password:     ['', [Validators.required, Validators.minLength(8)]],
    subdirectory: [''],
  });

  showPasswordDialog = signal(false);
  selectedAccount = signal<FtpAccount | null>(null);
  passwordForm = this.fb.group({
    new_password: ['', [Validators.required, Validators.minLength(8)]],
  });

  showDeleteDialog = signal(false);
  accountToDelete = signal<FtpAccount | null>(null);

  ngOnInit() {
    this.loadAccounts();
  }

  loadAccounts() {
    this.isLoading.set(true);
    this.error.set(null);
    this.ftpService.getAccounts().subscribe({
      next: (accounts) => {
        this.accounts.set(accounts);
        this.isLoading.set(false);
      },
      error: () => {
        this.error.set('Failed to load FTP accounts.');
        this.isLoading.set(false);
      }
    });
  }

  openAdd() {
    this.addForm.reset();
    if (!this.isAdmin()) {
      this.addForm.patchValue({ username: this.authService.currentUser() ?? '' });
    }
    this.showAddDialog.set(true);
  }

  submitAdd() {
    if (this.addForm.invalid) return;
    this.isSubmitting.set(true);
    const username = this.isAdmin()
      ? this.addForm.value.username!
      : (this.authService.currentUser() ?? '');
    const { password, subdirectory } = this.addForm.value;
    const sub = subdirectory?.trim().replace(/^\/+/, '');
    const directory = sub ? `/home/${username}/${sub}` : undefined;
    this.ftpService.createAccount(username!, password!, directory).subscribe({
      next: () => {
        this.showAddDialog.set(false);
        this.isSubmitting.set(false);
        this.snackBar.open(`FTP account ${username} created`, 'Dismiss', { duration: 3000 });
        this.loadAccounts();
      },
      error: (err) => {
        this.isSubmitting.set(false);
        const detail = err.error?.detail || 'Failed to create FTP account.';
        this.snackBar.open(detail, 'Dismiss', { duration: 4000 });
      }
    });
  }

  openPassword(acct: FtpAccount) {
    this.selectedAccount.set(acct);
    this.passwordForm.reset();
    this.showPasswordDialog.set(true);
  }

  submitPassword() {
    if (this.passwordForm.invalid || !this.selectedAccount()) return;
    const username = this.selectedAccount()!.username;
    const new_password = this.passwordForm.value.new_password!;
    this.ftpService.changePassword(username, new_password).subscribe({
      next: () => {
        this.showPasswordDialog.set(false);
        this.snackBar.open(`FTP password updated for ${username}`, 'Dismiss', { duration: 3000 });
      },
      error: (err) => {
        const detail = err.error?.detail || 'Failed to change FTP password.';
        this.snackBar.open(detail, 'Dismiss', { duration: 4000 });
      }
    });
  }

  confirmDelete(acct: FtpAccount) {
    this.accountToDelete.set(acct);
    this.showDeleteDialog.set(true);
  }

  executeDelete() {
    const acct = this.accountToDelete();
    if (!acct) return;
    this.ftpService.deleteAccount(acct.username).subscribe({
      next: () => {
        this.showDeleteDialog.set(false);
        this.snackBar.open(`FTP account ${acct.username} deleted`, 'Dismiss', { duration: 3000 });
        this.loadAccounts();
      },
      error: (err) => {
        this.showDeleteDialog.set(false);
        const detail = err.error?.detail || 'Failed to delete FTP account.';
        this.snackBar.open(detail, 'Dismiss', { duration: 4000 });
      }
    });
  }
}
