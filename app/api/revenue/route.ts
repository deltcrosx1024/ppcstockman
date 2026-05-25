export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { authenticateHandler } from '@/lib/auth';
import type { RevenueSummary } from '@/types/revenue';
import type { InventoryMovement } from '@/types/inventoryMovement';
import type { Shift } from '@/types/shift';

// Helper to get date string in YYYY-MM-DD format
function getDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

// GET /api/revenue - Get real-time financial summaries
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
    const shiftId = searchParams.get('shiftId');
    const dateParam = searchParams.get('date');
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    
    // Determine target date(s)
    let targetDate: string | null = null;
    let startDate: string | null = null;
    let endDate: string | null = null;
    
    if (dateParam) {
      targetDate = dateParam;
    } else if (startDateParam && endDateParam) {
      startDate = startDateParam;
      endDate = endDateParam;
    } else {
      // Default to today
      targetDate = getDateString(new Date());
    }
    
    // Authorization check
    let canAccessAllData = false;
    if (role === 'super_admin' || role === 'admin') {
      canAccessAllData = true;
    }
    
    // For non-admins, they can only access their own data unless it's a specific shift they worked
    const effectiveUserId = canAccessAllData ? null : userId;
    
    let expectedRevenue = 0;
    let actualRevenue = 0;
    let transactionCount = 0;
    
    // Calculate actual revenue from completed orders (or inventory movements out)
    // We'll use inventory movements out for simplicity in this prototype
    
    if (shiftId) {
      // Get specific shift
      const shiftData = await redis.hGetAll(`shift:${shiftId}`);
      if (Object.keys(shiftData).length === 0) {
        return NextResponse.json(
          { error: 'Shift not found' },
          { status: 404 }
        );
      }
      
      // Check authorization for this shift
      if (!canAccessAllData && shiftData.employeeId !== userId) {
        return NextResponse.json(
          { error: 'Forbidden: Insufficient permissions' },
          { status: 403 }
        );
      }
      
      // Get the shift date
      const shiftDate = shiftData.date;
      
      // Get all movement IDs
      const movementIds = await redis.sMembers('inventory:movementIds');
      
      // Filter movements for this shift's date and type 'out'
      for (const movementId of movementIds) {
        const movementData = await redis.hGetAll(`inventory:movement:${movementId}`);
        if (Object.keys(movementData).length === 0) continue;
        
        // Check if it's an outbound movement from the shift date
        if (
          movementData.type === 'out' && 
          movementData.performedAt?.startsWith(shiftDate)
        ) {
          const quantity = parseInt(movementData.quantity);
          const unitPrice = parseFloat(movementData.unitPrice);
          const totalPrice = quantity * unitPrice;
          actualRevenue += totalPrice;
          transactionCount++;
        }
      }
      
      // Expected revenue calculation (simplified)
      // In a real app, this might be based on shift targets, historical averages, etc.
      // For prototype, we'll set it to actual revenue or a fixed amount
      expectedRevenue = actualRevenue; // Placeholder
      
    } else if (targetDate) {
      // Get data for a specific date
      
      // Get all movement IDs
      const movementIds = await redis.sMembers('inventory:movementIds');
      
      // Filter movements for this date and type 'out'
      for (const movementId of movementIds) {
        const movementData = await redis.hGetAll(`inventory:movement:${movementId}`);
        if (Object.keys(movementData).length === 0) continue;
        
        // Check if it's an outbound movement from the target date
        if (
          movementData.type === 'out' && 
          movementData.performedAt?.startsWith(targetDate)
        ) {
          // Check authorization for non-admins
          if (!canAccessAllData) {
            // For prototyping, we'll check if the user performed the movement
            // In a real app, movements should be linked to users/shifts
            if (movementData.performedBy !== userId) {
              continue; // Skip movements not performed by this user
            }
          }
          
          const quantity = parseInt(movementData.quantity);
          const unitPrice = parseFloat(movementData.unitPrice);
          const totalPrice = quantity * unitPrice;
          actualRevenue += totalPrice;
          transactionCount++;
        }
      }
      
      // Expected revenue calculation (simplified)
      // For prototype, we'll base it on scheduled shifts for the day
      if (canAccessAllData) {
        // Get all shifts for the date
        const shiftIds = await redis.sMembers('shifts');
        let scheduledShiftCount = 0;
        for (const shiftId of shiftIds) {
          const shiftData = await redis.hGetAll(`shift:${shiftId}`);
          if (
            Object.keys(shiftData).length > 0 && 
            shiftData.date === targetDate && 
            shiftData.status === 'scheduled'
          ) {
            scheduledShiftCount++;
          }
        }
        // Assume average revenue per shift
        expectedRevenue = scheduledShiftCount * 1000; // Placeholder: $1000 per shift
      } else {
        // Get user's shifts for the date
        const shiftIds = await redis.sMembers(`user:${userId}:shifts`);
        let scheduledShiftCount = 0;
        for (const shiftId of shiftIds) {
          const shiftData = await redis.hGetAll(`shift:${shiftId}`);
          if (
            Object.keys(shiftData).length > 0 && 
            shiftData.date === targetDate && 
            shiftData.status === 'scheduled'
          ) {
            scheduledShiftCount++;
          }
        }
        // Assume average revenue per shift
        expectedRevenue = scheduledShiftCount * 1000; // Placeholder: $1000 per shift
      }
      
    } else if (startDate && endDate) {
      // Get data for a date range
      
      // Get all movement IDs
      const movementIds = await redis.sMembers('inventory:movementIds');
      
      // Filter movements for the date range and type 'out'
      for (const movementId of movementIds) {
        const movementData = await redis.hGetAll(`inventory:movement:${movementId}`);
        if (Object.keys(movementData).length === 0) continue;
        
        // Check if it's an outbound movement within the date range
        if (movementData.type === 'out') {
          const movementDate = movementData.performedAt?.split('T')[0] || '';
          const isInRange = 
            (!startDate || movementDate >= startDate) && 
            (!endDate || movementDate <= endDate);
          
          if (isInRange) {
            // Check authorization for non-admins
            if (!canAccessAllData) {
              // For prototyping, we'll check if the user performed the movement
              if (movementData.performedBy !== userId) {
                continue; // Skip movements not performed by this user
              }
            }
            
            const quantity = parseInt(movementData.quantity);
            const unitPrice = parseFloat(movementData.unitPrice);
            const totalPrice = quantity * unitPrice;
            actualRevenue += totalPrice;
            transactionCount++;
          }
        }
      }
      
      // Expected revenue calculation for date range
      if (canAccessAllData) {
        // Get all shifts in the date range
        const shiftIds = await redis.sMembers('shifts');
        let scheduledShiftCount = 0;
        for (const shiftId of shiftIds) {
          const shiftData = await redis.hGetAll(`shift:${shiftId}`);
          if (
            Object.keys(shiftData).length > 0 && 
            shiftData.status === 'scheduled'
          ) {
            const shiftDate = shiftData.date;
            const isInRange = 
              (!startDate || shiftDate >= startDate) && 
              (!endDate || shiftDate <= endDate);
            
            if (isInRange) {
              scheduledShiftCount++;
            }
          }
        }
        // Assume average revenue per shift
        expectedRevenue = scheduledShiftCount * 1000; // Placeholder: $1000 per shift
      } else {
        // Get user's shifts in the date range
        const shiftIds = await redis.sMembers(`user:${userId}:shifts`);
        let scheduledShiftCount = 0;
        for (const shiftId of shiftIds) {
          const shiftData = await redis.hGetAll(`shift:${shiftId}`);
          if (
            Object.keys(shiftData).length > 0 && 
            shiftData.status === 'scheduled'
          ) {
            const shiftDate = shiftData.date;
            const isInRange = 
              (!startDate || shiftDate >= startDate) && 
              (!endDate || shiftDate <= endDate);
            
            if (isInRange) {
              scheduledShiftCount++;
            }
          }
        }
        // Assume average revenue per shift
        expectedRevenue = scheduledShiftCount * 1000; // Placeholder: $1000 per shift
      }
    }
    
    // Calculate average transaction value
    const averageTransactionValue = transactionCount > 0 ? actualRevenue / transactionCount : 0;
    
    // Calculate cash in drawer (simplified)
    // In a real app, this would consider starting float, cash transactions, etc.
    const cashInDrawer = actualRevenue; // Placeholder: all revenue is cash for simplicity
    
    const revenueSummary: RevenueSummary = {
      ...(shiftId ? { shiftId } : {}),
      date: targetDate || new Date().toISOString().split('T')[0],
      expectedRevenue,
      actualRevenue,
      transactionCount,
      averageTransactionValue,
      cashInDrawer
    };
    
    return NextResponse.json({ summary: revenueSummary });
  } catch (error) {
    console.error('Error calculating revenue summary:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}