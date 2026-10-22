# Estado actual de ProteoMesh

| Campo | Valor |
|---|---|
| Fecha de corte | 2026-10-22 |
| Commit de referencia | `b7d900f` |
| Baseline | Android 13 / API 33 |
| Imagen | `proteomesh:latest` (`sha256:5cc1c1f9c61463131075154a6d51ec7e948df410e9a53fc4e50aa185db2800af`); rollback `proteomesh:pre-f05` (`sha256:558f46f38ca78213d43220e54f9c301a719e39526a7e1024c10048be44b77759`) |
| Estado del repo | `main` con cambios F0.5 sin commit; evidencia local en `tests/results/f05-live/` sin commit |
| Próximo hito | Fase 1 — contrato de bundle (F0.5 cerrada con excepción RDP licenciada) |

> Este documento es la fuente operativa de verdad. Si contradice a otro documento del repo, vale este archivo. La verdad arquitectónica decidida vive en el ADR-001 y sus afirmaciones verificadas `C1-C20`.

## 1. Qué está validado hoy

- **Pixelscan en clon limpio:** **100/100 Low Risk** en `f05-live` (clon `redroid-f05-clean`), incluso tras `sync-scope` y reinicio. Override final `1080x2340 @450`.
- **Root Detection Plus:** **0/39** reproducible en `hide-test` con licencia Play; **no** está validado en el clon limpio por el bloqueo PairIP/Play Pass. `f05-live` no deja RDP instalado.
- **Evidencia:** `tests/results/f05-live/` con capturas, XML y logs; resumen en `tests/results/f05-live/RESUMEN.md`. Está local y sin commit (C13 parcialmente atendido).
- **C5 validado en vivo:** `sync-scope` usa `su -c` para la DenyList, reintenta tras reinicio y `apply_runtime_defaults` restaura `wm size/density`, paquetes desactivados y BG processes. `net.pixelscan.check` queda en scope y DenyList.
- **Stack verificado:** Magisk 30.6 bootless, LSPosed 1.9.2, NoHello v0.0.7, `libpixel_hw.so` 64/32, `FakeWifiPixel.apk`, `manage-spoof`.
- **Entrega de perfil:** `instance_manager.py create` escribe `instances/<name>/profile.json` y lo monta read-only en `/system/etc/proteomesh_profile.json`; `/system/bin/profile-loader apply` lo consume. (C8/C9, confirmados.)
- **Catálogo:** 17 plantillas en `templates/` y 3 carriers en `carriers/`; todas parsean.
- **Instancias existentes:** `f05-live` corriendo en `5601` (contenedor `9302c8678812`); `hide-test` sin contenedor pero con data persistente; `inst-note13`, `verify-a54` y `v-gale` conservan sus datos. No hay otros contenedores corriendo.
- **`data-clean`:** original intacto (`mtime=2026-10-10 07:31:33.117736806 -0300`); NoHello aprovisionado; sin cuentas en `accounts_ce.db`/`accounts_de.db`; sin `persistent_properties` ni `persist.sys.fake.*`. La copia al clon quedó funcional salvo 8 fuentes fscrypt (`GoogleSans*`, `NotoColorEmoji.ttf`).

## 2. Qué no está resuelto

