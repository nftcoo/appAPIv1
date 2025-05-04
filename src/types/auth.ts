// src/types/auth.ts
export interface User {
    id: number;
    wallet_address: string;
    team_id?: number;  // Optional field
    created_at: Date;
  }
  
  export interface LoginCredentials {
    wallet_address: string;
    // Note: We'll need to implement wallet-based authentication
    // instead of username/password
  }
  
  export interface AuthResponse {
    token: string;
    user: User;
  }