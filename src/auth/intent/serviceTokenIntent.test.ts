import { afterEach, beforeEach, expect, it } from 'vitest';
import { resetSessionDouble, setTestSession } from '../../test-doubles/session';
import { clearServiceTokenIntent, currentServiceTokenIntent, markServiceTokenAmbiguous,
  resetServiceTokenIntentForTests, tryBeginServiceTokenIntent } from './serviceTokenIntent';

const owner = { sub: 'admin', sessionId: 'session' };
beforeEach(() => { resetServiceTokenIntentForTests(); resetSessionDouble(); });
afterEach(resetServiceTokenIntentForTests);

it('keeps only a frozen service intent, blocks duplicates and ignores stale cleanup', () => {
  const first = tryBeginServiceTokenIntent(owner, 'synkro-worker')!;
  expect(Object.keys(first).sort()).toEqual(['key', 'owner', 'service', 'status']);
  expect(tryBeginServiceTokenIntent(owner, 'synkro-workflow')).toBeNull();
  markServiceTokenAmbiguous(first.key);
  expect(currentServiceTokenIntent(owner)?.status).toBe('ambiguous');
  clearServiceTokenIntent('stale');
  expect(currentServiceTokenIntent(owner)?.key).toBe(first.key);
  clearServiceTokenIntent(first.key);
  expect(currentServiceTokenIntent(owner)).toBeNull();
});

it.each([null, { sub: 'admin', role: 'SALESPERSON', sessionId: 'session' },
  { sub: 'admin', role: 'ADMIN', sessionId: 'new-session' }])('retires unresolved intent on session loss (%j)', (next) => {
  tryBeginServiceTokenIntent(owner, 'synkro-worker');
  setTestSession(next);
  expect(currentServiceTokenIntent(owner)).toBeNull();
});

it('preserves the same intent on notifications from its still-authorized owner', () => {
  const first = tryBeginServiceTokenIntent(owner, 'synkro-worker')!;
  setTestSession({ ...owner, role: 'ADMIN' });
  expect(currentServiceTokenIntent(owner)?.key).toBe(first.key);
  expect(currentServiceTokenIntent({ ...owner, sub: 'someone-else' })).toBeNull();
});
