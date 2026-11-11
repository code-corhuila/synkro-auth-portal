import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { apiClient } from '../../test-doubles/apiClient';
import { ServiceTokenLookup } from './ServiceTokenLookup';

const VALID_ID = '11111111-1111-1111-1111-111111111111';
const metadata = {
  tokenId: VALID_ID, service: 'synkro-worker', permissions: ['products:read', 'stock-alerts:read', 'stock-alerts:write'],
  issuedBy: 'admin-1', issuedAt: '2020-01-01T00:00:00Z', expiresAt: '2020-01-31T00:00:00Z',
};

function search(id: string) {
  fireEvent.change(screen.getByLabelText('ID del token'), { target: { value: id } });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
}

beforeEach(() => { apiClient.request.mockReset(); });
afterEach(cleanup);

describe('known-ID metadata lookup (AUTH17-04, minimum test 4)', () => {
  it('focuses an invalid ID and lets the user clear the search without another request', async () => {
    render(<ServiceTokenLookup />);
    search('invalid');
    expect(screen.getByLabelText('ID del token')).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar ID del token' }));
    expect(screen.getByLabelText('ID del token')).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(apiClient.request).not.toHaveBeenCalled();
  });
  it('rejects an invalid UUID locally and never calls the API', () => {
    render(<ServiceTokenLookup />);
    search('not-a-uuid');

    expect(apiClient.request).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/uuid|id del token válido/i);
  });

  it('shows the metadata and an expired status for an id past its expiresAt, without ever showing a token field', async () => {
    apiClient.request.mockResolvedValue(metadata);
    render(<ServiceTokenLookup />);
    search(VALID_ID);

    expect(await screen.findByText('Expirado')).toBeInTheDocument();
    expect(screen.getByText('products:read, stock-alerts:read, stock-alerts:write')).toBeInTheDocument();
    expect(screen.queryByLabelText('Token')).not.toBeInTheDocument();
    expect(apiClient.request).toHaveBeenCalledWith(`/api/v1/auth/service-tokens/${VALID_ID}`, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('shows a loading status while the request is in flight', async () => {
    apiClient.request.mockReturnValue(new Promise(() => {}));
    render(<ServiceTokenLookup />);
    search(VALID_ID);

    expect(await screen.findByText('Buscando…')).toBeInTheDocument();
  });

  it('shows a token-specific not-found message for a 404, not the user-lookup wording', async () => {
    apiClient.request.mockRejectedValueOnce({ status: 404, body: { error: 'NOT_FOUND', message: 'not found', traceId: 't' } });
    render(<ServiceTokenLookup />);
    await act(async () => { search(VALID_ID); });

    expect(screen.getByText('No se encontró ningún token con ese ID.')).toBeInTheDocument();
    expect(apiClient.request).toHaveBeenCalledTimes(1);
  });

  it('offers an explicit retry for an ambiguous/5xx error and keeps searching the same id', async () => {
    apiClient.request.mockRejectedValueOnce({ status: 500, body: { error: 'INTERNAL_ERROR', message: 'boom', traceId: 't' } });
    render(<ServiceTokenLookup />);
    search(VALID_ID);

    expect(await screen.findByRole('button', { name: 'Reintentar búsqueda' })).toBeInTheDocument();

    apiClient.request.mockResolvedValueOnce(metadata);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar búsqueda' }));

    expect(await screen.findByText('Expirado')).toBeInTheDocument();
    expect(apiClient.request).toHaveBeenCalledTimes(2);
  });

  it('403 for a non-ADMIN/SERVICE caller maps to a denied message, not a notFound one', async () => {
    apiClient.request.mockRejectedValueOnce({ status: 403, body: { error: 'FORBIDDEN', message: 'forbidden', traceId: 't' } });
    render(<ServiceTokenLookup />);
    await act(async () => { search(VALID_ID); });

    expect(screen.getByText('No tienes permiso para realizar esta acción.')).toBeInTheDocument();
  });

  it('discards a stale response from an earlier search that resolves after a newer one started', async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    apiClient.request.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));
    render(<ServiceTokenLookup />);
    search(VALID_ID);

    const secondId = '22222222-2222-2222-2222-222222222222';
    apiClient.request.mockResolvedValueOnce({ ...metadata, tokenId: secondId });
    search(secondId);
    await screen.findByText(secondId);

    await act(async () => { resolveFirst(metadata); });

    expect(screen.getByText(secondId)).toBeInTheDocument();
  });
});
