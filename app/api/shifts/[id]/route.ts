import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { authenticateHandler } from '@/lib/auth';
import type { Shift, ShiftUpdateInput } from '@/types/shift';

// PATCH /api/shifts/[id] - Update a specific shift (e.g., clock in/out, add notes)
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    // Authenticate
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const token = authHeader.substring(7);
    const { verifyToken } = await import('@/lib/auth');
    const { payload, error } = verifyToken(token);
    if (error || !payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const userId = payload.userId;
    const role = payload.role;
    const shiftId = params.id;
    
    // Get the shift from Redis
    const shiftData = await redis.hGetAll(`shift:${shiftId}`);
    if (Object.keys(shiftData).length === 0) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }
    
    // Authorization check:
    // - The employee themselves can clock in/out and add notes
    // - Super Admin and Admin can make any changes
    const isOwnShift = shiftData.employeeId === userId;
    const isAdmin = role === 'super_admin' || role === 'admin';
    
    if (!isOwnShift && !isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions' },
        { status: 403 }
      );
    }
    
    const { endTime, status, notes } = await request.json();
    
    // Validate status if provided
    if (status && !['scheduled', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status' },
        { status: 400 }
      );
    }
    
    // Validate time format if endTime is provided
    if (endTime) {
      const timeRegex = /^\d{2}:\d{2}:\d{2}$/;
      if (!timeRegex.test(endTime)) {
        return NextResponse.json(
          { error: 'Invalid time format. Use HH:mm:ss' },
          { status: 400 }
        );
      }
    }
    
    // Prepare updates
    const updates: Record<string, string> = {};
    if (endTime !== undefined) {
      updates['endTime'] = endTime;
    }
    if (status !== undefined) {
      updates['status'] = status;
    }
    if (notes !== undefined) {
      updates['notes'] = notes;
    }
    
    // Always update the updatedAt timestamp
    updates['updatedAt'] = new Date().toISOString();
    
    // Apply updates to Redis
    for (const [key, value] of Object.entries(updates)) {
      await redis.hSet(`shift:${shiftId}`, key, value);
    }
    
    // Get updated shift data
    const updatedShiftData = await redis.hGetAll(`shift:${shiftId}`);
    
    const updatedShift: Shift = {
      id: updatedShiftData.id,
      employeeId: updatedShiftData.employeeId,
      date: updatedShiftData.date,
      startTime: updatedShiftData.startTime,
      endTime: updatedShiftData.endTime || undefined,
      status: updatedShiftData.status as 'scheduled' | 'in_progress' | 'completed' | 'cancelled',
      notes: updatedShiftData.notes || undefined,
      createdAt: updatedShiftData.createdAt,
      updatedAt: updatedShiftData.updatedAt
    };
    
    return NextResponse.json(
      { message: 'Shift updated successfully', shift: updatedShift }
    );
  } catch (error) {
    console.error('Error updating shift:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/shifts/[id] - Delete a specific shift (Super Admin only, or Admin for their managed employees)
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    // Authenticate
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const token = authHeader.substring(7);
    const { verifyToken } = await import('@/lib/auth');
    const { payload, error } = verifyToken(token);
    if (error || !payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const userId = payload.userId;
    const role = payload.role;
    const shiftId = params.id;
    
    // Authorization: Only Super Admin can delete shifts (for simplicity in prototype)
    // In a real app, you might allow admins to delete shifts for employees they manage
    if (role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Forbidden: Super Admin only' },
        { status: 403 }
      );
    }
    
    // Check if shift exists
    const shiftData = await redis.hGetAll(`shift:${shiftId}`);
    if (Object.keys(shiftData).length === 0) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }
    
    // Remove from user's shifts set
    await redis.sRem(`user:${shiftData.employeeId}:shifts`, shiftId);
    
    // Remove from general shifts set
    await redis.sRem('shifts', shiftId);
    
    // Delete the shift data
    await redis.del(`shift:${shiftId}`);
    
    return NextResponse.json({ message: 'Shift deleted successfully' });
  } catch (error) {
    console.error('Error deleting shift:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}