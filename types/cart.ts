export interface CartItem {
  inventoryItemId: string;
  quantity: number;
  unitPrice: number; // Price at the time of adding to cart
  totalPrice: number; // quantity * unitPrice
}

export interface Cart {
  id: string; // Unique cart ID (could be tied to session or user)
  items: CartItem[];
  updatedAt: string;
}

export interface CartCreateInput {
  inventoryItemId: string;
  quantity: number;
}

export interface CartUpdateInput {
  quantity: number;
}