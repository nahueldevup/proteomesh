# INFORME TÉCNICO Y DE CONTEXTO — Sesión ReDroid Integrity Lab
**Fecha:** 2026-09-24 (sesión larga, ~10:00 → ~19:20 hora contenedor)
**Idioma de trabajo:** español
**Objetivo del proyecto:** que el contenedor Docker ReDroid pase Play Integrity (`MEETS_BASIC_INTEGRITY` + `MEETS_DEVICE_INTEGRITY`, sin Strong) con Magisk 30.6 funcional, sin hacks manuales.

---

## 1. ESTADO ACTUAL (lo más importante primero)

- **Causa raíz del fallo de integridad ENCONTRADA Y MITIGADA:** `/proc/self/mountinfo` dentro del contenedor mide **31 MB / 97.608 líneas** por **~95.320 bind-mounts apilados** de `fake_proc`. `DroidGuard.initNative` (en `gms.unstable`) lee ese archivo secuencialmente en trozos de 1 KB; como `seq_file` re-recorre desde el inicio en cada `read()`, el costo es O(N²) → el init nunca termina antes del **timeout de 60 s** de `getSingleSnapshot` → `TimeoutException` → sin veredicto.
- **Fix aplicado y FUNCIONANDO:** archivo deduplicado `/data/local/tmp/mini_mountinfo` (2.348 líneas, 1,5 MB) + `mount --bind` sobre `/proc/<pid-unstable>/mountinfo` + watcher que re-aplica el bind si `unstable` reinicia (nuevo PID) + **SECCIÓN 13** persistente en `build_magisk/system/bin/apply-props.sh` (se ejecuta en cada boot, en background).
- **Prueba de que DG funciona ahora:** check completo en ~30 s (antes: timeout 60 s siempre), se obtiene token, y el servidor `integrity.1nikolas.dev` devuelve JSON decodificado. En logs: `requestIntegrityToken` → `SignalGenerationBreakdown` OK → `OnRequestIntegrityTokenCallback` SIN `TimeoutException`.
- **PERO veredictos actuales = FAIL (rojo):** el JSON dice `UNEVALUATED` en todo (`appRecognitionVerdict`, `deviceActivityLevel`, `appLicensingVerdict`, `deviceAttributes: {}`) porque el dispositivo está **no certificado**: `uncertified_status=1` en `gservices.db`.
- **Pendiente SOLO de propagación Google:** `android_id = 4405588804782457443` ya fue registrado por el usuario en `https://www.google.com/android/uncertified/`. Tras ~30 min sigue `uncertified_status=1`. Hay que seguir sondeando (checkin + leer flag) hasta que cambie a 0 y re-testear. Se espera entonces BASIC + DEVICE en verde (Strong debe seguir rojo: sin Strong por diseño).

## 2. CADENA DE EVIDENCIA DE LA CAUSA RAÍZ (para no redescubrirla)

1. `getSingleSnapshot` = llamada binder Finsky (`com.android.vending`, thread `DG`) → `DroidGuardService` (en `com.google.android.gms.unstable`). A los 60,0 s exactos: `IntegrityException: getSingleSnapshot failed. Caused by: TimeoutException`. Lado GMS: cero logs (ni `succeeded/failed for flow`).
2. `kill -3 <unstable>` → `/data/anr/trace_00`: hilo `binder:3330_3` en estado R con **1312 s de CPU**, dentro de `DroidGuard.initNative` → código nativo de `the.apk`. Dos hilos con dos locks distintos, ambos en `initNative`. Conclusión: el init nativo de DG no termina nunca.
3. `strace -p <tid>` (existe `/bin/strace` en el contenedor): solo `read(fd 90, ..., 1024)`, ~40 ms cada uno, cientos seguidos. `fd 90 = /proc/3330/mountinfo`.
4. Contenido del mountinfo: miles de líneas con la ruta host `/@home/nahuel/.../data-clean/local/tmp/fake_proc/...` (los binds de enmascaramiento de CPU).
5. Medición: `wc -c` = 31.234.725 bytes, 97.608 líneas, 95.320 con `fake_proc`. Lectura de los primeros 1,6 MB = **0,03 s** (rápido); el problema es leer 31 MB secuencial con costo creciente por offset (O(N²)).
6. Tras cubrir con mini (1,5 MB): DG completa. Prueba funcional definitiva.

## 3. EL PILE DE 95K MOUNTS (origen, estado, advertencias)

