import { session } from 'shell/session';
import type { Owner } from './registrationIntent';
import type { Service } from '../model/serviceToken';

// RAM-only intent for one in-flight (or ambiguous) service-token emission,
// scoped to one owner — the same pattern as registrationIntent.ts, applied
// to AUTH-17. Only {key, owner, service, status} are retained: never the
// issued secret, which lives solely in the component's ephemeral state.
export interface ServiceTokenIntent {
  key: string;
  owner: Owner;
  service: Service;
  status: 'pending' | 'ambiguous';
}

let stored: ServiceTokenIntent | null = null;
let unsubscribe: (() => void) | undefined;

function retire() {
  stored = null;
  const stop = unsubscribe;
  unsubscribe = undefined;
  stop?.();
}

function sameOwner(a: Owner, b: Owner): boolean {
  return a.sub === b.sub && a.sessionId === b.sessionId;
}

export function currentServiceTokenIntent(owner: Owner): ServiceTokenIntent | null {
  return stored && sameOwner(stored.owner, owner) ? stored : null;
}

// Synchronous guard against a double click: returns null, without creating
// anything, if that owner already has an unresolved intent.
export function tryBeginServiceTokenIntent(owner: Owner, service: Service): ServiceTokenIntent | null {
  if (currentServiceTokenIntent(owner)) return null;
  retire();
  stored = { key: crypto.randomUUID(), owner: { ...owner }, service, status: 'pending' };
  unsubscribe = session.subscribe(() => {
    const user = session.user();
    if (!user || user.role !== 'ADMIN' || user.sub !== owner.sub || session.sessionId() !== owner.sessionId) retire();
  });
  return stored;
}

export function markServiceTokenAmbiguous(key: string): void {
  if (stored?.key === key) stored = { ...stored, status: 'ambiguous' };
}

// No-op for a key that is no longer the stored one, so a stale async
// callback from an earlier intent can never clear a newer one.
export function clearServiceTokenIntent(key: string): void {
  if (stored?.key === key) retire();
}

export function resetServiceTokenIntentForTests(): void {
  retire();
}
