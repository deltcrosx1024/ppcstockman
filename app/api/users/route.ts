import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { hashPassword } from '@/lib/auth';
import { verifyToken } from '@/lib/auth';
import type { User } from '@/types/user';

// Helper to get user ID from token
async function getUserIdFromRequest(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7);
  const { payload, error } = verifyToken(token);
  if (error || !payload) return null;
  return payload.userId;
}

// Helper to get user role from token
async function getUserRoleFromRequest(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7);
  const { payload, error } = verifyToken(token);
  if (error || !payload) return null;
  return payload.role;
}

// GET /api/users - List all users (Super Admin only)
export async function GET(request: Request) {
  const role = await getUserRoleFromRequest(request);
  if (role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden: Super Admin only' }, { status: 403 });
  }
  
  try {
    // Get all user IDs from the 'users' set
    const userIds = await redis.sMembers('users');
    const users = [];
    
    for (const userId of userIds) {
      const userData = await redis.hGetAll(`user:${userId}`);
      if (Object.keys(userData).length > 0) {
        // Remove password hash from response
        const { passwordHash, ...userWithoutPassword } = userData;
        users.push({
          id: userWithoutPassword.id,
          username: userWithoutPassword.username,
          email: userWithoutPassword.email,
          role: userWithoutPassword.role as 'super_admin' | 'admin' | 'employee' | 'cashier',
          organizationId: userWithoutPassword.organizationId,
          createdAt: userWithoutPassword.createdAt,
          updatedAt: userWithoutPassword.updatedAt,
          isActive: userWithoutPassword.isActive === 'true'
        });
      }
    }
    
    return NextResponse.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/users - Create a new user (Super Admin only)
export async function POST(request: Request) {
  const role = await getUserRoleFromRequest(request);
  if (role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden: Super Admin only' }, { status: 403 });
  }
  
  try {
    const { username, email, role: newRole, organizationId, password } = await request.json();
    
     // Validate input
     if (!username || !email || !newRole || !organizationId || !password) {
       return NextResponse.json(
         { error: 'Username, email, role, organization ID, and password are required' },
         { status: 400 }
       );
     }
    
    // Validate role
    const validRoles = ['super_admin', 'admin', 'employee', 'cashier'];
    if (!validRoles.includes(newRole)) {
      return NextResponse.json(
        { error: 'Invalid role' },
        { status: 400 }
      );
    }
    
    // Check if username already exists
    const existingUserId = await redis.get(`user:username:${username}`);
    if (existingUserId) {
      return NextResponse.json(
        { error: 'Username already exists' },
        { status: 400 }
      );
    }
    
    // Create new user
    const userId = `user:${Date.now()}`;
    const hashedPassword = await hashPassword(password);
    const now = new Date().toISOString();
    
     const newUser: Omit<User, 'passwordHash'> = {
       id: userId,
       username,
       email,
       role: newRole,
       organizationId, // Required for multi-tenancy
       createdAt: now,
       updatedAt: now,
       isActive: true
     };
    
    // Store user in Redis
    await redis.hSet(`user:${userId}`, 'id', userId);
    await redis.hSet(`user:${userId}`, 'username', username);
    await redis.hSet(`user:${userId}`, 'email', email);
    await redis.hSet(`user:${userId}`, 'role', newRole);
    await redis.hSet(`user:${userId}`, 'passwordHash', hashedPassword);
    await redis.hSet(`user:${userId}`, 'createdAt', now);
    await redis.hSet(`user:${userId}`, 'updatedAt', now);
    await redis.hSet(`user:${userId}`, 'isActive', 'true');
    
    // Add to username lookup and users set
    await redis.set(`user:username:${username}`, userId);
    await redis.sAdd('users', userId);
    
    return NextResponse.json(
      { message: 'User created successfully', user: { ...newUser, passwordHash: undefined } },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}