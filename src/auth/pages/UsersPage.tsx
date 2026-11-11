import { useState } from 'react';
import { CreateUserForm } from '../components/CreateUserForm';
import { UserDirectory } from '../components/UserDirectory';
import { UserLookup } from '../components/UserLookup';
import type { Owner } from '../intent/registrationIntent';
import './UsersPage.css';

export function UsersPage({ owner }: { owner: Owner }) {
  const [selected, setSelected] = useState<{ id: string }>();
  const [directoryOpen, setDirectoryOpen] = useState(false);
  return (
    <div className="users-page">
      <h1 className="users-page__title">Usuarios</h1>
      <CreateUserForm owner={owner} />
      <UserLookup selected={selected} />
      {directoryOpen ? <UserDirectory onSelect={(id) => setSelected({ id })} /> : (
        <section className="user-directory" aria-labelledby="directory-preview">
          <h2 id="directory-preview">Directorio de usuarios</h2>
          <button type="button" onClick={() => setDirectoryOpen(true)}>Abrir directorio</button>
        </section>
      )}
    </div>
  );
}
