"""
Tests unitarios para la optimización de arranque por lotes (perf/boot-batching):
- Desactivación inteligente mediante pm list packages -d
- Verificación de solo lectura en la segunda pasada
- Semáforo de concurrencia en group start
"""
import sys
import asyncio
import unittest
from unittest.mock import MagicMock, patch
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(REPO_ROOT / "tools") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "tools"))

from instance_manager import (
    get_disabled_packages,
    apply_runtime_defaults,
    DISABLE_PACKAGES,
)
from server.services import manager_bridge


class BootBatchingTest(unittest.TestCase):
    def test_get_disabled_packages_parsing(self):
        sample_output = (
            "package:com.android.bluetooth\n"
            "package:com.android.nfc\n"
            "package:com.google.android.setupwizard\n"
        )
        with patch("instance_manager._run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0, stdout=sample_output)
            res = get_disabled_packages("127.0.0.1:5580")
            self.assertEqual(res, {
                "com.android.bluetooth",
                "com.android.nfc",
                "com.google.android.setupwizard",
            })

    def test_apply_runtime_defaults_only_disables_missing_packages(self):
        # Simula que 20 de los 22 paquetes ya están desactivados
        already_disabled = set(DISABLE_PACKAGES[:20])
        already_disabled.add("com.android.provision")

        executed_cmds = []

        def fake_run(cmd, *args, **kwargs):
            executed_cmds.append(cmd)
            cmd_str = " ".join(cmd)
            if "pm list packages -d" in cmd_str:
                out = "\n".join(f"package:{p}" for p in already_disabled)
                return MagicMock(returncode=0, stdout=out)
            if "wm size" in cmd_str or "wm density" in cmd_str:
                return MagicMock(returncode=0, stdout="Override size: 1080x2340\nOverride density: 440")
            if "pm disable-user" in cmd_str:
                return MagicMock(returncode=0, stdout="Package new state: disabled-user")
            return MagicMock(returncode=0, stdout="")

        with patch("instance_manager._run", side_effect=fake_run):
            meta = {"display": {"width": 1080, "height": 2340, "dpi": 440}}
            w, h, dpi, disabled_count, display_ok = apply_runtime_defaults("127.0.0.1:5580", meta)

            self.assertTrue(display_ok)
            # QW-6: Los paquetes faltantes se deshabilitan en UNA sola invocación batch
            batch_calls = [c for c in executed_cmds if any("for p in" in str(x) for x in c)]
            self.assertEqual(len(batch_calls), 1, "Esperaba 1 llamada batch para los paquetes faltantes")
            batch_cmd_str = " ".join(batch_calls[0])
            self.assertIn(DISABLE_PACKAGES[20], batch_cmd_str)
            self.assertIn(DISABLE_PACKAGES[21], batch_cmd_str)

    def test_apply_runtime_defaults_read_only_verify_zero_disable_calls(self):
        # En la segunda pasada con todo ya desactivado, debe hacer 0 llamadas a pm disable-user
        all_disabled = set(DISABLE_PACKAGES) | {"com.android.provision"}

        executed_cmds = []

        def fake_run(cmd, *args, **kwargs):
            executed_cmds.append(cmd)
            cmd_str = " ".join(cmd)
            if "pm list packages -d" in cmd_str:
                out = "\n".join(f"package:{p}" for p in all_disabled)
                return MagicMock(returncode=0, stdout=out)
            if "wm size" in cmd_str:
                return MagicMock(returncode=0, stdout="Override size: 1080x2340")
            if "wm density" in cmd_str:
                return MagicMock(returncode=0, stdout="Override density: 440")
            return MagicMock(returncode=0, stdout="")

        with patch("instance_manager._run", side_effect=fake_run):
            meta = {"display": {"width": 1080, "height": 2340, "dpi": 440}}
            w, h, dpi, disabled_count, display_ok = apply_runtime_defaults(
                "127.0.0.1:5580", meta, read_only_verify=True
            )

            self.assertTrue(display_ok)
            self.assertEqual(disabled_count, len(DISABLE_PACKAGES))
            pm_disable_calls = [c for c in executed_cmds if "disable-user" in c]
            self.assertEqual(len(pm_disable_calls), 0)


class GroupStartSemaphoreTest(unittest.IsolatedAsyncioTestCase):
    async def test_group_start_semaphore_bounds_concurrency(self):
        manager_bridge._group_start_semaphore = None
        with patch.dict("os.environ", {"GROUP_START_CONCURRENCY": "2"}):
            active_concurrency = 0
            max_observed = 0

            async def fake_start(inst):
                nonlocal active_concurrency, max_observed
                active_concurrency += 1
                if active_concurrency > max_observed:
                    max_observed = active_concurrency
                await asyncio.sleep(0.05)
                active_concurrency -= 1

            with patch("server.services.manager_bridge.start_instance_async", side_effect=fake_start):
                names = ["inst-1", "inst-2", "inst-3", "inst-4"]
                res = await manager_bridge.group_lifecycle_async(names, "start")
                self.assertEqual(res["total"], 4)
                self.assertEqual(res["succeeded"], 4)
                self.assertLessEqual(max_observed, 2)
                self.assertGreaterEqual(max_observed, 1)


if __name__ == "__main__":
    unittest.main()
