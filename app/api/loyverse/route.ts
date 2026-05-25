import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { verifyToken } from '@/lib/auth';
import type { InventoryItemCreateInput } from '@/types/inventoryItem';

// Helper to generate ID
function generateId() {
  return `item:${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

// Helper to parse numbers safely
function parseNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const number = Number(String(value).replace(/[^0-9.-]+/g, ''));
  return Number.isFinite(number) ? number : fallback;
}

// Helper to normalize strings
function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

// Normalize Loyverse item to our inventory format
function normalizeLoyverseItem(raw: Record<string, unknown>): InventoryItemCreateInput | null {
  const barcode = normalizeString(raw.barcode ?? raw.sku ?? raw['item_code']);
  const name = normalizeString(raw.name ?? raw['item_name'] ?? raw['product_name'] ?? 'Unnamed item');

  if (!barcode || !name) {
    return null;
  }

  const description = normalizeString(raw.description ?? raw.note ?? '');
  const category = normalizeString(raw.category_name ?? raw.category ?? raw.department ?? 'General');
  const supplier = normalizeString(raw.supplier_name ?? raw.supplier ?? '');

  return {
    name,
    description,
    barcode,
    category,
    supplier,
    purchasePrice: parseNumber(raw.cost_price ?? raw.purchase_price ?? 0),
    salePrice: parseNumber(raw.price ?? raw.sale_price ?? raw.sell_price ?? 0),
    quantityInStock: Math.max(0, Math.floor(parseNumber(raw.quantity_on_hand ?? raw.stock ?? raw.quantity ?? 0))),
    reorderLevel: Math.max(0, Math.floor(parseNumber(raw.reorder_level ?? 0)))
  };
}

// Save or update item in Redis
async function saveItem(item: InventoryItemCreateInput) {
  const barcode = item.barcode;
  const existingId = await redis.get(`inventory:barcode:${barcode}`);
  const now = new Date().toISOString();

  if (existingId) {
    // Update existing item
    await redis.hSet(`inventory:item:${existingId}`, 'name', item.name);
    await redis.hSet(`inventory:item:${existingId}`, 'description', item.description);
    await redis.hSet(`inventory:item:${existingId}`, 'category', item.category);
    await redis.hSet(`inventory:item:${existingId}`, 'purchasePrice', item.purchasePrice.toString());
    await redis.hSet(`inventory:item:${existingId}`, 'salePrice', item.salePrice.toString());
    await redis.hSet(`inventory:item:${existingId}`, 'quantityInStock', item.quantityInStock.toString());
    await redis.hSet(`inventory:item:${existingId}`, 'reorderLevel', item.reorderLevel.toString());
    await redis.hSet(`inventory:item:${existingId}`, 'supplier', item.supplier);
    await redis.hSet(`inventory:item:${existingId}`, 'updatedAt', now);
    await redis.hSet(`inventory:item:${existingId}`, 'isActive', 'true');
    return { updated: true, id: existingId };
  } else {
    // Create new item
    const itemId = generateId();
    await redis.hSet(`inventory:item:${itemId}`, 'id', itemId);
    await redis.hSet(`inventory:item:${itemId}`, 'name', item.name);
    await redis.hSet(`inventory:item:${itemId}`, 'description', item.description);
    await redis.hSet(`inventory:item:${itemId}`, 'barcode', item.barcode);
    await redis.hSet(`inventory:item:${itemId}`, 'category', item.category);
    await redis.hSet(`inventory:item:${itemId}`, 'purchasePrice', item.purchasePrice.toString());
    await redis.hSet(`inventory:item:${itemId}`, 'salePrice', item.salePrice.toString());
    await redis.hSet(`inventory:item:${itemId}`, 'quantityInStock', item.quantityInStock.toString());
    await redis.hSet(`inventory:item:${itemId}`, 'reorderLevel', item.reorderLevel.toString());
    await redis.hSet(`inventory:item:${itemId}`, 'supplier', item.supplier);
    await redis.hSet(`inventory:item:${itemId}`, 'createdAt', now);
    await redis.hSet(`inventory:item:${itemId}`, 'updatedAt', now);
    await redis.hSet(`inventory:item:${itemId}`, 'isActive', 'true');
    await redis.sAdd('inventory:itemIds', itemId);
    await redis.set(`inventory:barcode:${barcode}`, itemId);
    return { updated: false, id: itemId };
  }
}

// GET: Fetch items from Loyverse API (for manual sync)
export async function GET(request: Request) {
  try {
    // Authenticate user
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const { payload, error } = verifyToken(token);
    if (error || !payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permissions
    if (!['super_admin', 'admin'].includes(payload.role)) {
      return NextResponse.json({ error: 'Forbidden: insufficient permissions' }, { status: 403 });
    }

    // Get Loyverse credentials from request
    const { searchParams } = new URL(request.url);
    const accessToken = searchParams.get('accessToken');
    const apiUrl = searchParams.get('apiUrl') || 'https://api.loyverse.com/v1/items';

    if (!accessToken) {
      return NextResponse.json({ error: 'Loyverse access token is required' }, { status: 400 });
    }

    // Fetch items from Loyverse API
    const loyverseResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      }
    });

    if (!loyverseResponse.ok) {
      const errorText = await loyverseResponse.text();
      return NextResponse.json({ 
        error: `Loyverse API request failed: ${loyverseResponse.status} ${errorText}` 
      }, { status: loyverseResponse.status });
    }

    const loyverseData = await loyverseResponse.json();
    const rawItems = Array.isArray(loyverseData) ? loyverseData : 
                    loyverseData.items ?? loyverseData.data ?? [];

    if (!Array.isArray(rawItems)) {
      return NextResponse.json({ error: 'Loyverse API returned unexpected payload format' }, { status: 500 });
    }

    // Process items
    const results: Array<{ 
      success: boolean; 
      itemId?: string; 
      error?: string;
      barcode?: string;
      name?: string;
      action?: 'created' | 'updated' | 'deleted';
    }> = [];

    for (const rawItem of rawItems) {
      try {
        const normalizedItem = normalizeLoyverseItem(rawItem as Record<string, unknown>);
        if (!normalizedItem) {
          results.push({
            success: false,
            error: 'Invalid item data: missing required fields',
            barcode: normalizeString((rawItem as any).barcode ?? (rawItem as any).sku),
            name: normalizeString((rawItem as any).name ?? (rawItem as any).item_name)
          });
          continue;
        }

        const saveResult = await saveItem(normalizedItem);
        results.push({
          success: true,
          itemId: saveResult.id,
          barcode: normalizedItem.barcode,
          name: normalizedItem.name
        });
      } catch (itemError) {
        results.push({
          success: false,
          error: itemError instanceof Error ? itemError.message : 'Unknown error',
          barcode: normalizeString((rawItem as any).barcode ?? (rawItem as any).sku),
          name: normalizeString((rawItem as any).name ?? (rawItem as any).item_name)
        });
      }
    }

    // Count results
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    return NextResponse.json({
      message: 'Loyverse API synchronization completed',
      syncedCount: successful.length,
      failedCount: failed.length,
      results
    });
  } catch (err) {
    console.error('Error syncing with Loyverse API:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Receive item updates from Loyverse app (push integration)
export async function POST(request: Request) {
  try {
    // Authenticate user
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const { payload, error } = verifyToken(token);
    if (error || !payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permissions
    if (!['super_admin', 'admin'].includes(payload.role)) {
      return NextResponse.json({ error: 'Forbidden: insufficient permissions' }, { status: 403 });
    }

    // Parse request body
    const body = await request.json();
    
    // Support both single item and array of items
    const items = Array.isArray(body.items) ? body.items : 
                 body.item ? [body.item] : 
                 Array.isArray(body) ? body : [];

    if (!items.length) {
      return NextResponse.json({ error: 'No items provided for synchronization' }, { status: 400 });
    }

    // Process items
    const results: Array<{ 
      success: boolean; 
      itemId?: string; 
      error?: string;
      barcode?: string;
      name?: string;
      action?: 'created' | 'updated' | 'deleted';
    }> = [];

    for (const rawItem of items) {
      try {
        // Skip if item is marked for deletion (if your app supports this)
        if ((rawItem as any).deleted === true) {
          const barcode = normalizeString((rawItem as any).barcode ?? (rawItem as any).sku);
          if (barcode) {
            const existingId = await redis.get(`inventory:barcode:${barcode}`);
            if (existingId) {
              // Soft delete: mark as inactive
              await redis.hSet(`inventory:item:${existingId}`, 'isActive', 'false');
              await redis.hSet(`inventory:item:${existingId}`, 'updatedAt', new Date().toISOString());
              
              results.push({
                success: true,
                itemId: existingId,
                barcode,
                action: 'deleted'
              });
              continue;
            }
          }
        }

        const normalizedItem = normalizeLoyverseItem(rawItem);
        if (!normalizedItem) {
          results.push({
            success: false,
            error: 'Invalid item data: missing required fields',
            barcode: normalizeString((rawItem as any).barcode ?? (rawItem as any).sku),
            name: normalizeString((rawItem as any).name ?? (rawItem as any).item_name)
          });
          continue;
        }

        const saveResult = await saveItem(normalizedItem);
        results.push({
          success: true,
          itemId: saveResult.id,
          barcode: normalizedItem.barcode,
          name: normalizedItem.name,
          action: saveResult.updated ? 'updated' : 'created'
        });
      } catch (itemError) {
        results.push({
          success: false,
          error: itemError instanceof Error ? itemError.message : 'Unknown error',
          barcode: normalizeString((rawItem as any).barcode ?? (rawItem as any).sku),
          name: normalizeString((rawItem as any).name ?? (rawItem as any).item_name)
        });
      }
    }

    // Count results
    const created = results.filter(r => r.action === 'created').length;
    const updated = results.filter(r => r.action === 'updated').length;
    const deleted = results.filter(r => r.action === 'deleted').length;
    const failed = results.filter(r => !r.success).length;

    return NextResponse.json({
      message: 'Loyverse app synchronization completed',
      createdCount: created,
      updatedCount: updated,
      deletedCount: deleted,
      failedCount: failed,
      results
    });
  } catch (err) {
    console.error('Error processing Loyverse app data:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT: Full inventory replacement (optional)
export async function PUT(request: Request) {
  try {
    // Authenticate user
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const { payload, error } = verifyToken(token);
    if (error || !payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permissions
    if (!['super_admin', 'admin'].includes(payload.role)) {
      return NextResponse.json({ error: 'Forbidden: insufficient permissions' }, { status: 403 });
    }

    // Parse request body
    const body = await request.json();
    const items = Array.isArray(body.items) ? body.items : 
                 Array.isArray(body) ? body : [];

    if (!items.length) {
      return NextResponse.json({ error: 'No items provided for inventory replacement' }, { status: 400 });
    }

    // Optional: Clear existing inventory first (uncomment if desired)
    /*
    const existingItemIds = await redis.sMembers('inventory:itemIds');
    for (const itemId of existingItemIds) {
      await redis.del(`inventory:item:${itemId}`);
    }
    await redis.del('inventory:itemIds');
    const barcodeKeys = await redis.keys('inventory:barcode:*');
    for (const key of barcodeKeys) {
      await redis.del(key);
    }
    */

    // Process items
    const results: Array<{ 
      success: boolean; 
      itemId?: string; 
      error?: string;
      barcode?: string;
      name?: string;
      action?: 'created' | 'updated';
    }> = [];

    for (const rawItem of items) {
      try {
        const normalizedItem = normalizeLoyverseItem(rawItem);
        if (!normalizedItem) {
          results.push({
            success: false,
            error: 'Invalid item data: missing required fields',
            barcode: normalizeString((rawItem as any).barcode ?? (rawItem as any).sku),
            name: normalizeString((rawItem as any).name ?? (rawItem as any).item_name)
          });
          continue;
        }

        const saveResult = await saveItem(normalizedItem);
        results.push({
          success: true,
          itemId: saveResult.id,
          barcode: normalizedItem.barcode,
          name: normalizedItem.name,
          action: saveResult.updated ? 'updated' : 'created'
        });
      } catch (itemError) {
        results.push({
          success: false,
          error: itemError instanceof Error ? itemError.message : 'Unknown error',
          barcode: normalizeString((rawItem as any).barcode ?? (rawItem as any).sku),
          name: normalizeString((rawItem as any).name ?? (rawItem as any).item_name)
        });
      }
    }

    // Count results
    const created = results.filter(r => r.action === 'created').length;
    const updated = results.filter(r => r.action === 'updated').length;
    const failed = results.filter(r => !r.success).length;

    return NextResponse.json({
      message: 'Inventory replacement completed',
      createdCount: created,
      updatedCount: updated,
      failedCount: failed,
      results
    });
  } catch (err) {
    console.error('Error replacing inventory:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: Remove specific item by barcode
export async function DELETE(request: Request) {
  try {
    // Authenticate user
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const { payload, error } = verifyToken(token);
    if (error || !payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permissions
    if (!['super_admin', 'admin'].includes(payload.role)) {
      return NextResponse.json({ error: 'Forbidden: insufficient permissions' }, { status: 403 });
    }

    // Get barcode from query params
    const { searchParams } = new URL(request.url);
    const barcode = searchParams.get('barcode');

    if (!barcode) {
      return NextResponse.json({ error: 'Barcode parameter is required' }, { status: 400 });
    }

    // Find and delete item
    const existingId = await redis.get(`inventory:barcode:${barcode}`);
    if (!existingId) {
      return NextResponse.json({ error: 'Item not found with provided barcode' }, { status: 404 });
    }

    // Soft delete: mark as inactive
    await redis.hSet(`inventory:item:${existingId}`, 'isActive', 'false');
    await redis.hSet(`inventory:item:${existingId}`, 'updatedAt', new Date().toISOString());

    return NextResponse.json({
      message: 'Item marked as inactive',
      itemId: existingId,
      barcode
    });
  } catch (err) {
    console.error('Error deleting item:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}