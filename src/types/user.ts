export type UserRole = 'user' | 'host' | 'admin';

export interface User {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: UserRole;
  coinBalance: number;
  isVerified: boolean;
}
