"""
Rutas para catálogo de plantillas de hardware
"""
from typing import Dict, List, Any
from fastapi import APIRouter, HTTPException

from server.models.schemas import TemplateItem
from server.services.manager_bridge import get_templates_catalog, get_template_detail

router = APIRouter(prefix="/templates", tags=["Plantillas de Hardware"])


@router.get("", response_model=Dict[str, List[TemplateItem]], summary="Listar catálogo de plantillas por fabricante")
def list_templates():
    """Retorna los 17 modelos oficiales organizados por marca (Samsung, Motorola, Xiaomi, Google)."""
    return get_templates_catalog()


@router.get("/{brand}/{model}", response_model=Dict[str, Any], summary="Obtener definición completa de un modelo")
def get_template(brand: str, model: str):
    """Retorna el JSON completo de hardware (SoC, cámaras, sensores MEMS, TAC, GPU) de un modelo."""
    try:
        return get_template_detail(brand, model)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
