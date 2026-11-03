import { useAdminIdentity } from './auth/hooks/useAdminIdentity';
import { UsersPage } from './auth/pages/UsersPage';

const UNAVAILABLE = <p>Esta función aún no está disponible.</p>;

// Mounted by the Host for both /users and /service-tokens, without its own
// router (no `shell` package shares react-router-dom — _stacks/frontend.md
// forbids a second router). The Host does not remount this component when
// moving between those two prefixes, so the path is read fresh on every
// render rather than only once on mount; a Host navigation already forces a
// re-render here through its own RequireAuth/RequireRole (useLocation).
//
// This also re-checks ADMIN independently of the Host's route guard
// (defense in depth): a non-ADMIN or missing session never reaches the
// data-fetching children below, even if this remote were mounted outside
// the Host's guarded route.
export default function App() {
  const user = useAdminIdentity();

  if (!user || user.role !== 'ADMIN') return UNAVAILABLE;
  if (!/^\/users\/?$/i.test(window.location.pathname)) return UNAVAILABLE;

  const owner = { sub: user.sub, sessionId: user.sessionId };
  return <UsersPage key={JSON.stringify([owner.sub, owner.sessionId])} owner={owner} />;
}