- Composición: `/proc/cpuinfo,cmdline,version` (31 capas c/u), `cpu online/present/possible` (2.048 c/u), `cpufreq/policy*/cpuinfo_{min,max}_freq,scaling_{cur_freq,governor}` (17.407 salvo min_freq con 34.815). Total `fake_proc` = 95.320. Determinista (mismo número en 3 mediciones separadas por horas y reboots).
- Origen probable: versiones viejas del loop cpufreq (sobre `policy*`, no `cpu*/cpufreq` como el script actual) ejecutadas ~2.048 veces, o stacking histórico. Los scripts actuales (`mask-early.sh` 34 líneas, `apply-props.sh` SECC 1-4) son finitos (~80 mounts/boot) y el conteo está ESTÁTICO (no hay creador activo).
- **NO re-ejecutar `apply-props.sh` a mano**: cada ejecución apila otra capa de binds sobre las existentes.
- `umount` individual con 97k mounts es inviable (un `umount` tardó >20 s: el recorrido de propagación es carísimo). Por eso se optó por cubrir (bind over) en vez de desmontar.
- IDs de mount 487 → 4,8M: el contador global es monotónico con reutilización de IDs liberados; no inferir edad del namespace desde ellos.
- Misterio no resuelto (no bloqueante): el pile sobrevivió a `docker restart` con conteo idéntico; con `down+up` (recreate total) reapareció idéntico. Hipótesis: se recrea en cada boot (aunque los scripts visibles no lo explican) o el ns persiste de forma exótica. El watcher + mini lo neutraliza en cualquier caso. Si reaparece creciendo, cazar al creador auditando mounts durante el boot.

## 4. INCIDENTE DOCKER (daño colateral ya resuelto)

- `docker compose down + up` falló: `.../blobs/sha256/...: operation not permitted` en TODA operación del image store (`images`, `system df`, `create`).
- Causa (vía `dmesg` con sudo del usuario): `fs-verity (sdc2, inode N): require_signatures=1, rejecting unsigned file!` — el kernel exige firmas fs-verity y los blobs viejos tienen digests SIN firmar → EPERM al abrir.
- Los pulls frescos (`hello-world`, base redroid 838 MB) salen LIMPIOS (sin digests) y funcionan. Conclusión: el problema era específico de blobs viejos, no sistémico.
- Solución aplicada (aprobada por el usuario, solo mundo contenedor): `sudo systemctl stop docker/containerd`, `sudo rm -rf /var/lib/containerd /var/lib/docker`, restart daemons, re-pull base, **rebuild de la imagen** con `redroid-script`: `python3 redroid.py -a 13.0.0 -mtg -m -w` → tag `redroid/redroid:13.0.0_mindthegapps_magisk_widevine` (usa `stuff/magisk.py` LOCAL, que está parcheado con stub.apk+bootanim — no re-clonar).
- La imagen base es `redroid/redroid:13.0.0-latest` (1 capa gzip, 838 MB). El tag viejo `13.0.0_mindthegapps_magisk_widevine` NO existe en Docker Hub (es build local): **no borrar el store sin tener rebuild a mano**.
- **RESTRICCIÓN DEL USUARIO (CachyOS): no tocar el SO host** (ni kernel, ni bootloader, ni reboot del host, ni `/etc`). Todo lo containerizable sí se puede borrar/rehacer. No se ejecutó ningún `sudo` por parte del asistente; los comandos sudo los corrió el usuario.

## 5. CONOCIMIENTO OPERATIVO (trampas que ya costaron horas)

### 5.1 Taps e UI (¡leer antes de pulsar nada!)
- **NO estimar coordenadas desde screenshots**: la vista previa engaña (~150 px de error). **Siempre** obtener bounds con `adb -s localhost:5580 shell uiautomator dump` + pull del XML y pulsar el centro del `bounds`.
- Botón CHECK del checker: bounds `[272,829][448,925]`, centro display **(360,877)**. El tap llega a la app con offset Y −162 (content bajo status+toolbar); es normal, no es un bug.
- `handled=true` en InputDispatcher + `VelocityTracker(pid-app)` sin logs de la app = el tap cayó en una vista que consume sin acción (o botón deshabilitado). Verificar `enabled` en el dump.
- `uiautomator dump` vía `docker exec` traga el stdout: usarlo **vía ADB** (`adb shell uiautomator dump /sdcard/...` + `adb pull`).
- Antes de pulsar CHECK: `force-stop` del checker no hace falta, pero sí `am force-stop com.kblack.demo_play_integrity_api` para evitar interferencias; y verificar que el checker esté en primer plano (`dumpsys window | grep mFocusedApp`).

