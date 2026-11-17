"""
Parser y validador de volcado binario crudo para Android screencap (sin -p).
"""
import struct

# Constante de formato de píxeles en Android (hardware/libhardware/include/hardware/graphics.h)
HAL_PIXEL_FORMAT_RGBA_8888 = 1


class ScreencapParseError(ValueError):
    """Error al parsear o validar el volcado binario de screencap."""
    pass


def parse_screencap_raw(raw_data: bytes) -> tuple[int, int, bytes]:
    """
    Parsea y valida el volcado binario directo de 'screencap' (sin -p).

    Formatos soportados de encabezado:
    - 16 bytes (Android 10+): width (uint32_le), height (uint32_le), format (uint32_le), colorSpace (uint32_le)
    - 12 bytes (Android legacy): width (uint32_le), height (uint32_le), format (uint32_le)

    Retorna: (width, height, pixel_bytes)
    Lanza ScreencapParseError si el encabezado es inválido, si el formato no es RGBA_8888,
    o si la longitud total de los bytes difiere del payload esperado (width * height * 4).
    """
    if not raw_data or len(raw_data) < 12:
        raise ScreencapParseError(
            f"Datos de screencap raw demasiado cortos o vacíos ({len(raw_data) if raw_data else 0} bytes)"
        )

    w, h, fmt = struct.unpack("<III", raw_data[:12])
    if w <= 0 or h <= 0 or w > 8192 or h > 8192:
        raise ScreencapParseError(f"Dimensiones inválidas en encabezado screencap: {w}x{h}")

    expected_pixels = w * h * 4
    total_len = len(raw_data)

    if total_len == expected_pixels + 16:
        offset = 16
    elif total_len == expected_pixels + 12:
        offset = 12
    else:
        raise ScreencapParseError(
            f"Longitud de buffer ({total_len} bytes) no coincide con dimensiones {w}x{h} "
            f"(esperado {expected_pixels} + 12 o 16 bytes)"
        )

    if fmt != HAL_PIXEL_FORMAT_RGBA_8888:
        raise ScreencapParseError(
            f"Formato de píxeles no soportado: {fmt} "
            f"(se requiere HAL_PIXEL_FORMAT_RGBA_8888={HAL_PIXEL_FORMAT_RGBA_8888})"
        )

    return w, h, raw_data[offset:offset + expected_pixels]
