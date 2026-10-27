# Roadmap Técnico: USB-Mobile Transport (Fase 2) 📱📶

Este documento detalla la arquitectura, el diseño y los pasos de integración para la **Fase 2 (USB-Mobile)** en ProteoMesh, permitiendo que teléfonos Android físicos conectados por USB al host actúen como módems de datos móviles 4G/5G dedicados y con rotación de IP para instancias virtuales ReDroid.

---

## 0. Estado actual (USB-001 v0)

Ya está implementado el enganche base en `tools/network/usb_tether.sh`:
- Detecta la interfaz de tethering USB del host y aplica policy routing por IP de contenedor.
- No crea `tun0`: la instancia mantiene solo `eth0`.
- DNS se redirige al gateway del teléfono.
- API `/instances/{name}/usb/*` y botón en “Rutas y salidas”.
- Una ruta SOCKS desmonta el USB automáticamente.

Falta para Fase 2: activar datos móviles/apagar Wi-Fi del teléfono, rotación por modo avión,
reserva del IP móvil en `IpLeaseRegistry` y mapeo multi-teléfono.

## 1. Principio y Reutilización de Arquitectura

El diseño implementado en la **Fase 1 (`PROXY-002`)** fue concebido para ser 100% extensible:
1. **`Transport(ABC)`:** La interfaz abstracta en `server/services/network/transport.py` ya declara los métodos:
   - `reserve_exit(instance_id, config)`
   - `apply(instance_id, container_name, config)`
   - `teardown(instance_id, container_name)`
2. **`IpLeaseRegistry`:** La base de datos SQLite atómica (`instances/leases.db`) con índice `UNIQUE(exit_ip) WHERE released_at IS NULL` se utiliza **exactamente igual** para `usb_mobile` que para `socks5`. La regla no negociable de que *"nunca dos instancias activas comparten la misma IP pública"* queda garantizada por el motor a nivel ACID.

---

## 2. Flujo de Rotación de IP por Modo Avión

Las operadoras de telefonía móvil (Personal, Claro, Movistar) asignan una nueva dirección IP pública del pool dinámico cuando el módem se desconecta y se reconecta a la red de celdas.

```text
[Instancia ReDroid]
        │
        ▼ Requiere IP móvil exclusiva
[UsbMobileTransport.reserve_exit]
        │
        ├── 1. Consultar IP pública actual del teléfono USB
        │      (ej. vía curl sobre la interfaz usb0 o adb shell ifconfig)
        ▼
[IpLeaseRegistry.reserve(exit_ip, instance_id, "usb_mobile")]
        │
        ├── ¿IP libre? ──► [SÍ] ──► Adquirir lease atómico ──► Enrutar tráfico
        │
        └── ¿IP ocupada por otra instancia activa? (IpConflictError)
                │
                ▼ [NO] ──► Ciclo de Rotación por Modo Avión
                           ├── adb -s <SERIAL_USB> shell cmd connectivity airplane-mode enable
                           ├── sleep 3
                           ├── adb -s <SERIAL_USB> shell cmd connectivity airplane-mode disable
                           ├── Esperar re-asociación de datos (ping / timeout ~10s)
                           └── Reintentar reserva (máximo N intentos configurables)
```

---

## 3. Componentes a Implementar en Fase 2

### A. Detección y Mapeo USB (`tools/network/usb_detector.py`)
- Detección de dispositivos físicos conectados mediante `adb devices -l` (distinguiendo dispositivos reales de emuladores ReDroid por `model:` o `usb:`).
- Mapeo de cada teléfono físico a su interfaz de red USB tethering en el host (`usb0`, `usb1`, `enp0s20f0u...`).

### B. Plantilla de Enrutamiento (`tools/network/route-usb.sh.tmpl`)
Análogo a `route-socks5.sh.tmpl`, pero en lugar de levantar `tun2socks`, enlaza la interfaz de red virtual o macvlan/ipvlan directamente hacia el adaptador USB correspondiente en el host, excluyendo igualmente `172.17.0.0/16` para no interrumpir el control de ADB y scrcpy.

### C. Implementación de `UsbMobileTransport`
Completar la clase en `server/services/network/transport.py`:
- `reserve_exit()`: Ejecuta el bucle de rotación por modo avión y reserva en `lease_registry`.
- `apply()`: Enruta el tráfico del contenedor hacia la interfaz RNDIS.
- `teardown()`: Restaura rutas y libera el lease.

---

## 4. Garantías de Seguridad Preservadas
- Cero detección en Android: Al igual que en SOCKS5, el contenedor ReDroid no tiene apps de VPN ni flags `TRANSPORT_VPN`.
- Aislamiento estricto: Una instancia vinculada a un teléfono USB físico no puede interferir con otra que use SOCKS5 o un segundo teléfono físico.
