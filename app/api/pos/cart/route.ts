import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { authenticateHandler } from '@/lib/auth';
import type { Cart, CartItem, CartCreateInput } from '@/types/cart';
import type { InventoryItem } from '@/types/inventoryItem';

// Helper to generate ID
function generateId() {
  return `cart:${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

// GET /api/pos/cart - Get the current cart (for the current user/session)
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
    const cartKey = `cart:${userId}`;
    
    // Get cart from Redis
    const cartData = await redis.get(cartKey);
    let cart: Cart | null = null;
    
    if (cartData) {
      try {
        cart = JSON.parse(cartData) as Cart;
      } catch (e) {
        // If parsing fails, treat as no cart
        cart = null;
      }
    }
    
    if (!cart) {
      // Return empty cart
      cart = {
        id: cartKey,
        items: [],
        updatedAt: new Date().toISOString()
      };
    }
    
    return NextResponse.json({ cart });
  } catch (error) {
    console.error('Error fetching cart:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/pos/cart - Add an item to the cart
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
    const cartKey = `cart:${userId}`;
    
    // Get current cart
    const cartData = await redis.get(cartKey);
    let cart: Cart = { id: cartKey, items: [], updatedAt: new Date().toISOString() };
    
    if (cartData) {
      try {
        cart = JSON.parse(cartData) as Cart;
      } catch (e) {
        // If parsing fails, start with empty cart
        cart = { id: cartKey, items: [], updatedAt: new Date().toISOString() };
      }
    }
    
    const { inventoryItemId, quantity } = await request.json();
    
    // Validate input
    if (!inventoryItemId || !quantity || quantity <= 0) {
      return NextResponse.json(
        { error: 'Inventory item ID and quantity (>0) are required' },
        { status: 400 }
      );
    }
    
    // Check if inventory item exists and get its details
    const itemData = await redis.hGetAll(`inventory:item:${inventoryItemId}`);
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
    
    // Check if item already in cart
    const existingItemIndex = cart.items.findIndex(item => item.inventoryItemId === inventoryItemId);
    
    if (existingItemIndex >= 0) {
      // Increase quantity
      cart.items[existingItemIndex].quantity += quantity;
      cart.items[existingItemIndex].totalPrice = cart.items[existingItemIndex].quantity * cart.items[existingItemIndex].unitPrice;
    } else {
      // Add new item to cart
      const cartItem: CartItem = {
        inventoryItemId,
        quantity,
        unitPrice: item.salePrice, // Use sale price for POS
        totalPrice: quantity * item.salePrice
      };
      cart.items.push(cartItem);
    }
    
    // Update cart timestamp
    cart.updatedAt = new Date().toISOString();
    
    // Save cart to Redis
    await redis.set(cartKey, JSON.stringify(cart));
    
    return NextResponse.json(
      { message: 'Item added to cart successfully', cart },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error adding item to cart:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}