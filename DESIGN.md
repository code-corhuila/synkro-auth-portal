# Design — synkro-auth-portal

This portal has no local design tokens. The Host (`synkro-front`) is the single
owner of all colors, typography, spacing, radii and shadows, published as CSS
custom properties on `:root` (see `src/test-doubles/host-tokens.css`, the
test-only mirror of that contract — the real values ship from the Host, never
from this repo). Every component here reads `var(--token-name)`; none
redefines a token or hardcodes a hex value. Both the light and dark themes are
inherited automatically — this portal never branches on `prefers-color-scheme`
itself.

## Overview

Two ADMIN-only screens share this visual language: `/users` (`UsersPage`,
HU-AUTH-16) and `/service-tokens` (`ServiceTokensPage`, HU-AUTH-17). Both are
two-column card layouts mounted by the Host's `App` entry, gated by
`useAdminIdentity()`. New work follows the same card/section/form conventions
already established by `UsersPage` — this file documents those conventions
once, in one place, instead of repeating them per page.

## Colors

Semantic roles only, never a literal value:

- `--color-bg-page` / `--color-bg-card`: page canvas vs. the card surface each
  section sits on.
- `--color-text-primary` / `--color-text-secondary`: body text vs. labels
  (`dt`, helper copy).
- `--color-primary-500` (default) / `--color-primary-700` (hover/pressed):
  primary actions (submit, confirm, retry).
- `--color-error-700` on `--color-error-50`: field/form errors (`role="alert"`),
  invalid input borders.
- `--color-warning-700` on `--color-warning-50`: a consequential, not-yet-
  committed action — the "confirm before you issue" panel in
  `IssueServiceTokenForm`, the one new semantic use in this HU.
- `--color-success-700` on `--color-success-50`: a completed, safe-to-trust
  result (created profile, issued token metadata).

## Typography

- `--font-family-heading` (Big Shoulders Display): page `<h1>` and section
  `<h2>` only.
- `--font-family-sans` (IBM Plex Sans): body copy, labels, buttons.
- `--font-family-mono` (JetBrains Mono): any value that is an identifier or a
  secret the person may need to compare character-by-character — `dd` values
  in metadata lists, and the token field itself.

## Layout

`*-page` root: `display: grid; grid-template-columns: repeat(2, 1fr)`, title
spanning both columns, collapsing to one column under 960px (`UsersPage.css`,
`ServiceTokensPage.css`). Each section is a card: `padding: var(--space-6)`,
`border: 1px solid var(--color-text-secondary)`, `border-radius:
var(--radius-lg)`. `min-width: 0` on every grid child and every input/select
is what keeps a long UUID or token from forcing the grid wider than the
viewport at the 390px floor.

## Elevation & Depth

No shadows or overlays in this portal — cards are distinguished by a 1px
border on a page canvas one shade apart from the card surface
(`--color-bg-page` vs. `--color-bg-card`), not by `--shadow-*`. The one
exception that earns a stronger visual weight than a plain card is the
pre-emission confirmation panel: a tinted warning background
(`--color-warning-50`) with a matching border, so it reads as "stop and read
this" without introducing a modal, `alert()`, or any new elevation layer.

## Shapes

`--radius-md` for inputs, selects and buttons; `--radius-lg` for the outer
page cards and the warning/metadata/result panels inside them. No sharp
corners, no fully round corners outside `--radius-full` (unused here).

## Components

- **Native `<select>`**: the only input for a 2-option closed enumeration
  (`service`: `synkro-workflow` | `synkro-worker`). A custom listbox was
  considered and rejected — two fixed, server-defined options never need
  filtering or search, and the OS-native popup is accessible by default.
  The same native owner serves the existing three-role selectors in
  `CreateUserForm` and `UserDirectory`; `premium-ui.json` records this decision.
- **Form → inline confirm → result, never `confirm()`**: emitting a token is
  consequential (the secret cannot be recovered later), so selecting a
  service does not submit; it opens an inline `role="group"` panel with its
  own "Confirmar y emitir" / "Cancelar" buttons. No `window.confirm`,
  `alert`, or `prompt` anywhere in this portal.
- **Masked secret with explicit reveal**: the issued token renders once, in a
  `type="password"` input by default, with its own "Mostrar"/"Ocultar"
  toggle and a "Copiar" button (Clipboard API, with a sanitized, explicit
  error on denial — never a silent retry and never a new token minted just
  because the copy failed).
- **Status pattern**: `role="status"` for non-error outcomes (loading,
  success, honest "already issued" replay), `role="alert"` for anything the
  person must act on (validation, server rejection, copy failure). This is
  the same pair `UserLookup`/`CreateUserForm` already use — `ServiceTokenLookup`
  and `IssueServiceTokenForm` do not introduce a third pattern.
- **Password reset by an ADMIN (HU-AUTH-19)**: `ResetPasswordPanel` is an inline
  card in the authenticated Users page, never a modal or `confirm()`. It names
  the recipient (name, e-mail, role, id) on every step: form with two
  password fields and one show/hide toggle (`aria-pressed`), then a
  confirmation step that repeats the recipient and lists the effects in the
  warning tint (renewable sessions end, issued access tokens may last about an
  hour, hand the password over outside the application). While the request
  is in the air every control is disabled and a synchronous guard rejects a
  second submit. An outcome that cannot be confirmed says exactly
  "No se pudo confirmar el resultado." — it never claims failure — and offers
  "Reintentar con la misma solicitud" or "Descartar intento". A 422 about the
  key ends the attempt without claiming the reset did not happen and offers
  "Iniciar un restablecimiento nuevo" (empty form, new confirmation, new key). The entry
  button exists only in the directory row and the profile of an active
  non-ADMIN user, and never on the public login screen.
- **Known-ID lookup**: a single ID input + "Buscar", never a browsable list —
  same shape as `UserLookup`, reused for token metadata.

## Do's and Don'ts

- Do read every value through `var(--token-name)`; don't hardcode a hex,
  rgb(), or px shadow value in any portal CSS file.
- Do keep the secret in the page component's own ephemeral state; don't put
  it in the retained emission intent, a module-level variable, or any Web
  Storage/URL.
- Do keep the reset password only in the panel's state and in the RAM-only
  reset intent (module scope, bound to the Host subject and `sessionId`,
  retired on identity change, on success, on a definite answer and on discard):
  a retry with the same `Idempotency-Key` must resend the same
  request (ADR-021). Never in Web Storage, the URL, a log or the console, and
  never in any text shown after the request leaves the form.
- Do show a specific, sanitized message for a denied clipboard write; don't
  swallow the error or silently issue a replacement token.
- Do use `<select>` for this fixed 2-item enumeration; don't build a custom
  dropdown for a choice this small and this static.
- Do gate the irreversible action behind an inline, dismissible confirmation;
  don't use a browser-native `confirm()`/`alert()` dialog anywhere.
