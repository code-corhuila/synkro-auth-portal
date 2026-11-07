import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { apiClient } from '../../test-doubles/apiClient';
import { UserDirectory } from './UserDirectory';

const profile = { userId: 'fixture-id', name: 'Ana Pérez', email: 'ana@example.test', role: 'ADMIN',
  registrationDate: '2026-11-03T00:00:00Z', active: true };
const page = { data: [profile], meta: { page: 1, limit: 20, total: 21, totalPages: 2 } };

beforeEach(() => apiClient.request.mockReset());

it('busca por nombre en el cuerpo, pagina y abre la ficha existente', async () => {
  apiClient.request.mockResolvedValue(page);
  const open = vi.fn();
  render(<UserDirectory onSelect={open} />);
  await screen.findByText(profile.email);
  fireEvent.change(screen.getByLabelText('Nombre o correo'), { target: { value: 'Ana' } });
  await waitFor(() => expect(apiClient.request).toHaveBeenLastCalledWith('/api/v1/auth/users/search',
    expect.objectContaining({ method: 'POST', body: { q: 'Ana', page: 1, limit: 20 } })));
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  await waitFor(() => expect(apiClient.request).toHaveBeenLastCalledWith('/api/v1/auth/users/search',
    expect.objectContaining({ body: { q: 'Ana', page: 2, limit: 20 } })));
  fireEvent.click(await screen.findByRole('button', { name: 'Ver ficha de Ana Pérez' }));
  expect(open).toHaveBeenCalledWith(profile.userId);
});

it('puede reintentar si el listado falla sin mostrar datos anteriores', async () => {
  apiClient.request.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(page);
  render(<UserDirectory onSelect={() => {}} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo consultar');
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByText(profile.email)).toBeVisible();
});
