const axios = require('axios');

// Base URL for our API (assuming Next.js dev server)
const BASE_URL = 'http://localhost:3000/api';

// Test user credentials
const TEST_USER = {
  username: 'admin',
  password: 'admin123'
};

let authToken = null;

// Helper function to make authenticated requests
async function authenticatedRequest(method, endpoint, data = null) {
  const options = {
    method,
    url: `${BASE_URL}${endpoint}`,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    }
  };
  
  if (data) {
    options.data = data;
  }
  
  try {
    const response = await axios(options);
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(`API Error: ${error.response.status} - ${error.response.data.error || error.response.data.message}`);
    } else {
      throw new Error(`Network Error: ${error.message}`);
    }
  }
}

// Test authentication
async function testAuth() {
  console.log('🔐 Testing Authentication...');
  
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, TEST_USER);
    authToken = response.data.token;
    console.log('✅ Login successful');
    console.log(`   User: ${response.data.user.username} (${response.data.user.role})`);
    return true;
  } catch (error) {
    console.error('❌ Authentication failed:', error.message);
    return false;
  }
}

// Test user management (Super Admin only)
async function testUserManagement() {
  console.log('\n👥 Testing User Management...');
  
  if (!authToken) {
    console.log('❌ No auth token available');
    return false;
  }
  
  try {
    // Get all users
    const users = await authenticatedRequest('GET', '/users');
    console.log(`✅ Retrieved ${users.users.length} users`);
    
    // Try to create a new user (this should work for super admin)
    const newUser = {
      username: 'testuser',
      email: 'test@example.com',
      role: 'employee',
      password: 'testpass123'
    };
    
    const createdUser = await authenticatedRequest('POST', '/users', newUser);
    console.log('✅ Created test user');
    
    return true;
  } catch (error) {
    console.error('❌ User management test failed:', error.message);
    return false;
  }
}

// Test inventory management
async function testInventory() {
  console.log('\n📦 Testing Inventory Management...');
  
  if (!authToken) {
    console.log('❌ No auth token available');
    return false;
  }
  
  try {
    // Get all inventory items
    const items = await authenticatedRequest('GET', '/inventory/items');
    console.log(`✅ Retrieved ${items.items.length} inventory items`);
    
    if (items.items.length > 0) {
      const item = items.items[0];
      
      // Test recording an inbound movement
      const inboundMovement = {
        itemId: item.id,
        quantity: 5,
        unitPrice: item.purchasePrice,
        reference: 'PO-TEST-001',
        notes: 'Test inbound movement'
      };
      
      const inboundResult = await authenticatedRequest('POST', '/inventory/movements/in', inboundMovement);
      console.log('✅ Recorded inbound movement');
      
      // Test recording an outbound movement
      const outboundMovement = {
        itemId: item.id,
        quantity: 2,
        unitPrice: item.salePrice,
        reference: 'SO-TEST-001',
        notes: 'Test outbound movement'
      };
      
      const outboundResult = await authenticatedRequest('POST', '/inventory/movements/out', outboundMovement);
      console.log('✅ Recorded outbound movement');
    }
    
    // Test daily budget
    const budget = await authenticatedRequest('GET', '/inventory/budget');
    console.log(`✅ Retrieved daily budget: $${budget.budget.actualRevenue || 0} revenue`);
    
    return true;
  } catch (error) {
    console.error('❌ Inventory test failed:', error.message);
    return false;
  }
}

// Test POS functionality
async function testPos() {
  console.log('\n💰 Testing POS Functionality...');
  
  if (!authToken) {
    console.log('❌ No auth token available');
    return false;
  }
  
  try {
    // Get cart (should be empty initially)
    const cart = await authenticatedRequest('GET', '/pos/cart');
    console.log(`✅ Retrieved cart with ${cart.cart.items.length} items`);
    
    // Get inventory items to add to cart
    const items = await authenticatedRequest('GET', '/inventory/items');
    if (items.items.length > 0) {
      const item = items.items[0];
      
      // Add item to cart
      const addToCart = await authenticatedRequest('POST', '/pos/cart', {
        inventoryItemId: item.id,
        quantity: 2
      });
      console.log('✅ Added item to cart');
      
      // Get updated cart
      const updatedCart = await authenticatedRequest('GET', '/pos/cart');
      console.log(`✅ Cart now has ${updatedCart.cart.items.length} items`);
      
      const order = await authenticatedRequest('POST', '/pos/orders', {
        paymentMethod: 'credit_card',
        notes: 'Test order'
      });
      console.log('✅ Created order from cart');
      console.log(`   Order ID: ${order.order.id}`);
      console.log(`   Total: $${order.order.totalAmount}`);
    }
    
    return true;
  } catch (error) {
    console.error('❌ POS test failed:', error.message);
    return false;
  }
}

// Test shift and revenue management
async function testShiftsAndRevenue() {
  console.log('\n⏰ Testing Shift & Revenue Management...');
  
  if (!authToken) {
    console.log('❌ No auth token available');
    return false;
  }
  
  try {
    const shifts = await authenticatedRequest('GET', '/shifts');
    console.log(`✅ Retrieved ${shifts.shifts.length} shifts`);
    
    const shiftData = {
      employeeId: 'user:super_admin_001',
      date: new Date().toISOString().split('T')[0],
      startTime: '09:00:00',
      notes: 'Test shift'
    };
    
    const createdShift = await authenticatedRequest('POST', '/shifts', shiftData);
    console.log('✅ Created test shift');
    
    const revenue = await authenticatedRequest('GET', '/revenue');
    console.log('✅ Retrieved revenue summary');
    console.log(`   Actual Revenue: $${revenue.summary.actualRevenue}`);
    console.log(`   Transaction Count: ${revenue.summary.transactionCount}`);
    
    return true;
  } catch (error) {
    console.error('❌ Shift & Revenue test failed:', error.message);
    return false;
  }
}

// Main test function
async function runTests() {
  console.log('🧪 Starting PPC Stock Management API Tests\n');
  
  try {
    const authSuccess = await testAuth();
    if (!authSuccess) {
      console.log('\n❌ Cannot proceed with tests without authentication');
      return;
    }
    
    await testUserManagement();
    await testInventory();
    await testPos();
    await testShiftsAndRevenue();
    
    console.log('\n🎉 All tests completed!');
    console.log('\n📝 Next Steps:');
    console.log('1. Start the Next.js development server: npm run dev');
    console.log('2. Run this test script again to verify endpoints');
    console.log('3. Build frontend interfaces to consume these APIs');
    
  } catch (error) {
    console.error('\n💥 Test suite failed:', error.message);
  }
}

if (require.main === module) {
  runTests();
}

module.exports = { testAuth, testUserManagement, testInventory, testPos, testShiftsAndRevenue };