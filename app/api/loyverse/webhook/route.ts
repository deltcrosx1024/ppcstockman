import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { verifyToken } from '@/lib/auth';

// In a real implementation, you would verify the Loyverse signature
// For now, we'll use a simple token verification from headers
function verifyLoyverseRequest(request: Request): { valid: boolean; error?: string } {
  const loyverseSignature = request.headers.get('x-loyverse-signature');
  const loyverseToken = request.headers.get('x-loyverse-token');
  
  // In production, you would:
  // 1. Verify the signature using your Loyverse app secret
  // 2. Or validate the token against your registered token
  
  // For prototype, we'll check if token matches environment variable
  const expectedToken = process.env.LOYVERSE_WEBHOOK_TOKEN;
  if (!expectedToken) {
    return { valid: false, error: 'Loyverse webhook token not configured' };
  }
  
  if (loyverseToken !== expectedToken) {
    return { valid: false, error: 'Invalid Loyverse webhook token' };
  }
  
  return { valid: true };
}

async function processLoyverseItem(item: any) {
  // Normalize Loyverse item to our inventory item format
  const barcode = String(item.barcode ?? item.sku ?? item.item_code ?? '').trim();
  const name = String(item.name ?? item.item_name ?? item.product_name ?? 'Unnamed item').trim();
  
  if (!barcode || !name) {
    throw new Error('Invalid Loyverse item: missing barcode or name');
  }
  
  const description = String(item.description ?? item.note ?? '').trim();
  const category = String(item.category_name ?? item.category ?? item.department ?? 'General').trim();
  const supplier = String(item.supplier_name ?? item.supplier ?? '').trim();
  
  const purchasePrice = parseFloat(String(item.cost_price ?? item.purchase_price ?? 0));
  const salePrice = parseFloat(String(item.price ?? item.sale_price ?? item.sell_price ?? 0));
  const quantityInStock = Math.max(0, Math.floor(parseFloat(String(item.quantity_on_hand ?? item.stock ?? item.quantity ?? 0))));
  const reorderLevel = Math.max(0, Math.floor(parseFloat(String(item.reorder_level ?? 0))));
  
  const now = new Date().toISOString();
  
  // Check if item already exists by barcode
  const existingId = await redis.get(`inventory:barcode:${barcode}`);
  
  if (existingId) {
    // Update existing item
    await redis.hSet(`inventory:item:${existingId}`, 'name', name);
    await redis.hSet(`inventory:item:${existingId}`, 'description', description);
    await redis.hSet(`inventory:item:${existingId}`, 'category', category);
    await redis.hSet(`inventory:item:${existingId}`, 'purchasePrice', purchasePrice.toString());
    await redis.hSet(`inventory:item:${existingId}`, 'salePrice', salePrice.toString());
    await redis.hSet(`inventory:item:${existingId}`, 'quantityInStock', quantityInStock.toString());
    await redis.hSet(`inventory:item:${existingId}`, 'reorderLevel', reorderLevel.toString());
    await redis.hSet(`inventory:item:${existingId}`, 'supplier', supplier);
    await redis.hSet(`inventory:item:${existingId}`, 'updatedAt', now);
    await redis.hSet(`inventory:item:${existingId}`, 'isActive', 'true');
    
    return { updated: true, id: existingId };
  } else {
    // Create new item
    const itemId = `item:${Date.now()}${Math.floor(Math.random() * 1000)}`;
    await redis.hSet(`inventory:item:${itemId}`, 'id', itemId);
    await redis.hSet(`inventory:item:${itemId}`, 'name', name);
    await redis.hSet(`inventory:item:${itemId}`, 'description', description);
    await redis.hSet(`inventory:item:${itemId}`, 'barcode', barcode);
    await redis.hSet(`inventory:item:${itemId}`, 'category', category);
    await redis.hSet(`inventory:item:${itemId}`, 'purchasePrice', purchasePrice.toString());
    await redis.hSet(`inventory:item:${itemId}`, 'salePrice', salePrice.toString());
    await redis.hSet(`inventory:item:${itemId}`, 'quantityInStock', quantityInStock.toString());
    await redis.hSet(`inventory:item:${itemId}`, 'reorderLevel', reorderLevel.toString());
    await redis.hSet(`inventory:item:${itemId}`, 'supplier', supplier);
    await redis.hSet(`inventory:item:${itemId}`, 'createdAt', now);
    await redis.hSet(`inventory:item:${itemId}`, 'updatedAt', now);
    await redis.hSet(`inventory:item:${itemId}`, 'isActive', 'true');
    await redis.sAdd('inventory:itemIds', itemId);
    await redis.set(`inventory:barcode:${barcode}`, itemId);
    
    return { updated: false, id: itemId };
  }
}

export async function POST(request: Request) {
  try {
    // Verify Loyverse request
    const verification = verifyLoyverseRequest(request);
    if (!verification.valid) {
      return NextResponse.json({ error: verification.error }, { status: 401 });
    }
    
    // Parse JSON payload
    const payload = await request.json();
    
    // Handle different event types
    const eventType = payload.event_type ?? payload.type ?? 'item.updated';
    
    let processedCount = 0;
    let errors: string[] = [];
    
    if (eventType === 'item.created' || eventType === 'item.updated' || eventType === 'item') {
      // Handle item events
      const items = Array.isArray(payload.data) ? payload.data : 
                   Array.isArray(payload.items) ? payload.items :
                   [payload];
                   
      for (const itemData of items) {
        try {
          await processLoyverseItem(itemData);
          processedCount++;
        } catch (error) {
          errors.push(`Failed to process item ${itemData.id ?? itemData.barcode ?? 'unknown'}: ${error.message}`);
        }
      }
    } else if (eventType === 'item.deleted') {
      // Handle item deletion
      const items = Array.isArray(payload.data) ? payload.data :
                   Array.isArray(payload.items) ? payload.items :
                   [payload];
                   
      for (const itemData of items) {
        try {
          const barcode = String(itemData.barcode ?? itemData.sku ?? itemData.item_code ?? '').trim();
          if (barcode) {
            const existingId = await redis.get(`inventory:barcode:${barcode}`);
            if (existingId) {
              await redis.hSet(`inventory:item:${existingId}`, 'isActive', 'false');
              await redis.hSet(`inventory:item:${existingId}`, 'updatedAt', new Date().toISOString());
              processedCount++;
            }
          }
        } catch (error) {
          errors.push(`Failed to delete item ${itemData.id ?? 'unknown'}: ${error.message}`);
        }
      }
    } else {
      // Unknown event type - log but don't fail
      console.warn(`Unhandled Loyverse event type: ${eventType}`);
    }
    
    const response: any = {
      message: 'Loyverse webhook processed successfully',
      processedCount,
    };
    
    if (errors.length > 0) {
      response.warnings = errors;
    }
    
    return NextResponse.json(response);
  } catch (err) {
    console.error('Error processing Loyverse webhook:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET endpoint for verification (if needed by Loyverse)
export async function GET(request: Request) {
  try {
    // Some webhook services require a GET endpoint for verification
    const verification = verifyLoyverseRequest(request);
    if (!verification.valid) {
      return NextResponse.json({ error: verification.error }, { status: 401 });
    }
    
    // Return challenge token if provided (for webhook verification)
    const { searchParams } = new URL(request.url);
    const challenge = searchParams.get('challenge');
    
    if (challenge) {
      return new Response(challenge, { status: 200 });
    }
    
    return NextResponse.json({ message: 'Loyverse webhook endpoint is active' });
  } catch (err) {
    console.error('Error in Loyverse webhook GET:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}