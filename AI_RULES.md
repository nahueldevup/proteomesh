# ProteoMesh — AI Rules & Architecture Standards

## 1. Tech Stack Overview
- **Web Frontend:** React 19 with TypeScript, bundled with Vite 8 in `web/`.
- **UI & Styling:** Tailwind CSS v4, Radix UI primitives (`@radix-ui/react-*`), Lucide Icons (`lucide-react`), and Sonner (`sonner`) for notifications.
- **Geospatial & Mapping:** Leaflet (`leaflet` and `@types/leaflet`) for GPS location picking, pin placement, and interactive coordinate selection.
- **Remote Display & Streaming:** HTML5 Canvas and WebSocket stream integration connecting to `ws-scrcpy` for real-time mobile screen control and input dispatch.
- **Backend API:** Python 3.10+ FastAPI server in `server/` with Pydantic v2 data models, asynchronous handlers, and unified REST routing under `/api/v1`.
- **Host Orchestration & Automation:** Python 3 CLI suite in `tools/` (`instance_manager.py`, `render.py`, `deps_fetch.py`, `scope_audit.py`) managing Docker, ADB, and hardware bundles.
- **Virtualization & Emulation Runtime:** Docker containerized ReDroid 13 (Android 13 / API 33) on Linux x86_64 with Magisk 30.6 root, Zygisk NoHello v0.0.7 namespace isolation, and ashmem/binder shims.
- **Anti-Detection & System Hooking:** Dual-layer hooking with native Bionic C shims (`src/libpixel_hw/` loaded via `LD_PRELOAD`) and Java-level LSPosed Xposed module (`src/lsposed_module/FakeWifiPixel.apk`).
- **Hardware Profile Loader:** Standalone native C binary (`src/profile_loader/`) with embedded `cJSON` that executes `resetprop` injections during early Android boot.
- **Networking & Mobile Transport:** Physical USB tethering integration, host-level iptables/nftables firewall isolation, SOCKS5 tunnel routing, and local DNS bridging.

---

## 2. Library Usage Rules & Conventions

### Frontend (`web/`)

| Library / Tool | Permitted Use Cases & Rules |
| :--- | :--- |
| **React 19 & TypeScript** | Use functional components and modern React hooks (`useState`, `useEffect`, `useCallback`, `useMemo`). Keep TypeScript types strict (`web/src/types.ts`). Do not use `any` unless bridging raw DOM/WebSocket events. |
| **Tailwind CSS v4** | Primary and mandatory styling engine. Use utility classes for layout, typography, colors, animations, and responsive grids. Use the `cn()` helper (`clsx` + `tailwind-merge` in `web/src/lib/utils.ts`) for dynamic and conditional class application. Avoid custom CSS files. |
| **Radix UI Primitives** | Use `@radix-ui/react-*` (Dialog, Popover, Slider, Tooltip) for accessible, unstyled interactive components. Wrap them in reusable presentation components in `web/src/components/ui/`. |
| **Lucide Icons** | Exclusively use `lucide-react` for all system iconography. Do not import or mix other icon libraries (FontAwesome, Material Icons, etc.). |
| **Sonner** | Use `sonner` (`toast.success()`, `toast.error()`, `toast.info()`, `toast.warning()`) for all user toasts and action feedback. Do not use `react-toastify` or browser `alert()`. |
| **Leaflet** | Exclusively use `leaflet` for rendering interactive maps, pinning GPS presets, and visual coordinate pickers in `web/src/components/MapPicker.tsx` and custom location modals. Always handle cleanup on unmount to prevent memory leaks with map instances. |
| **API Client (`web/src/lib/api.ts`)** | All network communication to the backend must pass through the centralized `api` helper object. Keep request and response types aligned with `web/src/types.ts`. |

### Backend (`server/`)

| Library / Tool | Permitted Use Cases & Rules |
| :--- | :--- |
| **FastAPI** | Sole web framework for backend endpoints. Define routes modularly under `server/routes/` and mount them with `/api/v1` prefix in `server/main.py`. |
| **Pydantic** | All incoming request bodies and outgoing serialized responses must be validated with Pydantic schemas in `server/models/schemas.py`. |
| **Manager Bridge (`server/services/manager_bridge.py`)** | Subprocess bridge to `tools/instance_manager.py`. Wrap CLI invocations with robust error handling, stdout parsing, and structured JSON responses. |
| **Network & Firewall Services** | Use standard library `subprocess`, `ipaddress`, and `pathlib` for managing USB tethering interfaces, host firewall rules (`iptables`/`nftables`), and proxy forwarding. |

### System & Low-Level (`src/` & `tools/`)

| Component / Library | Permitted Use Cases & Rules |
| :--- | :--- |
| **cJSON (`src/profile_loader/`)** | Lightweight C JSON parser used exclusively in the standalone profile loader binary for reading hardware templates without glibc dependencies. |
| **Native Bionic C (`src/libpixel_hw/`)** | Intercept libc functions (`open`, `stat`, `uname`, `sysinfo`, `access`) to hide root artifacts, sanitize `/proc/self/environ`, and spoof SoC/kernel signatures. Must compile for both `x86_64` and `x86_32`. |
| **LSPosed Framework (`src/lsposed_module/`)** | Hook Android Java framework methods (`android.os.Build`, `TelephonyManager`, `WifiManager`, `SensorManager`, `PackageManager`) to simulate authentic device parameters and brand store stubs. |
| **Python CLI (`tools/`)** | Keep automation scripts standalone using Python standard libraries (`argparse`, `json`, `subprocess`, `unittest`). |

---

## 3. General Development Guidelines
- **Modularity:** Maintain separation of concerns across the three architectural layers (Frontend, API/Orchestration, Android/C hooks).
- **Type Consistency:** When modifying backend Pydantic models in `server/models/schemas.py`, update matching TypeScript interfaces in `web/src/types.ts`.
- **Integrity First:** Any change to Android system props, sensors, or device templates must preserve consistency across the whole stack to maintain 100/100 Low Risk rating in anti-fraud and anti-root checks.
