"""
Tests unitarios y de integración para el Subsistema de Red USB,
Cuarentena en el Host y Libro Mayor de IPs (NET-USB-001)
"""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import pytest
from fastapi.testclient import TestClient

from server.main import app
from server.services.network.ip_ledger import IpLedger
from server.services.network.host_firewall import HostFirewall
from server.services.usb_network_service import UsbDevice, UsbNetworkService


@pytest.fixture
def tmp_ledger(tmp_path: Path):
    db_file = tmp_path / "test_ledger.db"
    ledger = IpLedger(db_path=db_file)
    return ledger


def test_ip_ledger_safety_and_reuse_exception(tmp_ledger: IpLedger):
    # 1. IP nunca vista -> segura
    is_safe, reason, conflict = tmp_ledger.check_ip_safety("190.100.20.1", "phone-80")
    assert is_safe is True
    assert reason == "safe_new"
    assert conflict is None

    # Registrar IP para phone-80
    rec = tmp_ledger.record_ip("190.100.20.1", "phone-80", "usb-1", "Personal")
    assert rec["ip"] == "190.100.20.1"
    assert rec["instance_name"] == "phone-80"

    # 2. Misma instancia reutiliza dentro del TTL -> segura (Excepción de Reuso)
    is_safe, reason, conflict = tmp_ledger.check_ip_safety("190.100.20.1", "phone-80")
    assert is_safe is True
    assert reason == "safe_same_instance"
    assert conflict is None

    # 3. Otra instancia intenta usarla -> colisión detectada
    is_safe, reason, conflict = tmp_ledger.check_ip_safety("190.100.20.1", "phone-81")
    assert is_safe is False
    assert reason == "conflict_other_instance"
    assert conflict == "phone-80"


