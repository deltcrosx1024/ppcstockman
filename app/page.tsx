"use client";

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        setStatus({ type: 'error', message: data?.error || 'Login failed' });
      } else {
        // store token for client usage and navigate to dashboard
        if (data?.token) {
          try {
            localStorage.setItem('ppc_token', data.token);
          } catch (e) {
            // ignore storage errors
          }
        }
        setStatus({ type: 'success', message: data?.message || 'Login successful' });
        router.push('/dashboard');
      }
    } catch (error) {
      setStatus({ type: 'error', message: 'Network error — please try again.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-wrapper login-wrapper">
      <div className="login-card">
        <div className="login-header">
          <div className="login-brand">
            <span className="brand-mark">PPC</span>
            <div>
              <strong>PPC Stock Management</strong>
              <p>Access the warehouse, inventory, and POS dashboard.</p>
            </div>
          </div>
          <p className="login-intro">Sign in with your username and password to continue.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="form-label">
            Username
            <input
              className="input-field"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="admin"
              autoComplete="username"
              required
            />
          </label>

          <label className="form-label">
            Password
            <input
              type="password"
              className="input-field"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </label>

          <div className="form-actions">
            <button type="submit" className="button button-primary" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </div>

          {status ? (
            <div className={`status-message ${status.type === 'success' ? 'status-success' : 'status-error'}`}>
              {status.message}
            </div>
          ) : null}

          <p className="login-note">
            This is a prototype login page. If the username does not exist yet, it will be created automatically.
          </p>
        </form>
      </div>
    </main>
  );
}