### 5.2 Shell / transferencias
- Shell del contenedor es **zsh**: evitar `echo ===` sin comillas (`=...` se expande) y comillas simples anidadas/desbalanceadas en `docker exec` (`unmatched '`).
- **`docker cp` desde el contenedor FALLA** (`read-only file system` en `system/bin/apply-props.sh`). Transferir con `docker exec ... base64 <ruta> | base64 -d > destino` (archivos medianos) o **`adb push/pull`** (archivos grandes; requiere `adb connect localhost:5580` primero; adbd tarda en levantar tras boot).
- `/tmp` del contenedor es read-only: usar `/data/local/tmp/` (persiste vía bind `./data-clean`, visible en host en `data-clean/local/tmp/`).
- `sqlite3` del contenedor crashea (`Aborted`): extraer `.db` y consultar con `python3 sqlite3` en host.
- `python3` NO existe en el contenedor; `awk` SÍ (`/bin/awk`); `strace` SÍ (`/bin/strace`); `pidof`, `kill -3` (traces a `/data/anr/`) disponibles como root.

### 5.3 Invariantes del setup (NO romper)
- **DenyList de Magisk: DESACTIVADA** (`/sbin/magisk --denylist disable`). Activarla rompe GMS (`failed to attach` + `start timeout`). Scripts ya parcheados (apply-props.sh L262-263).
- **NO instalar el APK oficial de Magisk** (auto-uninstall). App viva con `/sbin/stub.apk` + `pm enable com.topjohnwu.magisk`; `/sbin` es tmpfs → tras boot restaurar con `cp /system/etc/init/magisk/stub.apk /sbin/stub.apk` si falta.
- PIF activo vía `LD_PRELOAD` en `init.zygote64_32.rc` (Zygisk PIF `unloaded` en x86_64; solo preload). PIF descartado como causa del hang DG.
- Keybox solo-RSA en `/data/adb/tricky_store/keybox.xml`; `teeBroken=true` es conocido/no bloqueante.
- Identidad: Pixel 5/redfin, fingerprint `google/redfin/redfin:14/UP1A.231105.001.B2/11261383:user/release-keys`, patch `2023-11-01`.
- `storage-info.pb` de vending (7 B, solo field4 timestamp) es **red herring**: el check completa con él roto. No perseguirlo hasta tener verdictos evaluados.
- `dg.db` (tabla `main(a,b,h,d)`) tiene filas `redroid/...` viejas con TTL; son caché por (flujo,fingerprint), no bloquean flujos `redfin`. No tocar salvo necesidad probada.
- Cuenta: `cuenta4fne@gmail.com`. GMS 26.34.36, Play Store se auto-actualiza (visto 53.2.23 → 53.3.21).

## 6. ARCHIVOS RELEVANTES

**Host – proyecto** (`/home/nahuel/Documentos/open-code-folder/redroid-integrity-lab/`):
- `docker-compose.yml` (binds; `./data-clean:/data`; puerto 5580:5555)
- `build_magisk/system/bin/apply-props.sh` (**+SECCIÓN 13**: watcher mountinfo en background)
- `build_magisk/system/etc/init/integrity_props.rc` (`exec apply-props.sh` en `boot_completed` + `start trickystore`)
- `build_magisk/system/bin/mask-early.sh`, `start-trickystore.sh`, `init.zygote64_32.rc` (LD_PRELOAD libpif), `system/etc/pif/*`, `inject_patched`
- `data-clean/local/tmp/mini_mountinfo` (cover 1,5 MB, persiste) ← NO borrar
- `_shot_*.png`, `v_*.jpg` (screenshots legibles por herramientas)
- `INFORME_TECNICO_Y_REPRODUCCION.md` (arquitectura TrickyStore, previo)

**Host – build** (`/home/nahuel/Documentos/open-code-folder/redroid-script/`): `redroid.py`, `Dockerfile` (generado), `stuff/magisk.py` (parcheado).
**Host – análisis** (`/tmp/opencode/`, volátil): `mountinfo_full.txt` (31 MB), `mini_mountinfo`, `checker.apk` + `checker_out/` (jadx del checker), `trace_unstable.txt` (kill -3 con `initNative` atascado), `gservices*.db`, `si2/*.pb`, `dbs/`, `ui*.xml`, `build.log`.

