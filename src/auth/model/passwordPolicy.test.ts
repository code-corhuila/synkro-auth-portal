import { describe, expect, it } from 'vitest';
import { newPasswordProblem, PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from './passwordPolicy';

describe('newPasswordProblem', () => {
  it('mirrors the API policy: at least 8 characters and at most 72 UTF-8 bytes', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(PASSWORD_MAX_BYTES).toBe(72);
  });

  it('accepts a password at the lower and upper edge', () => {
    expect(newPasswordProblem('a'.repeat(8))).toBeNull();
    expect(newPasswordProblem('a'.repeat(72))).toBeNull();
  });

  it('asks for a password when there is none', () => {
    expect(newPasswordProblem('')).toBe('Escribe la nueva contraseña.');
  });

  it('rejects fewer than 8 characters', () => {
    expect(newPasswordProblem('a'.repeat(7))).toBe('La contraseña debe tener al menos 8 caracteres.');
  });

  it('rejects more than 72 bytes, counting bytes and not characters', () => {
    expect(newPasswordProblem('a'.repeat(73))).toBe('La contraseña no puede superar los 72 bytes (UTF-8).');
    // 37 two-byte characters are 74 bytes although they are only 37 characters.
    expect(newPasswordProblem('é'.repeat(37))).toBe('La contraseña no puede superar los 72 bytes (UTF-8).');
    expect(newPasswordProblem('é'.repeat(36))).toBeNull();
  });

  it('does not trim: surrounding spaces are part of the password, exactly as the API treats them', () => {
    expect(newPasswordProblem('       a')).toBeNull();
    expect(newPasswordProblem('        ')).toBeNull();
  });
});
