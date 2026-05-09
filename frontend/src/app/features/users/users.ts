import { Component, inject, signal, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { UserService, HostUser, UserResources } from '../../services/user.service';
import { AbstractControl, ValidationErrors } from '@angular/forms';

const PROTECTED_USERNAMES = new Set(['ubuntu', 'root', 'nobody']);

function notProtectedUser(control: AbstractControl): ValidationErrors | null {
  return PROTECTED_USERNAMES.has(control.value) ? { protectedUser: true } : null;
}

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatMenuModule,
    MatChipsModule,
    MatSnackBarModule,
    MatCardModule,
    MatTooltipModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
  ],
  templateUrl: './users.html',
  styleUrl: './users.css',
})
export class UsersComponent implements OnInit {
  private snackBar = inject(MatSnackBar);
  private fb = inject(FormBuilder);
  private userService = inject(UserService);

  columns = ['username', 'home_dir', 'shell', 'status', 'ftp', 'actions'];

  users = signal<HostUser[]>([]);
  isLoading = signal(false);
  error = signal<string | null>(null);

  // Add user dialog
  showAddDialog = signal(false);
  isSubmitting = signal(false);
  addForm = this.fb.group({
    username: ['', [Validators.required, Validators.pattern(/^[a-z_][a-z0-9_-]{0,30}$/), notProtectedUser]],
    password: ['', [Validators.minLength(8)]],
    portal_password: ['', [Validators.minLength(8)]],
  });

  // Change password dialog
  showPasswordDialog = signal(false);
  selectedUser = signal<HostUser | null>(null);
  passwordForm = this.fb.group({
    new_password: ['', [Validators.required, Validators.minLength(8)]],
  });

  // Delete confirmation dialog
  showDeleteDialog = signal(false);
  userToDelete = signal<HostUser | null>(null);
  userResources = signal<UserResources | null>(null);
  isLoadingResources = signal(false);
  isDeleting = signal(false);

  // FTP enable dialog
  showFtpDialog = signal(false);
  ftpUser = signal<HostUser | null>(null);
  ftpForm = this.fb.group({
    password:     ['', [Validators.required, Validators.minLength(8)]],
    subdirectory: [''],
  });

  get ftpPasswordStrength(): number {
    const pw = this.ftpForm.get('password')?.value || '';
    if (!pw) return 0;
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return Math.min(score, 4);
  }

  get ftpStrengthLabel(): string {
    return ['', 'Weak', 'Fair', 'Good', 'Strong'][this.ftpPasswordStrength] || '';
  }

  get ftpStrengthColor(): string {
    return ['', '#ef4444', '#f59e0b', '#3b82f6', '#10b981'][this.ftpPasswordStrength] || '';
  }

  ngOnInit() {
    this.loadUsers();
  }

  loadUsers() {
    this.isLoading.set(true);
    this.error.set(null);
    this.userService.getUsers().subscribe({
      next: (users) => {
        this.users.set(users);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load users.');
        this.isLoading.set(false);
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
    const { username, password, portal_password } = this.addForm.value;
    this.userService.createUser(username!, password || undefined, portal_password || undefined).subscribe({
      next: () => {
        this.showAddDialog.set(false);
        this.isSubmitting.set(false);
        this.snackBar.open(`User ${username} created`, 'Dismiss', { duration: 3000 });
        this.loadUsers();
      },
      error: (err) => {
        this.isSubmitting.set(false);
        const detail = err.error?.detail || 'Failed to create user.';
        this.snackBar.open(detail, 'Dismiss', { duration: 4000 });
      }
    });
  }

  toggleSuspend(user: HostUser) {
    const suspend = user.status === 'active';
    this.userService.setSuspend(user.username, suspend).subscribe({
      next: () => {
        const action = suspend ? 'suspended' : 'unsuspended';
        this.snackBar.open(`User ${user.username} ${action}`, 'Dismiss', { duration: 2500 });
        this.loadUsers();
      },
      error: (err) => {
        const detail = err.error?.detail || 'Failed to update user status.';
        this.snackBar.open(detail, 'Dismiss', { duration: 4000 });
      }
    });
  }

  openPassword(user: HostUser) {
    this.selectedUser.set(user);
    this.passwordForm.reset();
    this.showPasswordDialog.set(true);
  }

  submitPassword() {
    if (this.passwordForm.invalid || !this.selectedUser()) return;
    const username = this.selectedUser()!.username;
    const new_password = this.passwordForm.value.new_password!;
    this.userService.changePassword(username, new_password).subscribe({
      next: () => {
        this.showPasswordDialog.set(false);
        this.snackBar.open(`Password updated for ${username}`, 'Dismiss', { duration: 3000 });
      },
      error: (err) => {
        const detail = err.error?.detail || 'Failed to change password.';
        this.snackBar.open(detail, 'Dismiss', { duration: 4000 });
      }
    });
  }

  confirmDelete(user: HostUser) {
    this.userToDelete.set(user);
    this.userResources.set(null);
    this.showDeleteDialog.set(true);
    this.isLoadingResources.set(true);
    this.userService.getUserResources(user.username).subscribe({
      next: (resources) => {
        this.userResources.set(resources);
        this.isLoadingResources.set(false);
      },
      error: () => this.isLoadingResources.set(false),
    });
  }

  executeDelete() {
    const user = this.userToDelete();
    if (!user) return;
    this.isDeleting.set(true);
    this.userService.deleteUser(user.username).subscribe({
      next: () => {
        this.isDeleting.set(false);
        this.showDeleteDialog.set(false);
        this.snackBar.open(`User ${user.username} and all resources deleted`, 'Dismiss', { duration: 3000 });
        this.loadUsers();
      },
      error: (err) => {
        this.isDeleting.set(false);
        this.showDeleteDialog.set(false);
        const detail = err.error?.detail || 'Failed to delete user.';
        this.snackBar.open(detail, 'Dismiss', { duration: 4000 });
      }
    });
  }

  onFtpChange(user: HostUser, event: any) {
    if (event.checked) {
      // Revert toggle until confirmed in dialog
      event.source.checked = false;
      this.ftpUser.set(user);
      this.ftpForm.reset({ password: '', subdirectory: '' });
      this.showFtpDialog.set(true);
    } else {
      this.disableFtp(user);
    }
  }

  submitEnableFtp() {
    if (this.ftpForm.invalid || !this.ftpUser()) return;
    const username = this.ftpUser()!.username;
    const password = this.ftpForm.value.password!;
    const sub = this.ftpForm.value.subdirectory?.trim().replace(/^\/+/, '');
    const directory = sub ? `/home/${username}/${sub}` : `/home/${username}`;
    this.userService.enableFtp(username, password, directory).subscribe({
      next: () => {
        this.showFtpDialog.set(false);
        this.snackBar.open(`FTP enabled for ${username}`, 'Dismiss', { duration: 3000 });
        this.loadUsers();
      },
      error: (err) => {
        const detail = err.error?.detail || 'Failed to enable FTP.';
        this.snackBar.open(detail, 'Dismiss', { duration: 4000 });
      }
    });
  }

  disableFtp(user: HostUser) {
    this.userService.disableFtp(user.username).subscribe({
      next: () => {
        this.snackBar.open(`FTP disabled for ${user.username}`, 'Dismiss', { duration: 2500 });
        this.loadUsers();
      },
      error: (err) => {
        const detail = err.error?.detail || 'Failed to disable FTP.';
        this.snackBar.open(detail, 'Dismiss', { duration: 4000 });
        this.loadUsers();
      }
    });
  }
}
