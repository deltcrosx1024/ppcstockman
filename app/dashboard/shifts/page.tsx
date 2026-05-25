"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ShiftsDashboard() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

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

  return (
    <main className="page-wrapper">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">PPC</span>
          <div>
            <strong>Shift Management</strong>
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
        <h1>Shift Management</h1>
        <p>Manage employee shifts and track work hours.</p>

        <div className="dashboard-grid">
          <Link href="/dashboard/shifts/list" className="dashboard-card">
            <div className="dashboard-card-content">
              <div className="dashboard-card-icon">📅</div>
              <h3>Shift Schedule</h3>
              <p>View and manage employee shifts</p>
            </div>
          </Link>
          
          <Link href="/dashboard/shifts/attendance" className="dashboard-card">
            <div className="dashboard-card-content">
              <div className="dashboard-card-icon">⏱️</div>
              <h3>Shift Attendance</h3>
              <p>Track clock-ins and clock-outs</p>
            </div>
          </Link>
        </div>
      </section>
    </main>
  );
}