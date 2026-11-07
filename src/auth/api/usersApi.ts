import { apiClient } from 'shell/apiClient';
import type { CreateUserPayload, UserProfile } from '../model/user';
import { ROLES } from '../model/user';

function safeProfile(value: UserProfile): UserProfile {
  if (!value || typeof value.userId !== 'string' || typeof value.name !== 'string'
    || typeof value.email !== 'string' || !ROLES.includes(value.role)
    || typeof value.registrationDate !== 'string' || typeof value.active !== 'boolean') {
    throw new Error('Invalid user profile response');
  }
  const { userId, name, email, role, registrationDate, active } = value;
  return { userId, name, email, role, registrationDate, active };
}

// Both calls go through the Host's single client. No gateway URL and no
// manual credential header here: the Host attaches that after its own
// session gate (_stacks/frontend.md).
export function registerUser(body: CreateUserPayload, idempotencyKey: string, signal?: AbortSignal): Promise<UserProfile> {
  return apiClient.request<UserProfile>('/api/v1/auth/register', { method: 'POST', body, idempotencyKey, signal }).then(safeProfile);
}

export function getUserById(id: string, signal?: AbortSignal): Promise<UserProfile> {
  return apiClient.request<UserProfile>(`/api/v1/auth/users/${encodeURIComponent(id)}`, { signal }).then(safeProfile);
}

export interface UserSearch {
  q?: string;
  role?: UserProfile['role'];
  page: number;
  limit: number;
}

export interface UserPage {
  data: UserProfile[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export async function searchUsers(body: UserSearch, signal: AbortSignal): Promise<UserPage> {
  const result = await apiClient.request<UserPage>('/api/v1/auth/users/search', { method: 'POST', body, signal });
  if (!Array.isArray(result?.data) || !result.meta
    || ![result.meta.page, result.meta.limit, result.meta.total, result.meta.totalPages].every(Number.isSafeInteger)
    || result.meta.page < 1 || result.meta.limit < 1 || result.meta.total < 0 || result.meta.totalPages < 0) {
    throw new Error('Invalid user directory response');
  }
  return { data: result.data.map(safeProfile), meta: result.meta };
}
