import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

export interface User {
  username: string;
  role: 'admin' | 'user';
}

interface AuthCtx {
  user: User | null;
  isAdmin: boolean;
  login(username: string, password: string): Promise<void>;
  logout(): void;
}

const AuthContext = createContext<AuthCtx>({
  user: null,
  isAdmin: false,
  login: async () => {},
  logout: () => {},
});

function getTokenExpiry(): number | null {
  const token = localStorage.getItem('auth_token');
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.exp ? payload.exp * 1000 : null;
  } catch { return null; }
}

function clearStoredSession() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('username');
  localStorage.removeItem('user_role');
}

function loadStoredUser(): User | null {
  const username = localStorage.getItem('username');
  const role = localStorage.getItem('user_role') as 'admin' | 'user' | null;
  if (!username || !role) return null;
  const expiry = getTokenExpiry();
  if (expiry && Date.now() > expiry) { clearStoredSession(); return null; }
  return { username, role };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(loadStoredUser);

  const login = useCallback(async (username: string, password: string) => {
    const form = new FormData();
    form.append('username', username);
    form.append('password', password);

    const r = await fetch('/cpanelapi/token', { method: 'POST', body: form });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: 'Login failed' }));
      throw new Error(err.detail ?? 'Login failed');
    }
    const { access_token } = await r.json() as { access_token: string };

    const payload = JSON.parse(atob(access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const role: 'admin' | 'user' = payload.role === 'admin' ? 'admin' : 'user';

    localStorage.setItem('auth_token', access_token);
    localStorage.setItem('username', username);
    localStorage.setItem('user_role', role);
    setUser({ username, role });
  }, []);

  const logout = useCallback(() => {
    clearStoredSession();
    setUser(null);
  }, []);

  // Listen for sdk.fetch 401 which dispatches a synthetic storage event
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'auth_token' && !e.newValue) setUser(null);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Auto-logout when JWT exp is reached (handles idle sessions)
  useEffect(() => {
    if (!user) return;
    const expiry = getTokenExpiry();
    if (!expiry) return;
    const delay = expiry - Date.now();
    if (delay <= 0) { logout(); return; }
    const timer = setTimeout(logout, delay);
    return () => clearTimeout(timer);
  }, [user, logout]);

  return (
    <AuthContext.Provider value={{ user, isAdmin: user?.role === 'admin', login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthCtx {
  return useContext(AuthContext);
}
