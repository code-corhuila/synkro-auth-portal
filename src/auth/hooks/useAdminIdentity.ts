import { useSyncExternalStore } from 'react';
import { session } from 'shell/session';

// The Host's real `shell/session.user()` builds a brand-new object on every
// call (synkro-front/src/shell/session.ts: `{ sub: current.sub, role: current.role }`).
// Handing that straight to useSyncExternalStore's getSnapshot would return a
// different reference on every render with nothing actually changed, which
// is the infinite-loop pattern React's docs warn about. This caches by value
// so repeated calls with the same (sub, role) return the exact same object.
let cached: { sub: string; role: string; sessionId: string } | null = null;

function getStableUser() {
  const fresh = session.user();
  const sessionId = session.sessionId();
  if (!fresh || !sessionId) {
    cached = null;
    return null;
  }
  if (cached && cached.sub === fresh.sub && cached.role === fresh.role && cached.sessionId === sessionId) return cached;
  cached = { sub: fresh.sub, role: fresh.role, sessionId };
  return cached;
}

export function useAdminIdentity() {
  return useSyncExternalStore(session.subscribe, getStableUser);
}
