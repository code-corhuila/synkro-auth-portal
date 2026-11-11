import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { apiClient } from '../../test-doubles/apiClient';
import { resetSessionDouble, setTestSession } from '../../test-doubles/session';
import { ResetPasswordPanel } from './ResetPasswordPanel';
import { currentIntent, resetPasswordResetIntentForTests } from '../intent/passwordResetIntent';

const owner = { sub: 'admin-1', sessionId: 'session-a' };
const target = { userId: '11111111-1111-1111-1111-111111111111', name: 'Alice Doe', email: 'alice@example.test', role: 'SALESPERSON' as const };
const PASSWORD = 'Brand-new-pass-91';
const answer = { userId: target.userId, passwordResetAt: '2026-11-10T20:00:00.123456Z' };

function failure(status: number, error: string, details?: { field: string; message: string }[]) {
  return { status, body: { error, message: 'english backend message', details, traceId: 't-1' } };
}

const timeout = () => ({ status: 0, body: { error: 'TIMEOUT', message: 'timed out', traceId: 'n/a' } });

function typePasswords(newPassword = PASSWORD, confirmPassword = newPassword) {
  fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: newPassword } });
  fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: confirmPassword } });
}

function goToConfirmation(newPassword = PASSWORD, confirmPassword = newPassword) {
  typePasswords(newPassword, confirmPassword);
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
}

function confirm() {
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar y restablecer' }));
}

function renderPanel(onClose = vi.fn()) {
  render(<ResetPasswordPanel owner={owner} target={target} onClose={onClose} />);
  return onClose;
}

