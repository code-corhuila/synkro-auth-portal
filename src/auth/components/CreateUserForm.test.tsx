import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../../test-doubles/apiClient';
import { CreateUserForm } from './CreateUserForm';
import { resetRegistrationIntentForTests } from '../intent/registrationIntent';

const owner = { sub: 'admin-1', sessionId: 'session-a' };

function fillValidForm() {
  fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'Alice Doe' } });
  fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'alice@example.test' } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secret123' } });
  fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'SALESPERSON' } });
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: /crear usuario|reintentar/i }));
}

beforeEach(() => {
  apiClient.request.mockReset();
  resetRegistrationIntentForTests();
});
afterEach(cleanup);

describe('creation (AUTH16-01, minimum test 1)', () => {
  it('registers through the Host API with a fresh idempotency key and a human-only role, then shows the safe profile', async () => {
    apiClient.request.mockResolvedValue({
      userId: 'u-1', name: 'Alice Doe', email: 'alice@example.test', role: 'SALESPERSON',
      registrationDate: '2026-11-01T00:00:00Z', active: true,
    });
    render(<CreateUserForm owner={owner} />);
    fillValidForm();
    submit();

    await waitFor(() => expect(apiClient.request).toHaveBeenCalledTimes(1));
    const [path, options] = apiClient.request.mock.calls[0];
    expect(path).toBe('/api/v1/auth/register');
    expect(options.method).toBe('POST');
    expect(options.body).toEqual({ name: 'Alice Doe', email: 'alice@example.test', password: 'secret123', role: 'SALESPERSON' });
    expect(typeof options.idempotencyKey).toBe('string');
    expect(options.idempotencyKey.length).toBeGreaterThanOrEqual(8);

    expect(await screen.findByText('alice@example.test')).toBeInTheDocument();
    expect(screen.getByText('u-1')).toBeInTheDocument();
    expect(screen.queryByText('secret123')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toHaveValue('');
  });

  it('blocks submission and shows an accessible error per empty required field, without calling the API', () => {
    render(<CreateUserForm owner={owner} />);
    submit();

    expect(apiClient.request).not.toHaveBeenCalled();
    const email = screen.getByLabelText('Correo electrónico');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription(/correo/i);
  });

  it('maps a 422 duplicate-email rejection to the email field and frees the form for a corrected new intention', async () => {
    apiClient.request.mockRejectedValueOnce({
      status: 422,
      body: { error: 'BUSINESS_RULE_VIOLATION', message: 'duplicate', details: [{ field: 'email', message: 'duplicate' }], traceId: 't-1' },
    });
    render(<CreateUserForm owner={owner} />);
    fillValidForm();
    submit();

    expect(await screen.findByText('Ya existe un usuario registrado con este correo.')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute('aria-invalid', 'true');

    apiClient.request.mockResolvedValueOnce({
      userId: 'u-2', name: 'Alice Doe', email: 'alice2@example.test', role: 'SALESPERSON',
      registrationDate: '2026-11-01T00:00:00Z', active: true,
    });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'alice2@example.test' } });
    submit();

    await waitFor(() => expect(apiClient.request).toHaveBeenCalledTimes(2));
    const firstKey = apiClient.request.mock.calls[0][1].idempotencyKey;
    const secondKey = apiClient.request.mock.calls[1][1].idempotencyKey;
    expect(secondKey).not.toBe(firstKey);
  });
});

describe('pending double submit and ambiguous retry (AUTH16-03, minimum test 2)', () => {
  it('sends exactly one POST for two rapid submits, guarded synchronously, and disables the button meanwhile', () => {
    apiClient.request.mockReturnValue(new Promise(() => {}));
    render(<CreateUserForm owner={owner} />);
    fillValidForm();
    const form = screen.getByRole('button', { name: 'Crear usuario' }).closest('form')!;

    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(apiClient.request).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('on an ambiguous timeout, offers an explicit retry with the exact same key and body, and blocks field edits meanwhile', async () => {
    let capturedKey = '';
    apiClient.request.mockImplementationOnce((_path: string, options: { idempotencyKey: string }) => {
      capturedKey = options.idempotencyKey;
      return Promise.reject({ status: 0, body: { error: 'TIMEOUT', message: 'timed out', traceId: 't-2' } });
    });
    render(<CreateUserForm owner={owner} />);
    fillValidForm();
    submit();

    expect(await screen.findByText(/no sabemos si la operación se completó/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre completo')).toBeDisabled();
    expect(screen.getByLabelText('Correo electrónico')).toHaveValue('alice@example.test');

    apiClient.request.mockResolvedValueOnce({
      userId: 'u-3', name: 'Alice Doe', email: 'alice@example.test', role: 'SALESPERSON',
      registrationDate: '2026-11-01T00:00:00Z', active: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(apiClient.request).toHaveBeenCalledTimes(2));
    expect(apiClient.request.mock.calls[1][1].idempotencyKey).toBe(capturedKey);
    expect(apiClient.request.mock.calls[1][1].body).toEqual({
      name: 'Alice Doe', email: 'alice@example.test', password: 'secret123', role: 'SALESPERSON',
    });
    expect(await screen.findByText('u-3')).toBeInTheDocument();
  });

  it('401 and 403 do not trigger an automatic second call', async () => {
    apiClient.request.mockRejectedValueOnce({ status: 403, body: { error: 'FORBIDDEN', message: 'nope', traceId: 't-3' } });
    render(<CreateUserForm owner={owner} />);
    fillValidForm();
    submit();

    expect(await screen.findByText('No tienes permiso para realizar esta acción.')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(apiClient.request).toHaveBeenCalledTimes(1);
  });
});
