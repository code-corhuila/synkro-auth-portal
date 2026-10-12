import { useEffect, useRef, useState, type FormEvent } from 'react';
import { authentication } from 'shell/authentication';
import './Login.css';
const messages: Record<string, string> = { INVALID_CREDENTIALS: 'Correo o contraseña incorrectos',
    RATE_LIMITED: 'Demasiados intentos. Espera antes de volver a intentar.',
    INDETERMINATE: 'No pudimos recuperar la sesión. Inicia sesión de nuevo.',
    UNAVAILABLE: 'El servicio no está disponible. Inténtalo de nuevo.' };
export default function Login({ returnTo }: {
    returnTo?: string;
}) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [retryAt, setRetryAt] = useState(0);
    const [now, setNow] = useState(Date.now());
    const flight = useRef<AbortController | null>(null);
    const secret = useRef<HTMLInputElement>(null);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        const input = secret.current;
        return () => {
            mounted.current = false;
            flight.current?.abort();
            if (input)
                input.value = '';
        };
    }, []);
    useEffect(() => { if (retryAt <= Date.now())
        return; const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer); }, [retryAt]);
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (flight.current || Date.now() < retryAt)
            return;
        const controller = new AbortController();
        flight.current = controller;
        setPending(true);
        setError(null);
        try {
            await authentication.login({ email: email.trim(), password }, { signal: controller.signal, returnTo });
            if (mounted.current && !controller.signal.aborted)
                setPassword('');
        }
        catch (failure) {
            if (!mounted.current || controller.signal.aborted)
                return;
            const outcome = failure as {
                code?: string;
                retryAt?: number;
            };
            if (outcome.code === 'CANCELLED')
                return;
            setError(outcome.code || 'UNAVAILABLE');
            if (outcome.code === 'INVALID_CREDENTIALS') {
                setPassword('');
                secret.current?.focus();
            }
            if (outcome.code === 'RATE_LIMITED') {
                setRetryAt(outcome.retryAt || 0);
                setNow(Date.now());
            }
        }
        finally {
            if (flight.current === controller)
                flight.current = null;
            if (mounted.current && !controller.signal.aborted)
                setPending(false);
        }
    }
    const rejected = error === 'INVALID_CREDENTIALS';
    const waiting = retryAt > now;
    return <section className="auth-login" aria-labelledby="login-title">
    <div className="auth-card">
      <p className="auth-brand">Synkro Tech</p><h1 id="login-title">Iniciar sesión</h1>
      <p>Accede con tu correo y contraseña.</p>
      <form onSubmit={submit} aria-busy={pending}>
        <label htmlFor="login-email">Correo electrónico</label>
        <input id="login-email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} readOnly={pending} aria-invalid={rejected} aria-describedby={error ? 'login-error' : undefined}/>
        <label htmlFor="login-password">Contraseña</label>
        <input ref={secret} id="login-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} readOnly={pending} aria-invalid={rejected} aria-describedby={error ? 'login-error' : undefined}/>
        {error && <p id="login-error" role="alert">{messages[error] || messages.UNAVAILABLE}</p>}
        {waiting && <p role="status">Podrás reintentar en {Math.ceil((retryAt - now) / 1000)} segundos.</p>}
        <button type="submit" disabled={pending || waiting}>{pending ? 'Iniciando sesión…' : error ? 'Reintentar' : 'Iniciar sesión'}</button>
      </form>
    </div>
  </section>;
}
