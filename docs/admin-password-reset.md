# HU-AUTH-19 — Restablecer la contraseña de un usuario (Auth Portal)

Un ADMIN restablece la contraseña de otro usuario desde la administración de **Usuarios**, ya autenticado. No existe
recuperación pública: la pantalla de login no cambia (hay una prueba de regresión que lo exige).

Referencias: HU `code-corhuila/synkro-docs#306`, HU-ARQ `#309`, ADR-021 (**Accepted**, revisión `a7004cf` en el PR
`synkro-docs#310`; la aceptación es de la decisión, no de este código ni de su revisión). Dependencias de integración:
`synkro-auth-db` (V018–V026, PR #27) → `synkro-auth-api` (PR #44) → este Portal.

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
7. **422 sobre `Idempotency-Key`** (ADR-021 Decisión 2): la API conserva un recibo privado 24 horas. Pasado ese tiempo
   (o si la limpieza lo retiró), o si la clave se usó con otra solicitud, el mismo reintento recibe 422 y la API no
   ejecuta nada. El Portal dice que el intento ya no se reconoce como la solicitud original, que esta vez no se repitió
   ningún cambio y que **el restablecimiento original puede haberse aplicado** (nunca afirma que no ocurrió). No reenvía
   ni genera otra clave por sí solo. Ofrece «Cerrar» o **«Iniciar un restablecimiento nuevo»**: abandona el intento y
   reabre el formulario vacío; una operación nueva exige escribir la contraseña de nuevo, pasar por la confirmación y se
   envía con una clave nueva.

Un intento sin resolver se muestra al volver a Usuarios dentro de la misma sesión y **bloquea elegir a otra persona**
hasta reenviarlo o descartarlo (aviso visible mientras dure).

## Intención en RAM

`passwordResetIntent.ts` guarda `{clave, destinatario, solicitud}` solo en memoria del módulo, ligada al `sub` y al
`sessionId` del Host. Se retira al cambiar la identidad (logout, nueva sesión, otro rol), al terminar con respuesta
definitiva, al descartar y al tener éxito. Nunca toca `localStorage`, `sessionStorage`, la URL, logs ni consola (pruebas).
**Límite declarado a la persona:** tras recargar o cerrar sesión el Portal no puede confirmar ni reenviar el intento; un
nuevo restablecimiento exige una confirmación nueva y una clave nueva.

## Verificación automatizada

`npm test` (204 pruebas, 21 archivos), `npm run build`, `npm run lint`, `npm run check:production-build` y
`npm run coverage` (93 % de sentencias) pasan. Las pruebas nuevas se escribieron en rojo primero: API
(`usersApi.test.ts`), política (`passwordPolicy.test.ts`), intención (`passwordResetIntent.test.ts`), copy
(`errors.test.ts`), panel (`ResetPasswordPanel.test.tsx`), puntos de entrada (`UserDirectory.test.tsx`,
`UserLookup.test.tsx`), página (`UsersPage.test.tsx`) y la regresión de login (`Login.test.tsx`). Las pruebas con el
cliente y la sesión del Host usan los dobles de `src/test-doubles`; **no se presentan como aceptación real**.

## Aceptación real (2026-11-11)

Composición propia y desechable en una red Docker propia (`auth19-net`); no se tocó ningún recurso `synkro-dev-*` ni la
base compartida. El candado `~/.synkro-operations` estaba vacío y no se adquirió (no se usó la CLI de operaciones de
Infra). Las ejecuciones fueron secuenciales. **Los artefactos propios se construyeron con los Dockerfiles versionados**,
desde `git archive` del commit (no desde `dist` ni JAR locales).

| Pieza | Origen |
| --- | --- |
| PostgreSQL 16.6 (`postgres:16.6-alpine`), base `synkro_auth_acc` | contenedor propio; Flyway 11.20.3 aplicó 26 migraciones de `synkro-auth-db` @ `8b9b2c4` (V022–V026: recibo, permisos, función de limpieza) |
| Auth API | imagen `auth19-final/auth-api:8b81276` (`sha256:782d876f…`), `docker build -f deploy/Dockerfile` del commit `8b81276` de `synkro-auth-api`, rol `auth_app`, clave RS256 desechable |
| Gateway | imagen entregada `synkro-dev-synkro-api-gateway:latest` (`sha256:f41b60d9…`), sin reconstruir |
| Host | imagen entregada `synkro-dev-host:latest` (`sha256:192e460c…`), sin reconstruir |
| Auth Portal | imagen `auth19-final/auth-portal:fb2f88e` (`sha256:18e3fb1f…`), `docker build -f deploy/Dockerfile` del commit `fb2f88e` con `VITE_SHELL_ENTRY_URL` del Host de prueba; el build ejecutó `check:production-build` |
| Inyector de fallos | proxy Node de un solo uso por petición `POST …/password-reset` entre Gateway y Auth API: `drop-before` y `drop-after`. Registra método, ruta, clave y estado; nunca cuerpos ni credenciales |
| Acceso directo a la API | reenvío TCP a la imagen de Auth API para los logins de verificación, porque el Gateway limita el login a 1/min (ráfaga 5); reset, registro, refresh y todo el navegador pasan por el Gateway |

ADMIN inicial con la CLI auditada (`InitialAdminCli`, de la imagen); el resto de cuentas (un ADMIN adicional, cinco usuarios de
la UI y cinco de los guiones) son **sintéticas y desechables** (`acc-*@example.test`). No se restableció ninguna cuenta
existente.

**Por la API (Gateway real y Auth API de la imagen): 53 comprobaciones, 0 fallos.**

| Bloque | Resultado |
| --- | --- |
| A. K1 fija A, K2 fija B | K1+A responde 200 con el mismo `passwordResetAt` original; A no se restaura (login con A: 401); B sigue vigente; la sesión abierta tras B no se revoca; K1+B y K1 con otro destino: 422 sobre `Idempotency-Key`; 2 auditorías y 2 recibos; `expires_at` ≈ 24 h |
| B. Recibo vencido | K3+C tras vencer: 422 sobre la clave; no se re-ejecuta (C sigue vigente, 1 auditoría); otra contraseña con K3: 422; una clave nueva es una operación nueva |
| C. Limpieza | `purge_expired_password_reset_receipts` borra solo el recibo vencido; la auditoría y la clave consumida permanecen (la clave sigue dando 422); el recibo vigente permanece y se repite con 200 |
| D1. Login primero | el login verificó la contraseña y quedó en la cola del bloqueo, el reset se encola después: el login guarda 1 refresh y el reset lo revoca; ese refresh ya no rota; login con la nueva contraseña: 200 |
| D2. Reset primero | el reset ocupa la cola, el login verificó la contraseña vieja y espera detrás: 401 genérico, sin tokens, sin fila de refresh nueva; la contraseña nueva entra y la vieja no |

El orden de D1 y D2 lo fija la cola del bloqueo consultativo por usuario, observada en `pg_locks` (un bloqueo mantenido
por una sesión de prueba y esperas contadas por la base), sin esperas por tiempo.

**En navegador real (panel integrado), Host en `http://localhost:15173`, por el Gateway:**

| # | Comprobación | Resultado |
| --- | --- | --- |
| 1 | Flujo feliz (usuario 1) | formulario → confirmación → `POST` 200; 1 auditoría `SUCCESS`, 1 recibo, refresh del destinatario `active=false`; contraseña vieja 401, nueva 200 |
| 2 | Respuesta perdida tras el commit (usuario 2) | «No se pudo confirmar el resultado.»; el reintento manual reenvía la misma clave y responde 200 (repetición por recibo); sigue habiendo **una** auditoría; la contraseña nueva entra |
| 3 | Recibo vencido tras un resultado incierto (usuario 3) | el recibo se venció por SQL de administrador; el reintento recibe 422 sobre la clave. El panel muestra el texto de la Decisión 2: no se reconoce como la solicitud original, no se repitió ningún cambio, el original puede haberse aplicado. El proxy registró **una** petición más y ninguna automática; la contraseña del primer intento seguía vigente |
| 4 | Nueva operación tras el 422 | «Iniciar un restablecimiento nuevo» reabre el formulario con campos vacíos; hasta confirmar no hay petición; se envía con una clave distinta, 200, y esa contraseña queda vigente (la del primer intento ya no) |
| 5 | Fallo antes del commit (usuario 4) | la petición no llega a la API (0 auditorías; la contraseña original sigue válida); panel de resultado incierto |
| 6 | Cierre de sesión con el intento sin resolver | `/auth/logout` 200; tras salir no hay panel, ni contraseñas en el DOM, y el almacenamiento queda vacío |
| 7 | Recuperación | tras iniciar sesión de nuevo el Portal no retoma el intento (sin panel ni aviso de bloqueo); un restablecimiento nuevo del mismo usuario con clave nueva responde 200 y la contraseña nueva entra; la clave del intento perdido no se reutilizó |
| 8 | 375 px de ancho | sin desbordamiento horizontal |

Secretos: ningún log de Auth API, Gateway, Host, Portal ni proxy contiene una contraseña usada, un hash bcrypt ni un JWT; la
auditoría no contiene hashes; el DOM y el almacenamiento tras salir no contienen contraseñas; ninguna URL las lleva. Las
claves `synkro_refresh` y `synkro_session` de `sessionStorage` son de la sesión del propio Host (no del Portal) y no
contienen contraseñas.

### Límites reales

- Host y Gateway son las imágenes ya entregadas (`synkro-dev-*`), no se reconstruyeron con sus Dockerfiles; el Portal y
  la Auth API sí se construyeron con los suyos. La imagen del Portal se construyó del commit `fb2f88e`; este archivo se
  confirma después en un commit solo de documentación.
- El inyector de fallos es instrumentación de prueba: simula la pérdida de respuesta, no una caída real de red. El
  vencimiento del recibo se simuló moviendo `expires_at` con el rol administrador de la base desechable; no se esperaron
  24 horas.
- Los logins de verificación de los guiones fueron directos a la API porque el Gateway los limita; el login del navegador
  sí pasó por el Gateway.
- El orden login/reset se fijó con la cola del bloqueo; no se afirma haber reproducido una carrera espontánea.
- No se hizo prueba manual solo con teclado ni con lector de pantalla.
- Fuera de alcance de esta aceptación: Customers, Sales, Products, Workflow, Worker y Mongo.
