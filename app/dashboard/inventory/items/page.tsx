"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function InventoryItemsPage() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [items, setItems] = useState<Array<any>>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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

  // Fetch inventory items
  useEffect(() => {
    if (!localStorage.getItem('ppc_token')) return;

    const fetchItems = async () => {
      try {
        setLoading(true);
        setError(null);
        const token = localStorage.getItem('ppc_token');
        const response = await fetch('/api/inventory/items', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch items: ${response.status}`);
        }

        const data = await response.json();
        setItems(data.items || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, []);

  const handleLogout = () => {
    try {
      localStorage.removeItem('ppc_token');
    } catch (e) {
      // ignore
    }
    router.push('/');
  };

  const handleAddItem = () => {
    alert('Add item functionality would be implemented here');
  };

  // Loading state
  if (loading) {
    return (
      <main className="page-wrapper">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">PPC</span>
            <div>
              <strong>Inventory Items</strong>
            </div>
          </div>
          <Link href="/dashboard/inventory" className="button button-secondary">
            ← Back to Inventory
          </Link>
          <button className="button button-secondary" onClick={handleLogout}>
            Sign out
          </button>
        </header>

        <section style={{ padding: '2rem' }}>
          <h1>Inventory Items</h1>
          <p>Loading inventory items...</p>
        </section>
      </main>
    );
  }

  // Error state
  if (error) {
    return (
      <main className="page-wrapper">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">PPC</span>
            <div>
              <strong>Inventory Items</strong>
            </div>
          </div>
          <Link href="/dashboard/inventory" className="button button-secondary">
            ← Back to Inventory
          </Link>
          <button className="button button-secondary" onClick={handleLogout}>
            Sign out
          </button>
        </header>

        <section style={{ padding: '2rem' }}>
          <h1>Inventory Items</h1>
          <p className="text-danger">Error: {error}</p>
          <button className="button button-primary" onClick={() => window.location.reload()}>
            Try Again
          </button>
        </section>
      </main>
    );
  }

  // Success state
  return (
    <main className="page-wrapper">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">PPC</span>
          <div>
            <strong>Inventory Items</strong>
            <p>
              {username ? `Signed in as ${username}` : 'Dashboard'}
              {role ? ` (${role})` : ''}
            </p>
          </div>
        </div>
        <Link href="/dashboard/inventory" className="button button-secondary">
          ← Back to Inventory
        </Link>
        <button className="button button-primary" onClick={handleAddItem}>
          Add New Item
        </button>
        <button className="button button-secondary" onClick={handleLogout}>
          Sign out
        </button>
      </header>

      <section style={{ padding: '2rem' }}>
        <h1>Inventory Items ({items.length})</h1>
        {items.length === 0 ? (
          <p>No inventory items found. Add some items to get started.</p>
        ) : (
          <div className="inventory-table">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Barcode</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index}>
                    <td>{item.name}</td>
                    <td>{item.barcode}</td>
                    <td>{item.category}</td>
                    <td>${item.salePrice?.toFixed(2) ?? '0.00'}</td>
                    <td>{item.quantityInStock}</td>
                    <td>
                      <button className="button button-small" onClick={() => alert('Edit item: ' + item.name)}>
                        Edit
                      </button>
                      <button className="button button-small button-danger" onClick={() => alert('Delete item: ' + item.name)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}