def test_ip_ledger_ttl_and_purge(tmp_ledger: IpLedger):
    # Configurar TTL 24h
    tmp_ledger.set_ttl_setting("24h")
    assert tmp_ledger.get_ttl_setting() == "24h"

    # Inserción con expiración artificial en el pasado
    now = datetime.now(timezone.utc)
    past = (now - timedelta(days=2)).isoformat()
    with tmp_ledger._get_connection() as conn:
        conn.execute(
            """
            INSERT INTO usb_ip_ledger (ip, instance_name, usb_id, carrier, first_seen_at, last_seen_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            ("181.10.10.10", "old-phone", "usb-0", "Claro", past, past, past),
        )

    # La IP expirada debe ser tratada como segura / nunca vista
    is_safe, reason, _ = tmp_ledger.check_ip_safety("181.10.10.10", "new-phone")
    assert is_safe is True
    assert reason == "safe_new"

    # Purgar expiradas
    purged = tmp_ledger.purge_expired()
    assert purged == 1

    entries = tmp_ledger.list_entries(active_only=True)
    assert len(entries) == 0


def test_host_firewall_table_id():
    fw = HostFirewall()
    assert fw._calc_table_id("172.17.0.2") == 202
    assert fw._calc_table_id("172.17.0.80") == 280
    assert fw._calc_table_id("invalido") == 200


def test_usb_network_service_fifo_queue():
    import asyncio
    async def _run_test():
        svc = UsbNetworkService()

        # Sin dispositivos disponibles -> va a cola WAITING_USB
        with patch.object(svc, "_container_running", return_value=True), \
             patch.object(svc, "_container_ip", return_value="172.17.0.10"), \
             patch.object(svc, "discover_usb_devices", return_value=[]):

            res1 = await svc.claim_usb("phone-1")
            assert res1["status"] == "waiting"
            assert res1["state"] == "WAITING_USB"
            assert res1["queue_position"] == 1
            assert "phone-1" in svc.waiting_queue

            res2 = await svc.claim_usb("phone-2")
            assert res2["status"] == "waiting"
            assert res2["queue_position"] == 2
            assert svc.waiting_queue == ["phone-1", "phone-2"]

            # Liberar NO hace pop ciego: inicia oferta temporal de 5s para el primero (phone-1)
            rel_res = await svc.release_network("phone-0")
            assert rel_res["status"] == "ok"
            assert rel_res["offered_next"] == "phone-1"
            assert rel_res["pending_offer"] is not None
            assert rel_res["pending_offer"]["instance"] == "phone-1"
            assert rel_res["pending_offer"]["expires_in_seconds"] == 5
            # Sigue en la cola mientras transcurren los 5s
            assert svc.waiting_queue == ["phone-1", "phone-2"]

            # Estado de instancia refleja OFFERED
            st1 = await svc.get_instance_network_state("phone-1")
            assert st1["state"] == "OFFERED"
            assert st1["pending_offer"]["instance"] == "phone-1"

            # Limpiar timers pendientes para cerrar la prueba limpia
            svc._cancel_offer_unlocked()

    asyncio.run(_run_test())


def test_grace_period_auto_claim_success():
    import asyncio

    async def _test():
        svc = UsbNetworkService()
        svc.waiting_queue = ["phone-1", "phone-2"]

        # Mockear claim_usb para simular auto-asignación exitosa tras expiración
        with patch.object(svc, "_claim_usb_unlocked", new_callable=AsyncMock) as mock_claim:
            async def _fake_claim(name, preferred_serial=None, steal_from=None):
                if name in svc.waiting_queue:
                    svc.waiting_queue.remove(name)
                return {"status": "ok", "state": "CONNECTED_USB"}
            mock_claim.side_effect = _fake_claim

            # Iniciar oferta con sleep mockeado de 0 segundos
            with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
                mock_sleep.return_value = None
                svc._start_offer_unlocked("phone-1", "SER123")
                # Esperar a que la tarea del timer se complete
                await svc._offer_task

            # Al finalizar con éxito, phone-1 fue retirado definitivamente de waiting_queue
            assert svc.waiting_queue == ["phone-2"]
            assert svc._pending_offer is None
            mock_claim.assert_called_once_with("phone-1", preferred_serial="SER123")

    asyncio.run(_test())


def test_grace_period_claim_failure_retains_instance_in_queue():
    import asyncio

    async def _test():
        svc = UsbNetworkService()
        svc.waiting_queue = ["phone-1", "phone-2"]

        # Si _claim_usb_unlocked falla, NO se expulsa de la cola y se registra el error
        with patch.object(svc, "_claim_usb_unlocked", new_callable=AsyncMock) as mock_claim:
            mock_claim.side_effect = RuntimeError("Módem ocupado o error DHCP")

            with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
                mock_sleep.return_value = None
                svc._start_offer_unlocked("phone-1", "SER123")
                await svc._offer_task

            # phone-1 sigue en la cola
            assert svc.waiting_queue == ["phone-1", "phone-2"]
            assert svc._pending_offer is None
            assert svc._instance_states["phone-1"]["state"] == "WAITING_USB"
            assert "error" in svc._instance_states["phone-1"]

    asyncio.run(_test())


def test_decline_offer_requeue_and_promote_next():
    import asyncio

    async def _test():
        svc = UsbNetworkService()
        svc.waiting_queue = ["phone-1", "phone-2", "phone-3"]
        svc._start_offer_unlocked("phone-1", "SER123")

        # phone-1 cede turno (requeue=True)
        res = await svc.decline_offer("phone-1", requeue=True)
        assert res["status"] == "ok"
        assert res["requeued"] is True
        # phone-1 pasa al final de la cola
        assert svc.waiting_queue == ["phone-2", "phone-3", "phone-1"]
        # phone-2 es promovido inmediatamente con oferta de 5s
        assert res["next_offered"] == "phone-2"
        assert svc._pending_offer is not None
        assert svc._pending_offer["instance"] == "phone-2"

        # phone-2 declina definitivamente (requeue=False)
        res2 = await svc.decline_offer("phone-2", requeue=False)
        assert res2["status"] == "ok"
        assert res2["requeued"] is False
        assert svc.waiting_queue == ["phone-3", "phone-1"]
        assert res2["next_offered"] == "phone-3"
        assert svc._pending_offer["instance"] == "phone-3"

        svc._cancel_offer_unlocked()

    asyncio.run(_test())


def test_immediate_claim_cancels_offer_timer():
    import asyncio

    async def _test():
        svc = UsbNetworkService()
        svc.waiting_queue = ["phone-1", "phone-2"]
        svc._start_offer_unlocked("phone-1", "SER123")
        assert svc._pending_offer["instance"] == "phone-1"

        with patch.object(svc, "_claim_usb_unlocked", new_callable=AsyncMock) as mock_claim:
            mock_claim.return_value = {"status": "ok", "state": "CONNECTED_USB"}
            # phone-1 pulsa "Conectar ya"
            claim_res = await svc.claim_usb("phone-1")
            assert claim_res["status"] == "ok"
            # La oferta se canceló inmediatamente
            assert svc._pending_offer is None
            mock_claim.assert_called_once_with(instance_name="phone-1", preferred_serial=None, steal_from=None)

    asyncio.run(_test())


def test_network_api_endpoints():
    client = TestClient(app)

    # 1. Resumen de estado
    r = client.get("/api/v1/network/status")
    assert r.status_code == 200
    data = r.json()
    assert "summary" in data
    assert "devices" in data
    assert "waiting_queue" in data
    assert "pending_offer" in data

    # 1b. Declinación de oferta
    r_dec = client.post("/api/v1/instances/phone-1/network/decline-offer", json={"requeue": True})
    assert r_dec.status_code == 200
    assert r_dec.json()["status"] == "ok"
    assert r_dec.json()["requeued"] is True

    # 2. Lista de dispositivos USB
    r = client.get("/api/v1/network/usb")
    assert r.status_code == 200
    assert "devices" in r.json()

    # 3. Historial de IPs (Ledger)
    r = client.get("/api/v1/network/ip-ledger")
    assert r.status_code == 200
    ledger_data = r.json()
    assert "ttl" in ledger_data
    assert "entries" in ledger_data

    # 4. Modificar TTL
    r = client.put("/api/v1/network/ip-ledger/ttl", json={"ttl": "30d"})
    assert r.status_code == 200
    assert r.json()["ttl"] == "30d"

    # Restaurar TTL 7d
    client.put("/api/v1/network/ip-ledger/ttl", json={"ttl": "7d"})

    # 5. Purgar expiradas
    r = client.post("/api/v1/network/ip-ledger/purge")
    assert r.status_code == 200
    assert "purged" in r.json()


def test_quarantine_releases_modem_and_allows_claim():
    client = TestClient(app)
    from server.services.usb_network_service import usb_network_service

    with patch.object(usb_network_service, "release_network", new_callable=AsyncMock) as mock_rel:
        mock_rel.return_value = {
            "status": "ok",
            "instance": "f05-test",
            "state": "QUARANTINE",
            "popped_next": None,
            "message": "Instancia f05-test en cuarentena segura. Módem liberado.",
        }
        r = client.post("/api/v1/instances/f05-test/network/quarantine")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok"
        assert data["state"] == "QUARANTINE"
        assert data["quarantined"] is True
        mock_rel.assert_called_once_with("f05-test")


def test_apply_usb_routing_flushes_container_quarantine():
    import asyncio
    fw = HostFirewall()

    async def _test():
        with patch.object(fw, "_run_async", new_callable=AsyncMock) as mock_host_run, \
             patch("asyncio.create_subprocess_exec", new_callable=AsyncMock) as mock_exec, \
             patch("asyncio.wait_for", new_callable=AsyncMock) as mock_wait:
            mock_host_run.return_value = (0, "OK", "")
            mock_proc = MagicMock()
            mock_exec.return_value = mock_proc
            mock_wait.return_value = 0

            res = await fw.apply_usb_routing(
                instance_name="phone-test",
                container_ip="172.17.0.88",
                usb_iface="enp48s0f3u2",
                gateway="10.74.180.139",
                subnet="10.74.180.0/24",
            )
            assert res is True
            # Verificar que se ejecutó el script dentro del contenedor
            mock_exec.assert_called_once()
            args = mock_exec.call_args[0]
            assert args[0] == "docker"
            assert args[1] == "exec"
            assert args[2] == "phone-test"
            ct_script = args[5]
            assert "PM_QUARANTINE" in ct_script
            assert "-D OUTPUT -j PM_QUARANTINE" in ct_script
            assert "table 101" in ct_script
            assert "setprop net.dns1 8.8.8.8" in ct_script

    asyncio.run(_test())


