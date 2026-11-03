// Mirrors the Auth OpenAPI contract's field names exactly
// (07-api/contracts/openapi/synkro-auth-api.yaml, RegisterRequest/UserResponse).
export type Role = 'ADMIN' | 'SALESPERSON' | 'INVENTORY';

export const ROLES: readonly Role[] = ['ADMIN', 'SALESPERSON', 'INVENTORY'];

export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  role: Role;
}

// Safe DTO allowlist only — never a credential, hash or token field.
export interface UserProfile {
  userId: string;
  name: string;
  email: string;
  role: Role;
  registrationDate: string;
  active: boolean;
}
