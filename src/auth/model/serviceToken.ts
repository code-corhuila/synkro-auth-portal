// Mirrors the Auth OpenAPI contract's field names exactly
// (07-api/contracts/openapi/synkro-auth-api.yaml, ServiceTokenResponse).
// Permissions per service are fixed by the server (ServiceAccount) and are
// never sent from this client — the UI only selects `service`.
export type Service = 'synkro-workflow' | 'synkro-worker';

export const SERVICES: readonly Service[] = ['synkro-workflow', 'synkro-worker'];

export interface IssueServiceTokenPayload {
  service: Service;
}

// Safe DTO allowlist only — never a credential, hash or secret field.
export interface ServiceTokenMetadata {
  tokenId: string;
  service: Service;
  permissions: string[];
  issuedBy: string;
  issuedAt: string;
  expiresAt: string;
}

// `token` is present only on the 201 that mints a new secret; a 200 replay
// carries metadata alone (the Auth OpenAPI contract).
export interface IssuedServiceToken extends ServiceTokenMetadata {
  token?: string;
}

export function expiryStatus(expiresAt: string, now: Date = new Date()): 'vigente' | 'expirado' {
  return new Date(expiresAt).getTime() > now.getTime() ? 'vigente' : 'expirado';
}