**Contenedor:**
- `/data/local/tmp/mini_mountinfo`, `/data/local/tmp/dgwatch.sh` (watcher corriendo, PID cambia; verificar con `ps | grep dgwatch`)
- `/data/adb/tricky_store/` (keybox.xml RSA, target.txt `!`), `/data/adb/modules/{tricky_store,playintegrityfix}`
- `/data/data/com.google.android.gms/app_dg_cache/*/the.apk` (APK DG, lib x86_64 OK), `.../databases/dg.db`
- `/data/data/com.google.android.gsf/databases/gservices.db` (`android_id`, `uncertified_status`)
- `/data/anr/trace_00` (evidencia del spin)

## 7. CHECKER APP (decompilado con jadx, útil para interpretar resultados)

- `gr.nikolasspyr.integritycheck` v2.2 (vCode 22). CHECK → `requestIntegrityToken(nonce 50 chars)` vía PlayCore (`R0.*`); exige `com.android.vending` versionCode ≥ 82.380.000 y firma válida (`T0.f.a`), si no → error `-14 PLAY_STORE_VERSION_OUTDATED`.
- Códigos de error conocidos: `-14` Play Store desactualizado, `-9` CANNOT_BIND_TO_SERVICE, `-2` PLAY_STORE_NOT_FOUND, `-1` API_NOT_AVAILABLE, `-3` NETWORK_ERROR.
- En éxito: `GET https://integrity.1nikolas.dev/api/check?token=...` y muestra el JSON (diálogo "Raw JSON response" + iconos). En fallo: `x(false)` + diálogo de error. Botón deshabilitado + spinner = check en vuelo.
- Firma del hang en logcat: `requestIntegrityToken(...)` → `Got displayListenerMetadata: [], -1` + `SignalGenerationBreakdown...` → **60,0 s después** `requestIntegrityToken() failed for <paquete>. IntegrityException: getSingleSnapshot failed. Caused by: TimeoutException`.

## 8. CERTIFICACIÓN PLAY PROTECT (estado y cómo continuar)

- `uncertified_status=1`, `uncertified_status_expiration_remaining_time_ms≈90M`, `android_id=4405588804782457443`.
- Registro en `google.com/android/uncertified` hecho por el usuario; a +30 min aún `=1` (propagación pendiente).
- Forzar checkin: `am broadcast -a android.provider.Telephony.SECRET_CODE -d android_secret_code://2432546` → `CheckinOperation finished with result: SUCCESS`. Releer flag desde `gservices.db`.
- Play Store → Ajustes → Acerca de: muestra `Play Protect certification: Device is not certified` (pantalla de referencia).
- Cuando el flag pase a 0: retest con el checker. Esperado: BASIC ✓ + DEVICE ✓, STRONG ✗ (por diseño), appLicensing posiblemente UNEVALUATED (checker sideloaded — normal).

## 9. PRÓXIMOS PASOS (para la otra IA)

1. Sondear `uncertified_status` (checkin + leer `gservices.db`) hasta que sea 0.
2. Re-test integridad → confirmar BASIC+DEVICE verdes + guardar screenshot.
3. Validación gold: `docker restart` (o recreate) → verificar que la SECCIÓN 13 cubre sola el mountinfo del nuevo unstable (leer tamaño vía `/proc/<pid>/mountinfo` ≈ 1,5 MB) → check verde sin intervención manual.
4. Solo si tras certificar sigue UNEVALUATED/fail: depurar contenido del veredicto (deviceAttributes, key attestation TrickyStore, PIF fields) — no antes.
5. Limpieza opcional: screenshots viejos `_shot_*`, `/tmp/opencode` (volátil), `.zip` duplicados del proyecto.
6. NO hacer: re-ejecutar `apply-props.sh` a mano, activar denylist, instalar APK Magisk oficial, tocar kernel/cmdline del host, borrar `./data-clean`, borrar el store de Docker sin rebuild a mano.

## 10. RIESGOS ABIERTOS

- Origen exacto del pile de 95k mounts sin identificar (candidato: stacking histórico de loops cpufreq sobre `policy*`). Si reaparece creciendo, auditar mounts durante el boot.
- El cover (`mini_mountinfo`) es una foto fija deduplicada: si aparecen mounts nuevos relevantes, DG leerá una vista vieja (aceptable hoy).
- `require_signatures=1` (fs-verity) sigue activo en el host: futuros blobs con digests sin firmar se vuelven ilegibles. Los pulls frescos salen limpios (verificado), pero ante otro brick del store, repetir wipe+rebuild (nunca tocar el kernel por restricción del usuario).
- La UI por taps es frágil: siempre uiautomator-bounds + verificación de `enabled` + confirmación en logcat (`requestIntegrityToken`).
