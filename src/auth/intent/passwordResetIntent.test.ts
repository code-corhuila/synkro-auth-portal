import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSessionDouble, setTestSession, session } from '../../test-doubles/session';
import {
  clearIntent,
  currentIntent,
  markAmbiguous,
  resetPasswordResetIntentForTests,
  tryBeginIntent,
} from './passwordResetIntent';

const owner = { sub: 'admin-1', sessionId: 'session-a' };
const otherSession = { sub: 'admin-1', sessionId: 'session-b' };
const otherUser = { sub: 'admin-2', sessionId: 'session-a' };
const target = { userId: '11111111-1111-1111-1111-111111111111', name: 'Alice Doe', email: 'alice@example.test', role: 'SALESPERSON' as const };
const request = { newPassword: 'Another-pass-9', confirmPassword: 'Another-pass-9' };

beforeEach(() => {
  resetSessionDouble();
  setTestSession({ sub: owner.sub, role: 'ADMIN', sessionId: owner.sessionId });
});
afterEach(() => resetPasswordResetIntentForTests());

describe('tryBeginIntent', () => {
  it('starts a pending intent with a fresh key inside the 8..128 range of the contract', () => {
    const intent = tryBeginIntent(owner, target, request);

    expect(intent?.status).toBe('pending');
    expect(intent?.key.length).toBeGreaterThanOrEqual(8);
    expect(intent?.key.length).toBeLessThanOrEqual(128);
    expect(intent?.target).toEqual(target);
    expect(intent?.request).toEqual(request);
  });

  it('keeps its own copy of what it was given, so a later edit of the form cannot change the retried request', () => {
    const mutable = { ...request };
    const intent = tryBeginIntent(owner, target, mutable)!;

    mutable.newPassword = 'changed-afterwards';

    expect(currentIntent(owner)?.request.newPassword).toBe('Another-pass-9');
    expect(intent.request.newPassword).toBe('Another-pass-9');
  });

  it('refuses a second intent for the same owner while one is unresolved (synchronous double-submit guard)', () => {
    const first = tryBeginIntent(owner, target, request);
    const second = tryBeginIntent(owner, { ...target, userId: '22222222-2222-2222-2222-222222222222' }, request);

    expect(second).toBeNull();
    expect(currentIntent(owner)?.key).toBe(first?.key);
    expect(currentIntent(owner)?.target.userId).toBe(target.userId);
  });

  it('never reuses a key for a new intent', () => {
    const keys = new Set<string>();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const intent = tryBeginIntent(owner, target, request)!;
      keys.add(intent.key);
      clearIntent(intent.key);
    }
    expect(keys.size).toBe(20);
  });
});

describe('currentIntent', () => {
  it('is only visible to the exact (sub, sessionId) that began it', () => {
    tryBeginIntent(owner, target, request);

    expect(currentIntent(owner)).not.toBeNull();
    expect(currentIntent(otherSession)).toBeNull();
    expect(currentIntent(otherUser)).toBeNull();
  });

  it('is null when nothing was begun', () => {
    expect(currentIntent(owner)).toBeNull();
  });
});

describe('markAmbiguous / clearIntent', () => {
  it('keeps the exact key, target and request across an ambiguous outcome, for the explicit retry', () => {
    const intent = tryBeginIntent(owner, target, request)!;

    markAmbiguous(intent.key);

    const retained = currentIntent(owner);
    expect(retained?.status).toBe('ambiguous');
    expect(retained?.key).toBe(intent.key);
    expect(retained?.target).toEqual(target);
    expect(retained?.request).toEqual(request);
  });

  it('frees the owner once cleared', () => {
    const intent = tryBeginIntent(owner, target, request)!;

    clearIntent(intent.key);

    expect(currentIntent(owner)).toBeNull();
    expect(tryBeginIntent(owner, target, request)).not.toBeNull();
  });

  it('ignores a stale key, so a late callback of an older attempt cannot drop or alter a newer intent', () => {
    const first = tryBeginIntent(owner, target, request)!;
    clearIntent(first.key);
    const second = tryBeginIntent(owner, target, request)!;

    clearIntent(first.key);
    markAmbiguous(first.key);

    expect(currentIntent(owner)?.key).toBe(second.key);
    expect(currentIntent(owner)?.status).toBe('pending');
  });
});

describe('what the intent is bound to', () => {
  it('is retired when the Host session ends (logout), so no password outlives the person who typed it', () => {
    tryBeginIntent(owner, target, request);

    setTestSession(null);

    expect(currentIntent(owner)).toBeNull();
  });

  it('is retired when the same person signs in again under a new sessionId', () => {
    tryBeginIntent(owner, target, request);

    setTestSession({ sub: owner.sub, role: 'ADMIN', sessionId: 'session-b' });

    expect(currentIntent(owner)).toBeNull();
    expect(currentIntent(otherSession)).toBeNull();
  });

  it('is retired when another person takes over the session', () => {
    tryBeginIntent(owner, target, request);

    setTestSession({ sub: 'admin-2', role: 'ADMIN', sessionId: owner.sessionId });

    expect(currentIntent(owner)).toBeNull();
  });

  it('is retired when the role is no longer ADMIN', () => {
    tryBeginIntent(owner, target, request);

    setTestSession({ sub: owner.sub, role: 'SALESPERSON', sessionId: owner.sessionId });

    expect(currentIntent(owner)).toBeNull();
  });

  it('stays while the same identity keeps notifying, and stops listening once retired', () => {
    const intent = tryBeginIntent(owner, target, request)!;
    setTestSession({ sub: owner.sub, role: 'ADMIN', sessionId: owner.sessionId });
    expect(currentIntent(owner)?.key).toBe(intent.key);

    clearIntent(intent.key);
    const unsubscribed = session.subscribe.mock.results.at(-1)?.value as () => boolean;

    expect(unsubscribed).toBeTypeOf('function');
    // Calling the returned stop again is harmless: the listener is already gone.
    expect(unsubscribed()).toBe(false);
  });
});

describe('RAM only', () => {
  it('writes nothing to localStorage, sessionStorage or the URL, and logs nothing', () => {
    const writes: string[] = [];
    const recorder = { length: 0, key: () => null, getItem: () => null, removeItem: () => {}, clear: () => {}, setItem: (name: string) => { writes.push(name); } };
    vi.stubGlobal('localStorage', recorder);
    vi.stubGlobal('sessionStorage', recorder);
    const log = vi.spyOn(console, 'log');
    const warn = vi.spyOn(console, 'warn');
    const error = vi.spyOn(console, 'error');
    const before = window.location.href;

    const intent = tryBeginIntent(owner, target, request)!;
    markAmbiguous(intent.key);
    clearIntent(intent.key);

    expect(writes).toEqual([]);
    expect(window.location.href).toBe(before);
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
