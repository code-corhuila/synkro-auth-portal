import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { apiClient } from '../../test-doubles/apiClient';
import { resetSessionDouble, setTestSession } from '../../test-doubles/session';
import { UsersPage } from './UsersPage';
import { currentIntent, resetPasswordResetIntentForTests } from '../intent/passwordResetIntent';
import { resetRegistrationIntentForTests } from '../intent/registrationIntent';

const owner = { sub: 'admin-1', sessionId: 'session-a' };
const PASSWORD = 'Brand-new-pass-91';
const vera = { userId: '11111111-1111-1111-1111-111111111111', name: 'Vera Ventas', email: 'vera@example.test', role: 'SALESPERSON', registrationDate: '2026-11-03T00:00:00Z', active: true };
const ivan = { userId: '22222222-2222-2222-2222-222222222222', name: 'Ivan Inventario', email: 'ivan@example.test', role: 'INVENTORY', registrationDate: '2026-11-03T00:00:00Z', active: true };
const directory = { data: [vera, ivan], meta: { page: 1, limit: 20, total: 2, totalPages: 1 } };
const answer = { userId: vera.userId, passwordResetAt: '2026-11-10T20:00:00.123456Z' };
const timeout = { status: 0, body: { error: 'TIMEOUT', message: 'timed out', traceId: 'n/a' } };

function serve(reset: (options: { body: unknown; idempotencyKey: string }) => Promise<unknown>) {
  apiClient.request.mockImplementation((path: string, options: { body: unknown; idempotencyKey: string }) => {
    if (path === '/api/v1/auth/users/search') return Promise.resolve(directory);
    if (path.endsWith('/password-reset')) return reset(options);
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

async function openDirectory() {
  fireEvent.click(screen.getByRole('button', { name: 'Abrir directorio' }));
  await screen.findByText('vera@example.test');
}

function startResetFromDirectory(name: string) {
  fireEvent.click(screen.getByRole('button', { name: `Restablecer contraseña de ${name}` }));
}

function typeAndConfirm() {
  fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: PASSWORD } });
  fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: PASSWORD } });
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar y restablecer' }));
}

beforeEach(() => {
  apiClient.request.mockReset();
  resetSessionDouble();
  setTestSession({ sub: owner.sub, role: 'ADMIN', sessionId: owner.sessionId });
  resetPasswordResetIntentForTests();
  resetRegistrationIntentForTests();
});
afterEach(cleanup);

