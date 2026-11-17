"""
Tests para QW-1 (CPU Pinning SMT + corrección regex + allocator)
y QW-8 (Paridad Web/CLI: swap expuesto y flag --dense).
"""
import json
import sys
import types
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch, call

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(REPO_ROOT / "tools") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "tools"))


# ─── QW-1: Corrección RESOURCE_CPUS_RE ───────────────────────────────────────

class ResourceCpusReTest(unittest.TestCase):
    """Valida la regex corregida RESOURCE_CPUS_RE (QW-1)."""

    def setUp(self):
        import instance_manager as im
        self.RE = im.RESOURCE_CPUS_RE

    # Válidos
    def test_accepts_smt_list(self):
        """1,9,2,10 debe ser válido (lista SMT-aware)."""
        self.assertIsNotNone(self.RE.fullmatch("1,9,2,10"))

    def test_accepts_single_list(self):
        self.assertIsNotNone(self.RE.fullmatch("0,8"))

    def test_accepts_classic_range(self):
        self.assertIsNotNone(self.RE.fullmatch("0-3"))

    def test_accepts_single_core(self):
        self.assertIsNotNone(self.RE.fullmatch("4"))

    def test_accepts_multi_range(self):
        self.assertIsNotNone(self.RE.fullmatch("0-3,8-11"))

    def test_accepts_mixed_range_and_list(self):
        """3,11,4-5 — mezcla de coma-individual y rango."""
        self.assertIsNotNone(self.RE.fullmatch("3,11,4-5"))

    # Inválidos
    def test_rejects_float(self):
        """2.0 NO debe ser válido — activa throttling CFS."""
        self.assertIsNone(self.RE.fullmatch("2.0"))

    def test_rejects_empty(self):
        self.assertIsNone(self.RE.fullmatch(""))

    def test_rejects_letters(self):
        self.assertIsNone(self.RE.fullmatch("a-b"))

    def test_rejects_leading_comma(self):
        self.assertIsNone(self.RE.fullmatch(",1,9"))


class ValidateLimitsDecimalTest(unittest.TestCase):
    """validate_limits debe rechazar decimales flotantes con mensaje claro (QW-1)."""

    def test_float_cpus_raises_systemexit(self):
        import instance_manager as im
        with self.assertRaises(SystemExit) as ctx:
            im.validate_limits(memory=None, swap=None, cpus="2.0", pids_limit=None)
        self.assertIn("CFS", str(ctx.exception))
        self.assertIn("2.0", str(ctx.exception))

    def test_smt_list_accepted_by_validate_limits(self):
        import instance_manager as im
        result = im.validate_limits(memory=None, swap=None, cpus="1,9,2,10", pids_limit=None)
        self.assertEqual(result["cpus"], "1,9,2,10")

    def test_classic_range_accepted(self):
        import instance_manager as im
        result = im.validate_limits(memory=None, swap=None, cpus="0-3", pids_limit=None)
        self.assertEqual(result["cpus"], "0-3")


# ─── QW-1: allocate_cpuset_slot ─────────────────────────────────────────────

