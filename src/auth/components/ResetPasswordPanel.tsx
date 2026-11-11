import { useEffect, useRef, useState, type FormEvent } from 'react';
import { resetUserPassword } from '../api/usersApi';
import { classifyFailure, fieldErrorsFrom, formErrorMessage, isApiFailure, validationMessageFor, type ApiFailure } from '../model/errors';
import { newPasswordProblem } from '../model/passwordPolicy';
import type { PasswordResetResult, ResetTarget, Role } from '../model/user';
import {
  clearIntent,
  currentIntent,
  markAmbiguous,
  tryBeginIntent,
  type Owner,
  type PasswordResetIntent,
} from '../intent/passwordResetIntent';
import './ResetPasswordPanel.css';

const ROLE_LABELS: Record<Role, string> = { ADMIN: 'Administrador', SALESPERSON: 'Vendedor', INVENTORY: 'Inventario' };

type Phase = 'form' | 'confirm' | 'ambiguous' | 'success' | 'discarded' | 'ended';
interface Fields {
  newPassword: string;
  confirmPassword: string;
}

const EMPTY_FIELDS: Fields = { newPassword: '', confirmPassword: '' };
const UNCONFIRMED = 'No se pudo confirmar el resultado.';
const EXTERNAL_CHANNEL = 'Entrega la nueva contraseña a la persona por un canal externo a la aplicación.';

function asFailure(raw: unknown): ApiFailure {
  if (isApiFailure(raw)) return raw;
  // Anything that is not a failure the Host client classified (a lost connection, an answer that cannot be read) says
  // nothing about whether the server applied the change: it is treated as an outcome that cannot be confirmed.
  return {
    status: 0,
    body: { error: 'NETWORK_ERROR', message: raw instanceof Error ? raw.message : 'network error', traceId: 'n/a' },
  };
}

function validate(fields: Fields): Record<string, string> {
  const errors: Record<string, string> = {};
  const problem = newPasswordProblem(fields.newPassword);
  if (problem) errors.newPassword = problem;
  if (fields.confirmPassword !== fields.newPassword) errors.confirmPassword = validationMessageFor('confirmPassword');
  return errors;
}

function Recipient({ target }: { target: ResetTarget }) {
  return (
    <div role="group" aria-label="Usuario destinatario" className="reset-password__recipient">
      <dl>
        <div><dt>Nombre</dt><dd>{target.name}</dd></div>
        <div><dt>Correo</dt><dd>{target.email}</dd></div>
        <div><dt>Rol</dt><dd>{ROLE_LABELS[target.role]}</dd></div>
        <div><dt>ID</dt><dd>{target.userId}</dd></div>
      </dl>
    </div>
  );
}

