import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { ThemeProvider } from './lib/theme';
import { PluginsProvider } from './lib/plugins';
import { ToastProvider } from './components/ui/Toast';
import { Shell } from './components/layout/Shell';
import { PackageShell } from './components/pkg/PackageShell';
import { PageSpinner } from './components/ui/Spinner';

const Login     = lazy(() => import('./features/auth/Login'));
const Dashboard = lazy(() => import('./features/dashboard/Dashboard'));
const Dns       = lazy(() => import('./features/dns/Dns'));
const Users     = lazy(() => import('./features/users/Users'));
const Ssh       = lazy(() => import('./features/ssh/Ssh'));
const Ssl       = lazy(() => import('./features/ssl/Ssl'));
const Services  = lazy(() => import('./features/services/Services'));
const Packages  = lazy(() => import('./features/packages/Packages'));
const AuditLog  = lazy(() => import('./features/audit/AuditLog'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/app/pkg/files" replace />;
  return <>{children}</>;
}

function S({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageSpinner />}>{children}</Suspense>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<S><Login /></S>} />
      <Route path="/app" element={<ProtectedRoute><Shell /></ProtectedRoute>}>
        <Route index element={<Navigate to="pkg/files" replace />} />
        <Route path="dashboard" element={<AdminRoute><S><Dashboard /></S></AdminRoute>} />
        <Route path="services"  element={<AdminRoute><S><Services /></S></AdminRoute>} />
        <Route path="packages"  element={<AdminRoute><S><Packages /></S></AdminRoute>} />
        <Route path="users"     element={<AdminRoute><S><Users /></S></AdminRoute>} />
        <Route path="dns"       element={<AdminRoute><S><Dns /></S></AdminRoute>} />
        <Route path="ssh"       element={<AdminRoute><S><Ssh /></S></AdminRoute>} />
        <Route path="ssl"       element={<AdminRoute><S><Ssl /></S></AdminRoute>} />
        <Route path="audit"     element={<AdminRoute><S><AuditLog /></S></AdminRoute>} />
        <Route path="pkg/:slug" element={<PackageShell />} />
        <Route path=":slug"     element={<PackageShell />} />
      </Route>
      <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <PluginsProvider>
          <ToastProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </ToastProvider>
        </PluginsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
