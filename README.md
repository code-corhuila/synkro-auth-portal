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

## Login remote (HU-FE-08)

React login form exposed as `authPortal/Login`, mounted by Host at public
`/login`. Consumes only `shell/authentication`; the Host owns transport,
credentials, session and navigation. No standalone production login client.

Node 22: `npm ci`, `npm run lint`, `npm run coverage`, `npm run build`,
`npm run check:production-build`. Configure `VITE_BASE_PATH` and
`VITE_SHELL_ENTRY_URL` at build time. Compose serves internally on platform
without published ports. See [implementation and delivery](docs/implementation.md)
for contracts, configuration, validation and coordinated release order.
