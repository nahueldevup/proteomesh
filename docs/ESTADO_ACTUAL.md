# Estado actual de ProteoMesh

| Campo | Valor |
|---|---|
| Fecha de corte | 2026-10-22 |
| Commit de referencia | `b7d900f`; fix C5 `a01586e`; smoke test F0.5 en `main` |
| Baseline | Android 13 / API 33 |
| Imagen | `proteomesh:latest` (`sha256:5cc1c1f9c61463131075154a6d51ec7e948df410e9a53fc4e50aa185db2800af`); rollback `proteomesh:pre-f05` (`sha256:558f46f38ca78213d43220e54f9c301a719e39526a7e1024c10048be44b77759`) |
| Estado del repo | `main`; F0.5 cerrada; evidencia en `tests/results/f05-main/` y `tests/results/f05-live/` |
| Próximo hito | Fase 1 — contrato de bundle |

> Este documento es la fuente operativa de verdad. Si contradice a otro documento del repo, vale este archivo. La verdad arquitectónica decidida vive en el ADR-001 y sus afirmaciones verificadas `C1-C20`.

## 1. Qué está validado hoy

- **Pixelscan en `f05-main`:** **100/100 Low Risk** sobre el `data-clean` original; captura 1080x2340 y override `1080x2340 @450`.
- **Root Detection Plus en `f05-main`:** **0/39** (`0/9`, `0/7`, `0/3`, `0/13`, `0/5`, `0/2`) sin paywall. RDP ya estaba instalado y licenciado en `data-clean`; no se agregó una cuenta nueva. La antigua excepción del clon quedó obsoleta.
- **Evidencia:** `tests/results/f05-main/` (Pixelscan, RDP top/bottom, XML y hashes) y `tests/results/f05-live/` como evidencia histórica del clon. C13 sigue parcial por falta de CI.
- **C5 validado en vivo:** `sync-scope` usa `su -c` para la DenyList, reintenta tras reinicio y `apply_runtime_defaults` restaura y **verifica** `wm size/density`, paquetes desactivados y BG processes. `net.pixelscan.check` queda en scope y DenyList.
- **Stack verificado:** Magisk 30.6 bootless, LSPosed 1.9.2, NoHello v0.0.7, `libpixel_hw.so` 64/32, `FakeWifiPixel.apk`, `manage-spoof`.
- **Entrega de perfil:** `instance_manager.py create` escribe `instances/<name>/profile.json` y lo monta read-only en `/system/etc/proteomesh_profile.json`; `/system/bin/profile-loader apply` lo consume. (C8/C9, confirmados.)
- **Catálogo:** 17 plantillas en `templates/` y 3 carriers en `carriers/`; todas parsean.
- **Instancias existentes:** `f05-main` corriendo en `5601` (contenedor `3e4383faa391`); `hide-test` sin contenedor pero con data persistente; `inst-note13`, `verify-a54` y `v-gale` conservan sus datos. El clon `f05-live` y su copia parcial fueron eliminados.
- **`data-clean`:** original intacto (`mtime=2026-10-10 07:31:33.117736806 -0300`); NoHello y RDP licenciado ya aprovisionados; sin cuentas en `accounts_ce.db`/`accounts_de.db`; sin `persistent_properties` ni `persist.sys.fake.*`. El clon parcial que tenía 8 fuentes fscrypt faltantes ya no existe.

## 2. Qué no está resuelto

| Tema | Evidencia | Consecuencia |
|---|---|---|
| La imagen **no es model-agnostic** | `docs/INVENTARIO_IMAGEN.md`; C19 | La imagen hornea 17 templates, Pixel 5 por defecto y defaults Pixel 5 en scripts, `profile-loader` y APK. |
| Reproducibilidad desde cero | C2, C15, C17 | El smoke test final usa el `data-clean` original, pero no se regenera desde cero; `data-clean/` e `instances/*/data/` siguen ignorados. Queda para F4. |
| `docker-compose.yml` no es canónico | C17 | **Mitigado en F0.5:** compose quedó como `legacy`, exige `PROTEOMESH_DATA`/`PROTEOMESH_PROFILE` y `tools/compose_up_safe.sh` valida `generated_identity` y rechaza `data-clean`. El camino canónico sigue siendo el manager. |
| `--name` sin validar | C18 | **Corregido en F0.5:** `instance_manager.py` valida `^[a-z0-9][a-z0-9_-]{0,62}$` en create/start/stop y usa `shlex.quote`. |
| Magisk del script no coincide | C20 | **Corregido en F0.5:** `prepare-magisk.sh` usa `modules.lock`/`deps_fetch.py` para Magisk 30.6 y conserva el `magisk` parcheado salvo `--force-raw`. |
| Apps instaladas post-boot | C5 | **Corregido y validado en vivo:** `sync-scope` consulta la DenyList con `su -c`, reintenta hasta 15×2s tras reiniciar y `apply_runtime_defaults` restaura `wm size/density` y paquetes desactivados. |
| Evidencia on-device y CI | C13, C14 | Evidencia versionada en `c3cfeb6` y en el commit del smoke test; hay tests host-side de nombres, pero no CI ni validación automática 100/100/0/39. |
| Docs históricas contradictorias | C12, F0.5 | **Corregido en F0.5:** README, guías, arquitectura y tabla de bitácora dicen 100/100; los documentos históricos llevan banner. |
| Procesos de root visibles | Auditoría previa | NoHello oculta mounts, no procesos (`magiskd`, `lspd`, `zygiskd`); no hay detector que lo explote hoy, pero es una fuga de diseño. |
| DenyList enforcement | Validaciones previas | Debe quedar **OFF**; activarlo rompe GMS. No es un bug, es una restricción operativa. |
| Sin proxy / sin límites finos | Auditoría previa | Todas las instancias comparten IP de host; el manager no aplica `--memory`, `--cpuset` ni `--pids-limit` por instancia. |
| Sin licencia | C14 | No hay `LICENSE` en el repo. NoHello ya tiene licencia MIT confirmada; falta la del proyecto. |

