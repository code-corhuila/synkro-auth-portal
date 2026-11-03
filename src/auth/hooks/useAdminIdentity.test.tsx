import { afterEach, beforeEach, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { resetSessionDouble, setTestSession } from '../../test-doubles/session';
import { useAdminIdentity } from './useAdminIdentity';

let renders = 0;

function Probe() {
  useAdminIdentity();
  renders += 1;
  return null;
}

beforeEach(() => {
  resetSessionDouble();
  renders = 0;
});
afterEach(cleanup);

// Guards against the exact pitfall the task calls out: the real Host's
// `session.user()` builds a brand-new object on every call, so a naive
// `useSyncExternalStore(session.subscribe, session.user)` would see a
// different reference on every notification and re-render without end.
it('does not re-render when notified again with an unchanged identity', () => {
  setTestSession({ sub: 'alice', role: 'ADMIN', sessionId: 's-1' });
  render(<Probe />);
  const afterMount = renders;

  act(() => setTestSession({ sub: 'alice', role: 'ADMIN', sessionId: 's-1' }));

  expect(renders).toBe(afterMount);
});

it('still re-renders when the role actually changes', () => {
  setTestSession({ sub: 'alice', role: 'ADMIN', sessionId: 's-1' });
  render(<Probe />);
  const afterMount = renders;

  act(() => setTestSession({ sub: 'alice', role: 'SALESPERSON', sessionId: 's-1' }));

  expect(renders).toBeGreaterThan(afterMount);
});
