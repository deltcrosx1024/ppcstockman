import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import type { InventoryItem } from '@/types/inventoryItem';

// GET /api/inventory/barcodes?barcode=...
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const barcode = searchParams.get('barcode');

    if (!barcode) {
      return NextResponse.json({ error: 'Barcode query parameter is required' }, { status: 400 });
    }

    // Lookup itemId by barcode
    const itemId = await redis.get(`inventory:barcode:${barcode}`);
    if (!itemId) {
      return NextResponse.json({ error: 'Item not found for barcode' }, { status: 404 });
    }

    const itemData = await redis.hGetAll(`inventory:item:${itemId}`);
    if (Object.keys(itemData).length === 0) {
      return NextResponse.json({ error: 'Item record not found' }, { status: 404 });
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
      organizationId: itemData.organizationId,
      isActive: itemData.isActive === 'true'
    };

    return NextResponse.json({ item });
  } catch (error) {
    console.error('Error fetching item by barcode:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/inventory/barcodes - Register a barcode for an item
export async function POST(request: Request) {
  try {
    const { itemId, barcode } = await request.json();

    if (!itemId || !barcode) {
      return NextResponse.json({ error: 'itemId and barcode are required' }, { status: 400 });
    }

    // Ensure the item exists before mapping barcode
    const itemData = await redis.hGetAll(`inventory:item:${itemId}`);
    if (Object.keys(itemData).length === 0) {
      return NextResponse.json({ error: 'Inventory item not found' }, { status: 404 });
    }

    // Prevent duplicate barcode registration
    const existingItemId = await redis.get(`inventory:barcode:${barcode}`);
    if (existingItemId && existingItemId !== itemId) {
      return NextResponse.json({ error: 'Barcode already assigned to another item' }, { status: 409 });
    }

    // Save barcode lookup and keep item mapping consistent
    await redis.set(`inventory:barcode:${barcode}`, itemId);
    await redis.hSet(`inventory:item:${itemId}`, 'barcode', barcode);
    await redis.hSet(`inventory:item:${itemId}`, 'updatedAt', new Date().toISOString());

    return NextResponse.json({ message: 'Barcode registered successfully', itemId, barcode }, { status: 201 });
  } catch (error) {
    console.error('Error registering barcode:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
