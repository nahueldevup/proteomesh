import re
import sys
import json
import hashlib
import subprocess
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
LOCK_FILE = REPO_ROOT / "modules.lock"
SHA256_RE = re.compile(r"^[0-9a-fA-F]{64}$")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


class DepsF4Test(unittest.TestCase):
    def setUp(self):
        self.assertTrue(LOCK_FILE.exists(), "modules.lock no existe")
        self.lock = json.loads(LOCK_FILE.read_text(encoding="utf-8"))

    def test_modules_lock_has_required_dependencies(self):
        deps = self.lock.get("dependencies", {})
        for req in ("redroid_base", "nohello", "magisk", "lsposed"):
            self.assertIn(req, deps, f"Falta la dependencia requerida '{req}' en modules.lock")

        # Verificar que no queden dependencias manuales sin cerrar
        manual = self.lock.get("manual", {})
        self.assertEqual(len(manual), 0, f"No deben quedar dependencias manuales: {manual}")

    def test_dockerfile_pinned_to_locked_digest(self):
        base_dep = self.lock["dependencies"]["redroid_base"]
        expected_digest = base_dep["digest"]
        self.assertTrue(expected_digest.startswith("sha256:"))

        dockerfile = REPO_ROOT / base_dep.get("pinned_in", "Dockerfile")
        self.assertTrue(dockerfile.exists())
        content = dockerfile.read_text(encoding="utf-8")

        self.assertIn(
            expected_digest,
            content,
            f"El Dockerfile no tiene fijado el digest exacto {expected_digest}"
        )

    def test_urls_and_hashes_valid_format(self):
        deps = self.lock.get("dependencies", {})
        for dep_id, dep in deps.items():
            with self.subTest(dep=dep_id):
                if "url" in dep:
                    self.assertTrue(dep["url"].startswith("https://"), f"{dep_id}: URL debe usar https")
                    self.assertTrue(SHA256_RE.fullmatch(dep["sha256"]), f"{dep_id}: sha256 debe ser 64 hex chars")
                if "digest" in dep:
                    self.assertTrue(dep["digest"].startswith("sha256:"), f"{dep_id}: digest debe iniciar con sha256:")

    def test_local_artifacts_match_hashes(self):
        artifacts = self.lock.get("local_artifacts", {})
        self.assertGreaterEqual(len(artifacts), 5)
        for name, art in artifacts.items():
            with self.subTest(artifact=name):
                p = REPO_ROOT / art["path"]
                self.assertTrue(p.exists(), f"Artefacto local {art['path']} no encontrado")
                actual_hash = sha256_file(p)
                self.assertEqual(
                    actual_hash,
                    art["sha256"],
                    f"Hash discrepante para {name} en {art['path']}"
                )

    def test_deps_fetch_verify_tool_succeeds(self):
        res = subprocess.run(
            [sys.executable, str(REPO_ROOT / "tools" / "deps_fetch.py"), "verify"],
            capture_output=True,
            text=True
        )
        self.assertEqual(
            res.returncode,
            0,
            f"tools/deps_fetch.py verify falló:\nSTDOUT:\n{res.stdout}\nSTDERR:\n{res.stderr}"
        )


if __name__ == "__main__":
    unittest.main()
