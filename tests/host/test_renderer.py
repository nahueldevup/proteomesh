import sys
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "tools"))

from render import lint_template, render_bundle
from instance_manager import TEMPLATES_DIR, CARRIERS_DIR


class PureRendererTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = Path(tempfile.mkdtemp(prefix="proteomesh_render_test_"))
        self.golden_dir = REPO_ROOT / "tests" / "golden" / "bundles" / "a54x_personal_seed42"

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_all_17_templates_pass_linter(self):
        templates = list(TEMPLATES_DIR.rglob("*.json"))
        self.assertEqual(len(templates), 17, f"Se esperaban 17 plantillas, encontradas: {len(templates)}")
        for t in templates:
            with self.subTest(template=t.name):
                doc = json.loads(t.read_text(encoding="utf-8"))
                errors = lint_template(doc, str(t))
                self.assertEqual(errors, [], f"Errores en {t.name}: {errors}")

    def test_render_determinism(self):
        out1 = self.temp_dir / "run1"
        out2 = self.temp_dir / "run2"

        t_path = TEMPLATES_DIR / "samsung" / "a54x.json"
        c_path = CARRIERS_DIR / "ar_personal.json"

        res1 = render_bundle(t_path, c_path, seed=12345, instance_name="test-det", out_dir=out1)
        res2 = render_bundle(t_path, c_path, seed=12345, instance_name="test-det", out_dir=out2)

        self.assertEqual(res1["sha256"], res2["sha256"])
        self.assertEqual(res1["profile"]["generated_identity"], res2["profile"]["generated_identity"])

        # Comparación bit-a-bit de archivos generados
        for fname in ("profile.json", "manifest.json", "meta.json"):
            b1 = (out1 / fname).read_bytes()
            b2 = (out2 / fname).read_bytes()
            self.assertEqual(b1, b2, f"Discrepancia en {fname} entre dos ejecuciones con mismo seed")

    def test_render_matches_golden_file(self):
        self.assertTrue(self.golden_dir.exists(), "Directorio golden no encontrado")

        out = self.temp_dir / "golden_verify"
        t_path = TEMPLATES_DIR / "samsung" / "a54x.json"
        c_path = CARRIERS_DIR / "ar_personal.json"

        res = render_bundle(t_path, c_path, seed=42, instance_name="a54x-golden", out_dir=out)

        golden_manifest = json.loads((self.golden_dir / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(res["sha256"], golden_manifest["profile_sha256"])

        for fname in ("profile.json", "manifest.json", "meta.json"):
            rendered_bytes = (out / fname).read_bytes()
            golden_bytes = (self.golden_dir / fname).read_bytes()
            self.assertEqual(rendered_bytes, golden_bytes, f"Discrepancia con golden file en {fname}")

    def test_linter_rejects_gpu_mismatch(self):
        t_path = TEMPLATES_DIR / "samsung" / "a54x.json"
        doc = json.loads(t_path.read_text(encoding="utf-8"))

        # Incoherencia: ARM con Adreno
        doc["gpu"]["vendor"] = "ARM"
        doc["gpu"]["renderer"] = "Adreno (TM) 620"
        errors = lint_template(doc, "bad_gpu_arm")
        self.assertTrue(any("Incoherencia GPU" in e for e in errors))

        # Incoherencia: Qualcomm con Mali
        doc["gpu"]["vendor"] = "Qualcomm"
        doc["gpu"]["renderer"] = "Mali-G68 MP5"
        errors = lint_template(doc, "bad_gpu_qcom")
        self.assertTrue(any("Incoherencia GPU" in e for e in errors))

    def test_linter_rejects_invalid_tac(self):
        t_path = TEMPLATES_DIR / "samsung" / "a54x.json"
        doc = json.loads(t_path.read_text(encoding="utf-8"))

        # TAC de 7 dígitos
        doc["identity_template"]["tac"] = "1234567"
        errors = lint_template(doc, "bad_tac_len")
        self.assertTrue(any("tac" in e for e in errors))

        # TAC no numérico
        doc["identity_template"]["tac"] = "3582401A"
        errors = lint_template(doc, "bad_tac_alpha")
        self.assertTrue(any("tac" in e for e in errors))

    def test_linter_rejects_release_sdk_mismatch(self):
        t_path = TEMPLATES_DIR / "samsung" / "a54x.json"
        doc = json.loads(t_path.read_text(encoding="utf-8"))

        doc["device"]["release"] = "13"
        doc["device"]["sdk"] = "34"
        errors = lint_template(doc, "bad_release_sdk")
        self.assertTrue(any("Incoherencia Release/SDK" in e for e in errors))

    def test_linter_rejects_invalid_display(self):
        t_path = TEMPLATES_DIR / "samsung" / "a54x.json"
        doc = json.loads(t_path.read_text(encoding="utf-8"))

        doc["display"]["width"] = -1080
        errors = lint_template(doc, "bad_display")
        self.assertTrue(any("display.width" in e for e in errors))

    def test_render_pure_no_docker_or_network(self):
        t_path = TEMPLATES_DIR / "samsung" / "a54x.json"
        with patch("subprocess.run") as mock_sub, patch("socket.socket") as mock_sock:
            res = render_bundle(t_path, seed=99, instance_name="pure-test")
            mock_sub.assert_not_called()
            mock_sock.assert_not_called()
            self.assertTrue(res["sha256"])


if __name__ == "__main__":
    unittest.main()
