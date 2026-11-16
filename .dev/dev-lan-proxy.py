#!/usr/bin/env python3
"""立象原型 · 局域网开发桥接网关
解决 macOS 下 PHP 内置服务器监听 0.0.0.0 时的 getpeername ENOTCONN 内核缺陷
实现 0.0.0.0:8765 -> 127.0.0.1:8766 高性能双向流式转发
"""
import select
import socket
import sys
import threading

BIND_HOST = '0.0.0.0'
BIND_PORT = 8765
TARGET_HOST = '127.0.0.1'
TARGET_PORT = 8766

def pipe(src, dst):
    try:
        while True:
            data = src.recv(65536)
            if not data:
                break
            dst.sendall(data)
    except Exception:
        pass
    finally:
        try: src.shutdown(socket.SHUT_RD)
        except Exception: pass
        try: dst.shutdown(socket.SHUT_WR)
        except Exception: pass

def handle_client(client_sock):
    try:
        target_sock = socket.create_connection((TARGET_HOST, TARGET_PORT), timeout=15)
    except Exception as e:
        client_sock.close()
        return

    t1 = threading.Thread(target=pipe, args=(client_sock, target_sock), daemon=True)
    t2 = threading.Thread(target=pipe, args=(target_sock, client_sock), daemon=True)
    t1.start()
    t2.start()

def main():
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((BIND_HOST, BIND_PORT))
    server.listen(128)
    print(f"[*] 局域网开发网关已就绪: http://{BIND_HOST}:{BIND_PORT} -> http://{TARGET_HOST}:{TARGET_PORT}")
    sys.stdout.flush()

    while True:
        try:
            client, addr = server.accept()
            threading.Thread(target=handle_client, args=(client,), daemon=True).start()
        except KeyboardInterrupt:
            break
        except Exception:
            pass

if __name__ == '__main__':
    main()
