# Testing

Detailed procedures and delivery notes moved from the repository README at
[source 57abc7c](https://github.com/code-corhuila/synkro-auth-portal/blob/57abc7c0a53d64f0af8399b04aeb5cf5051b8ddd/README.md).
Recorded execution results retain their original scope; moving them does not
constitute a new execution or certify a different revision.

Run commands from the repository root unless a step explicitly changes directory.

## AUTH-19 review checks

`npm run test:contract` generates five Pact interactions from the actual reset client. They cover success, replay
after a later reset, an expired receipt, a purged receipt and a forbidden caller. Their examples are redacted string
matchers; credentials are transient and never published in the artifact. Auth API verifies the pinned artifact with
real API/owning migrations/PostgreSQL plus a deliberately incompatible provider. Regenerate and commit the artifact
when the client contract changes; CI rejects stale artifacts. The normal unit collector remains restricted to src.

The portal CI also runs lint, build, unit coverage, the production boundary check and the versioned Dockerfile build.
Reset result transitions restore keyboard focus, including a second uncertain retry; closing restores a connected
opener. This does not change the request or silently generate a new idempotency key.
