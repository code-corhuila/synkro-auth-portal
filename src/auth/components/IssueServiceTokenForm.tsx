import { useEffect, useRef, useState, type FormEvent } from 'react';
import { issueServiceToken } from '../api/serviceTokensApi';
import { classifyFailure, formErrorMessage, isApiFailure, type ApiFailure } from '../model/errors';
import { SERVICES, type IssuedServiceToken, type Service } from '../model/serviceToken';
import {
  clearServiceTokenIntent,
  currentServiceTokenIntent,
  markServiceTokenAmbiguous,
  tryBeginServiceTokenIntent,
} from '../intent/serviceTokenIntent';
import type { Owner } from '../intent/registrationIntent';
import './IssueServiceTokenForm.css';

const SERVICE_LABELS: Record<Service, string> = {
  'synkro-workflow': 'synkro-workflow',
  'synkro-worker': 'synkro-worker',
};

// Server-mapped error codes get a token-specific override here instead of
// the generic formErrorMessage, and never the raw body.message (which may
// echo untrusted input back).
const FORM_ERROR_OVERRIDES: Record<string, string> = {
  BUSINESS_RULE_VIOLATION: 'Esta clave de idempotencia ya se usó para emitir un token de otro servicio. Emite uno nuevo con una clave distinta.',
};

function asFailure(raw: unknown): ApiFailure {
  if (isApiFailure(raw)) return raw;
  return {
    status: 0,
    body: { error: 'NETWORK_ERROR', message: raw instanceof Error ? raw.message : 'network error', traceId: 'n/a' },
  };
}

type Phase = 'select' | 'confirm' | 'pending' | 'ambiguous' | 'issued' | 'replayed';

