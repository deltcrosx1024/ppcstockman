"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function SuperAdminDashboard() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<Array<any>>([]);
  const [users, setUsers] = useState<Array<any>>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Check authentication and authorization on mount
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
        
        // Check if user is super_admin
        if (payload?.role !== 'super_admin') {
          router.replace('/dashboard');
          return;
        }
      }
    } catch (e) {
      console.error('Failed to parse token:', e);
      router.replace('/');
    }
  }, [router]);

  // Fetch organizations (placeholder - in real app, this would come from API)
  useEffect(() => {
    if (!localStorage.getItem('ppc_token')) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // In a real app, we would fetch from API
        // For now, we'll use mock data
        const mockOrganizations = [
          {
            id: 'org_001',
            name: 'PPC Stock Management',
            contactEmail: 'admin@ppcstock.local',
            contactPhone: '+1 (555) 123-4567',
            address: '123 Motorcycle Ave, Repair City, MC 12345',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
            isActive: true
          }
        ];
        
        setOrganizations(mockOrganizations);
        
        // Fetch users from API
        const token = localStorage.getItem('ppc_token');
        const response = await fetch('/api/users', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch users: ${response.status}`);
        }
        
        const data = await response.json();
        setUsers(data.users || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        setUsers([]);
        setOrganizations([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleLogout = () => {
    try {
      localStorage.removeItem('ppc_token');
    } catch (e) {
      // ignore
    }
    router.push('/');
  };

  // Loading state
  if (loading) {
    return (
      <main className="page-wrapper">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">PPC</span>
            <div>
              <strong>Super Administrator</strong>
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
          <h1>Super Administrator Dashboard</h1>
          <p>Loading organization and user data...</p>
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
              <strong>Super Administrator</strong>
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
          <h1>Super Administrator Dashboard</h1>
          <p className="text-danger">Error: {error}</p>
          <button className="button button-primary" onClick={() => window.location.reload()}>
            Try Again
          </button>
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
            <strong>Super Administrator</strong>
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
        <h1>Super Administrator Dashboard</h1>
        <p>Manage organizations, users, and system-wide configurations.</p>

        <div className="dashboard-grid">
          {/* Organization Management Card */}
          <Link href="/dashboard/super-admin/organizations" className="dashboard-card">
            <div className="dashboard-card-content">
              <div className="dashboard-card-icon">🏢</div>
              <h3>Organization Management</h3>
              <p>Configure and manage organization settings</p>
            </div>
          </Link>

          {/* User Management Card */}
          <Link href="/dashboard/super-admin/users" className="dashboard-card">
            <div className="dashboard-card-content">
              <div className="dashboard-card-icon">👥</div>
              <h3>User Management</h3>
              <p>Manage members, employees, and user roles</p>
            </div>
          </Link>

          {/* System Overview Card */}
          <Link href="/dashboard/super-admin/overview" className="dashboard-card">
            <div className="dashboard-card-content">
              <div className="dashboard-card-icon">📊</div>
              <h3>System Overview</h3>
              <p>Oversee organization-wide data and workflows</p>
            </div>
          </Link>

          {/* System Settings Card */}
          <Link href="/dashboard/super-admin/settings" className="dashboard-card">
            <div className="dashboard-card-content">
              <div className="dashboard-card-icon">⚙️</div>
              <h3>System Settings</h3>
              <p>Configure system-level configurations</p>
            </div>
          </Link>
        </div>

        {/* Organizations Section */}
        <div style={{ marginTop: '2rem' }}>
          <h2>Organizations ({organizations.length})</h2>
          {organizations.length === 0 ? (
            <p>No organizations found.</p>
          ) : (
            <div className="organization-table">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Contact Email</th>
                    <th>Status</th>
                    <th>Created At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {organizations.map((org, index) => (
                    <tr key={index}>
                      <td>{org.name}</td>
                      <td>{org.contactEmail}</td>
                      <td>
                        <span className={org.isActive ? 'status-active' : 'status-inactive'}>
                          {org.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>{new Date(org.createdAt).toLocaleDateString()}</td>
                      <td>
                        <button className="button button-small" onClick={() => alert(`Edit organization: ${org.name}`)}>
                          Edit
                        </button>
                        {!org.isActive && (
                          <button className="button button-small button-success" onClick={() => alert(`Activate organization: ${org.name}`)}>
                            Activate
                          </button>
                        )}
                        {org.isActive && (
                          <button className="button button-small button-danger" onClick={() => alert(`Deactivate organization: ${org.name}`)}>
                            Deactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Users Section */}
        <div style={{ marginTop: '2rem' }}>
          <h2>Users ({users.length})</h2>
          {users.length === 0 ? (
            <p>No users found.</p>
          ) : (
            <div className="user-table">
              <table>
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Organization</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user, index) => (
                    <tr key={index}>
                      <td>{user.username}</td>
                      <td>{user.email}</td>
                      <td>
                        <span className={`role-${user.role}`}>
                          {user.role.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td>{user.organizationId || 'N/A'}</td>
                      <td>
                        <span className={user.isActive ? 'status-active' : 'status-inactive'}>
                          {user.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <button className="button button-small" onClick={() => alert(`Edit user: ${user.username}`)}>
                          Edit
                        </button>
                        {!user.isActive && (
                          <button className="button button-small button-success" onClick={() => alert(`Activate user: ${user.username}`)}>
                            Activate
                          </button>
                        )}
                        {user.isActive && (
                          <button className="button button-small button-danger" onClick={() => alert(`Deactivate user: ${user.username}`)}>
                            Deactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}