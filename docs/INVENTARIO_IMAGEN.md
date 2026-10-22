# Inventario de la imagen madre — Fase 0.1

| Campo | Valor |
|---|---|
| Fecha | 2026-10-22 |
| Commit de referencia | `b7d900f` |
| Imagen | `proteomesh:latest` |
| Image ID | `sha256:5cc1c1f9c61463131075154a6d51ec7e948df410e9a53fc4e50aa185db2800af` |
| Rollback | `proteomesh:pre-f05` (`sha256:558f46f38ca78213d43220e54f9c301a719e39526a7e1024c10048be44b77759`) |
| Tamaño | 3,669,396,754 bytes (~3.67 GB) |
| Creada | 2026-10-21T10:24:05-03:00 |

## 1. Método

Se inspeccionó la imagen sin arrancar una instancia:

```bash
docker image inspect proteomesh:latest
cid=$(docker create proteomesh:latest)
docker cp "$cid:/system/etc/proteomesh_profile.json" /tmp/opencode/image-inspect/profile.json
docker cp "$cid:/system/etc/proteomesh" /tmp/opencode/image-inspect/proteomesh
docker cp "$cid:/system/bin" /tmp/opencode/image-inspect/bin
docker rm "$cid"
```

Luego se contrastó con las fuentes del repo (`Dockerfile`, `build_magisk/`, `src/`, `docker-compose.yml`). El objetivo es identificar **todo lo que la imagen contiene y menciona un modelo concreto**, para planificar F1/F1.5 sin romper el arranque.

## 2. Resultado ejecutivo

La imagen **no es hoy una imagen madre model-agnostic**. Contiene:

1. Un perfil Pixel 5 como `/system/etc/proteomesh_profile.json`.
2. Las 17 plantillas dentro de `/system/etc/proteomesh/templates/`.
3. Fallbacks Pixel 5 en tres scripts de runtime (`mask-early.sh`, `apply-props.sh`, `set-device-profile`).
4. Defaults Pixel 5 compilados en `profile-loader` y el módulo LSPosed; `libpixel_hw` conserva un fallback numérico de 8 GB y un comentario que lo asocia a Pixel 5.
5. Un XML de permisos de hardware con especificación Pixel 5.
6. Los strings Pixel 5 también están compilados en `/system/bin/profile-loader` y en `classes.dex` de `FakeWifiPixel.apk`, no solo en las fuentes.

Esto no invalida el enfoque de “runtime + data”, pero sí confirma que **P1 no se cumple** y que F1.5 es un refactor real, no un borrado de una línea.

## 3. Inventario por artefacto

### 3.1 Build e imagen

| Archivo | Qué contiene | Evidencia | Riesgo |
|---|---|---|---|
| `Dockerfile` | Copia **todas** las plantillas a `/system/etc/proteomesh/templates` y Pixel 5 como perfil por defecto. | `Dockerfile:13-14` | La imagen es un catálogo de modelos; un agente puede creer que el perfil por defecto es el activo. |
| `docker-compose.yml` | Antes montaba el template crudo y `data-clean` escribible; **ahora es legacy** y exige variables + perfil con `generated_identity`. | `docker-compose.yml:16-17`; `tools/compose_up_safe.sh` | C17 mitigado en F0.5; el camino canónico es el manager. |
| `prepare-magisk.sh` | Descarga Magisk 30.6 vía `tools/deps_fetch.py`; conserva el `magisk` parcheado salvo `--force-raw`. | `prepare-magisk.sh:25-48` | C20 corregido en F0.5; no se ejecutó para no alterar el árbol. |

### 3.2 Scripts de runtime

