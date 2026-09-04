#!/usr/bin/env python3
"""Diagnostic benchmark and network profiler for MOEYS PDF downloads on production.

Run directly in the production environment:
    python scripts/diagnose_prod_download.py
"""

import concurrent.futures
import platform
import socket
import subprocess
import sys
import time
import urllib.request
from urllib.parse import urlparse

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36"
BROWSER_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,application/pdf,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,km;q=0.8",
    "Referer": "https://moeys.gov.kh/",
    "Sec-Ch-Ua": '"Chromium";v="138", "Google Chrome";v="138", "Not?A_Brand";v="99"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"' if sys.platform == "win32" else '"Linux"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}

TEST_URL = "https://moeys.gov.kh/storage/uploads/documents/6722f6eac4de0.pdf"  # Phnom Penh 2024 (64 MB)


def log(section: str, message: str) -> None:
    print(f"[{section}] {message}", flush=True)


def test_system_info():
    log("SYSTEM", f"OS: {platform.platform()}, Python: {sys.version.split()[0]}, Arch: {platform.machine()}")
    curl_path = "curl.exe" if sys.platform == "win32" else "curl"
    try:
        res = subprocess.run([curl_path, "--version"], capture_output=True, text=True, check=False)
        first_line = res.stdout.splitlines()[0] if res.stdout else "unknown"
        log("SYSTEM", f"curl available: {first_line}")
    except Exception as e:
        log("SYSTEM", f"curl not available: {e}")


def test_dns_and_latency(hostname: str):
    t0 = time.time()
    try:
        ips = socket.gethostbyname_ex(hostname)[2]
        dns_time = (time.time() - t0) * 1000
        log("DNS", f"{hostname} resolved to {ips} in {dns_time:.1f}ms")
    except Exception as e:
        log("DNS", f"Failed to resolve {hostname}: {e}")
        return

    # Measure TCP connect latency to port 443
    target_ip = ips[0]
    t0 = time.time()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(10.0)
        s.connect((target_ip, 443))
        s.close()
        tcp_time = (time.time() - t0) * 1000
        log("LATENCY", f"TCP connection to {target_ip}:443 established in {tcp_time:.1f}ms")
    except Exception as e:
        log("LATENCY", f"TCP connection to {target_ip}:443 failed: {e}")


