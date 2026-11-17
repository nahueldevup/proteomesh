"""
Tests para tools/setup_backup_schedule.sh (Automatización con Systemd Timer).
"""
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEDULE_SCRIPT = REPO_ROOT / "tools" / "setup_backup_schedule.sh"


def test_schedule_help():
    """Verifica salida del menú de ayuda y sintaxis de comandos."""
    proc = subprocess.run([str(SCHEDULE_SCRIPT), "--help"], capture_output=True, text=True)
    assert proc.returncode == 0
    assert "Uso:" in proc.stdout
    assert "--enable" in proc.stdout
    assert "--status" in proc.stdout


def test_schedule_invalid_time():
    """Verifica rechazo de formato de hora incorrecto."""
    proc = subprocess.run(
        [str(SCHEDULE_SCRIPT), "--enable", "--time", "25:99"],
        capture_output=True,
        text=True,
    )
    assert proc.returncode != 0
    assert "Hora inválida" in proc.stderr


def test_schedule_status():
    """Verifica que el comando --status se ejecute sin errores."""
    proc = subprocess.run([str(SCHEDULE_SCRIPT), "--status"], capture_output=True, text=True)
    assert proc.returncode == 0
    assert "ESTADO DE PROGRAMACIÓN DE RESPALDOS" in proc.stdout
