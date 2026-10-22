# F0.5 — Smoke test desde `redroid-integrity-lab`

Fecha: 2026-10-22

Repo: `/home/nahuel/Documentos/open-code-folder/redroid-integrity-lab`  
Instancia: `f05-main`, puerto `5601`, contenedor `3e4383faa391`  
Imagen: `proteomesh:latest` `sha256:5cc1c1f9c61463131075154a6d51ec7e948df410e9a53fc4e50aa185db2800af`  
Base: `data-clean` original del repo principal.  
Commit de esta evidencia: `c72b33a`.

## Pixelscan

- Resultado: **100/100 Low Risk**.
- Captura: `f05-main-pixelscan.png` (1080x2340).
- XML: `f05-main-pixelscan.xml`.
- `wm size`: `Override size: 1080x2340`; `wm density`: `Override density: 450`.

Hashes:

```text
e5908354b7d331679d4f81240101ca753ccac995f3a6e1764163cd916a5e4eec  f05-main-pixelscan.png
ad45aa258b8f97f5dca4b0446675ccb2c07fe5175c00094f60d00506c528bed2  f05-main-pixelscan.xml
```

## Root Detection Plus

- Paquete: `at.persie0.root_detection_app` v2026.10.09.1510 (versionCode 36).
- Resultado: **0 Detected / 39 Not Detected / 0 Unknown**.
- Categorías: `0/9`, `0/7`, `0/3`, `0/13`, `0/5`, `0/2`.
- La app abrió y escaneó sin paywall; el APK/licencia ya estaba aprovisionado en `data-clean`. No se agregó una cuenta nueva.
- Capturas: `f05-main-rdp-top.png` y `f05-main-rdp-bottom.png` (1080x2340).
- XML: `f05-main-rdp-top.xml` y `f05-main-rdp-bottom.xml`.

Hashes:

```text
5e71a36d4f0da409da3d369beb93806bcb41858b20d3bc071fe918974230ec71  f05-main-rdp-top.png
70c31d08d9ccab4cd4e4cda89c0c01754917f884f05863e1e34d252958878e33  f05-main-rdp-top.xml
380af9fb1155c21163905bb00f52ff97724a28540e40393e206e68d6b1a764dd  f05-main-rdp-bottom.png
9832cc7d4f09af9e1918a225bc0e8c5dfe13003bec64b2a6a7f645b217167e10  f05-main-rdp-bottom.xml
```

## Conclusión

El smoke test desde el repo principal pasa completo: Pixelscan 100/100 y RDP 0/39. Esto reemplaza la excepción de licencia que se había documentado para el clon `f05-live`.

El override de pantalla se verificó después del fix `a01586e`: el manager reintenta `wm size`/`wm density` y confirma el resultado.
