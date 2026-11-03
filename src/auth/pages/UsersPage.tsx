import { CreateUserForm } from '../components/CreateUserForm';
import { UserLookup } from '../components/UserLookup';
import type { Owner } from '../intent/registrationIntent';
import './UsersPage.css';

// AUTH16: a creation form and a separate known-ID lookup — never a
// browsable list, edit/delete, reset or service-token administration.
export function UsersPage({ owner }: { owner: Owner }) {
  return (
    <div className="users-page">
      <h1 className="users-page__title">Usuarios</h1>
      <CreateUserForm owner={owner} />
      <UserLookup />
    </div>
  );
}