class AllocateCpusetSlotTest(unittest.TestCase):
    """Valida el allocator de slots SMT (QW-1)."""

    def setUp(self):
        import instance_manager as im
        self.im = im
        self._orig_instances_dir = im.INSTANCES_DIR

    def tearDown(self):
        self.im.INSTANCES_DIR = self._orig_instances_dir

    def _write_meta(self, tmp_dir: Path, inst_name: str, cpuset: str) -> None:
        inst_dir = tmp_dir / inst_name
        inst_dir.mkdir(parents=True, exist_ok=True)
        meta = {"instance_name": inst_name, "limits": {"cpus": cpuset}}
        (inst_dir / "meta.json").write_text(json.dumps(meta), encoding="utf-8")

    def test_first_slot_when_no_instances(self):
        """Sin instancias activas, devuelve el primer slot (1,9)."""
        with tempfile.TemporaryDirectory() as tmp:
            self.im.INSTANCES_DIR = Path(tmp)
            slot = self.im.allocate_cpuset_slot("phone-new")
        self.assertEqual(slot, "1,9")

    def test_skips_used_slot(self):
        """Si 1,9 está ocupado, devuelve 2,10."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            self._write_meta(tmp_path, "phone-01", "1,9")
            self.im.INSTANCES_DIR = tmp_path
            slot = self.im.allocate_cpuset_slot("phone-new")
        self.assertEqual(slot, "2,10")

    def test_skips_self(self):
        """El nombre propio no cuenta como 'ocupado'."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            self._write_meta(tmp_path, "phone-new", "1,9")
            self.im.INSTANCES_DIR = tmp_path
            slot = self.im.allocate_cpuset_slot("phone-new")
        self.assertEqual(slot, "1,9")

    def test_all_slots_occupied_falls_back_to_default(self):
        """Con todos los slots ocupados, cae al default configurado."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            slots = ["1,9", "2,10", "3,11", "4,12", "5,13", "6,14"]
            for i, s in enumerate(slots):
                self._write_meta(tmp_path, f"phone-{i:02d}", s)
            self.im.INSTANCES_DIR = tmp_path
            slot = self.im.allocate_cpuset_slot("phone-new")
        # Debe ser PROTEOMESH_DEFAULT_CPUSET (1,9,2,10 por defecto)
        self.assertIn(slot, [self.im.PROTEOMESH_DEFAULT_CPUSET, "1,9,2,10"])

    def test_two_consecutively_disjoint(self):
        """Dos instancias nuevas consecutivas reciben slots disjuntos."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            self.im.INSTANCES_DIR = tmp_path
            slot_a = self.im.allocate_cpuset_slot("phone-a")
            # Simular que phone-a fue creada con ese slot
            self._write_meta(tmp_path, "phone-a", slot_a)
            slot_b = self.im.allocate_cpuset_slot("phone-b")
        self.assertNotEqual(slot_a, slot_b)


# ─── QW-8: Paridad Web/CLI ────────────────────────────────────────────────────

class LimitsSchemaSwapTest(unittest.TestCase):
    """Valida que LimitsSchema incluye swap y dense (QW-8)."""

    def test_swap_field_present_with_default(self):
        from server.models.schemas import LimitsSchema
        ls = LimitsSchema()
        self.assertEqual(ls.swap, "700m")

    def test_dense_field_present_false_by_default(self):
        from server.models.schemas import LimitsSchema
        ls = LimitsSchema()
        self.assertFalse(ls.dense)

    def test_swap_custom_value(self):
        from server.models.schemas import LimitsSchema
        ls = LimitsSchema(swap="1200m")
        self.assertEqual(ls.swap, "1200m")

    def test_cpus_default_is_smt_aware(self):
        """El default de cpus ya no es '0-3' sino el nuevo cpuset SMT-aware."""
        from server.models.schemas import LimitsSchema
        ls = LimitsSchema()
        # No debe ser el antiguo hardcoded '0-3'
        self.assertNotEqual(ls.cpus, "0-3")
        # Debe ser la lista SMT-aware del default
        self.assertEqual(ls.cpus, "1,9,2,10")


