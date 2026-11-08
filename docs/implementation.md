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

---

# HU-AUTH-17 — Emisión y consulta de tokens de servicio (#302)

## Diseño antes de código

`App` (placeholder único, sin router propio) ahora enruta `/service-tokens`
hacia `ServiceTokensPage` del mismo modo que ya enrutaba `/users` hacia
`UsersPage`: mismo guard ADMIN, mismo remount por `key=JSON.stringify([sub,
sessionId])` para que ningún estado — y en particular ningún secreto —
sobreviva a un logout, cambio de rol o nuevo login de la misma persona.
`ServiceTokensPage` reutiliza el layout de dos secciones de `UsersPage`
(emisión + consulta), documentado junto con el resto de componentes visuales
en `DESIGN.md` (creado en esta HU: no existía un `DESIGN.md` en la raíz).

**Flujo de emisión** (`IssueServiceTokenForm`): seleccionar servicio
(`<select>` nativo, solo `synkro-workflow` | `synkro-worker`) → confirmación
en línea explícita (no `confirm()`/`alert()`, un panel con "Confirmar y
emitir"/"Cancelar") → envío con `Idempotency-Key` fresca → resultado. Estados:
`select → confirm → pending → issued | replayed | ambiguous(retry) |
select(error de campo/denegado/sesión)`. El secreto emitido solo existe en el
estado efímero del componente (nunca en el intent retenido, nunca en storage),
enmascarado por defecto con mostrar/ocultar y copiar (Clipboard API,
error explícito y saneado si se deniega, sin reintento automático ni
remint). Una respuesta 200 de replay nunca trae `token`: se muestra un
mensaje honesto de que el secreto anterior no es recuperable. Un 422
(`BUSINESS_RULE_VIOLATION`, misma clave con otro `service`) limpia el intent y
libera el formulario para una emisión nueva con una clave nueva — nunca
reintenta automáticamente con la clave en conflicto.

**Flujo de consulta** (`ServiceTokenLookup`): mismo patrón de `UserLookup`
(ID conocido, nunca listado) adaptado a metadatos de token — `loading / data /
empty(404, mensaje propio de token, no el de usuario) / error(retry si es
ambiguo)`. El estado "vigente/expirado" se calcula en el cliente comparando
`expiresAt` (UTC, tal como lo envía el servidor) contra la hora actual
(`expiryStatus` en `model/serviceToken.ts`), sin decodificar el JWT en ningún
momento — el `GET` nunca devuelve el token.

## Contrato consumido

Fuentes: [OpenAPI Auth](https://github.com/code-corhuila/synkro-docs/blob/main/07-api/contracts/openapi/synkro-auth-api.yaml)
y [Auth API](https://github.com/code-corhuila/synkro-auth-api/tree/develop),
revisión `eeb4cf35af4b556b6f6479bf9f35c6c75a814926`.

- `POST /api/v1/auth/service-tokens` — body `{ service }` únicamente,
  `Idempotency-Key` vía la opción `idempotencyKey` de `shell/apiClient`
  (nunca un header manual). `201` con `{tokenId, service, permissions,
  issuedBy, issuedAt, expiresAt, token}`; replay con la misma clave y el mismo
  `service` → `200` con el mismo cuerpo sin `token`; misma clave con otro
  `service` → `422`. Los permisos y el `issuedBy` los decide el servidor — el
  cliente nunca los envía ni los edita.
- `GET /api/v1/auth/service-tokens/{id}` — solo metadatos, nunca el token.
  `id` se valida como UUID antes de la llamada y se pasa por
  `encodeURIComponent`.
- Ambos adaptadores (`serviceTokensApi.ts`) proyectan la respuesta a un
  allowlist explícito (`safeMetadata`): cualquier campo no contemplado por el
  contrato (por ejemplo un `roles` o un segundo `token` inesperado en el
  `GET`) se descarta antes de llegar a un componente.

## Trazabilidad local (AUTH17-01..04)

| ID | Escenario | Test | Código |
|---|---|---|---|
| AUTH17-01 | Emisión nueva con confirmación explícita y clave fresca | `IssueServiceTokenForm.test.tsx` → "first emission" | `IssueServiceTokenForm.tsx`, `serviceTokensApi.ts` |
| AUTH17-02 | Replay (misma clave/servicio) sin secreto, mensaje honesto | `IssueServiceTokenForm.test.tsx` → "replay" | idem |
| AUTH17-03 | Ambigüedad de red/5xx con reintento explícito, misma clave/cuerpo | `IssueServiceTokenForm.test.tsx` → "ambiguous network/5xx outcome" | `serviceTokenIntent.ts` |
| AUTH17-04 | Consulta por ID conocido, nunca listado, 404 con mensaje propio | `ServiceTokenLookup.test.tsx` | `ServiceTokenLookup.tsx`, `serviceTokensApi.ts` |

La matriz central de trazabilidad FR/NFR → HU → Test → Código para HU-AUTH-17
sigue pendiente de actualización fuera de este repositorio; esta tabla es
solo la traza local de este portal, no sustituye esa matriz.

## Carencia formal pendiente

Al cierre de esta tarea no se confirmó un FR/NFR exacto para HU-AUTH-17 en la
matriz central — se trabajó únicamente contra el contrato ya implementado en
el backend y las decisiones de ADR-006
(Decisión 2) y ADR-014 citadas como referencia. No se afirma ningún ADR nuevo
ni se modifica `synkro-docs`.

## Verificación

Node 22.23.3: cobertura, lint, compilación y `check:production-build`
ejecutados por Codex. Se conserva el umbral de cobertura y el guard de
producción. Claude escribió las pruebas antes del código, pero no pudo
ejecutarlas desde su entorno; no se atribuye a esa fase un ciclo rojo→verde
observado. Codex ejecutó las pruebas y observó siete fallos en los casos de
revisión antes de corregir validación de respuestas, foco y confirmación de copia.

La auditoría visual estática no añade hallazgos para AUTH-17. Conserva tres
hallazgos anteriores de validación en Login, CreateUserForm y UserLookup;
no se declara una auditoría global sin observaciones. El comprobador de
DESIGN.md informa cero errores y una advertencia por ausencia de YAML.

La aceptación con servicios reales se registra aparte para la composición
exacta elegida. Las pruebas unitarias no sustituyen esa aceptación ni la
aprobación humana de la HU.

Resultado revisado: **115 pruebas unitarias aprobadas**, cobertura de
sentencias **91,75 %** (base anterior: 90,66 %). La aceptación suplementaria
real aprobó **44 comprobaciones**: las 32 anteriores y 12 específicas de
AUTH-17, con el portal en `b83378ed15e11cc03d404bec0cfe835c89484f95` sobre
la selección de Infra QA `3a33af9c2775086dbbb490c9700219af52831235`.
Incluye ambas emisiones, copia/revelación explícitas, metadatos sin secreto,
permisos efectivos, rechazo de expirados, 401/403, conflicto 422, respuesta
POST perdida después de confirmar la emisión y replay con la misma clave,
navegación, ambos temas, teclado, ancho de 390px y logout real.

La suite suplementaria terminó con código 0 y limpieza/exportación aprobadas.
El proceso exterior terminó con código 2, esperado para el alcance de revisión
disponible: no representa una aceptación completa nueva de las 21 suites.
Se verificaron las revisiones de las 18 fuentes, el lock y los nombres exactos
de las 44 comprobaciones. Continúan pendientes la revisión humana y la
trazabilidad central; esta evidencia no cierra automáticamente la HU.

## Archivos nuevos/modificados en esta HU

- `src/App.tsx`, `src/App.test.tsx` — enrutamiento a `/service-tokens`.
- `src/auth/model/serviceToken.ts`, `serviceToken.test.ts`
- `src/auth/api/serviceTokensApi.ts`, `serviceTokensApi.test.ts`
- `src/auth/intent/serviceTokenIntent.ts`
- `src/auth/components/IssueServiceTokenForm.{tsx,css}`,
  `IssueServiceTokenForm.test.tsx`
- `src/auth/components/ServiceTokenLookup.{tsx,css}`,
  `ServiceTokenLookup.test.tsx`
- `src/auth/pages/ServiceTokensPage.{tsx,css}`
- `DESIGN.md` (nuevo, raíz del repo)
