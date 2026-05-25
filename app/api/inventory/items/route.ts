import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { authenticateHandler } from '@/lib/auth';
import type { InventoryItem, InventoryItemCreateInput } from '@/types/inventoryItem';
import type { User } from '@/types/user';

// Helper to generate ID
function generateId() {
  return `item:${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

// GET /api/inventory/items - List all inventory items for the user's organization
export async function GET(request: Request) {
  try {
    // Authenticate (any logged-in user can view inventory)
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

    // Get user data to get organizationId
    const userData = await redis.hGetAll(`user:${payload.userId}`);
    const organizationId = userData.organizationId;

    // Get all item IDs from the organization's set
    const itemIds = await redis.sMembers(`organization:${organizationId}:inventory:itemIds`);
    const items = [];

    for (const itemId of itemIds) {
      const itemData = await redis.hGetAll(`organization:${organizationId}:inventory:item:${itemId}`);
      if (Object.keys(itemData).length > 0) {
        // Convert string numbers back to numbers
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
          organizationId: itemData.organizationId,
          createdAt: itemData.createdAt,
          updatedAt: itemData.updatedAt,
          isActive: itemData.isActive === 'true'
        };
        items.push(item);
      }
    }

    // Optional: filter by search query (name or barcode)
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.toLowerCase();
    if (search) {
      const filteredItems = items.filter(item => 
        item.name.toLowerCase().includes(search) || 
        item.barcode.toLowerCase().includes(search)
      );
      return NextResponse.json({ items: filteredItems });
    }

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Error fetching inventory items:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/inventory/items - Create a new inventory item
export async function POST(request: Request) {
  try {
    // Authenticate and authorize (Admin or Super Admin)
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

    // Check role: only super_admin and admin can create items
    if (!['super_admin', 'admin'].includes(payload.role)) {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    // Get user data to get organizationId
    const userData = await redis.hGetAll(`user:${payload.userId}`);
    const organizationId = userData.organizationId;

    const {
      name,
      description,
      barcode,
      category,
      purchasePrice,
      salePrice,
      quantityInStock,
      reorderLevel,
      supplier
    } = await request.json();

    // Validate input
    if (!name || !description || !barcode || !category || 
        purchasePrice === undefined || salePrice === undefined || 
        quantityInStock === undefined || reorderLevel === undefined || !supplier) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      );
    }

    // Check if barcode already exists in this organization
    const existingItemId = await redis.get(`organization:${organizationId}:inventory:barcode:${barcode}`);
    if (existingItemId) {
      return NextResponse.json(
        { error: 'Item with this barcode already exists in this organization' },
        { status: 400 }
      );
    }

    // Create new item
    const itemId = generateId();
    const now = new Date().toISOString();

    const newItem: InventoryItem = {
      id: itemId,
      name,
      description,
      barcode,
      category,
      purchasePrice,
      salePrice,
      quantityInStock,
      reorderLevel,
      supplier,
      organizationId, // Assign the organizationId from the user
      createdAt: now,
      updatedAt: now,
      isActive: true
    };

    // Store item in Redis
    await redis.hSet(`organization:${organizationId}:inventory:item:${itemId}`, 'id', itemId);
    await redis.hSet(`organization:${organizationId}:inventory:item:${itemId}`, 'name', name);
    await redis.hSet(`organization:${organizationId}:inventory:item:${itemId}`, 'description', description);
    await redis.hSet(`organization:${organizationId}:inventory:item:${itemId}`, 'barcode', barcode);
    await redis.hSet(`organization:${organizationId}:inventory:item:${itemId}`, 'category', category);
    await redis.hSet(`organization:${organizationId}:inventory:item:${itemId}`, 'purchasePrice', purchasePrice.toString());
    await redis.hSet(`organization:${organizationId}:inventory:item:${itemId}`, 'salePrice', salePrice.toString());
    await redis.hSet(`organization:${organizationId}:inventory:item:${itemId}`, 'quantityInStock', quantityInStock.toString());
    await redis.hSet(`organization:${organizationId}:inventory:item:${itemId}`, 'reorderLevel', reorderLevel.toString());
    await redis.hSet(`organization:${organizationId}:inventory:item:${itemId}`, 'supplier', supplier);
    await redis.hSet(`organization:${organizationId}:inventory:item:${itemId}`, 'createdAt', now);
    await redis.hSet(`organization:${organizationId}:inventory:item:${itemId}`, 'updatedAt', now);
    await redis.hSet(`organization:${organizationId}:inventory:item:${itemId}`, 'isActive', 'true');

    // Add to organization's ID set and barcode lookup
    await redis.sAdd(`organization:${organizationId}:inventory:itemIds`, itemId);
    await redis.set(`organization:${organizationId}:inventory:barcode:${barcode}`, itemId);

    return NextResponse.json(
      { message: 'Inventory item created successfully', item: newItem },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating inventory item:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}