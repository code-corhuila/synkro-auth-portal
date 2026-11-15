import { useState } from 'react';
import { CreateUserForm } from '../components/CreateUserForm';
import { ResetPasswordPanel } from '../components/ResetPasswordPanel';
import { UserDirectory } from '../components/UserDirectory';
import { UserLookup } from '../components/UserLookup';
import { currentIntent } from '../intent/passwordResetIntent';
import type { Owner } from '../intent/registrationIntent';
import type { ResetTarget } from '../model/user';
import './UsersPage.css';

export function UsersPage({ owner }: { owner: Owner }) {
  const [selected, setSelected] = useState<{ id: string }>();
  const [directoryOpen, setDirectoryOpen] = useState(false);
  // An attempt that could not be confirmed outlives this page inside the live session: coming back to it resumes that
  // recipient, not a blank state (ADR-021, Decision 6).
  const [resetTarget, setResetTarget] = useState<ResetTarget | null>(() => currentIntent(owner)?.target ?? null);
  const [blockedBy, setBlockedBy] = useState<string | null>(null);

  function openReset(user: ResetTarget) {
    const unresolved = currentIntent(owner);
    if (unresolved && unresolved.target.userId !== user.userId) {
      // One unresolved attempt at a time: it must be retried or discarded before another recipient is chosen.
      setResetTarget(unresolved.target);
      setBlockedBy(unresolved.target.name);
      return;
    }
    setBlockedBy(null);
    setResetTarget(unresolved ? unresolved.target : { userId: user.userId, name: user.name, email: user.email, role: user.role });
  }

  return (
    <div className="users-page">
      <h1 className="users-page__title">Usuarios</h1>
      {resetTarget && (
        <>
          {blockedBy && (
            <p role="status" className="users-page__notice">
              Primero resuelve el intento sin confirmar con {blockedBy}: reenvíalo o descártalo para elegir a otra persona.
            </p>
          )}
          <ResetPasswordPanel
            key={resetTarget.userId}
            owner={owner}
            target={resetTarget}
            onClose={() => {
              setResetTarget(null);
              setBlockedBy(null);
            }}
            onResolved={() => setBlockedBy(null)}
          />
        </>
      )}
      <CreateUserForm owner={owner} />
      <UserLookup selected={selected} onResetPassword={openReset} />
      {directoryOpen ? <UserDirectory onSelect={(id) => setSelected({ id })} onResetPassword={openReset} /> : (
        <section className="user-directory" aria-labelledby="directory-preview">
          <h2 id="directory-preview">Directorio de usuarios</h2>
          <button type="button" onClick={() => setDirectoryOpen(true)}>Abrir directorio</button>
        </section>
      )}
    </div>
  );
}
