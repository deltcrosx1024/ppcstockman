export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'mixed';

export interface OrderItem {
  inventoryItemId: string;
  name: string;
  barcode: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  totalAmount: number;
  paymentMethod: PaymentMethod;
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

export interface Receipt {
  orderId: string;
  date: string;
  cashierId: string;
  items: OrderItem[];
  totalAmount: number;
  paymentMethod: PaymentMethod;
  notes?: string;
}

export interface OrderFilters {
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}
