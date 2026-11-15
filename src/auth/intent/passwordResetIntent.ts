import type { PasswordResetRequest, ResetTarget } from '../model/user';
import { session } from 'shell/session';

// A single RAM-only password-reset intent, scoped to one owner (ADR-021, Decision 6). It exists so that, after an
// outcome the Portal cannot confirm, the ADMIN can resend the very same request with the very same key. It is never
// written to browser storage, the URL, a log or the console. It survives a remount of the panel inside the live
// session (module scope outlives a component instance) but never a page reload, and it is dropped the moment the
// Host identity that created it changes.
export interface Owner {
  sub: string;
  sessionId: string;
}

export interface PasswordResetIntent {
  key: string;
  owner: Owner;
  target: ResetTarget;
  request: PasswordResetRequest;
  status: 'pending' | 'ambiguous';
}

let stored: PasswordResetIntent | null = null;
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

// Only visible to the exact (sub, sessionId) that began it.
export function currentIntent(owner: Owner): PasswordResetIntent | null {
  return stored && sameOwner(stored.owner, owner) ? stored : null;
}

// Synchronous guard against a double submit: returns null, creating nothing, if that owner already has an unresolved
// intent. The caller must not fall back to sending anyway.
export function tryBeginIntent(owner: Owner, target: ResetTarget, request: PasswordResetRequest): PasswordResetIntent | null {
  if (currentIntent(owner)) return null;
  retire();
  stored = {
    key: crypto.randomUUID(),
    owner: { ...owner },
    target: { ...target },
    request: { newPassword: request.newPassword, confirmPassword: request.confirmPassword },
    status: 'pending',
  };
  // Keep watching while no panel is mounted: no retained password may outlive the identity that typed it.
  unsubscribe = session.subscribe(() => {
    const user = session.user();
    if (!user || user.role !== 'ADMIN' || user.sub !== owner.sub || session.sessionId() !== owner.sessionId) retire();
  });
  return stored;
}

export function markAmbiguous(key: string): void {
  if (stored?.key === key) stored = { ...stored, status: 'ambiguous' };
}

// A no-op for a key that is no longer the stored one, so a late callback of an older attempt can never clear a newer one.
export function clearIntent(key: string): void {
  if (stored?.key === key) retire();
}

export function resetPasswordResetIntentForTests(): void {
  retire();
}
