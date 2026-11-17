"""
Tests para HI-5 (Ciclo de vida del semáforo de arranque grupal)
y HI-4 (Motor de observabilidad nativo GET /api/v1/metrics).
"""
import asyncio
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(REPO_ROOT / "tools") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "tools"))

from server.main import app
from server.services import manager_bridge, screenshot_cache
from server.routes import metrics


# ─── HI-5: Ciclo de vida del semáforo de arranque grupal ─────────────────────

class GroupStartSemaphoreLifecycleTest(unittest.TestCase):
    """Valida la inicialización formal del semáforo en startup/lifespan (HI-5)."""

    def setUp(self):
        manager_bridge._group_start_semaphore = None

    def test_init_group_start_semaphore(self):
        """init_group_start_semaphore inicializa una instancia con la concurrencia configurada."""
        with patch.dict(os.environ, {"GROUP_START_CONCURRENCY": "3"}):
            sem = manager_bridge.init_group_start_semaphore()
            self.assertIsInstance(sem, asyncio.Semaphore)
            self.assertEqual(sem._value, 3)

    def test_get_group_start_semaphore_returns_same_instance(self):
        """get_group_start_semaphore recupera la instancia ya creada."""
        sem1 = manager_bridge.init_group_start_semaphore()
        sem2 = manager_bridge.get_group_start_semaphore()
        self.assertIs(sem1, sem2)

    def test_startup_initializes_semaphore(self):
        """El evento de startup de FastAPI inicializa el semáforo."""
        manager_bridge._group_start_semaphore = None
        with patch("server.db.migrate.init_db"), \
             patch("server.services.manager_bridge.ensure_ws_scrcpy_daemon"), \
             patch("subprocess.run") as mock_sub:
            mock_sub.return_value = MagicMock(returncode=0, stdout="")
            with TestClient(app):
                self.assertIsNotNone(manager_bridge._group_start_semaphore)
                self.assertIsInstance(manager_bridge._group_start_semaphore, asyncio.Semaphore)


# ─── HI-4: Motor de Observabilidad Nativo (/api/v1/metrics) ─────────────────

class ScreenshotCacheMetricsTest(unittest.TestCase):
    """Valida la telemetría interna de screenshot_cache (HI-4)."""

    def setUp(self):
        screenshot_cache.clear()
        with screenshot_cache._metrics_guard:
            screenshot_cache._cache_hits = 0
            screenshot_cache._cache_misses = 0
            screenshot_cache._latencies.clear()

    def test_hit_miss_and_latency_recording(self):
        """Comprueba el cómputo de hits, misses, ratios y percentiles p50/p95."""
        # Primera llamada: cache miss (ejecuta fn)
        data1 = screenshot_cache.capture("inst1", "jpeg", 720, fresh=False, ttl=30.0, fn=lambda: b"img1")
        self.assertEqual(data1, b"img1")

        # Segunda llamada con misma clave: cache hit
        data2 = screenshot_cache.capture("inst1", "jpeg", 720, fresh=False, ttl=30.0, fn=lambda: b"img2")
        self.assertEqual(data2, b"img1")

        stats = screenshot_cache.get_cache_stats()
        self.assertEqual(stats["misses"], 1)
        self.assertEqual(stats["hits"], 1)
        self.assertEqual(stats["total_requests"], 2)
        self.assertEqual(stats["hit_ratio_percent"], 50.0)
        self.assertGreaterEqual(stats["latency_p50_ms"], 0.0)
        self.assertGreaterEqual(stats["latency_p95_ms"], 0.0)


class MetricsEndpointTest(unittest.TestCase):
    """Valida la respuesta y estructura JSON del endpoint GET /api/v1/metrics (HI-4)."""

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_metrics_endpoint_structure(self):
        """GET /api/v1/metrics retorna JSON con timestamp, instances y host."""
        response = self.client.get("/api/v1/metrics")
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertIn("timestamp", data)
        self.assertIn("instances", data)
        self.assertIn("host", data)
        self.assertIsInstance(data["instances"], list)

        # Host metrics
        host = data["host"]
        self.assertIn("zram", host)
        self.assertIn("screenshot_cache", host)

        zram = host["zram"]
        self.assertIn("total_mb", zram)
        self.assertIn("used_mb", zram)
        self.assertIn("free_mb", zram)
        self.assertIn("compression_ratio", zram)

        sc = host["screenshot_cache"]
        self.assertIn("hits", sc)
        self.assertIn("misses", sc)
        self.assertIn("hit_ratio_percent", sc)
        self.assertIn("latency_p50_ms", sc)
        self.assertIn("latency_p95_ms", sc)

    def test_container_cgroup_metrics_parsing(self):
        """Valida parsing de cgroups simulados (cpu, memoria anon/swap, pids)."""
        import tempfile
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            (tmp_path / "pids.current").write_text("145\n", encoding="utf-8")
            (tmp_path / "memory.stat").write_text(
                "anon 104857600\nfile 52428800\n", encoding="utf-8"
            )
            (tmp_path / "memory.swap.current").write_text("20971520\n", encoding="utf-8")
            (tmp_path / "cpu.stat").write_text(
                "usage_usec 15000000\nnr_throttled 2\nthrottled_usec 45000\n", encoding="utf-8"
            )

            with patch("server.routes.metrics._find_cgroup_dir", return_value=tmp_path):
                # Primera lectura
                m1 = metrics.get_container_cgroup_metrics("sim-cid-1")
                self.assertEqual(m1["pids"], 145)
                self.assertEqual(m1["memory"]["anon_mb"], 100.0)
                self.assertEqual(m1["memory"]["file_mb"], 50.0)
                self.assertEqual(m1["memory"]["swap_mb"], 20.0)
                self.assertEqual(m1["cpu"]["usage_seconds"], 15.0)
                self.assertEqual(m1["cpu"]["nr_throttled"], 2)


if __name__ == "__main__":
    unittest.main()
