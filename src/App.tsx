import { useAdminIdentity } from './auth/hooks/useAdminIdentity';
import { UsersPage } from './auth/pages/UsersPage';
import { ServiceTokensPage } from './auth/pages/ServiceTokensPage';

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

  const owner = { sub: user.sub, sessionId: user.sessionId };
  // Remounting on owner change (instead of relying on each page's own
  // effects) is what guarantees no state — least of all an issued
  // secret — ever survives a logout, role change or new login as the
  // same person into the next render.
  const key = JSON.stringify([owner.sub, owner.sessionId]);
  const path = window.location.pathname;

  if (/^\/users\/?$/i.test(path)) return <UsersPage key={key} owner={owner} />;
  if (/^\/service-tokens\/?$/i.test(path)) return <ServiceTokensPage key={key} owner={owner} />;
  return UNAVAILABLE;
}
