"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function InventoryDashboard() {
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
            <strong>Inventory Management</strong>
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
        <h1>Inventory Management</h1>
        <p>Manage your motorcycle parts and inventory.</p>

        <div className="dashboard-grid">
          <Link href="/dashboard/inventory/items" className="dashboard-card">
            <div className="dashboard-card-content">
              <div className="dashboard-card-icon">📦</div>
              <h3>Inventory Items</h3>
              <p>View, add, edit, and manage inventory items</p>
            </div>
          </Link>
          
          <Link href="/dashboard/inventory/movements" className="dashboard-card">
            <div className="dashboard-card-content">
              <div className="dashboard-card-icon">📥📤</div>
              <h3>Stock Movements</h3>
              <p>Record inbound and outbound inventory movements</p>
            </div>
          </Link>
          
          <Link href="/dashboard/inventory/barcodes" className="dashboard-card">
            <div className="dashboard-card-content">
              <div className="dashboard-card-icon">🔖</div>
              <h3>Barcode Registry</h3>
              <p>Manage barcode mappings for items</p>
            </div>
          </Link>
          
          <Link href="/dashboard/inventory/label" className="dashboard-card">
            <div className="dashboard-card-content">
              <div className="dashboard-card-icon">🏷️</div>
              <h3>Label Printing</h3>
              <p>Generate labels for inventory items</p>
            </div>
          </Link>
          
          <Link href="/dashboard/inventory/budget" className="dashboard-card">
            <div className="dashboard-card-content">
              <div className="dashboard-card-icon">💰</div>
              <h3>Daily Budget</h3>
              <p>View daily input/output value summaries</p>
            </div>
          </Link>
          
          <Link href="/dashboard/inventory/import" className="dashboard-card">
            <div className="dashboard-card-content">
              <div className="dashboard-card-icon">📥</div>
              <h3>Import Inventory</h3>
              <p>Bulk import items from Excel/CSV or Loyverse</p>
            </div>
          </Link>
        </div>
      </section>
    </main>
  );
}