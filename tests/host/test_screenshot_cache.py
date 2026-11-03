"""
Tests unitarios para server.services.screenshot_cache.

Validan el comportamiento del caché de thumbnails sin necesidad de Docker:
- hit dentro del TTL (la segunda llamada no re-captura),
- fresh=True salta la caché,
- expiración por TTL,
- single-flight (peticiones concurrentes capturan una sola vez),
- invalidación por instancia,
- no cachear errores y liberar el candado.
"""
import sys
import threading
import time
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from server.services import screenshot_cache as cache


class ScreenshotCacheTest(unittest.TestCase):
    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    def test_cache_hit_within_ttl(self):
        calls = []

        def fn():
            calls.append(1)
            return b"frame"

        a = cache.capture("phone-80", "jpeg", 540, fresh=False, ttl=60, fn=fn)
        b = cache.capture("phone-80", "jpeg", 540, fresh=False, ttl=60, fn=fn)
        self.assertEqual(a, b)
        self.assertEqual(len(calls), 1)

    def test_fresh_bypasses_cache(self):
        calls = []

        def fn():
            calls.append(1)
            return b"frame" + str(len(calls)).encode()

        a = cache.capture("phone-80", "jpeg", 540, fresh=False, ttl=60, fn=fn)
        b = cache.capture("phone-80", "jpeg", 540, fresh=True, ttl=60, fn=fn)
        self.assertEqual(len(calls), 2)
        self.assertNotEqual(a, b)

    def test_ttl_expiry(self):
        calls = []

        def fn():
            calls.append(1)
            return b"frame"

        cache.capture("phone-80", "jpeg", 540, fresh=False, ttl=0.01, fn=fn)
        time.sleep(0.03)
        cache.capture("phone-80", "jpeg", 540, fresh=False, ttl=0.01, fn=fn)
        self.assertEqual(len(calls), 2)

    def test_key_separates_format_and_width(self):
        calls = []

        def fn():
            calls.append(1)
            return b"frame"

        cache.capture("phone-80", "jpeg", 540, fresh=False, ttl=60, fn=fn)
        cache.capture("phone-80", "jpeg", 360, fresh=False, ttl=60, fn=fn)
        cache.capture("phone-80", "png", 540, fresh=False, ttl=60, fn=fn)
        # tres claves distintas => tres capturas
        self.assertEqual(len(calls), 3)

    def test_single_flight(self):
        calls = []
        barrier = threading.Barrier(6)

        def fn():
            calls.append(1)
            time.sleep(0.15)
            return b"frame"

        results = []
        errors = []

        def worker():
            try:
                barrier.wait()
                results.append(
                    cache.capture("phone-80", "jpeg", 540, fresh=False, ttl=60, fn=fn)
                )
            except Exception as e:  # pragma: no cover
                errors.append(e)

        threads = [threading.Thread(target=worker) for _ in range(6)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(errors, [])
        self.assertEqual(len(calls), 1)  # una sola captura real
        self.assertEqual(len(results), 6)
        self.assertEqual(len(set(results)), 1)  # todos reciben el mismo frame

    def test_invalidate_instance(self):
        calls = []

        def fn():
            calls.append(1)
            return b"frame"

        cache.capture("phone-80", "jpeg", 540, fresh=False, ttl=60, fn=fn)
        cache.invalidate_instance("phone-80")
        cache.capture("phone-80", "jpeg", 540, fresh=False, ttl=60, fn=fn)
        self.assertEqual(len(calls), 2)

    def test_error_not_cached_and_lock_released(self):
        calls = []

        def fn():
            calls.append(1)
            if len(calls) == 1:
                raise RuntimeError("screencap falló")
            return b"ok"

        with self.assertRaises(RuntimeError):
            cache.capture("phone-80", "jpeg", 540, fresh=False, ttl=60, fn=fn)

        # El candado debe haberse liberado y el error no debe quedar cacheado.
        result = cache.capture("phone-80", "jpeg", 540, fresh=False, ttl=60, fn=fn)
        self.assertEqual(result, b"ok")
        self.assertEqual(len(calls), 2)


if __name__ == "__main__":
    unittest.main()
