// The password policy of the API (RegisterUserValidator.checkPassword, shared by registration and the administrative
// reset): at least 8 characters and at most 72 UTF-8 bytes (the bcrypt limit). It is not trimmed. The API stays
// authoritative; this only spares the person a round trip that is certain to be rejected.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;

const encoder = new TextEncoder();

export function newPasswordProblem(password: string): string | null {
  if (password.length === 0) return 'Escribe la nueva contraseña.';
  if (password.length < PASSWORD_MIN_LENGTH) return 'La contraseña debe tener al menos 8 caracteres.';
  if (encoder.encode(password).length > PASSWORD_MAX_BYTES) return 'La contraseña no puede superar los 72 bytes (UTF-8).';
  return null;
}
