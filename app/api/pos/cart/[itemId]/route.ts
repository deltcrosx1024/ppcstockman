import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { authenticateHandler } from '@/lib/auth';
import type { Cart, CartItem, CartUpdateInput } from '@/types/cart';
import type { InventoryItem } from '@/types/inventoryItem';

// Helper to generate ID
function generateId() {
  return `cart:${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

// GET /api/pos/cart/[itemId] - Get a specific cart item
export async function GET(request: Request, { params }: { params: { itemId: string } }) {
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
        cart = null;
      }
    }
    
    if (!cart) {
      return NextResponse.json({ error: 'Cart not found' }, { status: 404 });
    }
    
    // Find the item in the cart
    const cartItem = cart.items.find(item => item.inventoryItemId === params.itemId);
    
    if (!cartItem) {
      return NextResponse.json({ error: 'Item not found in cart' }, { status: 404 });
    }
    
    return NextResponse.json({ cartItem });
  } catch (error) {
    console.error('Error fetching cart item:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/pos/cart/[itemId] - Update a specific cart item (quantity)
export async function PUT(request: Request, { params }: { params: { itemId: string } }) {
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
        cart = null;
      }
    }
    
    if (!cart) {
      return NextResponse.json({ error: 'Cart not found' }, { status: 404 });
    }
    
    // Find the item in the cart
    const itemIndex = cart.items.findIndex(item => item.inventoryItemId === params.itemId);
    
    if (itemIndex === -1) {
      return NextResponse.json({ error: 'Item not found in cart' }, { status: 404 });
    }
    
    const { quantity } = await request.json();
    
    // Validate input
    if (!quantity || quantity <= 0) {
      return NextResponse.json(
        { error: 'Quantity must be greater than 0' },
        { status: 400 }
      );
    }
    
    // Update quantity
    cart.items[itemIndex].quantity = quantity;
    cart.items[itemIndex].totalPrice = quantity * cart.items[itemIndex].unitPrice;
    
    // Update cart timestamp
    cart.updatedAt = new Date().toISOString();
    
    // Save cart to Redis
    await redis.set(cartKey, JSON.stringify(cart));
    
    return NextResponse.json(
      { message: 'Cart item updated successfully', cartItem: cart.items[itemIndex] }
    );
  } catch (error) {
    console.error('Error updating cart item:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/pos/cart/[itemId] - Remove a specific cart item
export async function DELETE(request: Request, { params }: { params: { itemId: string } }) {
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
        cart = null;
      }
    }
    
    if (!cart) {
      return NextResponse.json({ error: 'Cart not found' }, { status: 404 });
    }
    
    // Find the item in the cart
    const itemIndex = cart.items.findIndex(item => item.inventoryItemId === params.itemId);
    
    if (itemIndex === -1) {
      return NextResponse.json({ error: 'Item not found in cart' }, { status: 404 });
    }
    
    // Remove item from cart
    const removedItem = cart.items.splice(itemIndex, 1)[0];
    
    // Update cart timestamp
    cart.updatedAt = new Date().toISOString();
    
    // Save cart to Redis
    await redis.set(cartKey, JSON.stringify(cart));
    
    return NextResponse.json(
      { message: 'Cart item removed successfully', removedItem }
    );
  } catch (error) {
    console.error('Error removing cart item:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}