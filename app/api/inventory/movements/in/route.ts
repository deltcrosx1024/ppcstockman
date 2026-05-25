import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { authenticateHandler } from '@/lib/auth';
import type { InventoryMovement, InventoryMovementCreateInput } from '@/types/inventoryMovement';
import type { InventoryItem } from '@/types/inventoryItem';

// Helper to generate ID
function generateId() {
  return `movement:${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

// POST /api/inventory/movements/in - Record an inbound inventory movement
export async function POST(request: Request) {
  try {
    // Authenticate and authorize (Admin, Super Admin, or designated roles)
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
    
    // For prototyping, we'll allow any authenticated user to record movements
    // In a real app, you might want to restrict to certain roles
    
    const { itemId, quantity, unitPrice, reference, notes } = await request.json();
    
    // Validate input
    if (!itemId || !quantity || quantity <= 0 || !unitPrice || unitPrice < 0 || !reference) {
      return NextResponse.json(
        { error: 'Item ID, quantity (>0), unitPrice (>=0), and reference are required' },
        { status: 400 }
      );
    }
    
    // Check if item exists
    const itemData = await redis.hGetAll(`inventory:item:${itemId}`);
    if (Object.keys(itemData).length === 0) {
      return NextResponse.json(
        { error: 'Inventory item not found' },
        { status: 404 }
      );
    }
    
    const item: InventoryItem = {
      id: itemData.id,
      name: itemData.name,
      description: itemData.description,
      barcode: itemData.barcode,
      category: itemData.category,
      purchasePrice: parseFloat(itemData.purchasePrice),
      salePrice: parseFloat(itemData.salePrice),
      quantityInStock: parseInt(itemData.quantityInStock),
      reorderLevel: parseInt(itemData.reorderLevel),
      supplier: itemData.supplier,
      createdAt: itemData.createdAt,
      updatedAt: itemData.updatedAt,
      isActive: itemData.isActive === 'true'
    };
    
    // Create movement
    const movementId = generateId();
    const now = new Date().toISOString();
    const totalPrice = quantity * unitPrice;
    
    const newMovement: InventoryMovement = {
      id: movementId,
      itemId,
      type: 'in',
      quantity,
      unitPrice,
      totalPrice,
      reference,
      notes: notes || '',
      performedBy: payload.userId, // Using the authenticated user's ID
      performedAt: now
    };
    
    // Store movement in Redis
    await redis.hSet(`inventory:movement:${movementId}`, 'id', movementId);
    await redis.hSet(`inventory:movement:${movementId}`, 'itemId', itemId);
    await redis.hSet(`inventory:movement:${movementId}`, 'type', 'in');
    await redis.hSet(`inventory:movement:${movementId}`, 'quantity', quantity.toString());
    await redis.hSet(`inventory:movement:${movementId}`, 'unitPrice', unitPrice.toString());
    await redis.hSet(`inventory:movement:${movementId}`, 'totalPrice', totalPrice.toString());
    await redis.hSet(`inventory:movement:${movementId}`, 'reference', reference);
    await redis.hSet(`inventory:movement:${movementId}`, 'notes', notes || '');
    await redis.hSet(`inventory:movement:${movementId}`, 'performedBy', payload.userId);
    await redis.hSet(`inventory:movement:${movementId}`, 'performedAt', now);
    
    // Add to movements set (we can have a set for all movements, or separate for in/out)
    // For simplicity, we'll have one set for all movements
    await redis.sAdd('inventory:movementIds', movementId);
    
    // Update item quantity in stock
    const newQuantity = item.quantityInStock + quantity;
    await redis.hSet(`inventory:item:${itemId}`, 'quantityInStock', newQuantity.toString());
    await redis.hSet(`inventory:item:${itemId}`, 'updatedAt', now);
    
    return NextResponse.json(
      { message: 'Inbound inventory movement recorded successfully', movement: newMovement },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error recording inbound inventory movement:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}