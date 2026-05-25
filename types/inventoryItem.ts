export interface InventoryItem {
  id: string;
  name: string;
  description: string;
  barcode: string; // Unique barcode for the item
  category: string;
  purchasePrice: number; // Cost price
  salePrice: number; // Selling price
  quantityInStock: number;
  reorderLevel: number; // Minimum stock level before reordering
  supplier: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface InventoryItemCreateInput {
  name: string;
  description: string;
  barcode: string;
  category: string;
  purchasePrice: number;
  salePrice: number;
  quantityInStock: number;
  reorderLevel: number;
  supplier: string;
}

export interface InventoryItemUpdateInput {
  name?: string;
  description?: string;
  barcode?: string;
  category?: string;
  purchasePrice?: number;
  salePrice?: number;
  quantityInStock?: number;
  reorderLevel?: number;
  supplier?: string;
  isActive?: boolean;
}