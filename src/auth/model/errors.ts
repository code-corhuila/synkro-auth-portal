// Classifies and translates rejections from `shell/apiClient.request`. The
// Host's ApiClientError class is not an exposed federation module, so this
// never imports it — it duck-types the shape it throws (status, body, retryAt).
export interface ApiFailure {
  status: number;
  body: {
    error: string;
    message: string;
    details?: { field: string; message: string }[];
    traceId: string;
  };
  retryAt?: number;
}

export function isApiFailure(value: unknown): value is ApiFailure {
  const candidate = value as Partial<ApiFailure> | null | undefined;
  return (
    typeof candidate?.status === 'number' &&
    typeof candidate.body?.error === 'string' &&
    typeof candidate.body?.message === 'string'
  );
}

// 'field'/'denied'/'notFound' are trusted, definitive outcomes the backend
// decided. 'session' is handled by the Host clearing the session already.
// 'ambiguous' covers transport/5xx uncertainty (design-system.md error
// handling + the task's "network/timeout/5xx uncertainty" rule): the caller
// does not know whether the write committed, so only an explicit same-key
// retry is offered. 'cancelled' is never shown to the person.
export type FailureKind = 'field' | 'denied' | 'session' | 'notFound' | 'ambiguous' | 'cancelled';

export function classifyFailure(failure: ApiFailure): FailureKind {
  if (failure.body.error === 'CANCELLED') return 'cancelled';
  if (failure.status === 401 || failure.body.error === 'SIGN_IN_REQUIRED') return 'session';
  if (failure.status === 403) return 'denied';
  if (failure.status === 404) return 'notFound';
  if (failure.status === 400 || failure.status === 422) return 'field';
  return 'ambiguous';
}

const FIELD_MESSAGES: Record<string, Record<string, string>> = {
  VALIDATION_ERROR: {
    name: 'Escribe un nombre (máximo 150 caracteres).',
    email: 'Escribe un correo electrónico válido.',
    password: 'La contraseña debe tener al menos 8 caracteres.',
    role: 'Selecciona un rol válido.',
    // The administrative password reset (ADR-021): same policy as the registration password, other field names.
    newPassword: 'La contraseña debe tener al menos 8 caracteres y no superar los 72 bytes (UTF-8).',
    confirmPassword: 'Las contraseñas no coinciden.',
    id: 'El identificador del usuario no es válido.',
  },
  BUSINESS_RULE_VIOLATION: {
    email: 'Ya existe un usuario registrado con este correo.',
    id: 'Este usuario ya no admite el restablecimiento: es administrador o está inactivo.',
    // A key already answered for another request. It does not say the earlier attempt failed: it was recorded.
    'Idempotency-Key': 'Este intento ya no se puede reenviar. Descártalo y, si hace falta, inicia un restablecimiento nuevo.',
  },
};

const GENERIC_FIELD_MESSAGE = 'Revisa este campo.';

export function fieldErrorsFrom(failure: ApiFailure): Record<string, string> {
  if (classifyFailure(failure) !== 'field' || !failure.body.details) return {};
  const byCode = FIELD_MESSAGES[failure.body.error] ?? {};
  const result: Record<string, string> = {};
  for (const detail of failure.body.details) {
    result[detail.field] = byCode[detail.field] ?? GENERIC_FIELD_MESSAGE;
  }
  return result;
}

const FORM_MESSAGES: Record<FailureKind, string> = {
  field: 'Revisa los datos ingresados.',
  denied: 'No tienes permiso para realizar esta acción.',
  session: 'Tu sesión ya no es válida. Inicia sesión de nuevo.',
  notFound: 'No se encontró ningún usuario con ese ID.',
  ambiguous: 'No sabemos si la operación se completó. Puedes reintentarlo con los mismos datos.',
  cancelled: '',
};

export function formErrorMessage(failure: ApiFailure): string {
  return FORM_MESSAGES[classifyFailure(failure)];
}

// Same Spanish copy the server-mapped VALIDATION_ERROR uses, reused for the
// client-side required/shape check so a person never sees two different
// wordings for the same rule.
export function validationMessageFor(field: string): string {
  return FIELD_MESSAGES.VALIDATION_ERROR[field] ?? GENERIC_FIELD_MESSAGE;
}
