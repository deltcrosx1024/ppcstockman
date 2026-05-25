"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function SuperAdminOrganizations() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<Array<any>>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [editingOrg, setEditingOrg] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    contactEmail: '',
    contactPhone: '',
    address: ''
  });

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

  // Fetch organizations
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
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
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

  const handleCreateClick = () => {
    setFormData({
      name: '',
      contactEmail: '',
      contactPhone: '',
      address: ''
    });
    setShowCreateModal(true);
  };

  const handleEditClick = (org: any) => {
    setEditingOrg(org);
    setFormData({
      name: org.name,
      contactEmail: org.contactEmail,
      contactPhone: org.contactPhone,
      address: org.address
    });
    setShowEditModal(true);
  };

  const handleDeleteClick = (orgId: string) => {
    if (window.confirm('Are you sure you want to delete this organization? This action cannot be undone.')) {
      // In a real app, we would call the API to delete the organization
      alert(`Organization deleted: ${orgId}`);
      // Refresh the list
      // In a real app, we would refetch the data
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // In a real app, we would call the API to create the organization
      alert('Organization created successfully!');
      setShowCreateModal(false);
      // Refresh the list
      // In a real app, we would refetch the data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization');
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // In a real app, we would call the API to update the organization
      alert('Organization updated successfully!');
      setShowEditModal(false);
      // Refresh the list
      // In a real app, we would refetch the data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update organization');
    }
  };

  // Loading state
  if (loading) {
    return (
      <main className="page-wrapper">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">PPC</span>
            <div>
              <strong>Organization Management</strong>
            </div>
          </div>
          <Link href="/dashboard/super-admin" className="button button-secondary">
            ← Back to Super Admin
          </Link>
          <button className="button button-secondary" onClick={handleLogout}>
            Sign out
          </button>
        </header>

        <section style={{ padding: '2rem' }}>
          <h1>Organization Management</h1>
          <p>Loading organizations...</p>
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
              <strong>Organization Management</strong>
            </div>
          </div>
          <Link href="/dashboard/super-admin" className="button button-secondary">
            ← Back to Super Admin
          </Link>
          <button className="button button-secondary" onClick={handleLogout}>
            Sign out
          </button>
        </header>

        <section style={{ padding: '2rem' }}>
          <h1>Organization Management</h1>
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
            <strong>Organization Management</strong>
            <p>
              {username ? `Signed in as ${username}` : 'Dashboard'}
              {role ? ` (${role})` : ''}
            </p>
          </div>
        </div>
        <Link href="/dashboard/super-admin" className="button button-secondary">
          ← Back to Super Admin
        </Link>
        <button className="button button-secondary" onClick={handleLogout}>
          Sign out
        </button>
      </header>

      <section style={{ padding: '2rem' }}>
        <h1>Organization Management</h1>
        <p>Configure and manage organization settings.</p>

        {/* Create Organization Button */}
        <div style={{ marginBottom: '1.5rem' }}>
          <button className="button button-primary" onClick={handleCreateClick}>
            + Create New Organization
          </button>
        </div>

        {/* Organizations Table */}
        <div>
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
                    <th>Contact Phone</th>
                    <th>Address</th>
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
                      <td>{org.contactPhone}</td>
                      <td>{org.address}</td>
                      <td>
                        <span className={org.isActive ? 'status-active' : 'status-inactive'}>
                          {org.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>{new Date(org.createdAt).toLocaleDateString()}</td>
                      <td>
                        <button className="button button-small" onClick={() => handleEditClick(org)}>
                          Edit
                        </button>
                        <button className="button button-small button-danger" onClick={() => handleDeleteClick(org.id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Create Organization Modal */}
        {showCreateModal && (
          <div className="modal-backdrop" onClick={() => setShowCreateModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2>Create New Organization</h2>
              <form onSubmit={handleCreateSubmit}>
                <div className="form-group">
                  <label htmlFor="orgName">Organization Name:</label>
                  <input
                    type="text"
                    id="orgName"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="orgEmail">Contact Email:</label>
                  <input
                    type="email"
                    id="orgEmail"
                    value={formData.contactEmail}
                    onChange={(e) => setFormData({...formData, contactEmail: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="orgPhone">Contact Phone:</label>
                  <input
                    type="tel"
                    id="orgPhone"
                    value={formData.contactPhone}
                    onChange={(e) => setFormData({...formData, contactPhone: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="orgAddress">Address:</label>
                  <textarea
                    id="orgAddress"
                    value={formData.address}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                    rows={3}
                  />
                </div>
                <div className="form-actions">
                  <button type="button" className="button button-secondary" onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="button button-primary">
                    Create Organization
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Organization Modal */}
        {showEditModal && editingOrg && (
          <div className="modal-backdrop" onClick={() => setShowEditModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2>Edit Organization</h2>
              <form onSubmit={handleEditSubmit}>
                <div className="form-group">
                  <label htmlFor="editOrgName">Organization Name:</label>
                  <input
                    type="text"
                    id="editOrgName"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="editOrgEmail">Contact Email:</label>
                  <input
                    type="email"
                    id="editOrgEmail"
                    value={formData.contactEmail}
                    onChange={(e) => setFormData({...formData, contactEmail: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="editOrgPhone">Contact Phone:</label>
                  <input
                    type="tel"
                    id="editOrgPhone"
                    value={formData.contactPhone}
                    onChange={(e) => setFormData({...formData, contactPhone: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="editOrgAddress">Address:</label>
                  <textarea
                    id="editOrgAddress"
                    value={formData.address}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                    rows={3}
                  />
                </div>
                <div className="form-actions">
                  <button type="button" className="button button-secondary" onClick={() => setShowEditModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="button button-primary">
                    Update Organization
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}