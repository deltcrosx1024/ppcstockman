export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { authenticateHandler } from '@/lib/auth';
import type { InventoryItem } from '@/types/inventoryItem';

// In a real application, you would use a PDF generation library like pdfkit
// For this prototype, we'll return a simple text representation that could be converted to PDF/sticker
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
    
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('itemId');
    
    if (!itemId) {
      return NextResponse.json(
        { error: 'Item ID is required' },
        { status: 400 }
      );
    }
    
    // Get inventory item details
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
    
    // Generate label content (in a real app, this would be a PDF or image)
    // For prototyping, we'll return a simple text format that shows what would be on the label
    const labelContent = `
PPC STOCK MANAGEMENT
====================
Item: ${item.name}
Barcode: ${item.barcode}
Category: ${item.category}
Price: $${item.salePrice.toFixed(2)}
Stock: ${item.quantityInStock}
${item.description}
====================
SCAN BARCODE FOR DETAILS
    `.trim();
    
    // In a real implementation, you would:
    // 1. Use a library like pdfkit or barcode generator to create a PDF/image
    // 2. Set appropriate headers for file download
    // 3. Return the binary file data
    
    // For prototype, we'll return the text content
    return new Response(labelContent, {
      headers: {
        'Content-Type': 'text/plain',
        'Content-Disposition': `attachment; filename="label_${item.barcode}.txt"`
      }
    });
  } catch (error) {
    console.error('Error generating label:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}