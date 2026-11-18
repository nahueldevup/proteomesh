# Alcance y Uso Previsto

**ProteoMesh** es un laboratorio local de virtualización Android y simulación de hardware móvil. Se ejecuta en infraestructura controlada por el operador y se utiliza para pruebas de compatibilidad, QA, rendimiento y robustez de **aplicaciones propias**.

## Uso previsto

- Ejecutar aplicaciones propias sobre perfiles de hardware reproducibles (17 dispositivos de referencia) para verificar que su comportamiento sea consistente frente a variaciones de SoC, GPU, pantalla, sensores, telefonía y red.
- Validar la robustez de los propios controles de integridad de la aplicación: detección de root, de instrumentación (Xposed/Frida), de emuladores y de manipulación del entorno.
- Reproducir escenarios de red, geolocalización y telefonía en un entorno aislado.
- Investigar y documentar técnicas de virtualización Android: namespaces, hooks en Bionic/ART, emulación de sensores y coherencia de propiedades del sistema.
- Probar el pipeline propio de build, instalación y actualización de la aplicación.

## Fuera de alcance

ProteoMesh **no** está destinado a:

- Operar cuentas de terceros ni mantener cuentas activas frente a sistemas de detección de plataformas ajenas.
- Interactuar con servicios financieros, bancarios o de pago.
- Eludir controles de integridad, antifraude o de cumplimiento de plataformas que no pertenecen al operador.
- Desplegarse como servicio, producto o infraestructura para terceros.
- Generar, distribuir o comercializar identidades de hardware con fines ajenos a las pruebas descritas.

## Condiciones operativas

- **Local:** el laboratorio corre en infraestructura propia, sin exposición pública.
- **Aplicaciones propias:** las apps instaladas y sometidas a prueba son desarrolladas o autorizadas por el operador.
- **Datos sintéticos:** las identidades de hardware (IMEI, MAC, serial, Android ID) son ficticias y se usan exclusivamente para que las pruebas sean deterministas y reproducibles.
- **Sin cuentas de terceros:** no se configuran cuentas de servicios ajenos en las instancias.

## Licencia y responsabilidad

El uso del software se rige por [LICENSE](LICENSE). El operador es responsable de que cada uso cumpla con las leyes aplicables y con los términos de servicio de las plataformas involucradas.
