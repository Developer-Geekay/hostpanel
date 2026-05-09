import { Component, inject, signal, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { PackageService, HostPanelPackage } from '../../services/package.service';
import { AuthService } from '../../services/auth.service';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-packages',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatDialogModule,
  ],
  templateUrl: './packages.html',
  styleUrl: './packages.css',
})
export class PackagesComponent implements OnInit {
  private snackBar = inject(MatSnackBar);
  private fb = inject(FormBuilder);
  private dialog = inject(MatDialog);
  private packageService = inject(PackageService);
  private authService = inject(AuthService);

  isAdmin = this.authService.isAdminSignal;

  columns = ['name', 'version', 'module', 'compatible', 'actions'];
  
  packages = signal<HostPanelPackage[]>([]);
  isLoading = signal(false);
  error = signal<string | null>(null);
  operationLogs = signal<string | null>(null);

  showInstallDialog = signal(false);
  isInstalling = signal(false);
  
  installForm = this.fb.group({
    package_source: ['']
  });

  selectedFile = signal<File | null>(null);

  ngOnInit() {
    this.loadPackages();
  }

  loadPackages() {
    this.isLoading.set(true);
    this.error.set(null);
    this.packageService.getInstalledPackages().subscribe({
      next: (response) => {
        this.packages.set(response.data || []);
        this.isLoading.set(false);
      },
      error: () => {
        this.error.set('Failed to load installed packages.');
        this.isLoading.set(false);
      }
    });
  }

  openInstall() {
    this.installForm.reset();
    this.selectedFile.set(null);
    this.showInstallDialog.set(true);
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile.set(file);
      this.installForm.patchValue({ package_source: '' });
    }
  }

  removeFile() {
    this.selectedFile.set(null);
  }

  submitInstall() {
    const source = this.installForm.value.package_source?.trim();
    const file = this.selectedFile();
    
    if (!source && !file) {
      this.snackBar.open('Please provide a package source or select a file.', 'Dismiss', { duration: 3000 });
      return;
    }
    
    this.isInstalling.set(true);
    
    const requestObservable = file 
      ? this.packageService.uploadPackage(file)
      : this.packageService.installPackage(source!);
    
    requestObservable.subscribe({
      next: (res) => {
        this.showInstallDialog.set(false);
        this.isInstalling.set(false);
        this.snackBar.open(res.message || 'Package installed successfully.', 'Dismiss', { duration: 5000 });
        if (res.logs) {
          this.operationLogs.set(res.logs);
        }
        this.loadPackages();
      },
      error: (err) => {
        this.isInstalling.set(false);
        const detail = err.error?.detail || 'Failed to install package.';
        this.snackBar.open(detail, 'Dismiss', { duration: 5000 });
      }
    });
  }

  uninstall(pkg: HostPanelPackage, force: boolean = false) {
    if (!force) {
      const dialogRef = this.dialog.open(ConfirmDialogComponent, {
        width: '400px',
        data: {
          title: 'Confirm Uninstallation',
          message: `Are you sure you want to uninstall ${pkg.name}? This will require an API restart.`,
          confirmText: 'Uninstall'
        }
      });
      
      dialogRef.afterClosed().subscribe(result => {
        if (result) {
          this.executeUninstall(pkg, force);
        }
      });
    } else {
      this.executeUninstall(pkg, force);
    }
  }
  
  private executeUninstall(pkg: HostPanelPackage, force: boolean) {
    this.isLoading.set(true);
    this.packageService.uninstallPackage(pkg.name, force).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.snackBar.open(res.message || `Package ${pkg.name} uninstalled.`, 'Dismiss', { duration: 5000 });
        if (res.logs) {
          this.operationLogs.set(res.logs);
        }
        this.loadPackages();
      },
      error: (err) => {
        this.isLoading.set(false);
        
        if (err.status === 409) {
          const detail = err.error?.detail || 'This package requires consent to uninstall.';
          
          const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            width: '500px',
            data: {
              title: 'WARNING: Action Required',
              message: detail,
              confirmText: 'Force Uninstall'
            }
          });
          
          dialogRef.afterClosed().subscribe(result => {
            if (result) {
              this.executeUninstall(pkg, true);
            }
          });
        } else {
          const detail = err.error?.detail || `Failed to uninstall ${pkg.name}.`;
          this.snackBar.open(detail, 'Dismiss', { duration: 5000 });
        }
      }
    });
  }
}
