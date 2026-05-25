import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { authenticateHandler } from '@/lib/auth';
import type { Cart, CartItem } from '@/types/cart';
import type { InventoryItem } from '@/types/inventoryItem';
import type { InventoryMovement } from '@/types/inventoryMovement';

// Helper to generate ID
function generateId() {
  return `${Date.now()}${Math.floor(Math.random() * 10000)}`;
}

// POST /api/pos/orders - Create an order from the cart (checkout)
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
    
    if (!cart || cart.items.length === 0) {
      return NextResponse.json(
        { error: 'Cart is empty' },
        { status: 400 }
      );
    }
    
    // Create order
    const orderId = generateId();
    const now = new Date().toISOString();
    
    let totalAmount = 0;
    const orderItems: Array<{
      inventoryItemId: string;
      name: string;
      barcode: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }> = [];
    
    // Process each item in the cart
    for (const cartItem of cart.items) {
      // Get inventory item details
      const itemData = await redis.hGetAll(`inventory:item:${cartItem.inventoryItemId}`);
      if (Object.keys(itemData).length === 0) {
        return NextResponse.json(
          { error: `Inventory item not found: ${cartItem.inventoryItemId}` },
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
      
      // Check if there's sufficient stock
      if (item.quantityInStock < cartItem.quantity) {
        return NextResponse.json(
          { error: `Insufficient stock for item ${item.name}. Available: ${item.quantityInStock}, requested: ${cartItem.quantity}` },
          { status: 400 }
        );
      }
      
      // Add to order items
      const orderItem = {
        inventoryItemId: item.id,
        name: item.name,
        barcode: item.barcode,
        quantity: cartItem.quantity,
        unitPrice: cartItem.unitPrice,
        totalPrice: cartItem.totalPrice
      };
      orderItems.push(orderItem);
      totalAmount += cartItem.totalPrice;
      
      // Create outbound inventory movement
      const movementId = generateId();
      const movement: InventoryMovement = {
        id: movementId,
        itemId: item.id,
        type: 'out',
        quantity: cartItem.quantity,
        unitPrice: cartItem.unitPrice,
        totalPrice: cartItem.totalPrice,
        reference: `ORDER-${orderId}`,
        notes: `Point of Sale transaction`,
        performedBy: userId,
        performedAt: now
      };
      
      // Store movement in Redis
      await redis.hSet(`inventory:movement:${movementId}`, 'id', movementId);
      await redis.hSet(`inventory:movement:${movementId}`, 'itemId', item.id);
      await redis.hSet(`inventory:movement:${movementId}`, 'type', 'out');
      await redis.hSet(`inventory:movement:${movementId}`, 'quantity', cartItem.quantity.toString());
      await redis.hSet(`inventory:movement:${movementId}`, 'unitPrice', cartItem.unitPrice.toString());
      await redis.hSet(`inventory:movement:${movementId}`, 'totalPrice', cartItem.totalPrice.toString());
      await redis.hSet(`inventory:movement:${movementId}`, 'reference', `ORDER-${orderId}`);
      await redis.hSet(`inventory:movement:${movementId}`, 'notes', 'Point of Sale transaction');
      await redis.hSet(`inventory:movement:${movementId}`, 'performedBy', userId);
      await redis.hSet(`inventory:movement:${movementId}`, 'performedAt', now);
      await redis.sAdd('inventory:movementIds', movementId);
      
      // Update item quantity in stock
      const newQuantity = item.quantityInStock - cartItem.quantity;
      await redis.hSet(`inventory:item:${item.id}`, 'quantityInStock', newQuantity.toString());
      await redis.hSet(`inventory:item:${item.id}`, 'updatedAt', now);
    }
    
    // Create order record
    const order = {
      id: orderId,
      userId,
      items: orderItems,
      totalAmount,
      status: 'completed',
      createdAt: now,
      updatedAt: now
    };
    
    // Store order in Redis
    await redis.hSet(`order:${orderId}`, 'id', orderId);
    await redis.hSet(`order:${orderId}`, 'userId', userId);
    await redis.hSet(`order:${orderId}`, 'items', JSON.stringify(orderItems));
    await redis.hSet(`order:${orderId}`, 'totalAmount', totalAmount.toString());
    await redis.hSet(`order:${orderId}`, 'status', 'completed');
    await redis.hSet(`order:${orderId}`, 'createdAt', now);
    await redis.hSet(`order:${orderId}`, 'updatedAt', now);
    
    // Add to user's orders set and general orders set
    await redis.sAdd(`user:${userId}:orders`, orderId);
    await redis.sAdd('orders', orderId);
    
    // Clear the cart after successful order
    await redis.del(cartKey);
    
    // Generate a simple receipt (in a real app, you might generate a PDF)
    const receipt = {
      orderId,
      date: now,
      items: orderItems,
      totalAmount,
      thankYouMessage: 'Thank you for your purchase!'
    };
    
    return NextResponse.json(
      { message: 'Order created successfully', order, receipt },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating order:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/pos/orders - Get order history (with filtering and pagination)
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
    
    // For simplicity in prototype, we'll get orders for the current user
    // In a real app, admins might see all orders
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    
    // Get order IDs for the user (or all if admin)
    let orderIds: string[] = [];
    if (role === 'super_admin' || role === 'admin') {
      // Admins can see all orders
      orderIds = await redis.sMembers('orders');
    } else {
      // Regular users see only their own orders
      orderIds = await redis.sMembers(`user:${userId}:orders`);
    }
    
    // Apply date filtering if provided
    if (startDate || endDate) {
      const filteredIds: string[] = [];
      for (const orderId of orderIds) {
        const orderData = await redis.hGetAll(`order:${orderId}`);
        if (Object.keys(orderData).length > 0) {
          const orderDate = orderData.createdAt?.split('T')[0] || '';
          const matchesStart = !startDate || orderDate >= startDate;
          const matchesEnd = !endDate || orderDate <= endDate;
          if (matchesStart && matchesEnd) {
            filteredIds.push(orderId);
          }
        }
      }
      orderIds = filteredIds;
    }
    
    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedIds = orderIds.slice(startIndex, endIndex);
    
    // Fetch orders
    const orders = [];
    for (const orderId of paginatedIds) {
      const orderData = await redis.hGetAll(`order:${orderId}`);
      if (Object.keys(orderData).length > 0) {
        const order = {
          id: orderData.id,
          userId: orderData.userId,
          items: JSON.parse(orderData.items),
          totalAmount: parseFloat(orderData.totalAmount),
          status: orderData.status,
          createdAt: orderData.createdAt,
          updatedAt: orderData.updatedAt
        };
        orders.push(order);
      }
    }
    
    return NextResponse.json({
      orders,
      pagination: {
        page,
        limit,
        total: orderIds.length,
        totalPages: Math.ceil(orderIds.length / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}