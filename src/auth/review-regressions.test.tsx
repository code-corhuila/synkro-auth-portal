import { afterEach, beforeEach, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { apiClient } from '../test-doubles/apiClient';
import { resetSessionDouble, setTestSession } from '../test-doubles/session';
import App from '../App';
import { UserLookup } from './components/UserLookup';
import { CreateUserForm } from './components/CreateUserForm';
import { registerUser, getUserById } from './api/usersApi';
import { currentIntent, markAmbiguous, resetRegistrationIntentForTests, tryBeginIntent } from './intent/registrationIntent';

const owner = { sub: 'admin', sessionId: 'session-a' };
const payload = { name: 'Test User', email: 'test@example.test', password: 'test-password', role: 'SALESPERSON' as const };
const profile = { userId: '11111111-1111-1111-1111-111111111111', name: 'Test User', email: 'test@example.test', role: 'SALESPERSON' as const, registrationDate: '2026-11-03T00:00:00Z', active: true };
function fill() {
  fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: payload.name } });
  fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: payload.email } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: payload.password } });
  fireEvent.change(screen.getByLabelText('Rol'), { target: { value: payload.role } });
}
function search() {
  fireEvent.change(screen.getByLabelText('ID de usuario'), { target: { value: profile.userId } });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
}
beforeEach(() => {
  resetRegistrationIntentForTests(); resetSessionDouble(); apiClient.request.mockReset();
  setTestSession({ ...owner, role: 'ADMIN' });
  window.history.replaceState({}, '', '/users');
});
afterEach(() => { cleanup(); resetRegistrationIntentForTests(); });

it('retires in-flight work when the same ADMIN receives a new session ID without an intervening logout', async () => {
  let resolve!: (value: unknown) => void;
  apiClient.request.mockReturnValue(new Promise((done) => { resolve = done; }));
  render(<App />); fill();
  fireEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
  const signal = apiClient.request.mock.calls[0][1].signal;
  act(() => setTestSession({ sub: owner.sub, role: 'ADMIN', sessionId: 'session-b' }));
  await act(async () => { resolve(profile); });
  expect(signal.aborted).toBe(true);
  expect(screen.queryByText(profile.userId)).not.toBeInTheDocument();
  expect(screen.getByLabelText('Nombre completo')).toHaveValue('');
});

it('does not fall back to the subject when a session identity is unavailable', () => {
  setTestSession({ sub: owner.sub, role: 'ADMIN', sessionId: '' });
  render(<App />);
  expect(screen.queryByLabelText('Nombre completo')).not.toBeInTheDocument();
});

it('retires the RAM-only password/intention on logout while the portal is unmounted', () => {
  const intent = tryBeginIntent(owner, payload)!; markAmbiguous(intent.key);
  const view = render(<App />); view.unmount();
  setTestSession(null);
  expect(currentIntent(owner)).toBeNull();
});

it('never restores an old lookup after its ID is edited without submitting another search', async () => {
  let resolve!: (value: unknown) => void;
  apiClient.request.mockReturnValue(new Promise((done) => { resolve = done; }));
  render(<UserLookup />); search();
  const signal = apiClient.request.mock.calls[0][1].signal;
  fireEvent.change(screen.getByLabelText('ID de usuario'), { target: { value: 'invalid' } });
  await act(async () => { resolve(profile); });
  expect(screen.queryByText(profile.email)).not.toBeInTheDocument();
  expect(signal.aborted).toBe(true);
});

it('aborts an outstanding lookup when the portal unmounts', () => {
  apiClient.request.mockReturnValue(new Promise(() => {}));
  const view = render(<UserLookup />); search();
  const signal = apiClient.request.mock.calls[0][1].signal;
  view.unmount(); expect(signal.aborted).toBe(true);
});

it.each([401, 403])('offers no lookup retry for an authority failure %i', async (status) => {
  apiClient.request.mockRejectedValueOnce({ status, body: { error: 'DENIED', message: 'denied', traceId: 't' } });
  render(<UserLookup />);
  await act(async () => { search(); });
  expect(screen.getByRole('alert')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reintentar búsqueda' })).not.toBeInTheDocument();
});

it('returns only the safe profile allowlist from both real-client adapters', async () => {
  apiClient.request.mockResolvedValue({ ...profile, password: 'private sentinel', accessToken: 'private sentinel', passwordHash: 'private sentinel' });
  const created = await registerUser(payload, 'one-key');
  const found = await getUserById(profile.userId);
  expect(created).toEqual(profile); expect(found).toEqual(profile);
});

it('removes the previous success profile when a new creation begins', async () => {
  apiClient.request.mockResolvedValueOnce(profile).mockReturnValueOnce(new Promise(() => {}));
  render(<CreateUserForm owner={owner} />); fill();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Crear usuario' })); });
  expect(screen.getByText(profile.userId)).toBeInTheDocument();
  fill(); fireEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
  expect(screen.queryByText(profile.userId)).not.toBeInTheDocument();
});

it('does not offer user creation at an unsupported nested auth route', () => {
  window.history.replaceState({}, '', '/users/unsupported');
  render(<App />);
  expect(screen.queryByLabelText('Nombre completo')).not.toBeInTheDocument();
});