| Tema | Evidencia | Consecuencia |
|---|---|---|
| La imagen **no es model-agnostic** | `docs/INVENTARIO_IMAGEN.md`; C19 | La imagen hornea 17 templates, Pixel 5 por defecto y defaults Pixel 5 en scripts, `profile-loader` y APK. |
| Reproducibilidad desde cero | C2, C15, C17 | El clon limpio se probó desde el repo + copia de `data-clean`, no desde cero; `data-clean/` e `instances/*/data/` siguen ignorados. La copia del clon no es bit-a-bit: faltan 8 fuentes fscrypt. |
| `docker-compose.yml` no es canónico | C17 | **Mitigado en F0.5:** compose quedó como `legacy`, exige `PROTEOMESH_DATA`/`PROTEOMESH_PROFILE` y `tools/compose_up_safe.sh` valida `generated_identity` y rechaza `data-clean`. El camino canónico sigue siendo el manager. |
| `--name` sin validar | C18 | **Corregido en F0.5:** `instance_manager.py` valida `^[a-z0-9][a-z0-9_-]{0,62}$` en create/start/stop y usa `shlex.quote`. |
| Magisk del script no coincide | C20 | **Corregido en F0.5:** `prepare-magisk.sh` usa `modules.lock`/`deps_fetch.py` para Magisk 30.6 y conserva el `magisk` parcheado salvo `--force-raw`. |
| Apps instaladas post-boot | C5 | **Corregido y validado en vivo:** `sync-scope` consulta la DenyList con `su -c`, reintenta hasta 15×2s tras reiniciar y `apply_runtime_defaults` restaura `wm size/density` y paquetes desactivados. |
| RDP en clon limpio | F0.5 | **Excepción aceptada (2026-10-22):** PairIP exige licencia Play Pass; el 0/39 se acepta desde `hide-test` licenciado. Copiar app data, Vending y GMS/GSF no alcanza; no se declara RDP limpio en clon sin cuenta. |
| Evidencia on-device y CI | C13, C14 | Evidencia local en `tests/results/f05-live/` (untracked); hay tests host-side de nombres, pero no CI ni validación automática 100/100/0/39. |
| Docs históricas contradictorias | C12, F0.5 | **Corregido en F0.5:** README, guías, arquitectura y tabla de bitácora dicen 100/100; los documentos históricos llevan banner. |
| Procesos de root visibles | Auditoría previa | NoHello oculta mounts, no procesos (`magiskd`, `lspd`, `zygiskd`); no hay detector que lo explote hoy, pero es una fuga de diseño. |
| DenyList enforcement | Validaciones previas | Debe quedar **OFF**; activarlo rompe GMS. No es un bug, es una restricción operativa. |
| Sin proxy / sin límites finos | Auditoría previa | Todas las instancias comparten IP de host; el manager no aplica `--memory`, `--cpuset` ni `--pids-limit` por instancia. |
| Sin licencia | C14 | No hay `LICENSE` en el repo. NoHello ya tiene licencia MIT confirmada; falta la del proyecto. |

**Limitaciones aceptadas al cierre de F0.5 (2026-10-22):** RDP se valida en `hide-test` con licencia Play, no en un clon limpio sin cuenta; la copia de `data-clean` al clon no es bit-a-bit por 8 fuentes fscrypt. Ninguna de las dos afecta el 100/100 de Pixelscan ni la operación de `f05-live`, pero deben declararse al citar resultados.

## 3. Flujo canónico

1. `bash src/libpixel_hw/build.sh` y `bash src/lsposed_module/build_apk.sh`.
2. `DOCKER_BUILDKIT=1 docker build -t proteomesh:latest .`
3. `python3 tools/instance_manager.py create --name <id> --template <marca/modelo> --carrier <carrier> --port <puerto> --start`
4. El contenedor monta `instances/<id>/profile.json:ro` en `/system/etc/proteomesh_profile.json`.
5. En boot, `/system/bin/profile-loader apply` lee ese archivo y aplica el perfil.
6. En boot, `manage-spoof sync` agrega apps de usuario a DenyList + scope. Para apps instaladas después, ejecutar `sync-scope` (C5); el manager reaplica los overrides de pantalla/paquetes tras el reinicio.
7. Validar con Pixelscan y Root Detection Plus. RDP requiere una instancia con licencia Play; el clon limpio sin cuenta no puede ejecutarlo.

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
- **F0.5 — Verdad documental y reproducibilidad:** **cerrada operativamente el 2026-10-22** con excepción RDP licenciada y copia `data-clean` no bit-a-bit (8 fuentes fscrypt). Incluye docs, `modules.lock`, `deps_fetch`, `bootstrap_data_clean`, Magisk 30.6, validación de `--name`, guardrail de compose, `sync-scope`, imagen nueva, `f05-live` y evidencia local. El commit de evidencia se hace al cerrar esta sesión.
- **F1 — Contrato de bundle:** perfil obligatorio, sin fallback, fallo explícito en `create`/`start`.
- **F1.5 — Model-agnostic:** sacar defaults Pixel 5 de la imagen.
- **F2 — Renderizador:** `proteomesh render` puro con schema y golden files.
- **F3 — Manager:** `--from-bundle`, validación, límites, evidencia post-arranque.
- **F4 — Dependencias:** completar `modules.lock` (redroid_base/LSPosed), `data-clean` reproducible end-to-end y guía sin `hide-test`.

## 6. Regla de uso

- Ninguna frase se cita como hecho sin su ID (`C1-C20`) y su estado (`CONFIRMADO`, `REFUTADO`, `PARCIAL`).
- Pixelscan 100/100 fue re-ejecutado en `f05-live` (clon limpio). RDP 0/39 fue re-ejecutado solo en `hide-test` con licencia; no se declara RDP limpio en clon sin cuenta.
- F0.5 está cerrada con esa excepción declarada; F1 puede iniciar sin heredar la deuda de RDP.
