export enum UserRole {
  ADMIN = 'admin',
  CLIENT = 'client',
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  status: string;
  client_id?: number;
  client_name?: string;
}

export interface Client {
  id: number;
  name: string;
  status: string;
  created_at: string;
}

export interface Chip {
  id: number;
  client_id: number;
  client_name?: string;
  name: string;
  number: string;
  platform: string;
  status: string;
  created_at: string;
}

export interface Log {
  id: number;
  chip_id: number;
  chip_name?: string;
  chip_number?: string;
  client_name?: string;
  date: string;
  action: string;
  leads_count: number;
  template_type: 'Marketing' | 'Utility';
  cost: number;
  observations?: string;
  created_at: string;
}

export interface DashboardStats {
  total_leads: number;
  total_cost: number;
  total_disparos: number;
  costByChip: { name: string; cost: number }[];
  costByTemplate: { template_type: string; cost: number }[];
}
