# Índice de Documentación de ProteoMesh

Bienvenido a la documentación técnica del proyecto **ProteoMesh**, el framework de emulación y endurecimiento (*hardening*) de contenedores Android sobre Linux x86_64.

---

## Documentos Disponibles

1. **[ESTADO_ACTUAL.md](./ESTADO_ACTUAL.md)**
   * Fuente operativa de verdad: baseline Android 13, validaciones vigentes, temas no resueltos y flujo canónico.
   * Si contradice a otro documento, vale este archivo.

2. **[ARQUITECTURA.md](./ARQUITECTURA.md)**
   * Modelo de capas de intercepción (Java IPC, Bionic C runtime, Init e inyecciones de sistema).
   * Detalle de cada componente: `libpixel_hw.so`, módulo `FakeWifiPixel`, Zygisk y NativeBridge.
   * Flujo de ejecución durante el ciclo de vida del contenedor.

3. **[GUIA_DE_REPRODUCCION.md](./GUIA_DE_REPRODUCCION.md)**
   * Requisitos previos de host (kernel Linux, Docker, OpenJDK, herramientas Bionic).
   * Instrucciones paso a paso para compilar las bibliotecas nativas (`gcc`) y el módulo LSPosed (`build_apk.sh` con R8).
   * Comandos de despliegue con `instance_manager.py` y ADB.
   * Checklist de verificación en vivo con `Device Info`, `DevCheck` y `Pixelscan`.

4. **[BITACORA_Y_ESTADO.md](./BITACORA_Y_ESTADO.md)**
   * Matriz completa de estado por subsistema (SoC, Kernel, RAM, GPU, Wi-Fi, SIM, Sensores, Cámara, Zygisk, ABIs).
   * Análisis de causas raíz y resolución de problemas críticos (offset de Zygisk `0x3284f`, filtro anti-root `/data/adb/lspd`, fuga de ABIs en Flutter).

5. **[INVENTARIO_IMAGEN.md](./INVENTARIO_IMAGEN.md)**
   * Inventario de la imagen `proteomesh:latest`: perfil por defecto, plantillas embebidas y defaults de modelo en scripts, `profile-loader` y módulos.
   * Base para F1/F1.5: qué debe salir de la imagen para que sea model-agnostic.

6. **[GUIA_DE_REPLICACION_ANTIROOT.md](./GUIA_DE_REPLICACION_ANTIROOT.md)**
   * Receta de replicación del blindaje anti-root (NoHello, LSPosed, shim, props y DenyList).
   * Referencia operativa; ya no depende de `hide-test`: usa `modules.lock` y `tools/bootstrap_data_clean.sh`.

---

## Archivos de Referencia Histórica

* `IDEA.md`: objetivo original Android 14/Play Integrity (archivo histórico).
* `INFORME_TECNICO_Y_REPRODUCCION.md`: Reporte de fases tempranas del laboratorio de contenedores (archivo histórico).
* `HERMES_REPORTES_GUIDE.md`: automatización local de otra sesión (archivo histórico).
* `INFORME_SESION_DROIDGUARD_Y_CONTEXTO.md`: Diagnóstico histórico de mitigación de O(N²) en `mountinfo` y DroidGuard.
