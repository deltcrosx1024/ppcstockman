import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { verifyToken, hashPassword } from '@/lib/auth';
import type { User, UserUpdateInput } from '@/types/user';

function mapUserData(userData: Record<string, string>): Omit<User, 'passwordHash'> {
  return {
    id: userData.id,
    username: userData.username,
    email: userData.email,
    role: userData.role as 'super_admin' | 'admin' | 'employee' | 'cashier',
    createdAt: userData.createdAt,
    updatedAt: userData.updatedAt,
    isActive: userData.isActive === 'true'
  };
}

function getTokenPayload(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7);
  const { payload, error } = verifyToken(token);
  return payload && !error ? payload : null;
}

// GET /api/users/[id] - Get a specific user
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const payload = getTokenPayload(request);
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const targetUserId = params.id;
  if (payload.userId !== targetUserId && payload.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden: insufficient permissions' }, { status: 403 });
  }

  const userData = await redis.hGetAll(`user:${targetUserId}`);
  if (Object.keys(userData).length === 0) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const user = mapUserData(userData);
  return NextResponse.json({ user });
}

// PUT /api/users/[id] - Update a specific user
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const payload = getTokenPayload(request);
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const targetUserId = params.id;
  const canManage = payload.role === 'super_admin' || payload.userId === targetUserId;

  if (!canManage) {
    return NextResponse.json({ error: 'Forbidden: insufficient permissions' }, { status: 403 });
  }

  const userExists = await redis.hGetAll(`user:${targetUserId}`);
  if (Object.keys(userExists).length === 0) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const { email, role, password, isActive } = await request.json() as UserUpdateInput;

  if (role && payload.role !== 'super_admin') {
    return NextResponse.json({ error: 'Only Super Admin can change roles' }, { status: 403 });
  }

  const updates: Record<string, string> = {};
  if (email) updates.email = email;
  if (role) updates.role = role;
  if (isActive !== undefined) updates.isActive = isActive ? 'true' : 'false';
  if (password) {
    updates.passwordHash = await hashPassword(password);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
  }

  updates.updatedAt = new Date().toISOString();

  for (const [field, value] of Object.entries(updates)) {
    await redis.hSet(`user:${targetUserId}`, field, value);
  }

  const updatedUserData = await redis.hGetAll(`user:${targetUserId}`);
  const user = mapUserData(updatedUserData);

  return NextResponse.json({ message: 'User updated successfully', user });
}

// DELETE /api/users/[id] - Delete a specific user (Super Admin only)
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const payload = getTokenPayload(request);
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (payload.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden: Super Admin only' }, { status: 403 });
  }

  const targetUserId = params.id;
  const userData = await redis.hGetAll(`user:${targetUserId}`);
  if (Object.keys(userData).length === 0) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  await redis.del(`user:${targetUserId}`);
  if (userData.username) {
    await redis.del(`user:username:${userData.username}`);
  }
  await redis.sRem('users', targetUserId);

  return NextResponse.json({ message: 'User deleted successfully' });
}
