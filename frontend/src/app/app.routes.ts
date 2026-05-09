import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login';
import { ShellComponent } from './layout/shell/shell';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: 'app',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'files', pathMatch: 'full' },
      {
        path: 'dashboard',
        canActivate: [adminGuard],
        loadComponent: () => import('./components/dashboard/dashboard').then(m => m.DashboardComponent),
      },
      {
        path: 'services',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/services/services').then(m => m.ServicesComponent),
      },
      {
        path: 'users',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/users/users').then(m => m.UsersComponent),
      },
      {
        path: 'dns',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/dns/dns').then(m => m.DnsComponent),
      },
      {
        path: 'ssh',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/ssh/ssh').then(m => m.SshComponent),
      },
      {
        path: 'ssl',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/ssl/ssl').then(m => m.SslComponent),
      },
      {
        path: 'packages',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/packages/packages').then(m => m.PackagesComponent),
      },
      {
        path: 'databases',
        loadComponent: () => import('./features/databases/databases').then(m => m.DatabasesComponent),
      },
      {
        path: 'files',
        loadComponent: () => import('./features/files/files').then(m => m.FilesComponent),
      },
    ],
  },
  { path: '', redirectTo: '/app/files', pathMatch: 'full' },
  { path: '**', redirectTo: '/app/files' },
];
