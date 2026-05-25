export interface User {
  id: string;
  username: string;
  email: string;
  role: 'super_admin' | 'admin' | 'employee' | 'cashier';
  passwordHash: string; // In practice, we would store a hash, not plain text
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface UserCredentials {
  username: string;
  password: string;
}

export interface UserCreateInput {
  username: string;
  email: string;
  role: 'super_admin' | 'admin' | 'employee' | 'cashier';
  password: string;
}

export interface UserUpdateInput {
  email?: string;
  role?: 'super_admin' | 'admin' | 'employee' | 'cashier';
  password?: string;
  isActive?: boolean;
}