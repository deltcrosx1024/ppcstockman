"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Dashboard() {
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

  // Define the menu items
  const menuItems = [
    {
      label: 'Inventory Management',
      href: '/dashboard/inventory',
      icon: '📦',
      roles: ['super_admin', 'admin', 'employee', 'cashier'],
    },
    {
      label: 'Point of Sale (POS)',
      href: '/dashboard/pos',
      icon: '💰',
      roles: ['super_admin', 'admin', 'employee', 'cashier'],
    },
    {
      label: 'Shift Management',
      href: '/dashboard/shifts',
      icon: '⏰',
      roles: ['super_admin', 'admin', 'employee'],
    },
    {
      label: 'Revenue & Reports',
      href: '/dashboard/revenue',
      icon: '📊',
      roles: ['super_admin', 'admin'],
    },
    {
      label: 'User Management',
      href: '/dashboard/users',
      icon: '👥',
      roles: ['super_admin', 'admin'],
    },
    {
      label: 'Loyverse Integration',
      href: '/dashboard/loyverse',
      icon: '🔗',
      roles: ['super_admin', 'admin'],
    },
  ];

  // Filter menu items based on user's role
  const visibleMenuItems = menuItems.filter(item =>
    item.roles.includes(role ?? '')
  );

  return (
    <main className="page-wrapper">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">PPC</span>
          <div>
            <strong>PPC Stock Management</strong>
            <p>
              {username ? `Signed in as ${username}` : 'Dashboard'}
              {role ? ` (${role})` : ''}
            </p>
          </div>
        </div>
        <Link href="/" className="button button-secondary">
          ← Home
        </Link>
        <button className="button button-secondary" onClick={handleLogout}>
          Sign out
        </button>
      </header>

      <section style={{ padding: '2rem' }}>
        <h1>Welcome{username ? `, ${username}` : ''}.</h1>
        <p>Select a module to manage your motorcycle repair and retail business.</p>

        <div className="dashboard-grid">
          {visibleMenuItems.map((item) => (
            <Link key={item.href} href={item.href} className="dashboard-card">
              <div className="dashboard-card-content">
                <div className="dashboard-card-icon">{item.icon}</div>
                <h3>{item.label}</h3>
                <p>Manage your {item.label.toLowerCase()}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}