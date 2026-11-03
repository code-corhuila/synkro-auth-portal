import { vi } from 'vitest';

// A minimal, test-controlled double of `shell/session`: mutable state plus a
// listener set, so a test can simulate a role change, logout or a new login
// (a different sessionId for the same sub) and assert on the notification.
let current: { sub: string; role: string } | null = null;
let sessionIdValue: string | null = null;
const listeners = new Set<() => void>();

export const session = {
  user: vi.fn(() => current ? { ...current } : null),
  sessionId: vi.fn(() => sessionIdValue),
  subscribe: vi.fn((listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }),
};

export function setTestSession(next: { sub: string; role: string; sessionId: string } | null) {
  current = next ? { sub: next.sub, role: next.role } : null;
  sessionIdValue = next ? next.sessionId : null;
  for (const listener of Array.from(listeners)) listener();
}

export function resetSessionDouble() {
  current = null;
  sessionIdValue = null;
  listeners.clear();
  session.user.mockClear();
  session.sessionId.mockClear();
  session.subscribe.mockClear();
}
