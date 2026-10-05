# Índice de Documentación de ProteoMesh

Bienvenido a la documentación técnica del proyecto **ProteoMesh**, el framework de emulación y endurecimiento (*hardening*) de contenedores Android sobre Linux x86_64.

---

## Documentos Disponibles

1. **[ARQUITECTURA.md](./ARQUITECTURA.md)**
   * Modelo de capas de intercepción (Java IPC, Bionic C runtime, Init e inyecciones de sistema).
   * Detalle de cada componente: `libpixel_hw.so`, módulo `FakeWifiPixel`, Zygisk y NativeBridge.
   * Flujo de ejecución durante el ciclo de vida del contenedor.

2. **[GUIA_DE_REPRODUCCION.md](./GUIA_DE_REPRODUCCION.md)**
   * Requisitos previos de host (kernel Linux, Docker, OpenJDK, herramientas Bionic).
   * Instrucciones paso a paso para compilar las bibliotecas nativas (`gcc`) y el módulo LSPosed (`build_apk.sh` con R8).
   * Comandos de despliegue con Docker Compose y ADB.
   * Checklist de verificación en vivo con `Device Info`, `DevCheck` y `Pixelscan`.

3. **[BITACORA_Y_ESTADO.md](./BITACORA_Y_ESTADO.md)**
   * Matriz completa de estado por subsistema (SoC, Kernel, RAM, GPU, Wi-Fi, SIM, Sensores, Cámara, Zygisk, ABIs).
   * Análisis de causas raíz y resolución de problemas críticos (offset de Zygisk `0x3284f`, filtro anti-root `/data/adb/lspd`, fuga de ABIs en Flutter).

---

## Archivos de Referencia Histórica

* `INFORME_TECNICO_Y_REPRODUCCION.md`: Reporte de fases tempranas del laboratorio de contenedores (archivo histórico).
* `INFORME_SESION_DROIDGUARD_Y_CONTEXTO.md`: Diagnóstico histórico de mitigación de O(N²) en `mountinfo` y DroidGuard.
