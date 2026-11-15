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

const person = (role: string, active: boolean, id: string, name: string) => ({
  userId: id, name, email: `${id}@example.test`, role, registrationDate: '2026-11-03T00:00:00Z', active,
});
const mixed = { data: [
  person('SALESPERSON', true, 'sales-1', 'Vera Ventas'),
  person('INVENTORY', true, 'inv-1', 'Ivan Inventario'),
  person('ADMIN', true, 'admin-1', 'Ada Admin'),
  person('SALESPERSON', false, 'gone-1', 'Gabi Inactiva'),
], meta: { page: 1, limit: 20, total: 4, totalPages: 1 } };

it('ofrece restablecer la contraseña solo de usuarios activos que no son administradores, y solo si se pasa la acción', async () => {
  apiClient.request.mockResolvedValue(mixed);
  render(<UserDirectory onSelect={() => {}} onResetPassword={() => {}} />);
  await screen.findByText('sales-1@example.test');

  expect(screen.getByRole('button', { name: 'Restablecer contraseña de Vera Ventas' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Restablecer contraseña de Ivan Inventario' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Restablecer contraseña de Ada Admin' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Restablecer contraseña de Gabi Inactiva' })).not.toBeInTheDocument();
});

it('no muestra ninguna acción de restablecimiento si el directorio no recibe la acción', async () => {
  apiClient.request.mockResolvedValue(mixed);
  render(<UserDirectory onSelect={() => {}} />);
  await screen.findByText('sales-1@example.test');

  expect(screen.queryByRole('button', { name: /restablecer contraseña/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: 'Contraseña' })).not.toBeInTheDocument();
});

it('entrega solo los datos que identifican al destinatario, sin pedir nada al servidor', async () => {
  apiClient.request.mockResolvedValue(mixed);
  const reset = vi.fn();
  render(<UserDirectory onSelect={() => {}} onResetPassword={reset} />);
  await screen.findByText('sales-1@example.test');
  apiClient.request.mockClear();

  fireEvent.click(screen.getByRole('button', { name: 'Restablecer contraseña de Vera Ventas' }));

  expect(reset).toHaveBeenCalledWith({ userId: 'sales-1', name: 'Vera Ventas', email: 'sales-1@example.test', role: 'SALESPERSON' });
  expect(apiClient.request).not.toHaveBeenCalled();
});
