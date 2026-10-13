# HU-FE-08 — Auth Portal

El paquete expone `authPortal/Login` y conserva `authPortal/App` para el registro
existente. `/Login` recibe solamente `returnTo?`; consume `shell/authentication`
del Host. El resultado contiene `{user:{sub,role},destination}` y los errores
contienen `code`, `message`, `retryAt?`; nunca tokens. El Host decide navegación,
Gateway, transporte, sesión, renovación y logout. App indica función pendiente
en rutas de administración sin implementar funcionalidades fuera de alcance.

Formulario español con labels/autocomplete, error asociado, teclado, foco tras
rechazo, bloqueo de doble envío, espera Retry-After y retry explícito. Contraseña
se elimina tras rechazo, éxito y desmontaje; abort/cancel previene efecto tardío.
No storage, cliente propio, decodificación JWT ni credenciales sintéticas en
código de producción. El entry standalone solo indica montaje desde el Host.

## Construcción y entrega

Node22, `npm ci`, `npm run lint`, `npm run coverage`, `npm run build`,
`npm run check:production-build`. OriginJS existente, React compartido del Host,
sin migración del runtime. Tokens CSS y fuentes los publica el Host. Dependencias
resueltas por package-lock. Dockerfile ejecuta build y guard, nginx sirve HTTP.

`docker compose -f deploy/compose.yml config --quiet` valida la configuración.
Compose usa contexto del propio repositorio y alias `synkro-auth-portal` en la
red externa `platform`, sin puertos publicados ni montajes de secretos.
`VITE_BASE_PATH=/remotes/auth/`; `VITE_SHELL_ENTRY_URL=https://HOST/assets/remoteEntry.js`.
Host debe construir `VITE_AUTH_PORTAL_ENTRY=https://HOST/remotes/auth/assets/remoteEntry.js`,
`VITE_DEV_SIGN_IN=false`, y proxy `/remotes/auth/` al servicio interno. Configuración
se fija al build; HOST debe sustituirse por origen real aprobado. Preparar imagen
Auth primero; integrar capability/delivery Host antes de habilitar login público.

## Verificación y decisión

9 pruebas pasan, cobertura global93,22 %, Login96,49 %. Lint, TypeScript, build,
guard y Compose pasan. Test form tuvo 8 fallos reales contra stub vacío antes de
implementarlo. Se verificó en navegador contra Auth/Gateway y PostgreSQL/Flyway
desechables: rechazo, login, reload/refresh, logout, retorno autorizado y
caída/recuperación del remoto sin reload. Se sirvieron entry/JS/CSS reales por
nginx Host. Los tests UI controlados comprueban rate limit y disponibilidad;
no se presentan como aceptación real de esos errores.

Referencias/SHAs, matriz FE-AUTH-01…18, límites de TDD inicial Host, decisión
humana y PRs dependientes están en `synkro-front/docs/authentication-*.md` de la
rama `feat/host-authentication-lifecycle`. Docs base
`61056c93e6e0783a9199bf56778e9494739bc458`; Auth checkpoint verificado
`d478fba7344f3a778da4f122dd5aefe481a1d32a`. La política proactiva fue aprobada
por el usuario para implementar. Formalización documental TD-010 sigue pendiente;
no se afirma un ADR aceptado ni se modifica synkro-docs. Sales concurrente es
HU-VEN-12 (#246). CODEOWNERS y contratos previos permanecen intactos.

PR preparado hacia develop: `feat(auth): deliver federated credential login portal`.
Descripción preparada: login accesible federado que consume solo capability del
Host, errores normalizados y cancellation; imagen interna sin puertos. Validación
anterior y dependencia coordinada del export Host. No se creó PR.
