"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function PosDashboard() {
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

  return (
    <main className="page-wrapper">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">PPC</span>
          <div>
            <strong>Point of Sale (POS)</strong>
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
        <h1>Point of Sale (POS)</h1>
        <p>Process sales transactions and manage customer purchases.</p>

        <div className="dashboard-grid">
          <Link href="/dashboard/pos/cart" className="dashboard-card">
            <div className="dashboard-card-content">
              <div className="dashboard-card-icon">🛒</div>
              <h3>Shopping Cart</h3>
              <p>Manage items for current sale</p>
            </div>
          </Link>
          
          <Link href="/dashboard/pos/orders" className="dashboard-card">
            <div className="dashboard-card-content">
              <div className="dashboard-card-icon">📋</div>
              <h3>Order History</h3>
              <p>View and manage completed sales orders</p>
            </div>
          </Link>
          
          <Link href="/dashboard/pos/receipts" className="dashboard-card">
            <div className="dashboard-card-content">
              <div className="dashboard-card-icon">🧾</div>
              <h3>Receipts</h3>
              <p>View and print sales receipts</p>
            </div>
          </Link>
        </div>
      </section>
    </main>
  );
}