describe('password reset inside the authenticated Users administration', () => {
  it('shows no reset panel until the ADMIN chooses a user', () => {
    render(<UsersPage owner={owner} />);

    expect(screen.queryByRole('region', { name: 'Restablecer contraseña' })).not.toBeInTheDocument();
    expect(apiClient.request).not.toHaveBeenCalled();
  });

  it('opens the panel for the user chosen in the directory, naming them, and closes it again without sending anything', async () => {
    serve(() => Promise.reject(new Error('must not be called')));
    render(<UsersPage owner={owner} />);
    await openDirectory();

    startResetFromDirectory('Vera Ventas');

    const panel = screen.getByRole('region', { name: 'Restablecer contraseña' });
    expect(within(panel).getByText('vera@example.test')).toBeInTheDocument();
    expect(within(panel).getByText(vera.userId)).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('region', { name: 'Restablecer contraseña' })).not.toBeInTheDocument();
    expect(apiClient.request.mock.calls.some(([path]) => String(path).endsWith('/password-reset'))).toBe(false);
  });

  it('opens it from the profile found by id too', async () => {
    apiClient.request.mockResolvedValue(vera);
    render(<UsersPage owner={owner} />);
    fireEvent.change(screen.getByLabelText('ID de usuario'), { target: { value: vera.userId } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByText('vera@example.test');

    fireEvent.click(screen.getByRole('button', { name: 'Restablecer contraseña' }));

    const panel = screen.getByRole('region', { name: 'Restablecer contraseña' });
    expect(within(panel).getByText('Vera Ventas')).toBeInTheDocument();
  });

  it('switches to another recipient only when nothing is unresolved, dropping what was typed for the first', async () => {
    serve(() => Promise.reject(new Error('must not be called')));
    render(<UsersPage owner={owner} />);
    await openDirectory();
    startResetFromDirectory('Vera Ventas');
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: PASSWORD } });

    startResetFromDirectory('Ivan Inventario');

    const panel = screen.getByRole('region', { name: 'Restablecer contraseña' });
    expect(within(panel).getByText('ivan@example.test')).toBeInTheDocument();
    expect(within(panel).queryByText('vera@example.test')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nueva contraseña')).toHaveValue('');
  });

  it('keeps the panel of an attempt that cannot be confirmed when another recipient is chosen, so it is resolved first', async () => {
    serve(() => Promise.reject(timeout));
    render(<UsersPage owner={owner} />);
    await openDirectory();
    startResetFromDirectory('Vera Ventas');
    typeAndConfirm();
    await screen.findByText('No se pudo confirmar el resultado.');

    startResetFromDirectory('Ivan Inventario');

    const panel = screen.getByRole('region', { name: 'Restablecer contraseña' });
    expect(within(panel).getByText('vera@example.test')).toBeInTheDocument();
    expect(within(panel).queryByText('ivan@example.test')).not.toBeInTheDocument();
    expect(screen.getByText('No se pudo confirmar el resultado.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Primero resuelve el intento sin confirmar con Vera Ventas');
  });

  it('drops the notice as soon as the unresolved attempt is discarded, because nothing is blocking any more', async () => {
    serve(() => Promise.reject(timeout));
    render(<UsersPage owner={owner} />);
    await openDirectory();
    startResetFromDirectory('Vera Ventas');
    typeAndConfirm();
    await screen.findByText('No se pudo confirmar el resultado.');
    startResetFromDirectory('Ivan Inventario');
    expect(screen.getByRole('status')).toHaveTextContent('Primero resuelve el intento sin confirmar');

    fireEvent.click(screen.getByRole('button', { name: 'Descartar intento' }));

    expect(screen.queryByText(/Primero resuelve el intento/)).not.toBeInTheDocument();
  });

  it('drops the notice as soon as the retry is answered', async () => {
    let calls = 0;
    serve(() => (calls++ === 0 ? Promise.reject(timeout) : Promise.resolve(answer)));
    render(<UsersPage owner={owner} />);
    await openDirectory();
    startResetFromDirectory('Vera Ventas');
    typeAndConfirm();
    await screen.findByText('No se pudo confirmar el resultado.');
    startResetFromDirectory('Ivan Inventario');
    expect(screen.getByText(/Primero resuelve el intento/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar con la misma solicitud' }));

    await screen.findByText('Contraseña restablecida.');
    expect(screen.queryByText(/Primero resuelve el intento/)).not.toBeInTheDocument();
  });

  it('resumes an unresolved attempt when the Users page is mounted again inside the same session, naming the same recipient', async () => {
    serve(() => Promise.reject(timeout));
    const first = render(<UsersPage owner={owner} />);
    await openDirectory();
    startResetFromDirectory('Vera Ventas');
    typeAndConfirm();
    await screen.findByText('No se pudo confirmar el resultado.');
    const key = currentIntent(owner)?.key;
    first.unmount();

    render(<UsersPage owner={owner} />);

    const panel = screen.getByRole('region', { name: 'Restablecer contraseña' });
    expect(within(panel).getByText('vera@example.test')).toBeInTheDocument();
    expect(screen.getByText('No se pudo confirmar el resultado.')).toBeInTheDocument();
    expect(currentIntent(owner)?.key).toBe(key);
  });

  it('shows nothing of an earlier attempt to a different session of the same person', async () => {
    serve(() => Promise.reject(timeout));
    const first = render(<UsersPage owner={owner} />);
    await openDirectory();
    startResetFromDirectory('Vera Ventas');
    typeAndConfirm();
    await screen.findByText('No se pudo confirmar el resultado.');
    first.unmount();

    render(<UsersPage owner={{ sub: owner.sub, sessionId: 'session-b' }} />);

    expect(screen.queryByRole('region', { name: 'Restablecer contraseña' })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(PASSWORD);
  });

  it('completes a reset end to end and leaves neither the password nor an intent behind', async () => {
    serve(() => Promise.resolve(answer));
    render(<UsersPage owner={owner} />);
    await openDirectory();
    startResetFromDirectory('Vera Ventas');

    typeAndConfirm();

    await screen.findByText('Contraseña restablecida.');
    const call = apiClient.request.mock.calls.find(([path]) => String(path).endsWith('/password-reset'))!;
    expect(call[0]).toBe(`/api/v1/auth/users/${vera.userId}/password-reset`);
    expect(call[1].body).toEqual({ newPassword: PASSWORD, confirmPassword: PASSWORD });
    expect(document.body.innerHTML).not.toContain(PASSWORD);
    expect(currentIntent(owner)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('region', { name: 'Restablecer contraseña' })).not.toBeInTheDocument();
  });
});
