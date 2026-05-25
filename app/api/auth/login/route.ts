import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { hashPassword, verifyPassword } from '@/lib/auth';

// Import User type
import type { User } from '@/types/user';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();
    
    // Validate input
    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }
    
    // For prototype, we'll check if there's a super admin user
    // In a real app, we'd query Redis for the user
    const userId = await redis.get(`user:username:${username}`);
    
    if (!userId) {
      // If no user exists, create a default super admin for prototyping
      // This is ONLY for prototyping - in production, you'd have a proper setup process
      const newUserId = `user:${Date.now()}`;
      const hashedPassword = await hashPassword(password);
      
      const superAdmin: Omit<User, 'passwordHash'> = {
        id: newUserId,
        username,
        email: `${username}@ppcstock.local`,
        role: 'super_admin',
        organizationId: 'org_001', // Default org for prototype
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true
      };
      
       // Store user in Redis
       await redis.hSet(`user:${newUserId}`, 'id', newUserId);
       await redis.hSet(`user:${newUserId}`, 'username', username);
       await redis.hSet(`user:${newUserId}`, 'email', superAdmin.email);
       await redis.hSet(`user:${newUserId}`, 'role', superAdmin.role);
       await redis.hSet(`user:${newUserId}`, 'organizationId', 'org_001'); // Default org for prototype
       await redis.hSet(`user:${newUserId}`, 'passwordHash', hashedPassword);
       await redis.hSet(`user:${newUserId}`, 'createdAt', superAdmin.createdAt);
       await redis.hSet(`user:${newUserId}`, 'updatedAt', superAdmin.updatedAt);
       await redis.hSet(`user:${newUserId}`, 'isActive', superAdmin.isActive.toString());
      
      // Create username lookup
      await redis.set(`user:username:${username}`, newUserId);
      
      // Generate token
      const { generateToken } = await import('@/lib/auth');
      const token = generateToken(superAdmin);
      
      return NextResponse.json({
        message: 'Default super admin created and logged in (PROTOTYPE ONLY)',
        token,
        user: { ...superAdmin, passwordHash: undefined }
      });
    }
    
     // Get user data (excluding password hash)
     const userData = await redis.hGetAll(`user:${userId}`);
     
     // Verify password
     const hashedPassword = userData.passwordHash;
     if (!hashedPassword || !verifyPassword(password, hashedPassword)) {
       return NextResponse.json(
         { error: 'Invalid credentials' },
         { status: 401 }
       );
     }
     
     // Get user data (excluding password hash)
     const user: Omit<User, 'passwordHash'> = {
       id: userData.id,
       username: userData.username,
       email: userData.email,
       role: userData.role as 'super_admin' | 'admin' | 'employee' | 'cashier',
       organizationId: userData.organizationId,
       createdAt: userData.createdAt,
       updatedAt: userData.updatedAt,
       isActive: userData.isActive === 'true'
     };
    
    // Generate token
    const { generateToken } = await import('@/lib/auth');
    const token = generateToken(user);
    
    return NextResponse.json({
      message: 'Login successful',
      token,
      user
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

