import { afterEach, describe, expect, it } from 'vitest';
import { clearIntent, currentIntent, markAmbiguous, resetRegistrationIntentForTests, tryBeginIntent } from './registrationIntent';

const owner = { sub: 'admin-1', sessionId: 'session-a' };
const otherSession = { sub: 'admin-1', sessionId: 'session-b' };
const otherUser = { sub: 'admin-2', sessionId: 'session-a' };
const body = { name: 'Alice', email: 'alice@example.test', password: 'secret123', role: 'SALESPERSON' as const };

afterEach(() => resetRegistrationIntentForTests());

describe('tryBeginIntent', () => {
  it('starts a new intent with a fresh idempotency key', () => {
    const intent = tryBeginIntent(owner, body);
    expect(intent?.status).toBe('pending');
    expect(intent?.key.length).toBeGreaterThanOrEqual(8);
    expect(intent?.body).toEqual(body);
  });

  it('refuses a second intent for the same owner while one is unresolved (double-submit guard)', () => {
    const first = tryBeginIntent(owner, body);
    const second = tryBeginIntent(owner, { ...body, name: 'Someone else' });
    expect(second).toBeNull();
    expect(currentIntent(owner)?.key).toBe(first?.key);
    expect(currentIntent(owner)?.body.name).toBe('Alice');
  });

  it('lets a different owner start its own intent independently', () => {
    tryBeginIntent(owner, body);
    const forOtherUser = tryBeginIntent(otherUser, body);
    const forOtherSession = tryBeginIntent(otherSession, body);
    expect(forOtherUser).not.toBeNull();
    expect(forOtherSession).not.toBeNull();
  });
});

describe('currentIntent', () => {
  it('is scoped to (sub, sessionId): a session replacement for the same person sees nothing', () => {
    tryBeginIntent(owner, body);
    expect(currentIntent(otherSession)).toBeNull();
    expect(currentIntent(otherUser)).toBeNull();
    expect(currentIntent(owner)).not.toBeNull();
  });

  it('returns null once nothing is pending for that owner', () => {
    expect(currentIntent(owner)).toBeNull();
  });
});

describe('markAmbiguous / clearIntent', () => {
  it('keeps the exact key and body across an ambiguous transition, for the explicit retry', () => {
    const intent = tryBeginIntent(owner, body)!;
    markAmbiguous(intent.key);
    const retained = currentIntent(owner);
    expect(retained?.status).toBe('ambiguous');
    expect(retained?.key).toBe(intent.key);
    expect(retained?.body).toEqual(body);
  });

  it('frees the owner to start a new intent once cleared', () => {
    const intent = tryBeginIntent(owner, body)!;
    clearIntent(intent.key);
    expect(currentIntent(owner)).toBeNull();
    expect(tryBeginIntent(owner, body)).not.toBeNull();
  });

  it('ignores a clear for a key that is no longer current, so a stale async callback cannot drop a newer intent', () => {
    const first = tryBeginIntent(owner, body)!;
    clearIntent(first.key);
    const second = tryBeginIntent(owner, body)!;
    clearIntent(first.key);
    expect(currentIntent(owner)?.key).toBe(second.key);
  });
});
