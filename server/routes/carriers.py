"""
Rutas para catálogo de operadoras telefónicas
"""
from typing import List
from fastapi import APIRouter, HTTPException

from server.models.schemas import CarrierSchema
from server.services.manager_bridge import get_carriers_catalog, save_custom_carrier

router = APIRouter(prefix="/carriers", tags=["Operadoras Telefónicas"])


@router.get("", response_model=List[CarrierSchema], summary="Listar catálogo de operadoras")
def list_carriers():
    """Retorna todas las operadoras registradas (Argentina, USA, España, México, Brasil, etc.)."""
    return get_carriers_catalog()


@router.post("", response_model=CarrierSchema, status_code=201, summary="Registrar operadora personalizada")
def create_carrier(carrier: CarrierSchema):
    """Permite a un usuario o agente de IA registrar una nueva operadora con MCC/MNC y timezone específicos."""
    try:
        return save_custom_carrier(carrier)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al registrar operadora: {e}")
