export interface DailyBudget {
  date: string; // YYYY-MM-DD format
  totalInputValue: number; // Total value of inventory received (cost basis)
  totalOutputValue: number; // Total value of inventory sold (revenue basis)
  netChange: number; // totalOutputValue - totalInputValue (profit/loss for the day)
  transactionCount: {
    in: number; // Number of inbound movements
    out: number; // Number of outbound movements
  };
}

export interface BudgetFilters {
  date?: string; // YYYY-MM-DD, defaults to today
}