export interface Shift {
  id: string;
  employeeId: string; // Reference to User
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm:ss (in local time)
  endTime?: string; // HH:mm:ss (when clocked out)
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftCreateInput {
  employeeId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm:ss
  notes?: string;
}

export interface ShiftUpdateInput {
  endTime?: string;
  status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
}

export interface ShiftFilters {
  employeeId?: string;
  date?: string; // YYYY-MM-DD
  status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
}