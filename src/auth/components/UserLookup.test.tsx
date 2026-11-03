import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../../test-doubles/apiClient';
import { UserLookup } from './UserLookup';

const VALID_ID = '11111111-1111-1111-1111-111111111111';

function search(id: string) {
  fireEvent.change(screen.getByLabelText('ID de usuario'), { target: { value: id } });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
}

beforeEach(() => apiClient.request.mockReset());
afterEach(cleanup);

describe('known-ID lookup (AUTH16-04, minimum test 4)', () => {
  it('rejects an invalid UUID locally and never calls the API', () => {
    render(<UserLookup />);
    search('not-a-uuid');

    expect(apiClient.request).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/uuid|id de usuario válido/i);
  });

  it('shows the safe profile for a known id', async () => {
    apiClient.request.mockResolvedValue({
      userId: VALID_ID, name: 'Bob', email: 'bob@example.test', role: 'INVENTORY',
      registrationDate: '2026-11-01T00:00:00Z', active: true,
    });
    render(<UserLookup />);
    search(VALID_ID);

    expect(await screen.findByText('bob@example.test')).toBeInTheDocument();
    expect(apiClient.request).toHaveBeenCalledWith(`/api/v1/auth/users/${VALID_ID}`, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('shows a useful empty state for a 404, not a generic error', async () => {
    apiClient.request.mockRejectedValueOnce({ status: 404, body: { error: 'NOT_FOUND', message: 'not found', traceId: 't' } });
    render(<UserLookup />);
    await act(async () => { search(VALID_ID); });

    expect(screen.getByText('No se encontró ningún usuario con ese ID.')).toBeInTheDocument();
    expect(apiClient.request).toHaveBeenCalledTimes(1);
  });

  it('offers an explicit retry for an ambiguous/5xx error and keeps searching the same id', async () => {
    apiClient.request.mockRejectedValueOnce({ status: 500, body: { error: 'INTERNAL_ERROR', message: 'boom', traceId: 't' } });
    render(<UserLookup />);
    search(VALID_ID);

    expect(await screen.findByRole('button', { name: 'Reintentar búsqueda' })).toBeInTheDocument();

    apiClient.request.mockResolvedValueOnce({
      userId: VALID_ID, name: 'Bob', email: 'bob@example.test', role: 'INVENTORY',
      registrationDate: '2026-11-01T00:00:00Z', active: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar búsqueda' }));

    expect(await screen.findByText('bob@example.test')).toBeInTheDocument();
    expect(apiClient.request).toHaveBeenCalledTimes(2);
  });

  it('lets only the newest search win when an older one resolves later, out of order', async () => {
    let resolveFirst!: (value: unknown) => void;
    apiClient.request.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));
    render(<UserLookup />);
    search(VALID_ID);

    const secondId = '22222222-2222-2222-2222-222222222222';
    apiClient.request.mockResolvedValueOnce({
      userId: secondId, name: 'Second', email: 'second@example.test', role: 'ADMIN',
      registrationDate: '2026-11-01T00:00:00Z', active: true,
    });
    search(secondId);

    expect(await screen.findByText('second@example.test')).toBeInTheDocument();

    resolveFirst({
      userId: VALID_ID, name: 'First', email: 'first@example.test', role: 'INVENTORY',
      registrationDate: '2026-11-01T00:00:00Z', active: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(screen.getByText('second@example.test')).toBeInTheDocument();
    expect(screen.queryByText('first@example.test')).not.toBeInTheDocument();
  });

  it('clears the previously shown profile as soon as the id is edited', async () => {
    apiClient.request.mockResolvedValue({
      userId: VALID_ID, name: 'Bob', email: 'bob@example.test', role: 'INVENTORY',
      registrationDate: '2026-11-01T00:00:00Z', active: true,
    });
    render(<UserLookup />);
    search(VALID_ID);
    await waitFor(() => expect(screen.getByText('bob@example.test')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('ID de usuario'), { target: { value: VALID_ID.slice(0, -1) + '2' } });

    expect(screen.queryByText('bob@example.test')).not.toBeInTheDocument();
  });
});
