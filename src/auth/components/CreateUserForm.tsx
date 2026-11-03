import { useEffect, useRef, useState, type FormEvent } from 'react';
import { registerUser } from '../api/usersApi';
import {
  classifyFailure,
  fieldErrorsFrom,
  formErrorMessage,
  isApiFailure,
  validationMessageFor,
  type ApiFailure,
} from '../model/errors';
import { ROLES, type CreateUserPayload, type Role, type UserProfile } from '../model/user';
import { clearIntent, currentIntent, markAmbiguous, tryBeginIntent, type Owner } from '../intent/registrationIntent';
import './CreateUserForm.css';

const ROLE_LABELS: Record<Role, string> = { ADMIN: 'Administrador', SALESPERSON: 'Vendedor', INVENTORY: 'Inventario' };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Fields {
  name: string;
  email: string;
  password: string;
  role: string;
}

const EMPTY_FIELDS: Fields = { name: '', email: '', password: '', role: '' };

function validate(fields: Fields): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = fields.name.trim();
  if (!name || name.length > 150) errors.name = validationMessageFor('name');
  const email = fields.email.trim();
  if (email.length < 3 || email.length > 255 || !EMAIL_PATTERN.test(email)) errors.email = validationMessageFor('email');
  if (fields.password.length < 8) errors.password = validationMessageFor('password');
  if (!ROLES.includes(fields.role as Role)) errors.role = validationMessageFor('role');
  return errors;
}

function asFailure(raw: unknown): ApiFailure {
  if (isApiFailure(raw)) return raw;
  return {
    status: 0,
    body: { error: 'NETWORK_ERROR', message: raw instanceof Error ? raw.message : 'network error', traceId: 'n/a' },
  };
}

