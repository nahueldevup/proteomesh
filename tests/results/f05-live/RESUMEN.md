# F0.5 — Evidencia histórica del clon eliminado

> **Histórico:** el clon `redroid-f05-clean` y el contenedor `f05-live` fueron eliminados.
> El cierre vigente de F0.5 está en `tests/results/f05-main/RESUMEN.md`: Pixelscan 100/100
> y RDP 0/39 sobre el `data-clean` original, sin excepción de licencia.

Fecha: 2026-10-22

Clon: `/home/nahuel/Documentos/open-code-folder/redroid-f05-clean`

Instancia: `f05-live`, puerto `5601`, contenedor `9302c8678812`

Imagen: `proteomesh:latest` `sha256:5cc1c1f9c61463131075154a6d51ec7e948df410e9a53fc4e50aa185db2800af`
Rollback: `proteomesh:pre-f05` `sha256:558f46f38ca78213d43220e54f9c301a719e39526a7e1024c10048be44b77759`

## Pixelscan

- Resultado: **100/100 Low Risk**.
- Paquete: `net.pixelscan.check` v1.6.0.
- `wm size`: override `1080x2340` (física `720x1280`); `wm density`: override `450` (física `270`).
- Evidencia: `f05-pixelscan-final-1080.png`
  - SHA-256: `38cc942e022893e9f11dfb92a5f611f9461e1720148ca546a278b45d73d52b57`

## Root Detection Plus

- `at.persie0.root_detection_app`: **0/39**, con categorías `0/9`, `0/7`, `0/3`, `0/13`, `0/5` y `0/2`.
- Validado en `hide-test`, instancia con licencia/Play existente; **no** en el clon limpio.
- La app **no queda instalada** en `f05-live` al cierre de esta evidencia.
- Evidencia:
  - `f05-rdp-hidetest-02.png`
    - SHA-256: `f492098ad410dd4adb14daaad7008dc46775a0add6f870dc07a81908ea411cc5`
  - `f05-rdp-hidetest-02.xml`
    - SHA-256: `a1965acbdc660fdfc66c2b28a3ab8cc4f0e8cf936e27ee5017d99e461efaf355`

## Bloqueo de licencia en clon limpio

- El APK se instaló con `adb install-multiple` usando los splits de `hide-test`.
- Al abrir, PairIP lanzó `LicenseActivity`, luego `LAUNCH_PLAY_PASS_PAYWALL_PAGE` y terminó en `com.android.vending/...UnauthenticatedMainActivity`.
- Copiar app data, `com.android.vending` y `com.google.android.gms`/`gsf` desde `hide-test` no replicó la licencia.
- Evidencia:
  - `f05-rdp-clean-license-blocked.png`
    - SHA-256: `b990d2b1b42ce7eb81f882d24d749e464a2af84d50c4c52bd1f4d5b4c501b7b5`
  - `f05-rdp-clean-license-blocked.log`
    - SHA-256: `e6437a5211505c142281587ee0c4cf866b11ff31525a73d47093cfce23e13925`

## C5 en vivo

- `adb root` falla (`adbd cannot run as root in production builds`); la DenyList se consulta con `su -c '/sbin/magisk --denylist ls'`.
- `net.pixelscan.check` está en scope LSPosed y DenyList.
- `sync-scope` reaplica overrides tras reiniciar (`apply_runtime_defaults`):
  - `wm size=1080x2340`, `wm density=450`.
  - Salida observada: `[✓] Overrides restaurados: 1080x2340 @ 450dpi; paquetes desactivados: 0`.
  - Salida observada: `[✓] net.pixelscan.check verificado en scope LSPosed y DenyList.`
- El scope total quedó en 20 paquetes durante la validación.

## `data-clean` y límites

- El `data-clean` original no se modificó; sigue con `mtime=2026-10-10 07:31:33.117736806 -0300`.
- La copia al clon se completó con `cp -a ... || true` salvo **8 fuentes fscrypt** (`GoogleSans*`, `NotoColorEmoji.ttf`); el clon bootea y pasa Pixelscan.
- El clon no es una reproducción bit-a-bit del `data-clean`.
- El host no puede borrar datos internos de la instancia por UIDs Android; usar Docker root para limpieza.

## Conclusión

Esta es la evidencia **histórica** del clon `f05-live` (commit `c3cfeb6`):

- Pixelscan 100/100 y C5 quedaron validados en el clon.
- En el clon, RDP quedó bloqueado por licencia y se aceptó una excepción temporal.
- La copia del clon no era bit-a-bit por 8 fuentes fscrypt.

Esa excepción fue **reemplazada** por el smoke test de `f05-main` sobre el `data-clean` original:
Pixelscan 100/100 y RDP 0/39 sin paywall. Ver `tests/results/f05-main/RESUMEN.md`.
