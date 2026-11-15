# Password reset operations

Detailed procedures and delivery notes moved from the repository README at
[source 57abc7c](https://github.com/code-corhuila/synkro-auth-portal/blob/57abc7c0a53d64f0af8399b04aeb5cf5051b8ddd/README.md).
Recorded execution results retain their original scope; moving them does not
constitute a new execution or certify a different revision.

Run commands from the repository root unless a step explicitly changes directory.

## Users: password reset by an ADMIN (HU-AUTH-19)

Inside the authenticated Users page an ADMIN can reset the password of an
**active non-ADMIN** user from the directory row or the profile found by id
(`ResetPasswordPanel`). There is no public recovery button on the login screen.

- Contract: `POST /api/v1/auth/users/{id}/password-reset` through the Host's
  client, body `{newPassword, confirmPassword}`, `Idempotency-Key` as a client
  option (never a URL, never a hand-written header). ADR-021 (accepted).
- Flow: form (two password fields, show/hide) → explicit confirmation that
  repeats the recipient and states the effects → pending (controls disabled,
  single flight) → success. The Portal never claims the password was changed
  until the API answered 200.
- An outcome that cannot be confirmed (timeout, lost response, network, 5xx or
  an unreadable answer) shows "No se pudo confirmar el resultado." and offers a
  manual retry with the **same key and the same request**, or discarding the
  attempt. Nothing is ever resent automatically and no login attempt is used to
  "check".
- A 422 on the key (the 24-hour receipt expired, or the key was used with another
  request) says the attempt can no longer be resent, that nothing was repeated and that the
  original reset may have been applied. It never claims it did not happen, never resends or
  makes a key by itself, and offers "Iniciar un restablecimiento nuevo", which needs the
  password typed and confirmed again and uses a new key.
- The intent (key, recipient, password) lives in RAM only, bound to the Host
  subject and `sessionId`. It is dropped on logout, on a new session, on a
  definite answer, on success and on discard; a page reload loses it and the
  Portal says it can no longer confirm or resend that attempt.
- Issued access tokens may stay valid until they expire (about one hour, ADR-017);
  the target's renewable sessions end.
