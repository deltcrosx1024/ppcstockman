"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoyverseDashboard() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  // Check authentication on mount
  useEffect(() => {
    const token = localStorage.getItem('ppc_token');
    if (!token) {
      router.replace('/');
      return;
    }

    try {
      const parts = token.split('.');
      if (parts.length >= 2) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        setUsername(payload?.username ?? null);
        setRole(payload?.role ?? null);
      }
    } catch (e) {
      console.error('Failed to parse token:', e);
      router.replace('/');
    }
  }, [router]);

  const handleLogout = () => {
    try {
      localStorage.removeItem('ppc_token');
    } catch (e) {
      // ignore
    }
    router.push('/');
  };

  // Only super_admin and admin can access Loyverse integration
  if (role !== 'super_admin' && role !== 'admin') {
    return (
      <main className="page-wrapper">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">PPC</span>
            <div>
              <strong>Access Denied</strong>
            </div>
          </div>
          <Link href="/dashboard" className="button button-secondary">
            ← Back to Dashboard
          </Link>
          <button className="button button-secondary" onClick={handleLogout}>
            Sign out
          </button>
        </header>

        <section style={{ padding: '2rem' }}>
          <h1>Access Denied</h1>
          <p>You do not have permission to access the Loyverse Integration module.</p>
          <p>This module is restricted to Super Administrators and Administrators only.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-wrapper">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">PPC</span>
          <div>
            <strong>Loyverse Integration</strong>
            <p>
              {username ? `Signed in as ${username}` : 'Dashboard'}
              {role ? ` (${role})` : ''}
            </p>
          </div>
        </div>
        <Link href="/dashboard" className="button button-secondary">
          ← Back to Dashboard
        </Link>
        <button className="button button-secondary" onClick={handleLogout}>
          Sign out
        </button>
      </header>

      <section style={{ padding: '2rem' }}>
        <h1>Loyverse Integration</h1>
        <p>Synchronize your inventory with Loyverse POS system.</p>

        <div className="dashboard-grid">
          <Link href="/dashboard/loyverse/sync" className="dashboard-card">
            <div className="dashboard-card-content">
              <div className="dashboard-card-icon">🔄</div>
              <h3>Manual Synchronization</h3>
              <p>Fetch items from Loyverse API or push updates to Loyverse</p>
            </div>
          </Link>
          
          <Link href="/dashboard/loyverse/webhook" className="dashboard-card">
            <div className="dashboard-card-content">
              <div className="dashboard-card-icon">📡</div>
              <h3>Webhook Configuration</h3>
              <p>View and configure real-time webhook settings</p>
            </div>
          </Link>
          
          <Link href="/dashboard/loyverse/logs" className="dashboard-card">
            <div className="dashboard-card-content">
              <div className="dashboard-card-icon">📋</div>
              <h3>Integration Logs</h3>
              <p>View Loyverse synchronization history and logs</p>
            </div>
          </Link>
        </div>
      </section>
    </main>
  );
}