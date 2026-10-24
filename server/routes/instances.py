"""
Rutas para ciclo de vida de instancias (CloudPhones)
"""
import asyncio
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Query, Response, WebSocket, WebSocketDisconnect

from server.models.schemas import (
    InstanceCreateRequest,
    InstanceResponse,
    HealthReport,
    InputTapRequest,
    InputSwipeRequest,
    InputKeyRequest,
    InputTextRequest,
    LaunchUrlRequest,
    ScrcpyLaunchResponse,
    GroupTapRequest,
    GroupSwipeRequest,
    GroupKeyRequest,
    GroupInstancesRequest,
    GroupActionResponse,
    ScrcpyStreamInfo,
)
from server.services.manager_bridge import (
    get_instances_list,
    get_single_instance,
    create_instance_async,
    start_instance_async,
    stop_instance_async,
    delete_instance_async,
    check_health_sync,
    launch_native_scrcpy,
    get_instance_screenshot,
    send_instance_tap,
    send_instance_swipe,
    send_instance_key,
    send_instance_text,
    launch_instance_url,
    group_tap_async,
    group_swipe_async,
    group_key_async,
    group_lifecycle_async,
    get_scrcpy_stream_info,
)

router = APIRouter(prefix="/instances", tags=["Instancias (CloudPhones)"])


@router.get("", response_model=List[InstanceResponse], summary="Listar todas las instancias")
def list_instances():
    """Retorna todas las instancias creadas con su estado en Docker, hardware y geolocalización."""
    return get_instances_list()


@router.post("", response_model=InstanceResponse, status_code=201, summary="Crear un nuevo CloudPhone")
async def create_instance(req: InstanceCreateRequest):
    """Aprovisiona una nueva instancia con identidad única (IMEI, MAC, Android ID) y ubicación."""
    try:
        return await create_instance_async(req)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Control de Grupo (debe declararse antes de /{name} para no colisionar) ──
@router.post("/group/input/tap", response_model=GroupActionResponse, summary="Tap simultáneo en varias instancias")
async def group_input_tap(req: GroupTapRequest):
    return await group_tap_async(req.instances, req.x, req.y)


@router.post("/group/input/swipe", response_model=GroupActionResponse, summary="Swipe simultáneo en varias instancias")
async def group_input_swipe(req: GroupSwipeRequest):
    return await group_swipe_async(req.instances, req.x1, req.y1, req.x2, req.y2, req.duration_ms)


@router.post("/group/input/key", response_model=GroupActionResponse, summary="Tecla simultánea en varias instancias")
async def group_input_key(req: GroupKeyRequest):
    return await group_key_async(req.instances, req.key)


@router.post("/group/{action}", response_model=GroupActionResponse, summary="Ciclo de vida masivo (start/stop/restart/delete)")
async def group_lifecycle(action: str, req: GroupInstancesRequest):
    if action not in ("start", "stop", "restart", "delete"):
        raise HTTPException(status_code=400, detail="Acción inválida: use start, stop, restart o delete")
    return await group_lifecycle_async(req.instances, action)


