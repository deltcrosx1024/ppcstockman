export interface RevenueSummary {
  shiftId?: string; // If for a specific shift
  date: string; // YYYY-MM-DD
  expectedRevenue: number; // Based on scheduled shifts and average sales per shift or set targets
  actualRevenue: number; // Sum of completed orders for the period
  transactionCount: number; // Number of transactions (orders) in the period
  averageTransactionValue: number; // actualRevenue / transactionCount
  cashInDrawer: number; // Expected cash in drawer based on starting float and transactions
  // We can add more detailed breakdowns by payment method, category, etc. if needed
}

export interface RevenueFilters {
  shiftId?: string;
  date?: string; // YYYY-MM-DD, defaults to today
  startDate?: string; // For a range
  endDate?: string; // For a range
}