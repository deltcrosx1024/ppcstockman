export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import type { DailyBudget } from '@/types/budget';
import type { InventoryMovement } from '@/types/inventoryMovement';

// Helper to get date string in YYYY-MM-DD format
function getDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

// GET /api/inventory/budget - Get daily budget summary
export async function GET(request: Request) {
  try {
    // Authenticate (any logged-in user can view budget)
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const targetDate = dateParam ? new Date(dateParam) : new Date();
    
    // Validate date
    if (isNaN(targetDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format' },
        { status: 400 }
      );
    }
    
    const dateString = getDateString(targetDate);
    
    // Get all movement IDs
    const movementIds = await redis.sMembers('inventory:movementIds');
    
    let totalInputValue = 0; // Total value of inventory received (cost basis)
    let totalOutputValue = 0; // Total value of inventory sold (revenue basis)
    let inboundCount = 0;
    let outboundCount = 0;
    
    // Process each movement
    for (const movementId of movementIds) {
      const movementData = await redis.hGetAll(`inventory:movement:${movementId}`);
      
      if (Object.keys(movementData).length === 0) continue;
      
      // Check if movement is from today
      const movementDate = getDateString(new Date(movementData.performedAt));
      if (movementDate !== dateString) continue;
      
      const quantity = parseInt(movementData.quantity);
      const unitPrice = parseFloat(movementData.unitPrice);
      const totalPrice = quantity * unitPrice;
      
      if (movementData.type === 'in') {
        totalInputValue += totalPrice;
        inboundCount++;
      } else if (movementData.type === 'out') {
        totalOutputValue += totalPrice;
        outboundCount++;
      }
    }
    
    const netChange = totalOutputValue - totalInputValue;
    
    const budget: DailyBudget = {
      date: dateString,
      totalInputValue,
      totalOutputValue,
      netChange,
      transactionCount: {
        in: inboundCount,
        out: outboundCount
      }
    };
    
    return NextResponse.json({ budget });
  } catch (error) {
    console.error('Error calculating daily budget:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}