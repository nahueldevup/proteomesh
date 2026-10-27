#!/usr/bin/env python3
"""
Puente DNS UDP/TCP -> DNS sobre TCP.

Android resuelve por UDP contra 8.8.8.8, pero `ssh -D` solo soporta TCP.
Este proceso escucha en el host (p. ej. 172.17.0.1:7089), recibe las consultas
DNS del contenedor y las reenvía por TCP al forward local del túnel
(127.0.0.1:6089 -> 8.8.8.8:53), de modo que el DNS sale por el servidor SSH
y nunca por el resolver del host.

Uso:
  dns_bridge.py --listen-port 7089 --upstream-port 6089
"""
import argparse
import socket
import socketserver
import struct
import sys
import threading


def recv_exact(sock: socket.socket, size: int) -> bytes:
    data = b""
    while len(data) < size:
        chunk = sock.recv(size - len(data))
        if not chunk:
            raise ConnectionError("conexión DNS cerrada")
        data += chunk
    return data


def forward_tcp(query: bytes, upstream_host: str, upstream_port: int, timeout: float) -> bytes:
    with socket.create_connection((upstream_host, upstream_port), timeout=timeout) as sock:
        sock.settimeout(timeout)
        sock.sendall(struct.pack("!H", len(query)) + query)
        length = struct.unpack("!H", recv_exact(sock, 2))[0]
        return recv_exact(sock, length)


class UDPHandler(socketserver.BaseRequestHandler):
    def handle(self) -> None:
        data, sock = self.request
        try:
            response = forward_tcp(data, self.server.upstream_host, self.server.upstream_port, self.server.timeout)
            sock.sendto(response, self.client_address)
        except Exception as exc:
            print(f"[dns-bridge] UDP {self.client_address} error: {exc}", flush=True)


class TCPHandler(socketserver.BaseRequestHandler):
    def handle(self) -> None:
        try:
            length = struct.unpack("!H", recv_exact(self.request, 2))[0]
            query = recv_exact(self.request, length)
            response = forward_tcp(query, self.server.upstream_host, self.server.upstream_port, self.server.timeout)
            self.request.sendall(struct.pack("!H", len(response)) + response)
        except Exception as exc:
            print(f"[dns-bridge] TCP {self.client_address} error: {exc}", flush=True)


class UDPServer(socketserver.ThreadingUDPServer):
    allow_reuse_address = True
    daemon_threads = True


class TCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main() -> int:
    parser = argparse.ArgumentParser(description="Puente DNS UDP/TCP hacia un upstream TCP (SSH -L)")
    parser.add_argument("--listen-host", default="172.17.0.1")
    parser.add_argument("--listen-port", type=int, required=True)
    parser.add_argument("--upstream-host", default="127.0.0.1")
    parser.add_argument("--upstream-port", type=int, required=True)
    parser.add_argument("--timeout", type=float, default=8.0)
    args = parser.parse_args()

    udp = UDPServer((args.listen_host, args.listen_port), UDPHandler)
    tcp = TCPServer((args.listen_host, args.listen_port), TCPHandler)
    for server in (udp, tcp):
        server.upstream_host = args.upstream_host
        server.upstream_port = args.upstream_port
        server.timeout = args.timeout

    print(
        f"[dns-bridge] escuchando udp/tcp {args.listen_host}:{args.listen_port} "
        f"-> tcp {args.upstream_host}:{args.upstream_port}",
        flush=True,
    )
    threading.Thread(target=tcp.serve_forever, daemon=True).start()
    try:
        udp.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        udp.server_close()
        tcp.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
