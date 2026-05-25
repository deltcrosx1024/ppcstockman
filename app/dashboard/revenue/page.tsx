"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RevenueDashboard() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    try {
      const token = localStorage.getItem('ppc_token');
      if (!token) {
        router.replace('/');
        return;
      }

      // try to decode payload — token is a JWT-like base64url string
      const parts = token.split('.');
      if (parts.length >= 2) {
        try {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          setUsername(payload?.username ?? null);
          setRole(payload?.role ?? null);
        } catch (e) {
          setUsername(null);
          setRole(null);
        }
      }
    } catch (err) {
      router.replace('/');
    }
  }, [router]);

  function handleLogout() {
    try {
      localStorage.removeItem('ppc_token');
    } catch (e) {
      // ignore
    }
    router.push('/');
  }

  return (
    <main className="page-wrapper">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">PPC</span>
          <div>
            <strong>Revenue & Reports</strong>
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
        <h1>Revenue & Reports</h1>
        <p>View financial summaries, shift performance, and business analytics.</p>

        <div className="dashboard-grid">
          <Link href="/dashboard/revenue/summary" className="dashboard-card">
            <div className="dashboard-card-content">
              <div className="dashboard-card-icon">💰</div>
              <h3>Revenue Summary</h3>
              <p>View real-time financial summaries per shift or date range</p>
            </div>
          </Link>
          
          <Link href="/dashboard/revenue/shifts" className="dashboard-card">
            <div className="dashboard-card-content">
              <div className="dashboard-card-icon">⏰</div>
              <h3>Shift Reports</h3>
              <p>Analyze shift performance and expected vs actual revenue</p>
            </div>
          </Link>
          
          <Link href="/dashboard/revenue/transactions" className="dashboard-card">
            <div className="dashboard-card-content">
              <div className="dashboard-card-icon">📋</div>
              <h3>Transaction History</h3>
              <p>View detailed transaction history and sales reports</p>
            </div>
          </Link>
        </div>
      </section>
    </main>
  );
}