**Nota de cierre de F0.5 (2026-10-22):** la antigua limitación de licencia RDP quedó resuelta en `f05-main`; el 0/39 se ejecutó sobre el `data-clean` original. La reproducibilidad desde cero y la copia bit-a-bit de `data-clean` siguen fuera de F0.5 y quedan para F4.

## 3. Flujo canónico

1. `bash src/libpixel_hw/build.sh` y `bash src/lsposed_module/build_apk.sh`.
2. `DOCKER_BUILDKIT=1 docker build -t proteomesh:latest .`
3. `python3 tools/instance_manager.py create --name <id> --template <marca/modelo> --carrier <carrier> --port <puerto> --start`
4. El contenedor monta `instances/<id>/profile.json:ro` en `/system/etc/proteomesh_profile.json`.
5. En boot, `/system/bin/profile-loader apply` lee ese archivo y aplica el perfil.
6. En boot, `manage-spoof sync` agrega apps de usuario a DenyList + scope. Para apps instaladas después, ejecutar `sync-scope` (C5); el manager reaplica los overrides de pantalla/paquetes tras el reinicio.
7. Validar con Pixelscan y Root Detection Plus. En `data-clean`, RDP ya está instalado y licenciado; se ejecuta sin paywall en instancias nuevas.

**`docker-compose.yml` es legacy, no canónico.** Solo usar `tools/compose_up_safe.sh` con una instancia creada por el manager; el camino normal es `create`/`start`.

## 4. Mapa de documentos

| Documento | Estado | Rol |
|---|---|---|
| `README.md` | Vigente | Visión, resultados actuales y guía rápida. |
| `docs/ESTADO_ACTUAL.md` | Vigente | Fuente operativa de verdad (este archivo). |
| `docs/INVENTARIO_IMAGEN.md` | Vigente | Inventario de la imagen madre (F0.1). |
| `docs/ARQUITECTURA.md` | Vigente con secciones históricas | Detalle técnico por capa; métrica 100/100 corregida. |
| `docs/BITACORA_Y_ESTADO.md` | Vigente con secciones históricas | Cronología y detalle por subsistema. Las entradas viejas de 75/100 son historia, no estado. |
| `docs/GUIA_DE_REPRODUCCION.md` | Vigente | Requisitos, build, dependencias y operación; CLI y métrica 100/100 corregidas. |
| `docs/GUIA_DE_REPLICACION_ANTIROOT.md` | Operativa | Réplica del blindaje; usa `modules.lock` y `bootstrap_data_clean.sh`, sin depender de `hide-test`. |
| `docs/IDEA.md`, `docs/INFORME_TECNICO_Y_REPRODUCCION.md`, `docs/INFORME_SESION_DROIDGUARD_Y_CONTEXTO.md` | Históricos | Objetivo Android 14/Play Integrity original. Baseline actual Android 13. |
| `contexto_explicativo_de_referencia.md` | Histórico con auditoría | Las 7 fugas eran ciertas en su momento; varias ya se resolvieron. |
| `docs/HERMES_REPORTES_GUIDE.md` | Histórico | Scripts locales de otra sesión; no es parte del flujo actual. |

## 5. Fases

- **F0 — Inventario y verificación:** completada al 2026-10-22 (`docs/INVENTARIO_IMAGEN.md`, C1-C20 documentados).
- **F0.5 — Verdad documental y reproducibilidad:** **cerrada el 2026-10-22.** Incluye docs, `modules.lock`, `deps_fetch`, `bootstrap_data_clean`, Magisk 30.6, validación de `--name`, guardrail de compose, `sync-scope`, imagen nueva, el fix de overrides `a01586e` y el smoke test `f05-main`: Pixelscan 100/100 y RDP 0/39 sobre `data-clean`. La reproducibilidad desde cero queda para F4.
- **F1 — Contrato de bundle:** perfil obligatorio, sin fallback, fallo explícito en `create`/`start`.
- **F1.5 — Model-agnostic:** sacar defaults Pixel 5 de la imagen.
- **F2 — Renderizador:** `proteomesh render` puro con schema y golden files.
- **F3 — Manager:** `--from-bundle`, validación, límites, evidencia post-arranque.
- **F4 — Dependencias:** completar `modules.lock` (redroid_base/LSPosed), `data-clean` reproducible end-to-end y guía sin `hide-test`.

## 6. Regla de uso

- Ninguna frase se cita como hecho sin su ID (`C1-C20`) y su estado (`CONFIRMADO`, `REFUTADO`, `PARCIAL`).
- Pixelscan 100/100 y RDP 0/39 fueron re-ejecutados en `f05-main` sobre el `data-clean` original; la antigua excepción de licencia RDP ya no aplica.
- F0.5 está cerrada; F1 puede iniciar sin heredar la deuda de RDP. La reproducibilidad desde cero sigue en F4.
