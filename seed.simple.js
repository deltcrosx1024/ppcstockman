// Simple seed script for PPC Stock Management System
// Run with: node seed.simple.js

const { Redis } = require('@upstash/redis');
const crypto = require('crypto');

// Mock Redis implementation for development/prototyping
class MockRedis {
  constructor() {
    this.data = new Map();
    this.sets = new Map();
    this.hashes = new Map();
  }

  async get(key) {
    const value = this.data.get(key);
    return value !== undefined ? value : null;
  }

  async set(key, value) {
    this.data.set(key, value);
  }

  async hGet(hashKey, field) {
    const hash = this.hashes.get(hashKey);
    return hash ? (hash.get(field) ?? null) : null;
  }

  async hSet(hashKey, field, value) {
    if (!this.hashes.has(hashKey)) {
      this.hashes.set(hashKey, new Map());
    }
    this.hashes.get(hashKey).set(field, value);
  }

  async hGetAll(hashKey) {
    const hash = this.hashes.get(hashKey);
    if (!hash) return {};
    const result = {};
    for (const [key, value] of hash.entries()) {
      result[key] = value;
    }
    return result;
  }

  async del(key) {
    this.data.delete(key);
    this.hashes.delete(key);
    this.sets.delete(key);
  }

  async sAdd(setKey, member) {
    if (!this.sets.has(setKey)) {
      this.sets.set(setKey, new Set());
    }
    this.sets.get(setKey).add(member);
  }

  async sMembers(setKey) {
    const set = this.sets.get(setKey);
    return set ? Array.from(set) : [];
  }

  async sIsMember(setKey, member) {
    const set = this.sets.get(setKey);
    return set ? set.has(member) : false;
  }

  async exists(key) {
    return this.data.has(key) ? 1 : 0;
  }

  async incr(key) {
    const current = await this.get(key);
    const newValue = (current ? parseInt(current, 10) : 0) + 1;
    await this.set(key, newValue.toString());
    return newValue;
  }
}

// Create Redis instance (using mock for prototyping)
const redis = new MockRedis();

// Password hashing
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function seedDatabase() {
  console.log('Seeding database for PPC Stock Management...');
  
  try {
    // Check if we already have a super admin
    const adminExists = await redis.exists('user:username:admin');
    
    if (adminExists === 0) {
      // Create default super admin user
      const adminId = 'user:super_admin_001';
      const hashedPassword = hashPassword('admin123'); // Change this in production!
      
      // Store user in Redis
      await redis.hSet(`user:${adminId}`, 'id', adminId);
      await redis.hSet(`user:${adminId}`, 'username', 'admin');
      await redis.hSet(`user:${adminId}`, 'email', 'admin@ppcstock.local');
      await redis.hSet(`user:${adminId}`, 'role', 'super_admin');
      await redis.hSet(`user:${adminId}`, 'passwordHash', hashedPassword);
      await redis.hSet(`user:${adminId}`, 'createdAt', new Date().toISOString());
      await redis.hSet(`user:${adminId}`, 'updatedAt', new Date().toISOString());
      await redis.hSet(`user:${adminId}`, 'isActive', 'true');
      
      // Create username lookup
      await redis.set('user:username:admin', adminId);
      
      // Add to users set
      await redis.sAdd('users', adminId);
      
      console.log('✓ Created super admin user (username: admin, password: admin123)');
    } else {
      console.log('✓ Super admin user already exists');
    }
    
    // Create some sample inventory items
    const sampleItems = [
      {
        name: 'Motorcycle Helmet - Full Face',
        description: 'Full face motorcycle helmet with visor',
        barcode: 'HELMET001',
        category: 'Safety Gear',
        purchasePrice: 75.00,
        salePrice: 120.00,
        quantityInStock: 15,
        reorderLevel: 5,
        supplier: 'HelmetCo Inc.'
      },
      {
        name: 'Motorcycle Oil - 10W-40',
        description: 'Synthetic motorcycle oil, 1 liter',
        barcode: 'OIL10W40',
        category: 'Fluids & Lubricants',
        purchasePrice: 8.50,
        salePrice: 15.00,
        quantityInStock: 30,
        reorderLevel: 10,
        supplier: 'LubeTech Ltd.'
      },
      {
        name: 'Brake Pads - Front Set',
        description: 'Front brake pads for most motorcycles',
        barcode: 'BRAKE001',
        category: 'Braking System',
        purchasePrice: 22.00,
        salePrice: 35.00,
        quantityInStock: 8,
        reorderLevel: 3,
        supplier: 'BrakeMaster'
      },
      {
        name: 'Motorcycle Chain Lube',
        description: 'Lubricant for motorcycle chains, 200ml',
        barcode: 'CHAINLUBE',
        category: 'Maintenance',
        purchasePrice: 6.00,
        salePrice: 10.00,
        quantityInStock: 25,
        reorderLevel: 8,
        supplier: 'ChainCare'
      },
      {
        name: 'Tire Pressure Gauge',
        description: 'Digital tire pressure gauge',
        barcode: 'TPGAUGE',
        category: 'Tools',
        purchasePrice: 12.00,
        salePrice: 20.00,
        quantityInStock: 12,
        reorderLevel: 4,
        supplier: 'ToolPro'
      }
    ];
    
    for (const itemData of sampleItems) {
      // Check if item with this barcode already exists
      const existingItemId = await redis.get(`inventory:barcode:${itemData.barcode}`);
      
      if (!existingItemId) {
        // Create new item
        const itemId = `item:${Date.now()}${Math.floor(Math.random() * 1000)}`;
        const now = new Date().toISOString();
        
        // Store item in Redis
        await redis.hSet(`inventory:item:${itemId}`, 'id', itemId);
        await redis.hSet(`inventory:item:${itemId}`, 'name', itemData.name);
        await redis.hSet(`inventory:item:${itemId}`, 'description', itemData.description);
        await redis.hSet(`inventory:item:${itemId}`, 'barcode', itemData.barcode);
        await redis.hSet(`inventory:item:${itemId}`, 'category', itemData.category);
        await redis.hSet(`inventory:item:${itemId}`, 'purchasePrice', itemData.purchasePrice.toString());
        await redis.hSet(`inventory:item:${itemId}`, 'salePrice', itemData.salePrice.toString());
        await redis.hSet(`inventory:item:${itemId}`, 'quantityInStock', itemData.quantityInStock.toString());
        await redis.hSet(`inventory:item:${itemId}`, 'reorderLevel', itemData.reorderLevel.toString());
        await redis.hSet(`inventory:item:${itemId}`, 'supplier', itemData.supplier);
        await redis.hSet(`inventory:item:${itemId}`, 'createdAt', now);
        await redis.hSet(`inventory:item:${itemId}`, 'updatedAt', now);
        await redis.hSet(`inventory:item:${itemId}`, 'isActive', 'true');
        
        // Add to ID set and barcode lookup
        await redis.sAdd('inventory:itemIds', itemId);
        await redis.set(`inventory:barcode:${itemData.barcode}`, itemId);
        
        console.log(`✓ Created inventory item: ${itemData.name}`);
      } else {
        console.log(`✓ Inventory item already exists: ${itemData.name}`);
      }
    }
    
    console.log('\n🌱 Database seeding completed!');
    console.log('\nYou can now login with:');
    console.log('  Username: admin');
    console.log('  Password: admin123');
    console.log('\n⚠️  IMPORTANT: Change the default password in production!');
    
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

// Run the seeding function
seedDatabase();