| Archivo | Qué contiene | Evidencia | Riesgo |
|---|---|---|---|
| `build_magisk/system/bin/mask-early.sh` | Fallback Pixel 5 si falta `profile-loader`; mocks Pixel 5 de mounts, cámara, sensores, `/proc/version`. | `:37-77`, `:183-192`, `:372-388`, `:428-547`, `:557-558` | Identidad temprana incoherente si falla el perfil; strings de modelo en la imagen. |
| `build_magisk/system/bin/apply-props.sh` | Fallback Pixel 5 para `BRAND`, `MODEL`, `PRODUCT`, `DEVICE`, `BOARD`, `HARDWARE`, `PLATFORM`, `BUILD_ID`, `FINGERPRINT`, `FLAVOR`, `DESCRIPTION`. | `:51-68` | Puede aplicar Pixel 5 sobre un perfil Samsung/Xiaomi si falta el bundle. |
| `build_magisk/system/bin/set-device-profile` | Defaults Pixel 5 (IMEI, MACs, IMSI, ICCID, TAC, serial). | `:11-21`, `:82`, `:100-128`, `:155` | Herramienta interactiva que refuerza el default Pixel 5; no debe ser el camino canónico. |

### 3.3 `profile-loader`

| Archivo | Qué contiene | Evidencia | Riesgo |
|---|---|---|---|
| `src/profile_loader/main.c` | Defaults de identidad (TAC, OUI, IMSI, ICCID, teléfono), hardware SM7250, nombre/modelo Pixel 5, fingerprint `redfin`, build ID `TQ3A`, GPU Adreno 620 y fallback de 8 GB. | `:224-230`, `:307-337`, `:399`, `:616`, `:663-667`, `:816-819`, `:864-885`, `:1092-1105`, `:1196`, `:1219`, `:1284-1286` | El binario puede “inventar” un Pixel 5 coherente sin bundle; eso enmascara errores de configuración. |
| `/system/bin/profile-loader` (binario en imagen) | Contiene strings `Pixel 5`, `redfin`, `sm7250`, `SM7250`, `35824011` y el fingerprint de `redfin`. | `strings /system/bin/profile-loader \| rg -i "Pixel 5\|redfin\|SM7250\|35824011"` | Confirma que el default no es solo fuente: viaja compilado en la imagen. |

### 3.4 Shim nativo

| Archivo | Qué contiene | Evidencia | Riesgo |
|---|---|---|---|
| `src/libpixel_hw/pixel_hw64.c` | Fallback de memoria de 8 GB; el comentario fuente lo asocia a Pixel 5. | `:541` | Menor: solo aplica si no hay `fake_proc/mem_total_kb`; no hay strings de modelo en el `.so`. |
| `src/libpixel_hw/pixel_hw32.c` | Mismo fallback numérico. | `:562` | Menor; no hay strings de modelo en el `.so`. |

El resto del shim es agnóstico: lee `/data/local/tmp/fake_proc/*` y variables de entorno, no se recompila por perfil.

### 3.5 Módulo LSPosed

| Archivo | Qué contiene | Evidencia | Riesgo |
|---|---|---|---|
| `src/lsposed_module/com/fakewifi/pixel/FakeWifiHook.java` | Fallbacks de IMEI, BT MAC, IMSI, ICCID, operadora y device (`redfin`, Pixel 5). | `:150`, `:228-248`, `:907-913`, `:936`, `:989-995`, `:2201` | Si `ProfileConfig` falla, la app ve Pixel 5 en lugar de fallar explícitamente. |
| `/system/etc/proteomesh/FakeWifiPixel.apk` (APK en imagen) | `classes.dex` contiene `Pixel 5`, `redfin`, `sm7250`, `SM7250`, `35824011` y el fingerprint de `redfin`. | `unzip -p FakeWifiPixel.apk classes.dex \| strings \| rg -i "Pixel 5\|redfin\|SM7250"` | Confirma que los fallbacks Java viajan compilados en la imagen. |
| `src/lsposed_module/com/fakewifi/pixel/FakeSensors.java` | Fallback de 11 sensores Pixel 5/Google. | `:68`, `:94-102` | Sensores coherentes con Pixel 5 aunque el perfil sea otro. |
| `src/lsposed_module/com/fakewifi/pixel/FakeGps.java` | Fallback de SoC SM7250 en la descripción GNSS. | `:563` | Coordenada GNSS coherente con Pixel 5 aunque el perfil sea otro. |