// ADMIN emission of a service token (AUTH17-01/02) + explicit same-key
// retry after an ambiguous outcome (AUTH17-03), mirroring CreateUserForm's
// policy. `owner` scopes the retained intent to one (subject, sessionId).
// The issued secret itself is never put in that intent, module state, or any
// browser storage — only this component's own React state, for as long as
// it stays mounted under the same owner.
export function IssueServiceTokenForm({ owner }: { owner: Owner }) {
  const [service, setService] = useState<Service | ''>('');
  const [phase, setPhase] = useState<Phase>('select');
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<IssuedServiceToken | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const flight = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const resumed = currentServiceTokenIntent(owner);
    if (resumed) {
      setService(resumed.service);
      setPhase('ambiguous');
      setFormError('No sabemos si la operación se completó. Puedes reintentarlo.');
    }
    return () => {
      mounted.current = false;
      flight.current?.abort();
    };
    // Reads the owner's resumable intent once, on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(key: string, body: { service: Service }) {
    const controller = new AbortController();
    flight.current = controller;
    setPhase('pending');
    setResult(null);
    setShowSecret(false);
    setCopyError(null);
    setCopied(false);
    try {
      const issued = await issueServiceToken(body, key, controller.signal);
      if (!mounted.current) return;
      clearServiceTokenIntent(key);
      setResult(issued);
      setFormError(null);
      setPhase(issued.token ? 'issued' : 'replayed');
    } catch (raw) {
      if (!mounted.current) return;
      const failure = asFailure(raw);
      const kind = classifyFailure(failure);
      if (kind === 'cancelled') return;
      if (kind === 'field' || kind === 'denied' || kind === 'session') {
        clearServiceTokenIntent(key);
        setFormError(FORM_ERROR_OVERRIDES[failure.body.error] ?? formErrorMessage(failure));
        setPhase('select');
      } else {
        markServiceTokenAmbiguous(key);
        setFormError(formErrorMessage(failure));
        setPhase('ambiguous');
      }
    } finally {
      if (flight.current === controller) flight.current = null;
    }
  }

  function handleSelect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!service) return;
    setFormError(null);
    setPhase('confirm');
  }

  async function handleConfirmIssue() {
    // Synchronous guard: set before any await, so a second click dispatched
    // before the next render still sees this ref already occupied.
    if (flight.current || !service) return;
    const intent = tryBeginServiceTokenIntent(owner, service);
    if (!intent) return;
    await send(intent.key, { service: intent.service });
  }

  async function handleRetry() {
    if (flight.current) return;
    const resumed = currentServiceTokenIntent(owner);
    if (!resumed) {
      setPhase('select');
      return;
    }
    await send(resumed.key, { service: resumed.service });
  }

  async function handleCopy() {
    if (!result?.token) return;
    setCopied(false);
    try {
      await navigator.clipboard.writeText(result.token);
      setCopyError(null);
      if (mounted.current) setCopied(true);
    } catch {
      setCopyError('No se pudo copiar el token automáticamente. Cópialo manualmente mientras esté visible.');
    }
  }

  function startOver() {
    setResult(null);
    setShowSecret(false);
    setCopyError(null);
    setCopied(false);
    setService('');
    setFormError(null);
    setPhase('select');
  }

  const disabled = phase === 'pending' || phase === 'ambiguous';
  const showForm = phase === 'select' || phase === 'confirm' || phase === 'pending' || phase === 'ambiguous';

  return (
    <section className="issue-service-token" aria-labelledby="issue-service-token-title">
      <h2 id="issue-service-token-title">Emitir token de servicio</h2>

      {showForm && (
        <form noValidate onSubmit={handleSelect} aria-busy={phase === 'pending'}>
          <div className="field">
            <label htmlFor="issue-service-token-service">Servicio</label>
            <select
              id="issue-service-token-service"
              value={service}
              disabled={disabled || phase === 'confirm'}
              onChange={(event) => setService(event.target.value as Service)}
            >
              <option value="">Selecciona un servicio</option>
              {SERVICES.map((candidate) => (
                <option key={candidate} value={candidate}>{SERVICE_LABELS[candidate]}</option>
              ))}
            </select>
          </div>
          {formError && <p role="alert" className="issue-service-token__form-error">{formError}</p>}
          {phase === 'ambiguous' ? (
            <button type="button" onClick={() => void handleRetry()}>Reintentar</button>
          ) : phase === 'select' && (
            <button type="submit" disabled={!service}>Emitir token</button>
          )}
        </form>
      )}

      {phase === 'confirm' && (
        <div className="issue-service-token__confirm" role="group" aria-labelledby="issue-service-token-confirm-title">
          <p id="issue-service-token-confirm-title">
            Vas a emitir un token para <strong>{SERVICE_LABELS[service as Service]}</strong>. Se mostrará una sola vez
            y no podrá recuperarse después.
            {' '}Su vigencia es de 30 días y sus permisos los fija el servidor. Emitir otro no revoca los anteriores.
          </p>
          <button type="button" onClick={() => void handleConfirmIssue()}>Confirmar y emitir</button>
          <button type="button" onClick={() => setPhase('select')}>Cancelar</button>
        </div>
      )}

      {phase === 'pending' && <p role="status">Emitiendo…</p>}

      {phase === 'replayed' && result && (
        <div className="issue-service-token__result">
          <p role="status">Esta clave ya se usó antes: no se emite un token nuevo y el secreto anterior no puede recuperarse.</p>
          <ServiceTokenMetadataView metadata={result} />
          <button type="button" onClick={startOver}>Emitir otro</button>
        </div>
      )}

      {phase === 'issued' && result?.token && (
        <div className="issue-service-token__result">
          <p role="status">Token emitido. Cópialo ahora: no volverá a mostrarse.</p>
          <ServiceTokenMetadataView metadata={result} />
          <div className="issue-service-token__secret field">
            <label htmlFor="issue-service-token-secret">Token</label>
            <input id="issue-service-token-secret" type={showSecret ? 'text' : 'password'} autoComplete="off" spellCheck={false} readOnly value={result.token} />
            <button type="button" onClick={() => setShowSecret((current) => !current)}>
              {showSecret ? 'Ocultar' : 'Mostrar'}
            </button>
            <button type="button" onClick={() => void handleCopy()}>Copiar</button>
          </div>
          {copyError && <p role="alert">{copyError}</p>}
          {copied && <p role="status">Token copiado.</p>}
          <button type="button" onClick={startOver}>Emitir otro</button>
        </div>
      )}
    </section>
  );
}

function ServiceTokenMetadataView({ metadata }: { metadata: IssuedServiceToken }) {
  return (
    <dl className="issue-service-token__metadata" aria-label="Metadatos del token">
      <div><dt>ID</dt><dd>{metadata.tokenId}</dd></div>
      <div><dt>Servicio</dt><dd>{metadata.service}</dd></div>
      <div><dt>Permisos</dt><dd>{metadata.permissions.join(', ')}</dd></div>
      <div><dt>Emitido por</dt><dd>{metadata.issuedBy}</dd></div>
      <div><dt>Emitido (UTC)</dt><dd>{metadata.issuedAt}</dd></div>
      <div><dt>Expira (UTC)</dt><dd>{metadata.expiresAt}</dd></div>
    </dl>
  );
}
