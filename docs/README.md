# Índice de Documentación de ProteoMesh 🛡️📱

Bienvenido a la documentación técnica del proyecto **ProteoMesh**, la plataforma de virtualización, endurecimiento (*hardening*), simulación de hardware móvil y evasión de detección de emulación para contenedores Android (**ReDroid 13 / API 33**) sobre Linux x86_64.

---

## 📚 Documentación Activa y Vigente

1. **[ESTADO_ACTUAL.md](./ESTADO_ACTUAL.md)**
   * **Fuente operativa de verdad:** baseline Android 13, validaciones vigentes, temas no resueltos y flujo canónico de la flota.
   * *Regla:* Si contradice a cualquier otro documento, prevalece este archivo.

2. **[ARQUITECTURA.md](./ARQUITECTURA.md)**
   * Modelo de capas de intercepción: Java IPC, Bionic C runtime, servicios Init de Android e inyecciones de sistema.
   * Detalle de componentes: bibliotecas nativas C, módulo `FakeWifiPixel`, Zygisk, NativeBridge y emulación de sensores.
   * Ciclo de vida y flujo de arranque determinista del contenedor.

3. **[CONTEXTO_AUDITORIA.md](./CONTEXTO_AUDITORIA.md)**
   * **Auditoría técnica de no-regresión:** Certificación de que ninguna regla sensible de hardening (Magisk 30.6, Zygisk, Shamiko, DenyList, plantillas oficiales) fue alterada.
   * Detalle exhaustivo del flujo de aprovisionamiento en 3 pasos, bypass de SetupWizard, pre-inyección de claves públicas ADB (`adbkey.pub`) y purga segura en disco mediante contenedor Alpine root.
   * Diagnóstico y calibración del streaming scrcpy de baja latencia (<20ms a 30 FPS).

4. **[GUIA_DE_REPRODUCCION.md](./GUIA_DE_REPRODUCCION.md)**
   * Requisitos previos del host (kernel Linux 5.18+, módulos ashmem/binder, Docker, OpenJDK, herramientas Bionic).
   * Instrucciones paso a paso para compilar bibliotecas nativas (`gcc`) y módulos LSPosed.
   * Comandos de despliegue mediante CLI (`instance_manager.py`) y verificación ADB.
   * Checklist de auditoría en vivo con `Device Info`, `DevCheck`, `Root Detection Plus` y `Pixelscan`.

5. **[BITACORA_Y_ESTADO.md](./BITACORA_Y_ESTADO.md)**
   * Registro histórico cronológico exhaustivo de decisiones de ingeniería (§1 a §72).
   * Matriz completa de estado por subsistema (SoC, Kernel, RAM, GPU, Wi-Fi, SIM, Sensores, Cámara, Zygisk, ABIs).
   * Análisis de causas raíz y resolución de problemas críticos.

6. **[GUIA_DE_REPLICACION_ANTIROOT.md](./GUIA_DE_REPLICACION_ANTIROOT.md)**
   * Receta de replicación del blindaje anti-root multicapa (LSPosed, shims nativos, props enmascaradas y DenyList).
   * Operatoria con `modules.lock` y regeneración limpia con `tools/bootstrap_data_clean.sh`.

7. **[INVENTARIO_IMAGEN.md](./INVENTARIO_IMAGEN.md)**
   * Inventario de la imagen base `proteomesh:latest`: perfil por defecto, plantillas embebidas y desacoplamiento para arquitectura *model-agnostic*.

8. **[Frontend Web README](../web/README.md)**
   * Arquitectura de la interfaz gráfica de usuario en React 19 + TypeScript + Vite + Tailwind CSS v4.
   * Tokens de diseño OKLCH (modo oscuro técnico y modo claro de alta legibilidad).
   * Integración same-origin `/ws-scrcpy` y pipeline de interacción táctil directa por WebSocket.

9. **[AUDITORIA_FRONTEND_WEB.md](./AUDITORIA_FRONTEND_WEB.md)**
   * Auditoría integral de calidad del frontend web, modularización de componentes monolíticos y optimización con TanStack Query v5.

10. **[USB_MOBILE_TRANSPORT_ROADMAP.md](./USB_MOBILE_TRANSPORT_ROADMAP.md)**
   * Diseño de Fase 2 para usar teléfonos físicos por USB como módems de datos móviles.
   * Reutilización de `Transport(ABC)` e `IpLeaseRegistry`, rotación de IP por modo avión y enrutamiento por `usbX`.

---

## 🗄️ Archivos de Referencia Histórica (en `docs/historico/`)

Los siguientes documentos corresponden a etapas previas de investigación, exploraciones iniciales o diagnósticos de laboratorio que se conservan íntegramente como material de consulta:

* **[contexto_explicativo_referencia.md](./historico/contexto_explicativo_referencia.md):** Guía exhaustiva y autocrítica técnica post-commit `d1a1c9a` sobre inercia de fabricantes y parches en memoria.
* **[INFORME_SESION_DROIDGUARD_Y_CONTEXTO.md](./historico/INFORME_SESION_DROIDGUARD_Y_CONTEXTO.md):** Diagnóstico de causa raíz y mitigación de complejidad $O(N^2)$ en la lectura de `/proc/mountinfo` para DroidGuard.
* **[INFORME_TECNICO_Y_REPRODUCCION.md](./historico/INFORME_TECNICO_Y_REPRODUCCION.md):** Reporte de fases tempranas del laboratorio emulando Xiaomi Redmi 5 Plus (`vince`) en Android 14.
* **[HERMES_REPORTES_GUIDE.md](./historico/HERMES_REPORTES_GUIDE.md):** Guía de automatización local y extracción de reportes de telemetría en host CachyOS.
* **[IDEA.md](./historico/IDEA.md):** Nota histórica original con el planteamiento de objetivos del proyecto.
