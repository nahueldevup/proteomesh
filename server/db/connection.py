"""
Gestor de conexiones y transacciones SQLite para ProteoMesh.
Aplica WAL mode, synchronous=NORMAL, foreign_keys=ON y timeout anti-bloqueo.
"""
import contextlib
import os
import sqlite3
from pathlib import Path
from typing import Generator, Optional

from server.config import PROTEOMESH_DB_PATH

DEFAULT_BUSY_TIMEOUT_MS = 5000


def get_db_path(override_path: Optional[Path] = None) -> Path:
    """Retorna la ruta hacia la base de datos principal de ProteoMesh."""
    if override_path is not None:
        return Path(override_path)
    env_path = os.getenv("PROTEOMESH_DB_PATH")
    if env_path:
        return Path(env_path)
    return PROTEOMESH_DB_PATH


def get_connection(
    db_path: Optional[Path] = None,
    timeout: float = 10.0,
    read_only: bool = False,
) -> sqlite3.Connection:
    """
    Crea y configura una conexión SQLite con WAL mode y claves foráneas activadas.
    """
    path = get_db_path(db_path)
    if str(path) != ":memory:":
        path.parent.mkdir(parents=True, exist_ok=True)

    if read_only and str(path) != ":memory:" and path.exists():
        uri = f"file:{path.as_posix()}?mode=ro"
        conn = sqlite3.connect(uri, uri=True, timeout=timeout)
    else:
        conn = sqlite3.connect(str(path), timeout=timeout)

    conn.row_factory = sqlite3.Row

    # Pragma pragmáticos para alto rendimiento y concurrencia
    try:
        if str(path) != ":memory:":
            conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        conn.execute(f"PRAGMA busy_timeout={DEFAULT_BUSY_TIMEOUT_MS};")
    except Exception:
        # En caso de conexión de solo lectura pueden fallar algunos pragmas de journal
        pass

    return conn


@contextlib.contextmanager
def transaction(
    conn: Optional[sqlite3.Connection] = None,
    db_path: Optional[Path] = None,
    immediate: bool = True,
) -> Generator[sqlite3.Connection, None, None]:
    """
    Context manager transaccional seguro con BEGIN IMMEDIATE y rollback automático.
    Si se proporciona una conexión existente, se reusa sin cerrarla al finalizar.
    Si se crea una nueva conexión, se realiza commit/rollback y se cierra.
    """
    close_on_exit = False
    if conn is None:
        conn = get_connection(db_path=db_path)
        close_on_exit = True

    try:
        if immediate:
            conn.execute("BEGIN IMMEDIATE")
        yield conn
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        if close_on_exit:
            conn.close()
