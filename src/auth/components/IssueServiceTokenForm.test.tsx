import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../../test-doubles/apiClient';
import { IssueServiceTokenForm } from './IssueServiceTokenForm';
import { resetServiceTokenIntentForTests } from '../intent/serviceTokenIntent';

const owner = { sub: 'admin-1', sessionId: 'session-a' };

const issued = {
  tokenId: 't-1', service: 'synkro-workflow' as const,
  permissions: ['customers:read', 'stock:reserve', 'stock:release', 'sales:register'],
  issuedBy: 'admin-1', issuedAt: '2026-11-07T00:00:00Z', expiresAt: '2026-12-07T00:00:00Z',
  token: 'eyJ.header.payload',
};
const replay = { ...issued, token: undefined };

function chooseWorkflow() {
  fireEvent.change(screen.getByLabelText('Servicio'), { target: { value: 'synkro-workflow' } });
}

function startEmission() {
  chooseWorkflow();
  fireEvent.click(screen.getByRole('button', { name: 'Emitir token' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar y emitir' }));
}

beforeEach(() => {
  apiClient.request.mockReset();
  resetServiceTokenIntentForTests();
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});
afterEach(cleanup);

describe('selecting a service requires an explicit confirmation before any request (AUTH17-01)', () => {
  it('shows an inline confirmation step and issues no request until it is accepted', () => {
    render(<IssueServiceTokenForm owner={owner} />);
    chooseWorkflow();
    fireEvent.click(screen.getByRole('button', { name: 'Emitir token' }));

    expect(screen.getByText(/se mostrará una sola vez/i)).toBeInTheDocument();
    expect(apiClient.request).not.toHaveBeenCalled();
  });

  it('cancelling the confirmation returns to selection without calling the API', () => {
    render(<IssueServiceTokenForm owner={owner} />);
    chooseWorkflow();
    fireEvent.click(screen.getByRole('button', { name: 'Emitir token' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByText(/se mostrará una sola vez/i)).not.toBeInTheDocument();
    expect(apiClient.request).not.toHaveBeenCalled();
  });
});

describe('first emission (AUTH17-01, minimum test 1)', () => {
  it('POSTs with a fresh idempotency key and the chosen service only, then shows the secret once, masked by default', async () => {
    apiClient.request.mockResolvedValue(issued);
    render(<IssueServiceTokenForm owner={owner} />);
    startEmission();

    await waitFor(() => expect(apiClient.request).toHaveBeenCalledTimes(1));
    const [path, options] = apiClient.request.mock.calls[0];
    expect(path).toBe('/api/v1/auth/service-tokens');
    expect(options.method).toBe('POST');
    expect(options.body).toEqual({ service: 'synkro-workflow' });
    expect(typeof options.idempotencyKey).toBe('string');
    expect(options.idempotencyKey.length).toBeGreaterThanOrEqual(8);

    expect(await screen.findByText('Token emitido. Cópialo ahora: no volverá a mostrarse.')).toBeInTheDocument();
    const secretInput = screen.getByLabelText('Token') as HTMLInputElement;
    expect(secretInput).toHaveAttribute('type', 'password');
    expect(secretInput).toHaveValue('eyJ.header.payload');
    expect(screen.getByText('t-1')).toBeInTheDocument();
    expect(screen.getByText('customers:read, stock:reserve, stock:release, sales:register')).toBeInTheDocument();
  });

  it('toggles the secret visible and back to masked', async () => {
    apiClient.request.mockResolvedValue(issued);
    render(<IssueServiceTokenForm owner={owner} />);
    startEmission();
    await screen.findByLabelText('Token');

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }));
    expect(screen.getByLabelText('Token')).toHaveAttribute('type', 'text');

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar' }));
    expect(screen.getByLabelText('Token')).toHaveAttribute('type', 'password');
  });

  it('copies the secret through the clipboard API without logging or storing it', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    apiClient.request.mockResolvedValue(issued);
    render(<IssueServiceTokenForm owner={owner} />);
    startEmission();
    await screen.findByLabelText('Token');

    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('eyJ.header.payload'));
    expect(screen.getByText('Token copiado.')).toBeInTheDocument();
    expect(setItem).not.toHaveBeenCalled();
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('eyJ.header.payload');
    expect(window.location.href).not.toContain('eyJ.header.payload');
    setItem.mockRestore();
    consoleError.mockRestore();
  });

  it('shows an explicit, sanitized error when the clipboard write is denied, without regenerating a credential', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    apiClient.request.mockResolvedValue(issued);
    render(<IssueServiceTokenForm owner={owner} />);
    startEmission();
    await screen.findByLabelText('Token');

    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo copiar/i);
    expect(apiClient.request).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Token')).toHaveValue('eyJ.header.payload');
  });
});