@router.delete("/{name}", response_model=Dict[str, Any], summary="Eliminar una instancia")
async def delete_instance(name: str):
    """Detiene y elimina un contenedor Docker y su carpeta de configuración de forma segura."""
    try:
        return await delete_instance_async(name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{name}", response_model=InstanceResponse, summary="Obtener detalle de una instancia")
def get_instance(name: str):
    """Retorna los metadatos y estado actual de una instancia específica."""
    try:
        return get_single_instance(name)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{name}/start", response_model=Dict[str, Any], summary="Iniciar contenedor Docker de la instancia")
async def start_instance(name: str):
    """Inicia el contenedor aplicando CPU Pinning, memoria, 30 FPS y validando health-check."""
    try:
        return await start_instance_async(name)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{name}/stop", response_model=Dict[str, Any], summary="Detener contenedor Docker de la instancia")
async def stop_instance(name: str):
    """Detiene y elimina el contenedor Docker (los datos en /data se preservan intactos)."""
    try:
        return await stop_instance_async(name)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{name}/health", response_model=HealthReport, summary="Verificar salud de la instancia")
def get_health(name: str):
    """Ejecuta los 7 puntos de control de verificación post-arranque (Docker, Red, Boot, DenyList, Overrides)."""
    try:
        return check_health_sync(name)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Rutas de Control Interactivo y Pantalla (Visor CloudPhone) ───────────────
@router.post("/{name}/scrcpy", response_model=ScrcpyLaunchResponse, summary="Abrir ventana scrcpy nativa en el escritorio")
def open_scrcpy(name: str):
    """
    Lanza la ventana nativa de scrcpy conectada al contenedor.
    Aceleración OpenGL/VA-API directa, atajos de teclado y ratón sin latencia.
    """
    try:
        res = launch_native_scrcpy(name)
        return ScrcpyLaunchResponse(**res)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{name}/stream-info", response_model=ScrcpyStreamInfo, summary="Info de streaming nativo scrcpy (ws-scrcpy)")
def stream_info(name: str, player: str = Query(default="mse", pattern="^(mse|webcodecs|tinyh264|broadway)$")):
    """Devuelve la URL de embed del visor ws-scrcpy y si el servicio está disponible."""
    try:
        return get_scrcpy_stream_info(name, player)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{name}/screen", summary="Obtener captura de pantalla en vivo (JPEG/PNG)")
def get_screen(
    name: str,
    format: str = Query("jpeg", description="Formato de imagen ('jpeg' o 'png')"),
    max_width: int = Query(540, description="Ancho máximo para optimizar ancho de banda"),
):
    """Retorna un frame de pantalla del CloudPhone para visualización interactiva en navegador."""
    try:
        img_bytes = get_instance_screenshot(name, format=format, max_width=max_width)
        media_type = "image/jpeg" if format.lower() in ("jpeg", "jpg") else "image/png"
        return Response(
            content=img_bytes,
            media_type=media_type,
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            }
        )
    except RuntimeError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{name}/input/tap", response_model=Dict[str, Any], summary="Tocar pantalla (tap táctil)")
def input_tap(name: str, req: InputTapRequest):
    """Envía un toque táctil a las coordenadas X e Y en Android."""
    try:
        return send_instance_tap(name, req.x, req.y)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{name}/input/swipe", response_model=Dict[str, Any], summary="Deslizar pantalla (swipe gesture)")
def input_swipe(name: str, req: InputSwipeRequest):
    """Envía un gesto de arrastre/deslizamiento entre dos puntos."""
    try:
        return send_instance_swipe(name, req.x1, req.y1, req.x2, req.y2, req.duration_ms)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{name}/input/key", response_model=Dict[str, Any], summary="Pulsar tecla física o navegación Android")
def input_key(name: str, req: InputKeyRequest):
    """Envía teclas de navegación: 'back', 'home', 'recents', 'power', 'volup', 'voldown', 'enter'."""
    try:
        return send_instance_key(name, req.key)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{name}/input/text", response_model=Dict[str, Any], summary="Escribir texto en Android")
def input_text(name: str, req: InputTextRequest):
    """Escribe una cadena de texto en el campo de texto activo."""
    try:
        return send_instance_text(name, req.text)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{name}/launch-url", response_model=Dict[str, Any], summary="Abrir URL en navegador")
def launch_url(name: str, req: LaunchUrlRequest):
    """Lanza el navegador de Android abriendo la dirección especificada."""
    try:
        return launch_instance_url(name, req.url)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.websocket("/{name}/ws-stream")
async def ws_stream(websocket: WebSocket, name: str, fps: int = 3, max_width: int = 540):
    """Stream continuo de frames JPEG por WebSocket (fallback nativo cuando ws-scrcpy no está disponible)."""
    await websocket.accept()
    delay = 1.0 / max(1, min(fps, 10))
    try:
        while True:
            try:
                frame = await asyncio.to_thread(get_instance_screenshot, name, "jpeg", max_width)
            except Exception as e:
                await websocket.send_json({"error": str(e)})
                break
            await websocket.send_bytes(frame)
            await asyncio.sleep(delay)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
