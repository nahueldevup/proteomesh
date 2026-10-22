import re
import zipfile
import subprocess
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
FORBIDDEN_MODEL_PATTERNS = [
    re.compile(r"\bPixel\s*5\b", re.IGNORECASE),
    re.compile(r"\bredfin\b", re.IGNORECASE),
    re.compile(r"\bSM7250\b", re.IGNORECASE),
    re.compile(r"35824011"),  # TAC específico de Pixel 5
]


class ModelAgnosticTest(unittest.TestCase):
    def test_dockerfile_has_no_baked_templates_or_default_profile(self):
        dockerfile = REPO_ROOT / "Dockerfile"
        content = dockerfile.read_text()
        self.assertNotIn("COPY templates /system/etc/proteomesh/templates", content)
        self.assertNotIn("COPY templates/google/pixel5_redfin.json /system/etc/proteomesh_profile.json", content)
        self.assertNotIn("pixel5", content.lower())

    def test_runtime_scripts_have_no_model_fallbacks(self):
        scripts_dir = REPO_ROOT / "build_magisk" / "system" / "bin"
        self.assertTrue(scripts_dir.exists())

        for script in scripts_dir.iterdir():
            if script.is_file() and not script.name.endswith(".orig"):
                content = script.read_text(errors="ignore")
                for pat in FORBIDDEN_MODEL_PATTERNS:
                    m = pat.search(content)
                    self.assertIsNone(
                        m,
                        f"Patrón prohibido {pat.pattern!r} encontrado en {script.relative_to(REPO_ROOT)}: '{m.group(0) if m else ''}'"
                    )

    def test_permissions_xml_has_no_model_strings(self):
        xml_file = REPO_ROOT / "build_magisk" / "vendor" / "etc" / "permissions" / "handheld_core_hardware.xml"
        self.assertTrue(xml_file.exists())
        content = xml_file.read_text()
        for pat in FORBIDDEN_MODEL_PATTERNS:
            self.assertIsNone(pat.search(content), f"Patrón prohibido en {xml_file.name}")

    def test_profile_loader_sources_have_no_model_fallbacks(self):
        pl_dir = REPO_ROOT / "src" / "profile_loader"
        for src in pl_dir.glob("*.c"):
            content = src.read_text(errors="ignore")
            for pat in FORBIDDEN_MODEL_PATTERNS:
                m = pat.search(content)
                self.assertIsNone(
                    m,
                    f"Patrón prohibido {pat.pattern!r} en {src.relative_to(REPO_ROOT)}"
                )

    def test_lsposed_module_sources_have_no_model_fallbacks(self):
        java_dir = REPO_ROOT / "src" / "lsposed_module" / "com" / "fakewifi" / "pixel"
        for src in java_dir.glob("*.java"):
            content = src.read_text(errors="ignore")
            for pat in FORBIDDEN_MODEL_PATTERNS:
                m = pat.search(content)
                self.assertIsNone(
                    m,
                    f"Patrón prohibido {pat.pattern!r} en {src.relative_to(REPO_ROOT)}"
                )

    def test_binary_profile_loader_has_no_model_strings(self):
        bin_path = REPO_ROOT / "build_magisk" / "system" / "bin" / "profile-loader"
        self.assertTrue(bin_path.exists())
        res = subprocess.run(["strings", str(bin_path)], capture_output=True, text=True, check=True)
        strings_out = res.stdout
        for pat in FORBIDDEN_MODEL_PATTERNS:
            m = pat.search(strings_out)
            self.assertIsNone(
                m,
                f"Patrón prohibido {pat.pattern!r} encontrado en binario compilado profile-loader"
            )

    def test_dex_module_has_no_model_strings(self):
        apk_path = REPO_ROOT / "modules" / "FakeWifiPixel.apk"
        self.assertTrue(apk_path.exists())
        with zipfile.ZipFile(apk_path, "r") as zf:
            dex_bytes = zf.read("classes.dex")

        # Extraer strings imprimibles del DEX
        text = dex_bytes.decode("latin1", errors="ignore")
        for pat in FORBIDDEN_MODEL_PATTERNS:
            m = pat.search(text)
            self.assertIsNone(
                m,
                f"Patrón prohibido {pat.pattern!r} encontrado en classes.dex de FakeWifiPixel.apk"
            )


if __name__ == "__main__":
    unittest.main()