describe('replay of the same key and service (AUTH17-02, minimum test 2)', () => {
  it('shows metadata and an honest message with no secret field when the Host replays a 200', async () => {
    apiClient.request.mockResolvedValue(replay);
    render(<IssueServiceTokenForm owner={owner} />);
    startEmission();

    expect(await screen.findByText(/esta clave ya se usó antes/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Token')).not.toBeInTheDocument();
    expect(screen.getByText('t-1')).toBeInTheDocument();
  });
});

describe('double submission guard', () => {
  it('ignores a second confirm click dispatched right after the first, before the request settles', async () => {
    apiClient.request.mockReturnValue(new Promise(() => {}));
    render(<IssueServiceTokenForm owner={owner} />);
    chooseWorkflow();
    fireEvent.click(screen.getByRole('button', { name: 'Emitir token' }));
    const confirmButton = screen.getByRole('button', { name: 'Confirmar y emitir' });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    expect(await screen.findByText('Emitiendo…')).toBeInTheDocument();
    expect(apiClient.request).toHaveBeenCalledTimes(1);
  });
});

describe('ambiguous network/5xx outcome (AUTH17-03, minimum test 3)', () => {
  it('offers an explicit retry that reuses the same idempotency key and body, never a silent new mint', async () => {
    apiClient.request.mockRejectedValueOnce({ status: 0, body: { error: 'TIMEOUT', message: 'timed out', traceId: 't' } });
    render(<IssueServiceTokenForm owner={owner} />);
    startEmission();

    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    const firstKey = apiClient.request.mock.calls[0][1].idempotencyKey;

    apiClient.request.mockResolvedValueOnce(issued);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(apiClient.request).toHaveBeenCalledTimes(2));
    const [, secondOptions] = apiClient.request.mock.calls[1];
    expect(secondOptions.idempotencyKey).toBe(firstKey);
    expect(secondOptions.body).toEqual({ service: 'synkro-workflow' });
    expect(await screen.findByLabelText('Token')).toBeInTheDocument();
  });

  it('resumes the retained ambiguous intent, service locked, after an unmount/remount of the same session', async () => {
    apiClient.request.mockRejectedValueOnce({ status: 500, body: { error: 'INTERNAL_ERROR', message: 'boom', traceId: 't' } });
    const first = render(<IssueServiceTokenForm owner={owner} />);
    startEmission();
    await screen.findByRole('button', { name: 'Reintentar' });
    first.unmount();

    render(<IssueServiceTokenForm owner={owner} />);

    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.getByLabelText('Servicio')).toHaveValue('synkro-workflow');
  });
});

describe('422 conflict: same key, different service (minimum test for idempotency conflict)', () => {
  it('shows a token-specific conflict message and frees the form for a fresh emission with a new key', async () => {
    apiClient.request.mockRejectedValueOnce({
      status: 422, body: { error: 'BUSINESS_RULE_VIOLATION', message: 'conflict', traceId: 't' },
    });
    render(<IssueServiceTokenForm owner={owner} />);
    startEmission();

    expect(await screen.findByText(/ya se usó para emitir un token de otro servicio/i)).toBeInTheDocument();
    const firstKey = apiClient.request.mock.calls[0][1].idempotencyKey;

    apiClient.request.mockResolvedValueOnce(issued);
    startEmission();

    await waitFor(() => expect(apiClient.request).toHaveBeenCalledTimes(2));
    expect(apiClient.request.mock.calls[1][1].idempotencyKey).not.toBe(firstKey);
  });
});

describe('stale responses and session boundaries', () => {
  it.each([401, 403])('sanitizes a rejected issuance (%s), without retaining a secret or retry', async (status) => {
    apiClient.request.mockRejectedValueOnce({ status, body: { error: 'FORBIDDEN', message: 'untrusted credential content', traceId: 't' } });
    render(<IssueServiceTokenForm owner={owner} />);
    startEmission();
    await screen.findByRole('alert');
    expect(screen.queryByText('untrusted credential content')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Token')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Emitir token' })).toBeInTheDocument();
  });

  it('clears a receipt before an explicitly requested new issuance', async () => {
    apiClient.request.mockResolvedValueOnce(issued);
    render(<IssueServiceTokenForm owner={owner} />);
    startEmission();
    await screen.findByLabelText('Token');
    fireEvent.click(screen.getByRole('button', { name: 'Emitir otro' }));
    expect(screen.queryByLabelText('Token')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Servicio')).toHaveValue('');
    expect(apiClient.request).toHaveBeenCalledTimes(1);
  });
  it('discards a POST that resolves after unmount without throwing or leaking the secret anywhere', async () => {
    let resolveRequest: (value: unknown) => void = () => {};
    apiClient.request.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
    const view = render(<IssueServiceTokenForm owner={owner} />);
    chooseWorkflow();
    fireEvent.click(screen.getByRole('button', { name: 'Emitir token' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y emitir' }));
    view.unmount();

    await act(async () => {
      resolveRequest(issued);
      await Promise.resolve();
    });

    expect(screen.queryByLabelText('Token')).not.toBeInTheDocument();
  });
});
