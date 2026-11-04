import type { CreateUserPayload } from '../model/user';
import { session } from 'shell/session';

// A single in-memory, RAM-only registration intent, scoped to one owner. Not
// written to any browser storage or the URL: it survives a portal remount
// within the same live session (module scope outlives a single component
// instance) but never a full page reload (ADR-016-style policy, applied by
// analogy to this portal's own write — see AUTH16-DESIGN.md, "Límite documentado").
export interface Owner {
  sub: string;
  sessionId: string;
}

export interface RegistrationIntent {
  key: string;
  owner: Owner;
  body: CreateUserPayload;
  status: 'pending' | 'ambiguous';
}

let stored: RegistrationIntent | null = null;
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

// Only visible to the exact (sub, sessionId) that started it. A different
// session for the same person, or a different person, sees nothing pending.
export function currentIntent(owner: Owner): RegistrationIntent | null {
  return stored && sameOwner(stored.owner, owner) ? stored : null;
}

// Synchronous guard against a double click: returns null, without creating
// anything, if that owner already has an unresolved intent (pending or
// ambiguous) — the caller must not fall back to firing a request anyway.
export function tryBeginIntent(owner: Owner, body: CreateUserPayload): RegistrationIntent | null {
  if (currentIntent(owner)) return null;
  retire();
  stored = { key: crypto.randomUUID(), owner: { ...owner }, body: { ...body }, status: 'pending' };
  // Keep watching while unmounted: no retained password survives logout.
  unsubscribe = session.subscribe(() => {
    const user = session.user();
    if (!user || user.role !== 'ADMIN' || user.sub !== owner.sub || session.sessionId() !== owner.sessionId) retire();
  });
  return stored;
}

export function markAmbiguous(key: string): void {
  if (stored?.key === key) stored = { ...stored, status: 'ambiguous' };
}

// No-ops for a key that is no longer the stored one, so a stale async
// callback from an earlier intent can never clear a newer one.
export function clearIntent(key: string): void {
  if (stored?.key === key) retire();
}

export function resetRegistrationIntentForTests(): void {
  retire();
}
