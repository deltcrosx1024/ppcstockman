export interface InventoryMovement {
  id: string;
  itemId: string; // Reference to InventoryItem
  type: 'in' | 'out';
  quantity: number;
  unitPrice: number; // Price per unit at the time of movement
  totalPrice: number; // quantity * unitPrice
  reference: string; // e.g., purchase order number, sales invoice number
  notes?: string;
  performedBy: string; // User ID of the person who performed the movement
  performedAt: string; // Timestamp
}

export interface InventoryMovementCreateInput {
  itemId: string;
  type: 'in' | 'out';
  quantity: number;
  unitPrice: number;
  reference: string;
  notes?: string;
}