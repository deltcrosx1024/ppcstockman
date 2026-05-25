"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Dashboard() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);

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
        } catch (e) {
          setUsername(null);
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
            <strong>PPC Stock Management</strong>
            <p>{username ? `Signed in as ${username}` : 'Dashboard'}</p>
          </div>
        </div>
        <button className="button button-secondary" onClick={handleLogout}>
          Sign out
        </button>
      </header>

      <section style={{ padding: '2rem' }}>
        <h1>Welcome{username ? `, ${username}` : ''}.</h1>
        <p>This is a placeholder dashboard. Wire up app routes and components as needed.</p>
      </section>
    </main>
  );
}
