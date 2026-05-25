import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { authenticateHandler } from '@/lib/auth';
import type { Shift, ShiftCreateInput } from '@/types/shift';

// Helper to generate ID
function generateId() {
  return `shift:${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

// GET /api/shifts - Get shifts with filtering and pagination
export async function GET(request: Request) {
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
    
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');
    const date = searchParams.get('date'); // YYYY-MM-DD
    const status = searchParams.get('status') as 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    
    // Get shift IDs based on permissions
    let shiftIds: string[] = [];
    if (role === 'super_admin' || role === 'admin') {
      // Admins can see all shifts
      shiftIds = await redis.sMembers('shifts');
    } else {
      // Regular users see only their own shifts
      shiftIds = await redis.sMembers(`user:${userId}:shifts`);
    }
    
    // Apply filters
    if (employeeId && !(role === 'super_admin' || role === 'admin')) {
      // Non-admins can only see their own shifts, so ignore employeeId if it's not theirs
      if (employeeId !== userId) {
        shiftIds = []; // Not authorized to see other employees' shifts
      }
    }
    
    if (employeeId && (role === 'super_admin' || role === 'admin')) {
      // Admins can filter by specific employee
      shiftIds = await redis.sMembers(`user:${employeeId}:shifts`);
    }
    
    if (date) {
      const filteredIds: string[] = [];
      for (const shiftId of shiftIds) {
        const shiftData = await redis.hGetAll(`shift:${shiftId}`);
        if (Object.keys(shiftData).length > 0 && shiftData.date === date) {
          filteredIds.push(shiftId);
        }
      }
      shiftIds = filteredIds;
    }
    
    if (status) {
      const filteredIds: string[] = [];
      for (const shiftId of shiftIds) {
        const shiftData = await redis.hGetAll(`shift:${shiftId}`);
        if (Object.keys(shiftData).length > 0 && shiftData.status === status) {
          filteredIds.push(shiftId);
        }
      }
      shiftIds = filteredIds;
    }
    
    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedIds = shiftIds.slice(startIndex, endIndex);
    
    // Fetch shifts
    const shifts = [];
    for (const shiftId of paginatedIds) {
      const shiftData = await redis.hGetAll(`shift:${shiftId}`);
      if (Object.keys(shiftData).length > 0) {
        const shift: Shift = {
          id: shiftData.id,
          employeeId: shiftData.employeeId,
          date: shiftData.date,
          startTime: shiftData.startTime,
          endTime: shiftData.endTime || undefined,
          status: shiftData.status as 'scheduled' | 'in_progress' | 'completed' | 'cancelled',
          notes: shiftData.notes || undefined,
          createdAt: shiftData.createdAt,
          updatedAt: shiftData.updatedAt
        };
        shifts.push(shift);
      }
    }
    
    return NextResponse.json({
      shifts,
      pagination: {
        page,
        limit,
        total: shiftIds.length,
        totalPages: Math.ceil(shiftIds.length / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching shifts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/shifts - Create a new shift schedule
export async function POST(request: Request) {
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
    
    // Determine whose shift we're creating
    const { employeeId, date, startTime, notes } = await request.json();
    let targetEmployeeId = userId;
    if (role === 'super_admin' || role === 'admin') {
      targetEmployeeId = employeeId || userId;
      if (employeeId) {
        const employeeData = await redis.hGetAll(`user:${employeeId}`);
        if (Object.keys(employeeData).length === 0) {
          return NextResponse.json(
            { error: 'Employee not found' },
            { status: 404 }
          );
        }
        
        if (employeeData.isActive !== 'true') {
          return NextResponse.json(
            { error: 'Employee is not active' },
            { status: 400 }
          );
        }
      }
    }
    if (!(role === 'super_admin' || role === 'admin')) {
      // Non-admins can only create shifts for themselves
      targetEmployeeId = userId;
    } else {
      // Admins can create shifts for others, but validate the employee exists
      if (employeeId) {
        const employeeData = await redis.hGetAll(`user:${employeeId}`);
        if (Object.keys(employeeData).length === 0) {
          return NextResponse.json(
            { error: 'Employee not found' },
            { status: 404 }
          );
        }
        
        // Additional validation: check if the employee is active
        if (employeeData.isActive !== 'true') {
          return NextResponse.json(
            { error: 'Employee is not active' },
            { status: 400 }
          );
        }
      } else {
        // If no employeeId provided, default to the requesting user
        targetEmployeeId = userId;
      }
    }
    
    // Validate input
    if (!targetEmployeeId || !date || !startTime) {
      return NextResponse.json(
        { error: 'Employee ID, date (YYYY-MM-DD), and start time (HH:mm:ss) are required' },
        { status: 400 }
      );
    }
    
    // Validate date format (basic check)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      );
    }
    
    // Validate time format (basic check)
    const timeRegex = /^\d{2}:\d{2}:\d{2}$/;
    if (!timeRegex.test(startTime)) {
      return NextResponse.json(
        { error: 'Invalid time format. Use HH:mm:ss' },
        { status: 400 }
      );
    }
    
    // Check for scheduling conflicts (optional for prototype)
    // In a real app, you'd check if the employee already has a shift at this time
    
    // Create shift
    const shiftId = generateId();
    const now = new Date().toISOString();
    
    const newShift: Shift = {
      id: shiftId,
      employeeId: targetEmployeeId,
      date,
      startTime,
      endTime: undefined,
      status: 'scheduled',
      notes: notes || '',
      createdAt: now,
      updatedAt: now
    };
    
    // Store shift in Redis
    await redis.hSet(`shift:${shiftId}`, 'id', shiftId);
    await redis.hSet(`shift:${shiftId}`, 'employeeId', targetEmployeeId);
    await redis.hSet(`shift:${shiftId}`, 'date', date);
    await redis.hSet(`shift:${shiftId}`, 'startTime', startTime);
    await redis.hSet(`shift:${shiftId}`, 'status', 'scheduled');
    await redis.hSet(`shift:${shiftId}`, 'notes', notes || '');
    await redis.hSet(`shift:${shiftId}`, 'createdAt', now);
    await redis.hSet(`shift:${shiftId}`, 'updatedAt', now);
    
    // Add to user's shifts set and general shifts set
    await redis.sAdd(`user:${targetEmployeeId}:shifts`, shiftId);
    await redis.sAdd('shifts', shiftId);
    
    return NextResponse.json(
      { message: 'Shift created successfully', shift: newShift },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating shift:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}