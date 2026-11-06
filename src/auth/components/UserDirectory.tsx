import { useEffect, useRef, useState } from 'react';
import { searchUsers, type UserPage } from '../api/usersApi';
import { formErrorMessage, isApiFailure } from '../model/errors';
import { ROLES, type Role } from '../model/user';
import './UserDirectory.css';

const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Administrador', SALESPERSON: 'Vendedor', INVENTORY: 'Inventario' };
const LIMIT = 20;
type Result = { state: 'loading' } | { state: 'ready'; page: UserPage } | { state: 'error'; message: string };

export function UserDirectory({ onSelect }: { onSelect: (id: string) => void }) {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [composing, setComposing] = useState(false);
  const [result, setResult] = useState<Result>({ state: 'loading' });
  const searchInput = useRef<HTMLInputElement>(null);
  const waiting = input.trim() !== query;

  useEffect(() => {
    if (composing || !waiting) return;
    const timer = window.setTimeout(() => {
      setPage(1);
      setQuery(input.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [composing, input, waiting]);

  useEffect(() => {
    if (waiting || composing) return;
    const abort = new AbortController();
    setResult({ state: 'loading' });
    void searchUsers({
      ...(query && { q: query }), ...(role && { role }), page, limit: LIMIT,
    }, abort.signal).then(
      (value) => { if (!abort.signal.aborted) setResult({ state: 'ready', page: value }); },
      (error: unknown) => {
        if (abort.signal.aborted) return;
        setResult({ state: 'error', message: isApiFailure(error)
          ? formErrorMessage(error) : 'No se pudo consultar el directorio. Inténtalo de nuevo.' });
      },
    );
    return () => abort.abort();
  }, [attempt, composing, page, query, role, waiting]);

  const visible = waiting || composing ? { state: 'loading' } as const : result;
  return (
    <section className="user-directory" aria-labelledby="directory-title">
      <h2 id="directory-title">Directorio de usuarios</h2>
      <form className="user-directory__filters" noValidate onSubmit={(event) => {
        event.preventDefault();
        if (composing || !waiting) return;
        setPage(1);
        setQuery(input.trim());
      }}>
        <label htmlFor="directory-query">Nombre o correo</label>
        <div className="user-directory__search">
          <input ref={searchInput} id="directory-query" type="search" value={input} maxLength={150}
            onChange={(event) => setInput(event.target.value)}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)} />
          {input && <button type="button" onClick={() => {
            setInput('');
            setQuery('');
            setPage(1);
            searchInput.current?.focus();
          }}>Limpiar búsqueda</button>}
        </div>
        <label htmlFor="directory-role">Filtrar por rol</label>
        <select id="directory-role" value={role} onChange={(event) => {
          setPage(1);
          setRole(event.target.value as Role | '');
        }}>
          <option value="">Todos los roles</option>
          {ROLES.map((value) => <option key={value} value={value}>{ROLE_LABEL[value]}</option>)}
        </select>
      </form>
      <div className="user-directory__results" aria-busy={visible.state === 'loading'}>
        {visible.state === 'loading' && <p role="status">Consultando usuarios…</p>}
        {visible.state === 'error' && <div role="alert">
          <p>{visible.message}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>Reintentar</button>
        </div>}
        {visible.state === 'ready' && <>
          {visible.page.data.length ? <div className="user-directory__table">
            <table>
              <caption className="user-directory__caption">Usuarios encontrados</caption>
              <thead><tr><th scope="col">Nombre</th><th scope="col">Correo</th><th scope="col">Rol</th><th scope="col">Estado</th><th scope="col">Ficha</th></tr></thead>
              <tbody>{visible.page.data.map((user) => <tr key={user.userId}>
                <th scope="row">{user.name}</th><td>{user.email}</td><td>{ROLE_LABEL[user.role]}</td>
                <td>{user.active ? 'Activo' : 'Inactivo'}</td>
                <td><button type="button" aria-label={`Ver ficha de ${user.name}`} onClick={() => onSelect(user.userId)}>Ver ficha</button></td>
              </tr>)}</tbody>
            </table>
          </div> : <p role="status">No se encontraron usuarios.</p>}
          {(visible.page.meta.totalPages > 1 || page > 1) && <nav aria-label="Páginas de usuarios" className="user-directory__pages">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
            <span>Página {page} de {Math.max(page, visible.page.meta.totalPages)}</span>
            <button type="button" disabled={page >= visible.page.meta.totalPages} onClick={() => setPage(page + 1)}>Siguiente</button>
          </nav>}
        </>}
      </div>
    </section>
  );
}