// An ADMIN's reset of another person's password (ADR-021, Decision 6). The password lives only in this component's
// state and, once a request is made, in the RAM-only intent that allows a manual retry with the same key and the same
// request after an outcome that cannot be confirmed. Nothing is written to storage, the URL or the console, and the
// secret is cleared on cancel, on success, on a definite answer, on discard and on unmount.
// `onResolved` tells the page that no attempt is unresolved any more (answered, discarded or given up), so it can drop
// anything it showed because of one.
export function ResetPasswordPanel({ owner, target, onClose, onResolved }: {
  owner: Owner;
  target: ResetTarget;
  onClose: () => void;
  onResolved?: () => void;
}) {
  // An intent that survived an earlier unmount takes precedence over the target this panel was opened for: its
  // recipient is the one whose outcome is unresolved.
  const [resumed] = useState(() => currentIntent(owner));
  const [shownTarget] = useState<ResetTarget>(() => resumed?.target ?? target);
  const [phase, setPhase] = useState<Phase>(() => (resumed ? 'ambiguous' : 'form'));
  const [fields, setFields] = useState<Fields>(EMPTY_FIELDS);
  const [reveal, setReveal] = useState(false);
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<PasswordResetResult | null>(null);
  const flight = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const title = useRef<HTMLHeadingElement>(null);
  const step = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    mounted.current = true;
    if (resumed) markAmbiguous(resumed.key);
    return () => {
      mounted.current = false;
      flight.current?.abort();
    };
    // The resumed intent is read once, when the panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (phase === 'form' ? title : step).current?.focus();
  }, [phase]);

  function conclude(next: Phase, text: string | null) {
    onResolved?.();
    setFields(EMPTY_FIELDS);
    setReveal(false);
    setFieldErrors({});
    setMessage(text);
    setPhase(next);
  }

  async function send(intent: PasswordResetIntent) {
    const controller = new AbortController();
    flight.current = controller;
    setPending(true);
    setMessage(null);
    try {
      const answer = await resetUserPassword(intent.target.userId, intent.request, intent.key, controller.signal);
      // A readable answer is definitive whether or not the panel is still on screen.
      clearIntent(intent.key);
      if (!mounted.current) return;
      setResult(answer);
      conclude('success', null);
    } catch (raw) {
      const failure = asFailure(raw);
      const kind = classifyFailure(failure);
      if (kind === 'cancelled') return;
      if (kind === 'ambiguous') {
        markAmbiguous(intent.key);
        if (!mounted.current) return;
        setMessage(UNCONFIRMED);
        setPhase('ambiguous');
        return;
      }
      clearIntent(intent.key);
      if (!mounted.current) return;
      if (kind === 'field') {
        const errors = fieldErrorsFrom(failure);
        if (errors.newPassword || errors.confirmPassword) {
          // The server refused the password itself: the person can correct it and confirm again with a new key.
          onResolved?.();
          setFieldErrors(errors);
          setMessage(null);
          setFields({ newPassword: intent.request.newPassword, confirmPassword: intent.request.confirmPassword });
          setPhase('form');
          return;
        }
        conclude('ended', errors.id ?? errors['Idempotency-Key'] ?? formErrorMessage(failure));
        return;
      }
      conclude('ended', formErrorMessage(failure));
    } finally {
      if (flight.current === controller) flight.current = null;
      if (mounted.current) setPending(false);
    }
  }

  function handleForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validate(fields);
    setFieldErrors(errors);
    if (Object.keys(errors).length === 0) setPhase('confirm');
  }

  async function handleConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Synchronous guard: set before any await, so a second submit dispatched before the next render still finds it.
    if (flight.current) return;
    const intent = tryBeginIntent(owner, shownTarget, { newPassword: fields.newPassword, confirmPassword: fields.confirmPassword });
    if (!intent) return;
    await send(intent);
  }

  async function handleRetry() {
    if (flight.current) return;
    const intent = currentIntent(owner);
    if (!intent) {
      conclude('ended', 'La sesión cambió y este intento ya no se puede reenviar. No se pudo confirmar si el restablecimiento anterior se aplicó; si lo necesitas, inicia uno nuevo.');
      return;
    }
    await send(intent);
  }

  function handleDiscard() {
    if (flight.current) return;
    const intent = currentIntent(owner);
    if (intent) clearIntent(intent.key);
    conclude('discarded', null);
  }

  const describedBy = (name: keyof Fields) => (fieldErrors[name] ? `reset-password-${name}-error` : undefined);

  return (
    <section className="reset-password" aria-labelledby="reset-password-title">
      <h2 id="reset-password-title" ref={title} tabIndex={-1}>Restablecer contraseña</h2>

      {phase === 'form' && (
        <form onSubmit={handleForm} noValidate>
          <Recipient target={shownTarget} />
          <p>Escribe la nueva contraseña de este usuario. Tendrás que confirmarla en el siguiente paso.</p>
          <div className="field">
            <label htmlFor="reset-password-new">Nueva contraseña</label>
            <input
              id="reset-password-new"
              type={reveal ? 'text' : 'password'}
              autoComplete="new-password"
              value={fields.newPassword}
              onChange={(event) => setFields((current) => ({ ...current, newPassword: event.target.value }))}
              aria-invalid={!!fieldErrors.newPassword}
              aria-describedby={describedBy('newPassword')}
            />
            {fieldErrors.newPassword && <p id="reset-password-newPassword-error" role="alert">{fieldErrors.newPassword}</p>}
          </div>
          <div className="field">
            <label htmlFor="reset-password-confirm">Confirmar contraseña</label>
            <input
              id="reset-password-confirm"
              type={reveal ? 'text' : 'password'}
              autoComplete="new-password"
              value={fields.confirmPassword}
              onChange={(event) => setFields((current) => ({ ...current, confirmPassword: event.target.value }))}
              aria-invalid={!!fieldErrors.confirmPassword}
              aria-describedby={describedBy('confirmPassword')}
            />
            {fieldErrors.confirmPassword && <p id="reset-password-confirmPassword-error" role="alert">{fieldErrors.confirmPassword}</p>}
          </div>
          <button type="button" className="reset-password__secondary" aria-pressed={reveal} onClick={() => setReveal((value) => !value)}>
            {reveal ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
          </button>
          <div className="reset-password__actions">
            <button type="submit">Continuar</button>
            <button type="button" className="reset-password__secondary" onClick={onClose}>Cancelar</button>
          </div>
        </form>
      )}

      {phase === 'confirm' && (
        <form onSubmit={(event) => void handleConfirm(event)} aria-busy={pending}>
          <h3 ref={step} tabIndex={-1}>Confirmar restablecimiento</h3>
          <Recipient target={shownTarget} />
          <ul className="reset-password__effects">
            <li>Las sesiones renovables de este usuario se cierran: no podrá renovar su sesión.</li>
            <li>Los tokens de acceso ya emitidos pueden seguir siendo válidos hasta que expiren (cerca de una hora).</li>
            <li>{EXTERNAL_CHANNEL}</li>
          </ul>
          {message && <p role="alert" className="reset-password__error">{message}</p>}
          <div className="reset-password__actions">
            <button type="submit" disabled={pending}>{pending ? 'Restableciendo…' : 'Confirmar y restablecer'}</button>
            <button type="button" className="reset-password__secondary" disabled={pending} onClick={() => setPhase('form')}>Volver</button>
            <button type="button" className="reset-password__secondary" disabled={pending} onClick={onClose}>Cancelar</button>
          </div>
        </form>
      )}

      {phase === 'ambiguous' && (
        <div aria-busy={pending}>
          <h3 ref={step} tabIndex={-1}>Resultado sin confirmar</h3>
          <Recipient target={shownTarget} />
          {pending ? (
            <p role="status">Reenviando la misma solicitud…</p>
          ) : (
            <div role="alert" className="reset-password__error">
              <p>{UNCONFIRMED}</p>
              <p>Puede que el cambio se haya aplicado o no. Reenviar la misma solicitud es seguro: no lo repite si ya se aplicó.</p>
              <p>Si recargas la página o cierras sesión, el Portal ya no podrá confirmar ni reenviar este intento.</p>
            </div>
          )}
          <div className="reset-password__actions">
            <button type="button" disabled={pending} onClick={() => void handleRetry()}>Reintentar con la misma solicitud</button>
            <button type="button" className="reset-password__secondary" disabled={pending} onClick={handleDiscard}>Descartar intento</button>
          </div>
        </div>
      )}

      {phase === 'success' && (
        <div>
          <h3 ref={step} tabIndex={-1}>Restablecimiento completado</h3>
          <Recipient target={shownTarget} />
          <p role="status">Contraseña restablecida.</p>
          {result && <p>Restablecida el {result.passwordResetAt}.</p>}
          <p>{EXTERNAL_CHANNEL}</p>
          <p>Las sesiones renovables del usuario se cerraron; sus tokens de acceso ya emitidos pueden seguir siendo válidos hasta que expiren.</p>
          <div className="reset-password__actions">
            <button type="button" onClick={onClose}>Cerrar</button>
          </div>
        </div>
      )}

      {phase === 'discarded' && (
        <div>
          <h3 ref={step} tabIndex={-1}>Intento descartado</h3>
          <Recipient target={shownTarget} />
          <p role="status">
            Intento descartado. No se pudo confirmar si el restablecimiento anterior se aplicó. Si lo necesitas, inicia uno
            nuevo: requerirá una nueva confirmación.
          </p>
          <div className="reset-password__actions">
            <button type="button" onClick={onClose}>Cerrar</button>
          </div>
        </div>
      )}

      {phase === 'ended' && (
        <div>
          <h3 ref={step} tabIndex={-1}>Operación terminada</h3>
          <Recipient target={shownTarget} />
          {message && <p role="alert" className="reset-password__error">{message}</p>}
          <div className="reset-password__actions">
            <button type="button" onClick={onClose}>Cerrar</button>
          </div>
        </div>
      )}
    </section>
  );
}