beforeEach(() => {
  apiClient.request.mockReset();
  resetSessionDouble();
  setTestSession({ sub: owner.sub, role: 'ADMIN', sessionId: owner.sessionId });
  resetPasswordResetIntentForTests();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the form', () => {
  it('names the person before anything else: name, e-mail, role and id', () => {
    renderPanel();

    const region = screen.getByRole('region', { name: 'Restablecer contraseña' });
    const summary = within(region).getByRole('group', { name: 'Usuario destinatario' });
    expect(within(summary).getByText('Alice Doe')).toBeInTheDocument();
    expect(within(summary).getByText('alice@example.test')).toBeInTheDocument();
    expect(within(summary).getByText('Vendedor')).toBeInTheDocument();
    expect(within(summary).getByText(target.userId)).toBeInTheDocument();
    expect(apiClient.request).not.toHaveBeenCalled();
  });

  it('has two password fields, hidden by default and with autocomplete off so the browser does not offer to store them', () => {
    renderPanel();

    for (const label of ['Nueva contraseña', 'Confirmar contraseña']) {
      const field = screen.getByLabelText(label);
      expect(field).toHaveAttribute('type', 'password');
      expect(field).toHaveAttribute('autocomplete', 'new-password');
    }
  });

  it('can show and hide both passwords with one control that says its state', () => {
    renderPanel();
    typePasswords();
    const toggle = screen.getByRole('button', { name: 'Mostrar contraseñas' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(toggle);

    expect(screen.getByLabelText('Nueva contraseña')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Confirmar contraseña')).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ocultar contraseñas' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar contraseñas' }));

    expect(screen.getByLabelText('Nueva contraseña')).toHaveAttribute('type', 'password');
  });

  it('moves focus to the heading when it opens', () => {
    renderPanel();

    expect(screen.getByRole('heading', { name: 'Restablecer contraseña' })).toHaveFocus();
  });

  it.each([
    ['nothing is typed', '', '', 'Nueva contraseña', 'Escribe la nueva contraseña.'],
    ['it is shorter than 8 characters', 'short', 'short', 'Nueva contraseña', 'La contraseña debe tener al menos 8 caracteres.'],
    ['it is longer than 72 bytes', 'a'.repeat(73), 'a'.repeat(73), 'Nueva contraseña', 'La contraseña no puede superar los 72 bytes (UTF-8).'],
    ['the two differ', PASSWORD, PASSWORD + '!', 'Confirmar contraseña', 'Las contraseñas no coinciden.'],
  ])('stops before the confirmation, with an accessible error, when %s', (_case, first, second, label, message) => {
    renderPanel();

    goToConfirmation(first, second);

    expect(screen.queryByRole('button', { name: 'Confirmar y restablecer' })).not.toBeInTheDocument();
    const field = screen.getByLabelText(label);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(message);
    expect(apiClient.request).not.toHaveBeenCalled();
    expect(currentIntent(owner)).toBeNull();
  });

  it('closes without sending anything when the person cancels', () => {
    const onClose = renderPanel();
    typePasswords();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(apiClient.request).not.toHaveBeenCalled();
    expect(currentIntent(owner)).toBeNull();
  });
});

describe('the explicit confirmation', () => {
  it('repeats the target, states the effects and the limits, and has not sent anything yet', () => {
    renderPanel();

    goToConfirmation();

    const region = screen.getByRole('region', { name: 'Restablecer contraseña' });
    expect(within(region).getByRole('heading', { name: 'Confirmar restablecimiento' })).toHaveFocus();
    expect(within(region).getByText('Alice Doe')).toBeInTheDocument();
    expect(within(region).getByText('alice@example.test')).toBeInTheDocument();
    expect(within(region).getByText(target.userId)).toBeInTheDocument();
    expect(within(region).getByText(/sesiones renovables .* se cierran/i)).toBeInTheDocument();
    expect(within(region).getByText(/tokens de acceso ya emitidos .* hasta que expiren \(cerca de una hora\)/i)).toBeInTheDocument();
    expect(within(region).getByText(/canal externo a la aplicación/i)).toBeInTheDocument();
    expect(apiClient.request).not.toHaveBeenCalled();
  });

  it('does not print the password it is about to send', () => {
    renderPanel();

    goToConfirmation();

    expect(screen.queryByDisplayValue(PASSWORD)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(PASSWORD);
  });

  it('goes back to the form with what was typed, still without having sent anything', () => {
    renderPanel();
    goToConfirmation();

    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));

    expect(screen.getByLabelText('Nueva contraseña')).toHaveValue(PASSWORD);
    expect(apiClient.request).not.toHaveBeenCalled();
  });
});

describe('sending', () => {
  it('posts once, with a fresh key and the password only in the body, then reports success and forgets the secret', async () => {
    apiClient.request.mockResolvedValue(answer);
    const onClose = renderPanel();
    goToConfirmation();

    confirm();

    await screen.findByText('Contraseña restablecida.');
    expect(apiClient.request).toHaveBeenCalledTimes(1);
    const [path, options] = apiClient.request.mock.calls[0];
    expect(path).toBe(`/api/v1/auth/users/${target.userId}/password-reset`);
    expect(path).not.toContain(PASSWORD);
    expect(options.method).toBe('POST');
    expect(options.body).toEqual({ newPassword: PASSWORD, confirmPassword: PASSWORD });
    expect(options.idempotencyKey.length).toBeGreaterThanOrEqual(8);
    expect(screen.getByText(/2026-11-10T20:00:00\.123456Z/)).toBeInTheDocument();
    expect(screen.getByText(/canal externo a la aplicación/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Nueva contraseña')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(PASSWORD)).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(PASSWORD);
    expect(currentIntent(owner)).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('sends exactly one request for two rapid confirmations and disables every control while it waits', () => {
    apiClient.request.mockReturnValue(new Promise(() => {}));
    renderPanel();
    goToConfirmation();
    const form = screen.getByRole('button', { name: 'Confirmar y restablecer' }).closest('form')!;

    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(apiClient.request).toHaveBeenCalledTimes(1);
    expect(form).toHaveAttribute('aria-busy', 'true');
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
    expect(screen.getByText('Restableciendo…')).toBeInTheDocument();
  });

  it('keeps the intent only in memory: nothing reaches the storage, the URL or the console', async () => {
    apiClient.request.mockRejectedValue(timeout());
    const writes: string[] = [];
    const recorder = { length: 0, key: () => null, getItem: () => null, removeItem: () => {}, clear: () => {}, setItem: (name: string) => { writes.push(name); } };
    vi.stubGlobal('localStorage', recorder);
    vi.stubGlobal('sessionStorage', recorder);
    const consoleCalls = [vi.spyOn(console, 'log'), vi.spyOn(console, 'info'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'debug')];
    const before = window.location.href;
    renderPanel();
    goToConfirmation();

    confirm();
    await screen.findByText('No se pudo confirmar el resultado.');

    expect(writes).toEqual([]);
    expect(window.location.href).toBe(before);
    for (const spy of consoleCalls) expect(spy).not.toHaveBeenCalled();
  });
});

describe('an outcome that cannot be confirmed', () => {
  it.each([
    ['a timeout', () => Promise.reject(timeout())],
    ['a network error', () => Promise.reject({ status: 0, body: { error: 'NETWORK_ERROR', message: 'offline', traceId: 'n/a' } })],
    ['a 500', () => Promise.reject(failure(500, 'INTERNAL_ERROR'))],
    ['an unreadable answer', () => Promise.resolve({ unexpected: true })],
  ])('says it cannot confirm the result after %s, without claiming that it failed or that nothing changed', async (_case, outcome) => {
    apiClient.request.mockImplementationOnce(outcome);
    renderPanel();
    goToConfirmation();

    confirm();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudo confirmar el resultado.');
    expect(alert.textContent).not.toMatch(/falló|fallido|no se (aplicó|cambió)|sin cambios|intenta iniciar sesión/i);
    expect(screen.getByRole('button', { name: 'Reintentar con la misma solicitud' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Descartar intento' })).toBeEnabled();
    expect(screen.queryByLabelText('Nueva contraseña')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(PASSWORD)).not.toBeInTheDocument();
    expect(currentIntent(owner)?.status).toBe('ambiguous');
    expect(apiClient.request).toHaveBeenCalledTimes(1);
  });

  it('never resends on its own, and retries only on request with the same key and the same body', async () => {
    apiClient.request.mockRejectedValueOnce(timeout()).mockResolvedValueOnce(answer);
    renderPanel();
    goToConfirmation();
    confirm();
    await screen.findByText('No se pudo confirmar el resultado.');
    const firstKey = apiClient.request.mock.calls[0][1].idempotencyKey;
    expect(apiClient.request).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar con la misma solicitud' }));

    await screen.findByText('Contraseña restablecida.');
    expect(apiClient.request).toHaveBeenCalledTimes(2);
    const [path, options] = apiClient.request.mock.calls[1];
    expect(path).toBe(apiClient.request.mock.calls[0][0]);
    expect(options.idempotencyKey).toBe(firstKey);
    expect(options.body).toEqual({ newPassword: PASSWORD, confirmPassword: PASSWORD });
    expect(currentIntent(owner)).toBeNull();
  });

  it('can stay uncertain through several retries without ever creating a second key', async () => {
    apiClient.request.mockRejectedValue(timeout());
    renderPanel();
    goToConfirmation();
    confirm();
    await screen.findByText('No se pudo confirmar el resultado.');

    for (let retry = 0; retry < 3; retry += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar con la misma solicitud' }));
      await waitFor(() => expect(apiClient.request).toHaveBeenCalledTimes(retry + 2));
      await screen.findByText('No se pudo confirmar el resultado.');
    }

    expect(new Set(apiClient.request.mock.calls.map((call) => call[1].idempotencyKey)).size).toBe(1);
  });

  it('shows the same disabled, single-flight state while the retry is in the air', async () => {
    apiClient.request.mockRejectedValueOnce(timeout()).mockReturnValueOnce(new Promise(() => {}));
    renderPanel();
    goToConfirmation();
    confirm();
    await screen.findByText('No se pudo confirmar el resultado.');
    const retry = screen.getByRole('button', { name: 'Reintentar con la misma solicitud' });

    fireEvent.click(retry);
    fireEvent.click(retry);

    expect(apiClient.request).toHaveBeenCalledTimes(2);
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
  });

  it('on discard clears the secret, says the earlier attempt cannot be confirmed, and sends nothing', async () => {
    apiClient.request.mockRejectedValueOnce(timeout());
    const onClose = renderPanel();
    goToConfirmation();
    confirm();
    await screen.findByText('No se pudo confirmar el resultado.');

    fireEvent.click(screen.getByRole('button', { name: 'Descartar intento' }));

    expect(currentIntent(owner)).toBeNull();
    expect(screen.getByText(/no se pudo confirmar si el restablecimiento anterior se aplicó/i)).toBeInTheDocument();
    expect(screen.getByText(/nueva confirmación/i)).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(PASSWORD);
    expect(apiClient.request).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('cannot resend after the Host session changed: it says so and offers no retry', async () => {
    apiClient.request.mockRejectedValueOnce(timeout());
    renderPanel();
    goToConfirmation();
    confirm();
    await screen.findByText('No se pudo confirmar el resultado.');

    act(() => setTestSession({ sub: owner.sub, role: 'ADMIN', sessionId: 'session-b' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar con la misma solicitud' }));

    expect(apiClient.request).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/ya no se puede reenviar/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar con la misma solicitud' })).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(PASSWORD);
  });
});

describe('a definite answer', () => {
  it.each([
    ['a 401', failure(401, 'UNAUTHORIZED'), 'Tu sesión ya no es válida. Inicia sesión de nuevo.'],
    ['a 403', failure(403, 'FORBIDDEN'), 'No tienes permiso para realizar esta acción.'],
  ])('ends the attempt and clears the secret after %s, without resending', async (_case, rejection, message) => {
    apiClient.request.mockRejectedValue(rejection);
    renderPanel();
    goToConfirmation();

    confirm();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(currentIntent(owner)).toBeNull();
    expect(apiClient.request).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('No se pudo confirmar el resultado.')).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(PASSWORD);
    expect(screen.queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument();
  });

  it('says the user no longer exists after a 404 and clears the secret', async () => {
    apiClient.request.mockRejectedValue(failure(404, 'NOT_FOUND'));
    renderPanel();
    goToConfirmation();

    confirm();

    expect(await screen.findByText('No se encontró ningún usuario con ese ID.')).toBeInTheDocument();
    expect(currentIntent(owner)).toBeNull();
    expect(document.body.innerHTML).not.toContain(PASSWORD);
  });

  it('explains a 422 on the user (administrator or inactive) and ends the attempt', async () => {
    apiClient.request.mockRejectedValue(failure(422, 'BUSINESS_RULE_VIOLATION', [{ field: 'id', message: 'The password of an inactive user cannot be reset' }]));
    renderPanel();
    goToConfirmation();

    confirm();

    expect(await screen.findByText('Este usuario ya no admite el restablecimiento: es administrador o está inactivo.')).toBeInTheDocument();
    expect(currentIntent(owner)).toBeNull();
    expect(document.body.innerHTML).not.toContain(PASSWORD);
  });

  it('goes back to the form on a 400 about the password, keeping what was typed so it can be corrected, and then uses a new key', async () => {
    apiClient.request.mockRejectedValueOnce(failure(400, 'VALIDATION_ERROR', [{ field: 'newPassword', message: 'must have at most 72 bytes' }]))
      .mockResolvedValueOnce(answer);
    renderPanel();
    goToConfirmation();
    confirm();

    const field = await screen.findByLabelText('Nueva contraseña');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription('La contraseña debe tener al menos 8 caracteres y no superar los 72 bytes (UTF-8).');
    expect(currentIntent(owner)).toBeNull();

    typePasswords('Corrected-pass-77');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    confirm();

    await screen.findByText('Contraseña restablecida.');
    expect(apiClient.request.mock.calls[1][1].idempotencyKey).not.toBe(apiClient.request.mock.calls[0][1].idempotencyKey);
    expect(apiClient.request.mock.calls[1][1].body.newPassword).toBe('Corrected-pass-77');
  });

  it('on a 422 about the key during a retry (a different request, or a receipt that expired), says the attempt cannot be resent, ends it and clears the secret', async () => {
    apiClient.request.mockRejectedValueOnce(timeout())
      .mockRejectedValueOnce(failure(422, 'BUSINESS_RULE_VIOLATION', [{ field: 'Idempotency-Key', message: 'used with a different request' }]));
    renderPanel();
    goToConfirmation();
    confirm();
    await screen.findByText('No se pudo confirmar el resultado.');

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar con la misma solicitud' }));

    expect(await screen.findByText('No se pudo reenviar este intento: ya no se reconoce como la solicitud original (pasó el tiempo de reenvío o la clave se usó con otra solicitud). Esta vez no se repitió ningún cambio, pero el restablecimiento original puede haberse aplicado.')).toBeInTheDocument();
    expect(currentIntent(owner)).toBeNull();
    expect(apiClient.request).toHaveBeenCalledTimes(2);
    expect(document.body.innerHTML).not.toContain(PASSWORD);
    expect(screen.queryByRole('button', { name: 'Reintentar con la misma solicitud' })).not.toBeInTheDocument();
  });

  // ADR-021 Decision 2: after the receipt expires the same request is a 422 on the key. The server executed nothing, and
  // it does not say the first reset did not happen, so neither may the Portal.
  describe('a 422 about the key because the receipt expired', () => {
    async function reachTheKeyConflict() {
      apiClient.request.mockRejectedValueOnce(timeout())
        .mockRejectedValueOnce(failure(422, 'BUSINESS_RULE_VIOLATION', [{ field: 'Idempotency-Key', message: 'used with a different request' }]));
      renderPanel();
      goToConfirmation();
      confirm();
      await screen.findByText('No se pudo confirmar el resultado.');
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar con la misma solicitud' }));
      await screen.findByText(/ya no se reconoce como la solicitud original/);
    }

    it('does not generate another key by itself and sends nothing more', async () => {
      await reachTheKeyConflict();

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });

      expect(apiClient.request).toHaveBeenCalledTimes(2);
      expect(currentIntent(owner)).toBeNull();
    });

    it('does not claim that the earlier reset never happened, and says nothing was repeated', async () => {
      await reachTheKeyConflict();

      const text = screen.getByRole('region', { name: 'Restablecer contraseña' }).textContent ?? '';
      expect(text).toContain('puede haberse aplicado');
      expect(text).toContain('no se repitió ningún cambio');
      expect(text).not.toMatch(/no se aplicó|nunca se aplicó|no se realizó|no ocurrió|fall[oó]/i);
    });

    it('lets the person abandon the attempt and start another operation only by typing, continuing and confirming again, with a new key', async () => {
      await reachTheKeyConflict();
      const firstKey = apiClient.request.mock.calls[0][1].idempotencyKey;

      fireEvent.click(screen.getByRole('button', { name: 'Iniciar un restablecimiento nuevo' }));

      expect(screen.getByLabelText('Nueva contraseña')).toHaveValue('');
      expect(screen.getByLabelText('Confirmar contraseña')).toHaveValue('');
      expect(apiClient.request).toHaveBeenCalledTimes(2);
      apiClient.request.mockResolvedValueOnce(answer);
      typePasswords('Another-new-pass-55');
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
      expect(apiClient.request).toHaveBeenCalledTimes(2);
      confirm();

      await screen.findByText('Contraseña restablecida.');
      expect(apiClient.request).toHaveBeenCalledTimes(3);
      expect(apiClient.request.mock.calls[2][1].idempotencyKey).not.toBe(firstKey);
      expect(apiClient.request.mock.calls[2][1].body.newPassword).toBe('Another-new-pass-55');
    });

    it('keeps the attempt closed for any other ending: no new-operation shortcut after a 422 about the user', async () => {
      apiClient.request.mockRejectedValue(failure(422, 'BUSINESS_RULE_VIOLATION', [{ field: 'id', message: 'inactive' }]));
      renderPanel();
      goToConfirmation();
      confirm();
      await screen.findByText('Este usuario ya no admite el restablecimiento: es administrador o está inactivo.');

      expect(screen.queryByRole('button', { name: 'Iniciar un restablecimiento nuevo' })).not.toBeInTheDocument();
    });
  });
});

describe('leaving while an attempt is unresolved', () => {
  it('returns focus to the result after a second inconclusive retry', async () => {
    apiClient.request.mockRejectedValue(timeout());
    renderPanel();
    goToConfirmation();
    confirm();
    await screen.findByRole('heading', { name: 'Resultado sin confirmar' });
    const retry = screen.getByRole('button', { name: 'Reintentar con la misma solicitud' });
    retry.focus();
    fireEvent.click(retry);
    await waitFor(() => expect(apiClient.request).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Resultado sin confirmar' })).toHaveFocus());
  });

  it('returns focus to the connected opener when the panel unmounts', () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open password reset';
    document.body.append(opener);
    try {
      opener.focus();
      const view = render(<ResetPasswordPanel owner={owner} target={target} onClose={vi.fn()} />);
      expect(screen.getByRole('heading', { name: 'Restablecer contraseña' })).toHaveFocus();
      view.unmount();
      expect(opener).toHaveFocus();
    } finally {
      opener.remove();
    }
  });

  it('aborts the request in the air on unmount and, on the next mount, resumes as uncertain with the same key', async () => {
    let signal: AbortSignal | undefined;
    apiClient.request.mockImplementationOnce((_path: string, options: { signal: AbortSignal }) => {
      signal = options.signal;
      return new Promise(() => {});
    });
    const first = render(<ResetPasswordPanel owner={owner} target={target} onClose={vi.fn()} />);
    goToConfirmation();
    confirm();
    const key = apiClient.request.mock.calls[0][1].idempotencyKey;

    first.unmount();

    expect(signal?.aborted).toBe(true);
    expect(currentIntent(owner)?.key).toBe(key);

    apiClient.request.mockResolvedValueOnce(answer);
    render(<ResetPasswordPanel owner={owner} target={target} onClose={vi.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo confirmar el resultado.');
    expect(screen.queryByDisplayValue(PASSWORD)).not.toBeInTheDocument();
    expect(apiClient.request).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar con la misma solicitud' }));

    await screen.findByText('Contraseña restablecida.');
    expect(apiClient.request.mock.calls[1][1].idempotencyKey).toBe(key);
    expect(apiClient.request.mock.calls[1][1].body.newPassword).toBe(PASSWORD);
  });

  it('shows the recipient of the unresolved attempt, not the one it was opened for', () => {
    apiClient.request.mockReturnValue(new Promise(() => {}));
    const first = render(<ResetPasswordPanel owner={owner} target={target} onClose={vi.fn()} />);
    goToConfirmation();
    confirm();
    first.unmount();
    const other = { ...target, userId: '22222222-2222-2222-2222-222222222222', name: 'Bob Roe', email: 'bob@example.test' };

    render(<ResetPasswordPanel owner={owner} target={other} onClose={vi.fn()} />);

    const summary = screen.getByRole('group', { name: 'Usuario destinatario' });
    expect(within(summary).getByText('Alice Doe')).toBeInTheDocument();
    expect(within(summary).queryByText('Bob Roe')).not.toBeInTheDocument();
  });

  it('does not touch the screen when an answer arrives after it was closed', async () => {
    let resolve: (value: unknown) => void = () => {};
    apiClient.request.mockReturnValue(new Promise((done) => { resolve = done; }));
    const error = vi.spyOn(console, 'error');
    const view = render(<ResetPasswordPanel owner={owner} target={target} onClose={vi.fn()} />);
    goToConfirmation();
    confirm();
    view.unmount();

    await act(async () => resolve(answer));

    expect(error).not.toHaveBeenCalled();
  });
});