### 3.6 Permisos y props base

| Archivo | Qué contiene | Evidencia | Riesgo |
|---|---|---|---|
| `build_magisk/vendor/etc/permissions/handheld_core_hardware.xml` | Comentarios y features de cámara/sensores Pixel 5. | `:17-34` | Strings de modelo en la imagen; features que pueden no coincidir con el template activo. |
| `build_magisk/system/build.prop` | Fingerprint `generic_x86_64` y build ID `TQ3A.230901.001.C2`. | `:15-16`, `:28-29`, `:58` | No es un modelo, pero es un residuo de build que debe inventariarse. |
| `build_magisk/vendor/build.prop` | Fingerprint `generic_x86_64` y build ID `TQ3A.230901.001.C2`. | `:15-16` | Mismo caso. |

### 3.7 Plantillas dentro de la imagen

La imagen contiene las 17 plantillas en `/system/etc/proteomesh/templates/`. Ejemplo verificado:

```text
/system/etc/proteomesh_profile.json
/system/etc/proteomesh/templates/google/pixel5_redfin.json
/system/etc/proteomesh/templates/samsung/a34x.json
...
```

Esto es útil para herramientas, pero contradice P1 si la imagen se distribuye como “runtime sin modelos”. En F1.5 hay que decidir:

- mover las plantillas a un volumen de datos/CLI, o
- mantenerlas en la imagen pero excluirlas del contrato P1 y documentarlo.

## 4. Qué NO es model-specific

- `libpixel_hw.so` 64/32 (salvo el fallback de memoria).
- `resetprop`.
- `apply-props.sh` en su lógica de DenyList/scope.
- `manage-spoof`.
- `profile-loader` en su lógica de parseo/aplicación (los defaults son el problema).
- Los stubs de tiendas y el módulo de hooks, salvo sus fallbacks.

## 5. Acciones propuestas

### F0.5 (docs/repro)

- Documentar que el perfil canónico es el que se monta en `/system/etc/proteomesh_profile.json`; el default de la imagen no es confiable.
- **Implementado:** `docker-compose.yml` quedó legacy con variables obligatorias y `tools/compose_up_safe.sh` exige perfil `generated_identity` y rechaza `data-clean`.
- **Implementado:** `prepare-magisk.sh` ya usa Magisk 30.6 y protege el binario parcheado; su ejecución real sigue pendiente de validación.
- **Validado en vivo:** imagen nueva (`5cc1c1f…`) probada en `f05-main` sobre el `data-clean` original: Pixelscan 100/100 y RDP 0/39, sin paywall ni excepción. La evidencia del clon `f05-live` es histórica. Ver `tests/results/f05-main/RESUMEN.md`.

### F1 (contrato)

- Validar en `create`/`start` que el perfil tenga `generated_identity` o seed; rechazar template crudo.
- Si falta el perfil, fallar en `create`/`start`; no bootloop.
- Mantener el mount actual; no hace falta copiar el bundle al volumen.

### F1.5 (model-agnostic)

- Quitar el fallback Pixel 5 de `mask-early.sh` y `apply-props.sh`.
- Reemplazar los defaults de `profile-loader`, `FakeWifiHook`, `FakeSensors`, `libpixel_hw` por valores explícitos del bundle o por error.
- Decidir si `set-device-profile` se elimina o se convierte en una herramienta que consume un bundle.
- Mover las plantillas fuera de la imagen o aceptar explícitamente que la imagen las contiene.
- Agregar un test que escanee la imagen y falle si aparecen strings de modelo fuera de una allowlist.

## 6. Criterio de cierre

- `docker cp` de la imagen no muestra un perfil Pixel 5 por defecto.
- `rg "Pixel 5|redfin|SM7250"` sobre `/system/bin` y `/system/etc` no devuelve coincidencias no allowlisted.
- Una instancia A54 arranca desde bundle y no cae en Pixel 5 si falta el perfil.
- El escaneo de la imagen es parte de CI o de `tools/doctor.py`.