def test_headers_and_status(url: str):
    log("HTTP-CHECK", f"Probing {url} with HEAD and GET Range...")
    try:
        req = urllib.request.Request(url, method="HEAD", headers=BROWSER_HEADERS)
        with urllib.request.urlopen(req, timeout=15) as resp:
            headers = dict(resp.headers)
            log("HTTP-CHECK", f"HEAD Status: {resp.status}")
            log("HTTP-CHECK", f"  Content-Length: {headers.get('content-length', 'missing')}")
            log("HTTP-CHECK", f"  Content-Type: {headers.get('content-type', 'missing')}")
            log("HTTP-CHECK", f"  Server: {headers.get('server', 'unknown')}")
            log("HTTP-CHECK", f"  Volterra POP: {headers.get('x-volterra-location', 'unknown')}")
            log("HTTP-CHECK", f"  Accept-Ranges: {headers.get('accept-ranges', 'unknown')}")
    except Exception as e:
        log("HTTP-CHECK", f"HEAD request failed: {e}")

    # Test Range request
    try:
        req = urllib.request.Request(url, headers={**BROWSER_HEADERS, "Range": "bytes=0-1023"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            headers = dict(resp.headers)
            data = resp.read()
            is_pdf = data.startswith(b"%PDF")
            log("HTTP-CHECK", f"Range (bytes=0-1023) Status: {resp.status}, Content-Range: {headers.get('content-range')}")
            log("HTTP-CHECK", f"  Received {len(data)} bytes, is PDF magic header (%PDF): {is_pdf}")
            if not is_pdf:
                log("HTTP-CHECK", f"  WARNING: Non-PDF header received: {data[:100]!r}")
    except Exception as e:
        log("HTTP-CHECK", f"Range request failed: {e}")


def benchmark_single_urllib(url: str, size_bytes: int = 2 * 1024 * 1024):
    log("BENCH-URLLIB", f"Benchmarking single-stream urllib download of {size_bytes / 1024 / 1024:.1f} MB...")
    req = urllib.request.Request(url, headers={**BROWSER_HEADERS, "Range": f"bytes=0-{size_bytes - 1}"})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
            duration = time.time() - t0
            speed_kb = (len(data) / 1024) / max(0.001, duration)
            log("BENCH-URLLIB", f"Downloaded {len(data):,} bytes in {duration:.2f}s -> {speed_kb:.1f} KB/s ({speed_kb / 1024:.2f} MB/s)")
    except Exception as e:
        log("BENCH-URLLIB", f"Failed: {e}")


def benchmark_single_curl(url: str, size_bytes: int = 2 * 1024 * 1024):
    curl_path = "curl.exe" if sys.platform == "win32" else "curl"
    log("BENCH-CURL", f"Benchmarking single-stream curl download of {size_bytes / 1024 / 1024:.1f} MB...")
    cmd = [
        curl_path,
        "-L",
        "--silent",
        "--show-error",
        "-r", f"0-{size_bytes - 1}",
        "-A", USER_AGENT,
        "-e", "https://moeys.gov.kh/",
        "-H", "Accept: application/pdf,*/*",
        "-H", "Accept-Language: en-US,en;q=0.9",
        "--connect-timeout", "15",
        "--speed-limit", "1024",
        "--speed-time", "15",
        url,
        "-o", "-"
    ]
    t0 = time.time()
    try:
        res = subprocess.run(cmd, capture_output=True, check=False)
        duration = time.time() - t0
        received_bytes = len(res.stdout)
        speed_kb = (received_bytes / 1024) / max(0.001, duration)
        log("BENCH-CURL", f"Downloaded {received_bytes:,} bytes in {duration:.2f}s -> {speed_kb:.1f} KB/s ({speed_kb / 1024:.2f} MB/s), code={res.returncode}")
        if res.stderr:
            log("BENCH-CURL", f"stderr: {res.stderr.decode('utf-8', errors='ignore').strip()}")
    except Exception as e:
        log("BENCH-CURL", f"Failed: {e}")


def benchmark_parallel_curl(url: str, num_workers: int = 4, chunk_size: int = 2 * 1024 * 1024):
    curl_path = "curl.exe" if sys.platform == "win32" else "curl"
    log("BENCH-PARALLEL-CURL", f"Benchmarking {num_workers} parallel curl workers ({num_workers * chunk_size / 1024 / 1024:.1f} MB total)...")

    def fetch_worker(worker_id: int):
        s = worker_id * chunk_size
        e = (worker_id + 1) * chunk_size - 1
        cmd = [
            curl_path,
            "-L",
            "--silent",
            "--show-error",
            "-r", f"{s}-{e}",
            "-A", USER_AGENT,
            "-e", "https://moeys.gov.kh/",
            "-H", "Accept: application/pdf,*/*",
            "-H", "Accept-Language: en-US,en;q=0.9",
            "--connect-timeout", "15",
            "--speed-limit", "1024",
            "--speed-time", "15",
            url,
            "-o", "-"
        ]
        t_w = time.time()
        res = subprocess.run(cmd, capture_output=True, check=False)
        dur = time.time() - t_w
        return worker_id, len(res.stdout), dur, res.returncode

    t0 = time.time()
    results = []
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=num_workers) as pool:
            futures = [pool.submit(fetch_worker, i) for i in range(num_workers)]
            for f in concurrent.futures.as_completed(futures):
                results.append(f.result())
        total_dur = time.time() - t0
        total_bytes = sum(r[1] for r in results)
        effective_speed = (total_bytes / 1024) / max(0.001, total_dur)
        for w_id, b, d, code in sorted(results):
            log("BENCH-PARALLEL-CURL", f"  Worker {w_id}: {b:,} bytes in {d:.2f}s ({(b / 1024) / max(0.001, d):.1f} KB/s), code={code}")
        log("BENCH-PARALLEL-CURL", f"Result: {total_bytes:,} bytes in {total_dur:.2f}s -> Aggregated Speed: {effective_speed:.1f} KB/s ({effective_speed / 1024:.2f} MB/s)")
    except Exception as e:
        log("BENCH-PARALLEL-CURL", f"Parallel curl test failed: {e}")


def benchmark_single_urllib(url: str, size_bytes: int = 2 * 1024 * 1024):
    log("BENCH-URLLIB", f"Benchmarking single-stream urllib download of {size_bytes / 1024 / 1024:.1f} MB (with 15s timeout)...")
    socket.setdefaulttimeout(15.0)
    req = urllib.request.Request(url, headers={**BROWSER_HEADERS, "Range": f"bytes=0-{size_bytes - 1}"})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            chunks = []
            total = 0
            while total < size_bytes:
                chunk = resp.read(65536)
                if not chunk:
                    break
                chunks.append(chunk)
                total += len(chunk)
            data = b"".join(chunks)
            duration = time.time() - t0
            speed_kb = (len(data) / 1024) / max(0.001, duration)
            log("BENCH-URLLIB", f"Downloaded {len(data):,} bytes in {duration:.2f}s -> {speed_kb:.1f} KB/s ({speed_kb / 1024:.2f} MB/s)")
    except Exception as e:
        log("BENCH-URLLIB", f"Failed: {e}")


def main():
    print("=" * 65)
    print("  MOEYS PDF Download Diagnostic & Network Profiler")
    print("=" * 65)
    test_system_info()
    parsed = urlparse(TEST_URL)
    test_dns_and_latency(parsed.hostname or "moeys.gov.kh")
    test_headers_and_status(TEST_URL)
    # Test curl FIRST
    benchmark_single_curl(TEST_URL, 2 * 1024 * 1024)
    benchmark_parallel_curl(TEST_URL, num_workers=4, chunk_size=2 * 1024 * 1024)
    # Test urllib with safe timeouts
    benchmark_single_urllib(TEST_URL, 2 * 1024 * 1024)
    print("=" * 65)
    print("  Diagnostic Complete. Please share the output above.")
    print("=" * 65)


if __name__ == "__main__":
    main()
