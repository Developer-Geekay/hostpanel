import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { AuthService } from '../../services/auth.service';

interface SshKey {
  id: string;
  label: string;
  type: string;
  fingerprint: string;
  username: string;
}

interface UserSshState {
  username: string;
  sshEnabled: boolean;
}

@Component({
  selector: 'app-ssh',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatChipsModule,
    MatSnackBarModule,
    MatCardModule,
    MatTooltipModule,
    MatDividerModule,
  ],
  templateUrl: './ssh.html',
  styleUrl: './ssh.css',
})
export class SshComponent implements OnInit {
  private snackBar = inject(MatSnackBar);
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);

  isAdmin = this.authService.isAdminSignal;

  columns = ['label', 'type', 'fingerprint', 'actions'];

  users: UserSshState[] = [];

  selectedUsername = signal(this.authService.currentUser() ?? '');

  allKeys = signal<SshKey[]>([
    { id: '1', label: 'MacBook Pro', type: 'ed25519', fingerprint: 'SHA256:aBcDeFgH...X4Y5Z6W', username: 'alice' },
    { id: '2', label: 'Work Laptop', type: 'rsa', fingerprint: 'SHA256:1234567...ABCDEFGH', username: 'alice' },
    { id: '3', label: 'Home Desktop', type: 'ed25519', fingerprint: 'SHA256:zyxwvut...9876543', username: 'bob' },
  ]);

  filteredKeys = computed(() =>
    this.allKeys().filter(k => k.username === this.selectedUsername())
  );

  selectedUser = computed(() =>
    this.users.find(u => u.username === this.selectedUsername())
  );

  ngOnInit() {
    const me = this.authService.currentUser() ?? '';
    this.users = this.isAdmin()
      ? [{ username: me, sshEnabled: true }]
      : [{ username: me, sshEnabled: true }];
    this.selectedUsername.set(me);
  }

  showAddDialog = signal(false);
  addForm = this.fb.group({
    label: ['', Validators.required],
    public_key: ['', [Validators.required, Validators.pattern(/^(ssh-(rsa|ed25519|dss)|ecdsa-sha2-nistp\d+)\s+\S+/)]],
  });

  toggleSshAccess(user: UserSshState) {
    user.sshEnabled = !user.sshEnabled;
    this.snackBar.open(
      `SSH access ${user.sshEnabled ? 'enabled' : 'disabled'} for ${user.username}`,
      'Dismiss', { duration: 2500 }
    );
  }

  openAdd() { this.addForm.reset(); this.showAddDialog.set(true); }

  submitAdd() {
    if (this.addForm.invalid) return;
    const v = this.addForm.value;
    const type = v.public_key!.startsWith('ssh-rsa') ? 'rsa' : 'ed25519';
    this.allKeys.update(keys => [...keys, {
      id: Date.now().toString(),
      label: v.label!,
      type,
      fingerprint: `SHA256:${Math.random().toString(36).slice(2, 10)}...`,
      username: this.selectedUsername(),
    }]);
    this.showAddDialog.set(false);
    this.snackBar.open(`SSH key "${v.label}" added`, 'Dismiss', { duration: 3000 });
  }

  deleteKey(key: SshKey) {
    this.allKeys.update(keys => keys.filter(k => k.id !== key.id));
    this.snackBar.open(`Key "${key.label}" removed`, 'Dismiss', { duration: 3000 });
  }
}
