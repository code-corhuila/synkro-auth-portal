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

// The person a password reset is aimed at, as the ADMIN saw it when choosing: enough to name the recipient
// unambiguously on every step. Never a credential.
export type ResetTarget = Pick<UserProfile, 'userId' | 'name' | 'email' | 'role'>;

// The body of the reset, field names exactly as the API contract (ADR-021).
export interface PasswordResetRequest {
  newPassword: string;
  confirmPassword: string;
}

export interface PasswordResetResult {
  userId: string;
  passwordResetAt: string;
}