class CreateInstanceSwapTest(unittest.TestCase):
    """Valida que create_instance_async propaga --swap y --dense (QW-8)."""

    def _build_req(self, memory=None, swap=None, cpus=None, dense=False):
        from server.models.schemas import InstanceCreateRequest, LimitsSchema
        limits = LimitsSchema(
            memory=memory or "2560m",
            swap=swap or "700m",
            cpus=cpus or "1,9,2,10",
            dense=dense,
        )
        return InstanceCreateRequest(
            name="phone-test",
            port=5590,
            limits=limits,
        )

    @patch("server.services.manager_bridge.asyncio.create_subprocess_exec")
    async def _run_create(self, req, mock_exec):
        from server.services.manager_bridge import create_instance_async
        mock_proc = MagicMock()
        mock_proc.communicate = MagicMock(return_value=(b"", b""))
        mock_proc.returncode = 0
        mock_exec.return_value = mock_proc

        # Patch get_single_instance para no necesitar disco
        with patch("server.services.manager_bridge.get_single_instance", return_value=MagicMock()):
            try:
                await create_instance_async(req)
            except Exception:
                pass
        return mock_exec.call_args_list

    def _get_cmd(self, mock_exec_calls):
        """Extrae el cmd posicional de la primera llamada a create_subprocess_exec."""
        if not mock_exec_calls:
            return []
        return list(mock_exec_calls[0][0])

    def test_swap_included_in_cmd(self):
        """--swap aparece en el comando generado cuando dense=False."""
        import asyncio
        from unittest.mock import AsyncMock, patch, MagicMock
        from server.models.schemas import InstanceCreateRequest, LimitsSchema

        limits = LimitsSchema(memory="2560m", swap="700m", cpus="1,9,2,10", dense=False)
        req = InstanceCreateRequest(name="phone-test", port=5590, limits=limits)

        captured_cmd = []

        async def fake_exec(*args, **kwargs):
            captured_cmd.extend(args)
            proc = MagicMock()
            proc.communicate = AsyncMock(return_value=(b"", b""))
            proc.returncode = 0
            return proc

        async def run():
            with patch("server.services.manager_bridge.asyncio.create_subprocess_exec", side_effect=fake_exec):
                with patch("server.services.manager_bridge.get_single_instance", return_value=MagicMock()):
                    try:
                        from server.services.manager_bridge import create_instance_async
                        await create_instance_async(req)
                    except Exception:
                        pass

        asyncio.run(run())
        cmd = list(captured_cmd)
        self.assertIn("--swap", cmd, f"--swap no encontrado en cmd: {cmd}")
        idx = cmd.index("--swap")
        self.assertEqual(cmd[idx + 1], "700m")

    def test_dense_overrides_memory_swap(self):
        """--dense → cmd con --memory 2048m --swap 1200m."""
        import asyncio
        from unittest.mock import AsyncMock, patch, MagicMock
        from server.models.schemas import InstanceCreateRequest, LimitsSchema

        limits = LimitsSchema(memory="2560m", swap="700m", cpus="1,9", dense=True)
        req = InstanceCreateRequest(name="phone-dense", port=5591, limits=limits)

        captured_cmd = []

        async def fake_exec(*args, **kwargs):
            captured_cmd.extend(args)
            proc = MagicMock()
            proc.communicate = AsyncMock(return_value=(b"", b""))
            proc.returncode = 0
            return proc

        async def run():
            with patch("server.services.manager_bridge.asyncio.create_subprocess_exec", side_effect=fake_exec):
                with patch("server.services.manager_bridge.get_single_instance", return_value=MagicMock()):
                    try:
                        from server.services.manager_bridge import create_instance_async
                        await create_instance_async(req)
                    except Exception:
                        pass

        asyncio.run(run())
        cmd = list(captured_cmd)
        self.assertIn("--memory", cmd)
        mem_idx = cmd.index("--memory")
        self.assertEqual(cmd[mem_idx + 1], "2048m", "dense debe fijar memory a 2048m")
        self.assertIn("--swap", cmd)
        swap_idx = cmd.index("--swap")
        self.assertEqual(cmd[swap_idx + 1], "1200m", "dense debe fijar swap a 1200m")


class InstanceCliDenseFlagTest(unittest.TestCase):
    """Valida el soporte del flag --dense en la CLI de instance_manager (HI-2)."""

    def test_create_parser_accepts_dense(self):
        """instance_manager.py create --dense configura memory=2048m y swap=1200m."""
        import argparse
        # Instanciar el parser principal
        script = REPO_ROOT / "tools" / "instance_manager.py"
        content = script.read_text(encoding="utf-8")
        self.assertIn('"--dense"', content)
        self.assertIn("mem_arg = \"2048m\"", content)
        self.assertIn("swap_arg = \"1200m\"", content)

    @patch("instance_manager.validate_instance_name", return_value="phone-dense-test")
    @patch("instance_manager.validate_limits")
    def test_cmd_create_uses_dense_values(self, mock_val_limits, mock_val_name):
        """cmd_create_instance pasa 2048m y 1200m a validate_limits cuando args.dense es True."""
        args = MagicMock(dense=True, memory=None, swap=None, cpus=None, pids_limit=None)
        args.name = "phone-dense-test"
        args.from_bundle = None
        args.template = "a54x"

        # Simular fallo temprano tras validate_limits para no escribir a disco
        import instance_manager
        mock_val_limits.side_effect = RuntimeError("early exit")
        with self.assertRaises(RuntimeError):
            instance_manager.cmd_create_instance(args)

        mock_val_limits.assert_called_once_with(
            "2048m", None, None, swap="1200m"
        )


if __name__ == "__main__":
    unittest.main()
