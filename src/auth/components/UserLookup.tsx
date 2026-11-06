import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { getUserById } from '../api/usersApi';
import { classifyFailure, formErrorMessage, isApiFailure, type ApiFailure } from '../model/errors';
import type { Role, UserProfile } from '../model/user';
import './UserLookup.css';

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const INVALID_ID_MESSAGE = 'Escribe un ID de usuario válido (UUID).';
const ROLE_LABELS: Record<Role, string> = { ADMIN: 'Administrador', SALESPERSON: 'Vendedor', INVENTORY: 'Inventario' };

function asFailure(raw: unknown): ApiFailure {
  if (isApiFailure(raw)) return raw;
  return {
    status: 0,
    body: { error: 'NETWORK_ERROR', message: raw instanceof Error ? raw.message : 'network error', traceId: 'n/a' },
  };
}

type Status = 'idle' | 'loading' | 'data' | 'empty' | 'error';

// Known-ID lookup only (AUTH16-04) — never a browsable list. A request id
// counter plus aborting the previous controller both guard against an older
// search overwriting a newer one, even if the abort itself is not observed.
export function UserLookup({ selected }: { selected?: { id: string } } = {}) {
  const [id, setId] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastSearched, setLastSearched] = useState('');
  const [retryable, setRetryable] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => () => {
    requestId.current += 1;
    controller.current?.abort();
  }, []);

  function clearResult() {
    requestId.current += 1;
    controller.current?.abort();
    setStatus('idle');
    setProfile(null);
    setMessage(null);
  }

  const runSearch = useCallback(async (targetId: string) => {
    controller.current?.abort();
    const myController = new AbortController();
    controller.current = myController;
    requestId.current += 1;
    const thisRequest = requestId.current;
    setStatus('loading');
    setProfile(null);
    setMessage(null);
    try {
      const result = await getUserById(targetId, myController.signal);
      if (thisRequest !== requestId.current) return;
      setStatus('data');
      setProfile(result);
    } catch (raw) {
      if (thisRequest !== requestId.current) return;
      const failure = asFailure(raw);
      const kind = classifyFailure(failure);
      if (kind === 'cancelled') return;
      setMessage(formErrorMessage(failure));
      setRetryable(kind === 'ambiguous');
      setStatus(kind === 'notFound' ? 'empty' : 'error');
    }
  }, []);

  useEffect(() => {
    if (!selected) return;
    setId(selected.id);
    setValidationError(null);
    setLastSearched(selected.id);
    heading.current?.focus();
    void runSearch(selected.id);
  }, [runSearch, selected]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = id.trim();
    if (!UUID_PATTERN.test(trimmed)) {
      setValidationError(INVALID_ID_MESSAGE);
      clearResult();
      return;
    }
    setValidationError(null);
    setLastSearched(trimmed);
    void runSearch(trimmed);
  }

  return (
    <section className="user-lookup" aria-labelledby="user-lookup-title">
      <h2 id="user-lookup-title" ref={heading} tabIndex={-1}>Consultar usuario por ID</h2>
      <form onSubmit={handleSubmit}>
        <label htmlFor="user-lookup-id">ID de usuario</label>
        <input
          id="user-lookup-id"
          value={id}
          onChange={(event) => {
            setId(event.target.value);
            setValidationError(null);
            clearResult();
          }}
          aria-invalid={!!validationError}
          aria-describedby={validationError ? 'user-lookup-id-error' : undefined}
        />
        {validationError && (
          <p id="user-lookup-id-error" role="alert">
            {validationError}
          </p>
        )}
        <button type="submit">Buscar</button>
      </form>
      {status === 'loading' && <p role="status">Buscando…</p>}
      {status === 'empty' && <p role="status">{message}</p>}
      {status === 'error' && (
        <div role="alert" className="user-lookup__error">
          <p>{message}</p>
          {retryable && <button type="button" onClick={() => void runSearch(lastSearched)}>
            Reintentar búsqueda
          </button>}
        </div>
      )}
      {status === 'data' && profile && (
        <dl className="user-lookup__profile" aria-label="Perfil encontrado">
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
      )}
    </section>
  );
}
