import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { getServiceTokenById } from '../api/serviceTokensApi';
import { classifyFailure, formErrorMessage, isApiFailure, type ApiFailure } from '../model/errors';
import { expiryStatus, type ServiceTokenMetadata } from '../model/serviceToken';
import './ServiceTokenLookup.css';

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const INVALID_ID_MESSAGE = 'Escribe un ID de token válido (UUID).';
const NOT_FOUND_MESSAGE = 'No se encontró ningún token con ese ID.';

function asFailure(raw: unknown): ApiFailure {
  if (isApiFailure(raw)) return raw;
  return {
    status: 0,
    body: { error: 'NETWORK_ERROR', message: raw instanceof Error ? raw.message : 'network error', traceId: 'n/a' },
  };
}

type Status = 'idle' | 'loading' | 'data' | 'empty' | 'error';

// Known-ID metadata lookup only (AUTH17-04), never a token — the server's
// GET never returns the secret either. A request id counter plus aborting
// the previous controller both guard against an older search overwriting a
// newer one, even if the abort itself is not observed (same pattern as
// UserLookup.tsx).
export function ServiceTokenLookup() {
  const [id, setId] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [metadata, setMetadata] = useState<ServiceTokenMetadata | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastSearched, setLastSearched] = useState('');
  const [retryable, setRetryable] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    requestId.current += 1;
    controller.current?.abort();
  }, []);

  function clearResult() {
    requestId.current += 1;
    controller.current?.abort();
    setStatus('idle');
    setMetadata(null);
    setMessage(null);
  }

  const runSearch = useCallback(async (targetId: string) => {
    controller.current?.abort();
    const myController = new AbortController();
    controller.current = myController;
    requestId.current += 1;
    const thisRequest = requestId.current;
    setStatus('loading');
    setMetadata(null);
    setMessage(null);
    try {
      const result = await getServiceTokenById(targetId, myController.signal);
      if (thisRequest !== requestId.current) return;
      setStatus('data');
      setMetadata(result);
    } catch (raw) {
      if (thisRequest !== requestId.current) return;
      const failure = asFailure(raw);
      const kind = classifyFailure(failure);
      if (kind === 'cancelled') return;
      setMessage(kind === 'notFound' ? NOT_FOUND_MESSAGE : formErrorMessage(failure));
      setRetryable(kind === 'ambiguous');
      setStatus(kind === 'notFound' ? 'empty' : 'error');
    }
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = id.trim();
    if (!UUID_PATTERN.test(trimmed)) {
      setValidationError(INVALID_ID_MESSAGE);
      clearResult();
      input.current?.focus();
      return;
    }
    setValidationError(null);
    setLastSearched(trimmed);
    void runSearch(trimmed);
  }

  return (
    <section className="service-token-lookup" aria-labelledby="service-token-lookup-title">
      <h2 id="service-token-lookup-title">Consultar token por ID</h2>
      <form noValidate onSubmit={handleSubmit}>
        <label htmlFor="service-token-lookup-id">ID del token</label>
        <input
          id="service-token-lookup-id"
          ref={input}
          value={id}
          onChange={(event) => {
            setId(event.target.value);
            setValidationError(null);
            clearResult();
          }}
          aria-invalid={!!validationError}
          aria-describedby={validationError ? 'service-token-lookup-id-error' : undefined}
        />
        {id && <button type="button" aria-label="Limpiar ID del token" onClick={() => {
          setId('');
          setValidationError(null);
          clearResult();
          input.current?.focus();
        }}>Limpiar</button>}
        {validationError && <p id="service-token-lookup-id-error" role="alert">{validationError}</p>}
        <button type="submit">Buscar</button>
      </form>
      {status === 'loading' && <p role="status">Buscando…</p>}
      {status === 'empty' && <p role="status">{message}</p>}
      {status === 'error' && (
        <div role="alert" className="service-token-lookup__error">
          <p>{message}</p>
          {retryable && (
            <button type="button" onClick={() => void runSearch(lastSearched)}>Reintentar búsqueda</button>
          )}
        </div>
      )}
      {status === 'data' && metadata && (
        <dl className="service-token-lookup__metadata" aria-label="Metadatos del token">
          <div><dt>ID</dt><dd>{metadata.tokenId}</dd></div>
          <div><dt>Servicio</dt><dd>{metadata.service}</dd></div>
          <div><dt>Permisos</dt><dd>{metadata.permissions.join(', ')}</dd></div>
          <div><dt>Emitido por</dt><dd>{metadata.issuedBy}</dd></div>
          <div><dt>Emitido (UTC)</dt><dd>{metadata.issuedAt}</dd></div>
          <div><dt>Expira (UTC)</dt><dd>{metadata.expiresAt}</dd></div>
          <div><dt>Estado</dt><dd>{expiryStatus(metadata.expiresAt) === 'vigente' ? 'Vigente' : 'Expirado'}</dd></div>
        </dl>
      )}
    </section>
  );
}
