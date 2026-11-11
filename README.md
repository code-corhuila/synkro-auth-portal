# synkro-auth-portal

> auth bounded context: web UI (remote)

Part of the **SynkroTech SAS Sales Management System** — organization `code-corhuila`.
Governance and documentation live in [`synkro-docs`](https://github.com/code-corhuila/synkro-docs).

## Branching

Three permanent branches. **None of them accepts a direct commit** — you enter through a child
branch and leave through a Pull Request.

```
develop  <--PR--  feat/... fix/... chore/...
qa       <--PR--  qa/...
main     <--PR--  release/...  hotfix/...
```

Promotion happens **by re-application** (`git cherry-pick -x`), never by merging one permanent
branch into another: `merge develop -> qa` and `merge qa -> main` do not exist in this model.

`main` requires **1 approval from `ariel5253`**. On `develop` and `qa` the team sets its own review
rule.

Full policy: `00-governance/branching-policy.md` in `synkro-docs`.

## Users: password reset by an ADMIN (HU-AUTH-19)

Inside the authenticated Users page an ADMIN can reset the password of an
**active non-ADMIN** user from the directory row or the profile found by id
(`ResetPasswordPanel`). There is no public recovery button on the login screen.

- Contract: `POST /api/v1/auth/users/{id}/password-reset` through the Host's
  client, body `{newPassword, confirmPassword}`, `Idempotency-Key` as a client
  option (never a URL, never a hand-written header). ADR-021 (proposed).
- Flow: form (two password fields, show/hide) → explicit confirmation that
  repeats the recipient and states the effects → pending (controls disabled,
  single flight) → success. The Portal never claims the password was changed
  until the API answered 200.
- An outcome that cannot be confirmed (timeout, lost response, network, 5xx or
  an unreadable answer) shows "No se pudo confirmar el resultado." and offers a
  manual retry with the **same key and the same request**, or discarding the
  attempt. Nothing is ever resent automatically and no login attempt is used to
  "check".
- The intent (key, recipient, password) lives in RAM only, bound to the Host
  subject and `sessionId`. It is dropped on logout, on a new session, on a
  definite answer, on success and on discard; a page reload loses it and the
  Portal says it can no longer confirm or resend that attempt.
- Issued access tokens may stay valid until they expire (about one hour, ADR-017);
  the target's renewable sessions end.

## Login remote (HU-FE-08)

React login form exposed as `authPortal/Login`, mounted by Host at public
`/login`. Consumes only `shell/authentication`; the Host owns transport,
credentials, session and navigation. No standalone production login client.

Node 22: `npm ci`, `npm run lint`, `npm run coverage`, `npm run build`,
`npm run check:production-build`. Configure `VITE_BASE_PATH` and
`VITE_SHELL_ENTRY_URL` at build time. Compose serves internally on platform
without published ports. See [implementation and delivery](docs/implementation.md)
for contracts, configuration, validation and coordinated release order.
