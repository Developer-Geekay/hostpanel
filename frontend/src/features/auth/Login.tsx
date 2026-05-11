import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Server } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { Button } from '../../components/ui/Button';

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!username.trim() || !password) return;
      setError('');
      setLoading(true);
      try {
        await login(username.trim(), password);
        const role = localStorage.getItem('user_role');
        navigate(role === 'admin' ? '/app/dashboard' : '/app/files', { replace: true });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Login failed');
      } finally {
        setLoading(false);
      }
    },
    [login, navigate, username, password]
  );

  if (user) {
    navigate(user.role === 'admin' ? '/app/dashboard' : '/app/files', { replace: true });
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--bg)',
        padding: 16,
      }}
    >
      <div
        className="card animate-fade-in"
        style={{ width: '100%', maxWidth: 400, padding: '36px 32px' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 'var(--radius-lg)',
              background: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 14,
              color: 'var(--accent-text)',
            }}
          >
            <Server size={24} strokeWidth={1.5} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.03em', color: 'var(--text)' }}>
            HostPanel
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>
            Sign in to your control panel
          </p>
        </div>

        {error && (
          <div
            className="badge badge-err animate-fade-in"
            style={{ width: '100%', marginBottom: 16, padding: '10px 12px', borderRadius: 'var(--radius-sm)', fontSize: 13 }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              placeholder="admin"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={loading}
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                tabIndex={-1}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-2)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 4,
                }}
              >
                {showPassword ? <EyeOff size={15} strokeWidth={1.5} /> : <Eye size={15} strokeWidth={1.5} />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            style={{ marginTop: 4, width: '100%' }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  );
}