// ADMIN creation + explicit same-key/body retry after an ambiguous outcome
// (AUTH16-01, AUTH16-03). `owner` scopes the retained intent to one
// (subject, sessionId) — the caller (UsersPage/App) only renders this once
// that owner is a confirmed ADMIN.
export function CreateUserForm({ owner }: { owner: Owner }) {
  const [fields, setFields] = useState<Fields>(EMPTY_FIELDS);
  const [phase, setPhase] = useState<'idle' | 'ambiguous' | 'success'>('idle');
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const flight = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const resumed = currentIntent(owner);
    if (resumed) {
      setFields({ name: resumed.body.name, email: resumed.body.email, password: resumed.body.password, role: resumed.body.role });
      setPhase('ambiguous');
      setFormError('No sabemos si la operación se completó. Puedes reintentarlo con los mismos datos.');
    }
    return () => {
      mounted.current = false;
      flight.current?.abort();
    };
    // Reads the owner's resumable intent once, on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(key: string, body: CreateUserPayload) {
    const controller = new AbortController();
    flight.current = controller;
    setPending(true);
    setProfile(null);
    try {
      const result = await registerUser(body, key, controller.signal);
      if (!mounted.current) return;
      clearIntent(key);
      setPhase('success');
      setProfile(result);
      setFieldErrors({});
      setFormError(null);
      setFields(EMPTY_FIELDS);
    } catch (raw) {
      if (!mounted.current) return;
      const failure = asFailure(raw);
      const kind = classifyFailure(failure);
      if (kind === 'cancelled') return;
      if (kind === 'field') {
        clearIntent(key);
        const errors = fieldErrorsFrom(failure);
        setFieldErrors(errors);
        setFormError(Object.keys(errors).length > 0 ? null : formErrorMessage(failure));
        setPhase('idle');
      } else if (kind === 'denied' || kind === 'session') {
        clearIntent(key);
        setFields((current) => ({ ...current, password: '' }));
        setFieldErrors({});
        setFormError(formErrorMessage(failure));
        setPhase('idle');
      } else {
        markAmbiguous(key);
        setFormError(formErrorMessage(failure));
        setPhase('ambiguous');
      }
    } finally {
      if (flight.current === controller) flight.current = null;
      if (mounted.current) setPending(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Synchronous guard: set before any await, so a second click dispatched
    // before the next render still sees this ref already occupied.
    if (flight.current) return;

    if (phase === 'ambiguous') {
      const resumed = currentIntent(owner);
      if (!resumed) {
        setPhase('idle');
        return;
      }
      await send(resumed.key, resumed.body);
      return;
    }

    const errors = validate(fields);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    const payload: CreateUserPayload = {
      name: fields.name.trim(),
      email: fields.email.trim(),
      password: fields.password,
      role: fields.role as Role,
    };
    const intent = tryBeginIntent(owner, payload);
    if (!intent) return;
    setFieldErrors({});
    setFormError(null);
    await send(intent.key, intent.body);
  }

  const disabled = pending || phase === 'ambiguous';
  const describedBy = (name: keyof Fields) => (fieldErrors[name] ? `create-user-${name}-error` : undefined);

  return (
    <section className="create-user" aria-labelledby="create-user-title">
      <h2 id="create-user-title">Crear usuario</h2>
      <form onSubmit={handleSubmit} aria-busy={pending}>
        <div className="field">
          <label htmlFor="create-user-name">Nombre completo</label>
          <input
            id="create-user-name"
            value={fields.name}
            disabled={disabled}
            onChange={(event) => setFields((current) => ({ ...current, name: event.target.value }))}
            aria-invalid={!!fieldErrors.name}
            aria-describedby={describedBy('name')}
          />
          {fieldErrors.name && (
            <p id="create-user-name-error" role="alert">
              {fieldErrors.name}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="create-user-email">Correo electrónico</label>
          <input
            id="create-user-email"
            type="email"
            autoComplete="off"
            value={fields.email}
            disabled={disabled}
            onChange={(event) => setFields((current) => ({ ...current, email: event.target.value }))}
            aria-invalid={!!fieldErrors.email}
            aria-describedby={describedBy('email')}
          />
          {fieldErrors.email && (
            <p id="create-user-email-error" role="alert">
              {fieldErrors.email}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="create-user-password">Contraseña</label>
          <input
            id="create-user-password"
            type="password"
            autoComplete="new-password"
            value={fields.password}
            disabled={disabled}
            onChange={(event) => setFields((current) => ({ ...current, password: event.target.value }))}
            aria-invalid={!!fieldErrors.password}
            aria-describedby={describedBy('password')}
          />
          {fieldErrors.password && (
            <p id="create-user-password-error" role="alert">
              {fieldErrors.password}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="create-user-role">Rol</label>
          <select
            id="create-user-role"
            value={fields.role}
            disabled={disabled}
            onChange={(event) => setFields((current) => ({ ...current, role: event.target.value }))}
            aria-invalid={!!fieldErrors.role}
            aria-describedby={describedBy('role')}
          >
            <option value="">Selecciona un rol</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          {fieldErrors.role && (
            <p id="create-user-role-error" role="alert">
              {fieldErrors.role}
            </p>
          )}
        </div>
        {formError && (
          <p role="alert" className="create-user__form-error">
            {formError}
          </p>
        )}
        <button type="submit" disabled={pending}>
          {pending ? 'Creando…' : phase === 'ambiguous' ? 'Reintentar' : 'Crear usuario'}
        </button>
      </form>
      {profile && (
        <div aria-live="polite">
        <p role="status">Usuario creado correctamente.</p>
        <dl className="create-user__profile" aria-label="Usuario creado">
          <div>
            <dt>ID</dt>
            <dd>{profile.userId}</dd>
          </div>
          <div>
            <dt>Nombre</dt>
            <dd>{profile.name}</dd>
          </div>
          <div>
            <dt>Correo</dt>
            <dd>{profile.email}</dd>
          </div>
          <div>
            <dt>Rol</dt>
            <dd>{ROLE_LABELS[profile.role]}</dd>
          </div>
          <div>
            <dt>Registrado</dt>
            <dd>{profile.registrationDate}</dd>
          </div>
          <div>
            <dt>Activo</dt>
            <dd>{profile.active ? 'Sí' : 'No'}</dd>
          </div>
        </dl>
        </div>
      )}
    </section>
  );
}
