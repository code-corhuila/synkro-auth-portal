import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { apiClient } from './test-doubles/apiClient';
import { resetSessionDouble, setTestSession } from './test-doubles/session';
import App from './App';
import { resetRegistrationIntentForTests } from './auth/intent/registrationIntent';
import { resetServiceTokenIntentForTests } from './auth/intent/serviceTokenIntent';

beforeEach(() => {
  apiClient.request.mockReset();
  resetSessionDouble();
  resetRegistrationIntentForTests();
  resetServiceTokenIntentForTests();
  window.history.pushState({}, '', '/users');
});
afterEach(cleanup);

describe('service credential session boundaries', () => {
  it.each([null, { sub: 'alice', role: 'INVENTORY', sessionId: 's-1' },
    { sub: 'alice', role: 'ADMIN', sessionId: 's-2' },
    { sub: 'bob', role: 'ADMIN', sessionId: 's-1' }])('removes a received credential when identity changes (%j)', async (next) => {
    window.history.pushState({}, '', '/service-tokens');
    setTestSession({ sub: 'alice', role: 'ADMIN', sessionId: 's-1' });
    apiClient.request.mockResolvedValue({
      tokenId: 'test-id', service: 'synkro-worker', permissions: ['products:read'],
      issuedBy: 'alice', issuedAt: '2026-11-07T00:00:00Z', expiresAt: '2026-12-07T00:00:00Z', token: 'fixture-secret',
    });
    render(<App />);
    fireEvent.change(screen.getByLabelText('Servicio'), { target: { value: 'synkro-worker' } });
    fireEvent.click(screen.getByRole('button', { name: 'Emitir token' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y emitir' }));
    await screen.findByLabelText('Token');
    act(() => setTestSession(next));
    expect(screen.queryByLabelText('Token')).not.toBeInTheDocument();
    expect(apiClient.request).toHaveBeenCalledTimes(1);
  });
});

describe('ADMIN gate inside the remote itself (defense in depth)', () => {
  it('mounts nothing and issues no request for a non-ADMIN session', () => {
    setTestSession({ sub: 'vera', role: 'SALESPERSON', sessionId: 's-1' });
    render(<App />);

    expect(screen.queryByText('Crear usuario')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('ID de usuario')).not.toBeInTheDocument();
    expect(apiClient.request).not.toHaveBeenCalled();
  });

  it('mounts nothing when there is no session at all', () => {
    setTestSession(null);
    render(<App />);

    expect(screen.queryByText('Crear usuario')).not.toBeInTheDocument();
  });

  it('renders creation and lookup for an ADMIN session at /users', () => {
    setTestSession({ sub: 'alice', role: 'ADMIN', sessionId: 's-1' });
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Crear usuario' })).toBeInTheDocument();
    expect(screen.getByLabelText('ID de usuario')).toBeInTheDocument();
  });

  it('routes an ADMIN session to the service-tokens page at /service-tokens without any I/O', () => {
    window.history.pushState({}, '', '/service-tokens');
    setTestSession({ sub: 'alice', role: 'ADMIN', sessionId: 's-1' });
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Emitir token de servicio' })).toBeInTheDocument();
    expect(screen.queryByText('Crear usuario')).not.toBeInTheDocument();
    expect(apiClient.request).not.toHaveBeenCalled();
  });

  it('mounts nothing and issues no request for a non-ADMIN session at /service-tokens', () => {
    window.history.pushState({}, '', '/service-tokens');
    setTestSession({ sub: 'vera', role: 'SALESPERSON', sessionId: 's-1' });
    render(<App />);

    expect(screen.queryByText('Emitir token de servicio')).not.toBeInTheDocument();
    expect(apiClient.request).not.toHaveBeenCalled();
  });

  it('mounts nothing at /service-tokens when there is no session at all', () => {
    window.history.pushState({}, '', '/service-tokens');
    setTestSession(null);
    render(<App />);

    expect(screen.queryByText('Emitir token de servicio')).not.toBeInTheDocument();
    expect(apiClient.request).not.toHaveBeenCalled();
  });

  it('retires an in-flight creation and shows no stale profile when the role is denied mid-flight', () => {
    setTestSession({ sub: 'alice', role: 'ADMIN', sessionId: 's-1' });
    apiClient.request.mockReturnValue(new Promise(() => {}));
    render(<App />);
    fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'Alice Doe' } });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'alice@example.test' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secret123' } });
    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'SALESPERSON' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
    expect(apiClient.request).toHaveBeenCalledTimes(1);

    act(() => setTestSession({ sub: 'alice', role: 'SALESPERSON', sessionId: 's-1' }));

    expect(screen.queryByText('Crear usuario')).not.toBeInTheDocument();
    expect(screen.queryByText('alice@example.test')).not.toBeInTheDocument();
  });

  it('hides the module immediately on logout', () => {
    setTestSession({ sub: 'alice', role: 'ADMIN', sessionId: 's-1' });
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Crear usuario' })).toBeInTheDocument();

    act(() => setTestSession(null));

    expect(screen.queryByText('Crear usuario')).not.toBeInTheDocument();
  });
});

describe('mount/remount ambiguity policy for the same live session (minimum test 3)', () => {
  it('resumes the retained ambiguous intent, with fields disabled, after an unmount/remount of the same session', async () => {
    setTestSession({ sub: 'alice', role: 'ADMIN', sessionId: 's-1' });
    apiClient.request.mockRejectedValueOnce({ status: 0, body: { error: 'TIMEOUT', message: 'timed out', traceId: 't' } });
    const first = render(<App />);
    fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'Alice Doe' } });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'alice@example.test' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secret123' } });
    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'SALESPERSON' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
    await screen.findByRole('button', { name: 'Reintentar' });
    first.unmount();

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toHaveValue('alice@example.test');
    expect(screen.getByLabelText('Nombre completo')).toBeDisabled();
  });

  it('a brand-new login as the same person (new sessionId) never sees the previous intent', async () => {
    setTestSession({ sub: 'alice', role: 'ADMIN', sessionId: 's-1' });
    apiClient.request.mockRejectedValueOnce({ status: 0, body: { error: 'TIMEOUT', message: 'timed out', traceId: 't' } });
    const first = render(<App />);
    fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'Alice Doe' } });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'alice@example.test' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secret123' } });
    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'SALESPERSON' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
    await screen.findByRole('button', { name: 'Reintentar' });
    first.unmount();

    setTestSession({ sub: 'alice', role: 'ADMIN', sessionId: 's-2' });
    render(<App />);

    expect(screen.getByRole('button', { name: 'Crear usuario' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre completo')).toHaveValue('');
  });
});
