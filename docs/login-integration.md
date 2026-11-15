# Login integration

Detailed procedures and delivery notes moved from the repository README at
[source 57abc7c](https://github.com/code-corhuila/synkro-auth-portal/blob/57abc7c0a53d64f0af8399b04aeb5cf5051b8ddd/README.md).
Recorded execution results retain their original scope; moving them does not
constitute a new execution or certify a different revision.

Run commands from the repository root unless a step explicitly changes directory.

## Login remote (HU-FE-08)

React login form exposed as `authPortal/Login`, mounted by Host at public
`/login`. Consumes only `shell/authentication`; the Host owns transport,
credentials, session and navigation. No standalone production login client.

Node 22: `npm ci`, `npm run lint`, `npm run coverage`, `npm run build`,
`npm run check:production-build`. Configure `VITE_BASE_PATH` and
`VITE_SHELL_ENTRY_URL` at build time. Compose serves internally on platform
without published ports. See [implementation and delivery](implementation.md)
for contracts, configuration, validation and coordinated release order.
