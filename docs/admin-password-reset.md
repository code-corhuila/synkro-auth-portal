# HU-AUTH-19 — Restablecer la contraseña de un usuario (Auth Portal)

Un ADMIN restablece la contraseña de otro usuario desde la administración de **Usuarios**, ya autenticado. No existe
recuperación pública: la pantalla de login no cambia (hay una prueba de regresión que lo exige).

Referencias: HU `code-corhuila/synkro-docs#306`, HU-ARQ `#309`, ADR-021 (**Proposed**, PR `synkro-docs#310`; no está
aceptado y su aprobación sigue siendo requisito para publicar en `main`). Dependencias de integración: `synkro-auth-db`
(V018–V021, PR #27) → `synkro-auth-api` → este Portal.

## Alcance

- Acción **«Restablecer contraseña»** en la fila del directorio y en la ficha encontrada por ID, solo para un usuario
  **activo y no ADMIN**. La API sigue siendo la autoridad (rechaza ADMIN, inactivo, el propio ADMIN).
- Contrato consumido: `POST /api/v1/auth/users/{id}/password-reset`, cuerpo `{newPassword, confirmPassword}`,
  `Idempotency-Key` como opción del cliente del Host (nunca cabecera escrita a mano). La contraseña solo viaja en el
  cuerpo; el `id` va codificado en la ruta. Respuesta: `{userId, passwordResetAt}`; el Portal descarta cualquier otro campo.
- Sin cambios en Host, Customers, Sales, Products ni Infra. Sin recuperación pública ni administración general de roles.

## Flujo

`ResetPasswordPanel` es un panel en línea (sin modal ni `confirm()`, DESIGN.md):

1. **Formulario**: nombra al destinatario (nombre, correo, rol, id), dos campos de contraseña con un solo control
   «Mostrar/Ocultar contraseñas» (`aria-pressed`), validación local de la política de la API (≥ 8 caracteres y ≤ 72 bytes
   UTF-8, sin recortar) y de la confirmación.
2. **Confirmación explícita**: repite al destinatario y enuncia los efectos: las sesiones renovables se cierran; los tokens
   de acceso ya emitidos pueden seguir válidos hasta que expiren (cerca de una hora, ADR-017); la contraseña se entrega por
   un canal externo a la aplicación. No muestra la contraseña.
3. **Pendiente**: todos los controles deshabilitados y una guarda síncrona rechaza el segundo envío.
4. **Éxito**: «Contraseña restablecida.», el instante registrado, y se limpian los secretos.
5. **Resultado incierto** (timeout, red, 5xx, respuesta ilegible): «No se pudo confirmar el resultado.» Sin afirmar que
   falló. Ofrece solo **«Reintentar con la misma solicitud»** (misma clave y mismo cuerpo, manual) o **«Descartar intento»**
   (limpia el secreto y dice que no se pudo confirmar si el anterior se aplicó). Nunca reenvía por sí solo ni usa un login
   para «comprobar».
6. **Respuestas definitivas**: 400 sobre la contraseña vuelve al formulario con el error en el campo (y clave nueva al
   reenviar); 401/403/404/422 terminan el intento y limpian el secreto.

Un intento sin resolver se muestra al volver a Usuarios dentro de la misma sesión y **bloquea elegir a otra persona**
hasta reenviarlo o descartarlo (aviso visible mientras dure).

## Intención en RAM

`passwordResetIntent.ts` guarda `{clave, destinatario, solicitud}` solo en memoria del módulo, ligada al `sub` y al
`sessionId` del Host. Se retira al cambiar la identidad (logout, nueva sesión, otro rol), al terminar con respuesta
definitiva, al descartar y al tener éxito. Nunca toca `localStorage`, `sessionStorage`, la URL, logs ni consola (pruebas).
**Límite declarado a la persona:** tras recargar o cerrar sesión el Portal no puede confirmar ni reenviar el intento; un
nuevo restablecimiento exige una confirmación nueva y una clave nueva.

## Verificación automatizada

`npm test` (200 pruebas, 21 archivos), `npm run build`, `npm run lint`, `npm run check:production-build` y
`npm run coverage` (93 % de sentencias) pasan. Las pruebas nuevas se escribieron en rojo primero: API
(`usersApi.test.ts`), política (`passwordPolicy.test.ts`), intención (`passwordResetIntent.test.ts`), copy
(`errors.test.ts`), panel (`ResetPasswordPanel.test.tsx`), puntos de entrada (`UserDirectory.test.tsx`,
`UserLookup.test.tsx`), página (`UsersPage.test.tsx`) y la regresión de login (`Login.test.tsx`). Las pruebas con el
cliente y la sesión del Host usan los dobles de `src/test-doubles`; **no se presentan como aceptación real**.

## Aceptación real (2026-11-10)

Composición propia y desechable, en una red Docker propia (`auth19-net`); no se tocó ningún recurso `synkro-dev-*` ni la
base compartida, no se usó la CLI de operaciones de Infra (su candado `~/.synkro-operations` estaba vacío y no se
adquirió) y las ejecuciones fueron secuenciales.

| Pieza | Origen |
| --- | --- |
| PostgreSQL 16.6 (`postgres:16.6-alpine`), base `synkro_auth_acc` | contenedor propio; Flyway 11.20.3 aplicó las 21 migraciones de `synkro-auth-db` @ `5d831a6` |
| Auth API | JAR construido de `synkro-auth-api` (rama `feat/admin-password-reset`, mismo árbol que se confirma) sobre `eclipse-temurin:21-jre-alpine`, usuario `auth_app`, clave RS256 desechable |
| Gateway | imagen entregada `synkro-dev-synkro-api-gateway:latest`, sin cambios |
| Host | imagen entregada `synkro-dev-host:latest`, sin cambios (entradas relativas, proxy `/api/`) |
| Auth Portal | `dist` de esta rama (`VITE_BASE_PATH=/remotes/auth/`, shell en el origen del Host de prueba) servido por `nginx:1.27-alpine` con `deploy/nginx.conf` |
| Inyector de fallos | proxy Node mínimo entre Gateway y Auth API, de un solo uso por petición `POST …/password-reset`: `drop-before` (no llega a la API) y `drop-after` (la API confirma y la respuesta se pierde). Registra método, ruta, clave y estado; nunca cuerpos ni credenciales |

ADMIN inicial creado con la CLI auditada (`InitialAdminCli`); cuatro usuarios no ADMIN, un ADMIN adicional y un usuario
inactivo, todos **sintéticos y desechables** (`acc-*@example.test`), creados por la UI (uno) y por la API (el resto). No se
restableció ninguna cuenta existente.

Navegador real (panel integrado de la app de escritorio), Host en `http://localhost:15173`:

| # | Comprobación | Resultado |
| --- | --- | --- |
| A | Login público | un solo botón, sin enlaces ni texto de recuperación; sin claves de almacenamiento |
| B | Directorio con 7 usuarios | 4 botones de restablecer (solo activos no ADMIN); ninguno para los 2 ADMIN ni el inactivo |
| C | Contraseñas distintas | bloqueado en el cliente, 0 peticiones; error accesible en «Confirmar contraseña» |
| D | Flujo feliz (usuario 1) | formulario → confirmación → `Restableciendo…` → `POST` 200; fila de auditoría `SUCCESS` (actor, destino, correlación, sin contraseña); su refresh quedó `active=false`; la contraseña anterior responde 401 y la nueva 200; el token de acceso previo sigue válido (403 por no ser ADMIN) hasta expirar; el refresh previo responde 401 |
| E | Respuesta perdida **tras** el commit (usuario 2) | el navegador recibe 503, la BD ya tenía la fila `SUCCESS`; el Portal dice «No se pudo confirmar el resultado.»; el reintento manual reenvía la misma clave (dos entradas con la misma clave en el proxy), responde 200 con el **mismo** `passwordResetAt`; **una** fila de auditoría para la clave |
| F | Fallo **antes** del commit (usuario 3) | la petición no llega a la API (0 filas, contraseña original sigue válida); el reintento con la misma clave la aplica una vez y revoca la sesión abierta entretanto |
| G | Descartar (usuario 4) | texto de descarte, sin campos ni contraseña en DOM/almacenamiento; la verdad del backend era «aplicado» (la contraseña antigua ya no entra), por eso el Portal no afirma lo contrario; el aviso de bloqueo desaparece al descartar |
| H | Recarga con intento sin resolver | sin panel, sin reintento, sin rastro en almacenamiento (límite declarado) |
| I | Elegir a otra persona con un intento sin resolver | el panel conserva al primer destinatario y muestra el aviso |
| J | 375 px de ancho | el panel no desborda y no hay scroll horizontal |

Comprobaciones de API por el Gateway real: reintento de la misma clave **tras** que el destinatario iniciara otra sesión
→ 200 con el mismo instante y esa sesión **no** se revoca; misma clave con otra contraseña u otro destino → 422 sobre
`Idempotency-Key`; actor no ADMIN → 403; sin token → 401; sin `Idempotency-Key`, confirmación distinta, contraseña corta e
id mal formado → 400; el propio ADMIN, otro ADMIN e inactivo → 422; id desconocido → 404; cuatro peticiones paralelas con la
misma clave → todas 200 y **una** sola fila de auditoría; otro ADMIN con la misma clave obtiene su propio registro (la
clave está ligada al actor).

Secretos: ningún log de Auth API, Gateway, Host, Portal ni proxy, ni el volcado de la tabla de auditoría, contiene una
contraseña usada ni un hash bcrypt; el DOM, el almacenamiento y las URL tras éxito/descarte/recarga tampoco.

### Límites reales

- El `dist` del Portal y el JAR de la API se construyeron en la estación (mismo lockfile y mismo árbol), no con
  `docker build`; Host y Gateway son las imágenes ya entregadas, no se reconstruyeron.
- El inyector de fallos es instrumentación de prueba: simula la pérdida de respuesta, no una caída real de red.
- Un hallazgo (el aviso de bloqueo seguía visible tras descartar) se corrigió durante la aceptación con dos pruebas
  nuevas; las ejecuciones D–F se hicieron antes de ese cambio y G–J después. Solo afecta al aviso.
- El borrado del intento al cerrar sesión se verifica con el doble de `shell/session` en pruebas; en el navegador real se
  verificó que tras recargar no queda rastro. No se hizo prueba manual solo con teclado ni con lector de pantalla.
- Fuera de alcance de esta aceptación: Customers, Sales, Products, Workflow, Worker y Mongo.
