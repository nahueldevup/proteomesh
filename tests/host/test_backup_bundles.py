"""
Tests para tools/backup_bundles.sh:
Empaquetado, cifrado, verificación, restauración y rotación de bundles e identidades.
"""
import hashlib
import json
import os
import stat
import subprocess
import time
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parents[2] / "tools" / "backup_bundles.sh"


def run_script(*args, env=None, check=True):
    """Ejecuta tools/backup_bundles.sh y retorna subprocess.CompletedProcess."""
    cmd = [str(SCRIPT_PATH)] + list(args)
    run_env = os.environ.copy()
    if env:
        run_env.update(env)
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        env=run_env,
        check=check,
    )


def test_backup_bundles_help():
    """Verifica que --help y -h retornen código 0 y la ayuda completa."""
    res = run_script("--help")
    assert res.returncode == 0
    assert "Uso:" in res.stdout
    assert "--verify" in res.stdout
    assert "--restore" in res.stdout
    assert "--keep" in res.stdout


def test_backup_bundles_unencrypted(tmp_path):
    """Verifica creación de backup sin cifrar (.tar.gz) y permisos seguros."""
    dest = tmp_path / "backups"
    res = run_script("--dest", str(dest), "--no-encrypt", "--keep", "5", "--no-db")
    assert res.returncode == 0

    # Comprobar permisos del directorio (0700)
    dest_mode = stat.S_IMODE(os.stat(dest).st_mode)
    assert dest_mode == 0o700

    # Comprobar existencia del archivo .tar.gz
    tars = list(dest.glob("proteomesh-bundles-*.tar.gz"))
    assert len(tars) == 1
    tar_file = tars[0]

    # Comprobar permisos del archivo (0600)
    file_mode = stat.S_IMODE(os.stat(tar_file).st_mode)
    assert file_mode == 0o600

    # Verificar que es un tar.gz válido
    chk = subprocess.run(["tar", "-tzf", str(tar_file)], capture_output=True, text=True)
    assert chk.returncode == 0
    assert "backup_manifest.json" in chk.stdout


def test_backup_bundles_encrypted_and_verify(tmp_path):
    """Verifica creación cifrada con AES-256-CBC y comprobación con --verify."""
    dest = tmp_path / "backups_enc"
    passphrase = "test_super_secure_pass_456"

    # 1. Crear backup cifrado
    res = run_script(
        "--dest", str(dest),
        "--pass", passphrase,
        "--keep", "3",
        "--no-db",
    )
    assert res.returncode == 0
    encs = list(dest.glob("proteomesh-bundles-*.tar.gz.enc"))
    assert len(encs) == 1
    enc_file = encs[0]

    # 2. Verificar con la frase correcta
    v_res = run_script("--verify", str(enc_file), "--pass", passphrase)
    assert v_res.returncode == 0
    assert "Verificación exitosa" in v_res.stdout

    # 3. Verificar con frase errónea debe fallar
    v_bad = run_script("--verify", str(enc_file), "--pass", "wrong_password", check=False)
    assert v_bad.returncode != 0
    assert "Fallo de descifrado" in v_bad.stderr or "error" in v_bad.stderr.lower()


def test_backup_bundles_restore_and_integrity(tmp_path):
    """Verifica ciclo completo: creación, cifrado, restauración y verificación de hashes SHA256."""
    # Crear bundle simulado
    src_bundle = tmp_path / "mock_bundle"
    src_bundle.mkdir()
    prof_data = {"generated_identity": {"imei": "358742110023456", "serial": "PMESH992"}}
    manifest_data = {"bundle_format": 1, "instance_name": "mock-test"}
    meta_data = {"adb_port": 5580, "carrier": "ar_personal"}

    (src_bundle / "profile.json").write_text(json.dumps(prof_data, indent=2))
    (src_bundle / "manifest.json").write_text(json.dumps(manifest_data, indent=2))
    (src_bundle / "meta.json").write_text(json.dumps(meta_data, indent=2))

    orig_prof_hash = hashlib.sha256((src_bundle / "profile.json").read_bytes()).hexdigest()

    dest = tmp_path / "backups_restore"
    passphrase = "restore_test_pass_789"

    # Backup del directorio específico
    res_b = run_script(
        "--source", str(src_bundle),
        "--dest", str(dest),
        "--pass", passphrase,
        "--no-db",
    )
    assert res_b.returncode == 0
    enc_file = list(dest.glob("*.enc"))[0]

    # Restaurar en nuevo destino
    restore_dest = tmp_path / "restored_dir"
    res_r = run_script(
        "--restore", str(enc_file),
        "--restore-dest", str(restore_dest),
        "--pass", passphrase,
    )
    assert res_r.returncode == 0
    assert (restore_dest / "backup_manifest.json").exists()
    assert (restore_dest / "source" / "profile.json").exists()

    # Verificar que el contenido y hash se preservan bit a bit
    restored_hash = hashlib.sha256((restore_dest / "source" / "profile.json").read_bytes()).hexdigest()
    assert restored_hash == orig_prof_hash


def test_backup_bundles_rotation(tmp_path):
    """Verifica que la política de rotación --keep mantenga sólo los N más recientes."""
    dest = tmp_path / "backups_rot"
    passphrase = "rotation_pass_999"

    # Generar 4 backups consecutivos con --keep 2
    for i in range(4):
        run_script(
            "--dest", str(dest),
            "--pass", passphrase,
            "--keep", "2",
            "--no-db",
            "-q",
        )
        time.sleep(1)

    encs = list(dest.glob("*.tar.gz.enc"))
    assert len(encs) == 2


def test_backup_bundles_list(tmp_path):
    """Verifica que --list muestre adecuadamente los backups generados."""
    dest = tmp_path / "backups_list"
    run_script("--dest", str(dest), "--no-encrypt", "--keep", "5", "--no-db", "-q")

    res = run_script("--dest", str(dest), "--list")
    assert res.returncode == 0
    assert "ARCHIVO" in res.stdout
    assert "proteomesh-bundles-" in res.stdout
    assert "Total de backups encontrados: 1" in res.stdout
