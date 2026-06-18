#!/usr/bin/env python3
"""Live 'user B' observer. dev-login, join the session, then watch the canvas
for new spores arriving WITHOUT a manual refresh (proves daemon-driven live
propagation). Usage: realtime_b_observe.py <privyUserId> <sessionId> [observeSecs]"""
import os, sys, time, pathlib
from playwright.sync_api import sync_playwright
USERID = sys.argv[1]; SID = sys.argv[2]; OBSERVE = int(sys.argv[3]) if len(sys.argv) > 3 else 150
BASE = os.environ.get("BASE", "http://localhost:5173")
SHOT = pathlib.Path("/tmp/mycelia-rtb"); SHOT.mkdir(exist_ok=True)
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(f"/tmp/rtb-{USERID.replace(':','_')}", headless=True, viewport={"width":1280,"height":860}, args=["--no-sandbox"])
    page = ctx.new_page()
    page.goto(BASE, wait_until="domcontentloaded", timeout=60000); page.wait_for_timeout(3000)
    page.wait_for_selector("[data-testid=dev-userid]", timeout=20000)
    page.fill("[data-testid=dev-userid]", USERID); page.click("[data-testid=dev-login]")
    page.wait_for_selector("[data-testid=create-session]", timeout=60000)
    addr = page.get_attribute("[data-testid=my-address]", "data-address")
    print(f"[B] logged in {addr}", flush=True)
    page.fill("[data-testid=join-session-id]", SID); page.click("[data-testid=join-session]")
    base = 0
    for _ in range(40):
        page.wait_for_timeout(2000)
        if page.locator("[data-testid=spore]").count() > 0: break
    base = page.locator("[data-testid=spore]").count()
    print(f"[B] joined; baseline spores={base}", flush=True)
    page.screenshot(path=str(SHOT/"b-joined.png"))
    # reveal one node to prove cross-party decrypt
    revealed = ""
    sp = page.locator("[data-testid=spore]")
    for i in range(min(sp.count(), 6)):
        sp.nth(i).click(force=True); page.wait_for_selector("[data-testid=inspector]", timeout=8000)
        if page.locator("[data-testid=reveal]").count() > 0:
            page.click("[data-testid=reveal]")
            try: page.wait_for_selector("[data-testid=node-title]", timeout=60000); revealed = page.locator("[data-testid=node-title]").inner_text(); break
            except Exception: pass
    print(f"[B] revealed='{revealed}'", flush=True)
    print("[B] OBSERVING for live updates (no manual refresh)…", flush=True)
    detected = False
    t0 = time.time()
    while time.time() - t0 < OBSERVE:
        page.wait_for_timeout(3000)
        n = page.locator("[data-testid=spore]").count()
        if n > base:
            print(f"[B] LIVE UPDATE DETECTED: spores {base} -> {n} at +{int(time.time()-t0)}s (no manual refresh)", flush=True)
            detected = True; break
    page.screenshot(path=str(SHOT/"b-after.png"))
    print("[B] RESULT:", "LIVE_OK" if detected else "NO_UPDATE", "| final spores", page.locator("[data-testid=spore]").count(), flush=True)
    ctx.close()
    sys.exit(0 if detected else 2)
