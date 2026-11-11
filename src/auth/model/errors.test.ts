import { describe, expect, it } from 'vitest';
import { classifyFailure, fieldErrorsFrom, formErrorMessage } from './errors';

function failure(status: number, error: string, details?: { field: string; message: string }[]) {
  return { status, body: { error, message: 'english message', details, traceId: 't-1' } };
}

describe('classifyFailure', () => {
  it('treats 400/422 as a trusted field rejection', () => {
    expect(classifyFailure(failure(400, 'VALIDATION_ERROR'))).toBe('field');
    expect(classifyFailure(failure(422, 'BUSINESS_RULE_VIOLATION'))).toBe('field');
  });
  it('treats 401 and SIGN_IN_REQUIRED as a session problem', () => {
    expect(classifyFailure(failure(401, 'UNAUTHORIZED'))).toBe('session');
    expect(classifyFailure(failure(0, 'SIGN_IN_REQUIRED'))).toBe('session');
  });
  it('treats 403 as denied', () => {
    expect(classifyFailure(failure(403, 'FORBIDDEN'))).toBe('denied');
  });
  it('treats 404 as not found', () => {
    expect(classifyFailure(failure(404, 'NOT_FOUND'))).toBe('notFound');
  });
  it('treats timeout, network and 5xx as ambiguous, never as a definitive rejection', () => {
    expect(classifyFailure(failure(0, 'TIMEOUT'))).toBe('ambiguous');
    expect(classifyFailure(failure(0, 'NETWORK_ERROR'))).toBe('ambiguous');
    expect(classifyFailure(failure(500, 'INTERNAL_ERROR'))).toBe('ambiguous');
    expect(classifyFailure(failure(503, 'SERVICE_UNAVAILABLE'))).toBe('ambiguous');
  });
  it('treats an explicit cancellation as its own kind, never ambiguous', () => {
    expect(classifyFailure(failure(0, 'CANCELLED'))).toBe('cancelled');
  });
});

describe('fieldErrorsFrom', () => {
  it('maps a validation field to Spanish copy, never the English backend message', () => {
    const errors = fieldErrorsFrom(failure(400, 'VALIDATION_ERROR', [{ field: 'email', message: 'must be a valid email' }]));
    expect(errors.email).toBe('Escribe un correo electrónico válido.');
    expect(errors.email).not.toMatch(/must be/);
  });
  it('maps a duplicate-email business rejection to its own Spanish copy, distinct from a format error', () => {
    const errors = fieldErrorsFrom(failure(422, 'BUSINESS_RULE_VIOLATION', [{ field: 'email', message: 'already exists' }]));
    expect(errors.email).toBe('Ya existe un usuario registrado con este correo.');
  });
  it('falls back to a generic field message for an unmapped field', () => {
    const errors = fieldErrorsFrom(failure(400, 'VALIDATION_ERROR', [{ field: 'unknownField', message: 'nope' }]));
    expect(errors.unknownField).toBe('Revisa este campo.');
  });
  it('returns an empty map when the failure is not a field rejection', () => {
    expect(fieldErrorsFrom(failure(403, 'FORBIDDEN'))).toEqual({});
  });
});

describe('formErrorMessage', () => {
  it('gives a Spanish message per classification, never the raw backend text', () => {
    expect(formErrorMessage(failure(403, 'FORBIDDEN'))).toBe('No tienes permiso para realizar esta acción.');
    expect(formErrorMessage(failure(404, 'NOT_FOUND'))).toBe('No se encontró ningún usuario con ese ID.');
    expect(formErrorMessage(failure(0, 'TIMEOUT'))).toMatch(/mismos datos/);
    expect(formErrorMessage(failure(400, 'VALIDATION_ERROR'))).not.toMatch(/english message/);
  });
});

describe('password reset copy', () => {
  it('maps each field the reset can reject to its own Spanish text, never the English backend message', () => {
    const errors = fieldErrorsFrom(failure(400, 'VALIDATION_ERROR', [
      { field: 'newPassword', message: 'The field newPassword must have at least 8 characters' },
      { field: 'confirmPassword', message: 'The field confirmPassword must match newPassword' },
      { field: 'id', message: 'The path parameter id must be a valid identifier' },
    ]));

    expect(errors.newPassword).toBe('La contraseña debe tener al menos 8 caracteres y no superar los 72 bytes (UTF-8).');
    expect(errors.confirmPassword).toBe('Las contraseñas no coinciden.');
    expect(errors.id).toBe('El identificador del usuario no es válido.');
    for (const text of Object.values(errors)) expect(text).not.toMatch(/The field|path parameter/);
  });

  it('explains a 422 on the user as a user that can no longer be reset, not as a form field', () => {
    const errors = fieldErrorsFrom(failure(422, 'BUSINESS_RULE_VIOLATION', [{ field: 'id', message: 'The password of an inactive user cannot be reset' }]));

    expect(errors.id).toBe('Este usuario ya no admite el restablecimiento: es administrador o está inactivo.');
  });

  it('explains a 422 on the idempotency key as an attempt that cannot be resent, without saying it failed', () => {
    const errors = fieldErrorsFrom(failure(422, 'BUSINESS_RULE_VIOLATION', [{ field: 'Idempotency-Key', message: 'already used with a different request' }]));

    expect(errors['Idempotency-Key']).toBe('Este intento ya no se puede reenviar. Descártalo y, si hace falta, inicia un restablecimiento nuevo.');
    expect(errors['Idempotency-Key']).not.toMatch(/falló|no se aplicó/i);
  });

  it('keeps the existing registration copy unchanged for the registration fields', () => {
    expect(fieldErrorsFrom(failure(400, 'VALIDATION_ERROR', [{ field: 'password', message: 'x' }])).password)
      .toBe('La contraseña debe tener al menos 8 caracteres.');
  });
});
