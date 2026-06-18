#!/usr/bin/env python3
"""Smoke the new Visualizer a11y/interaction controls against the dev server:
fit-to-view, type filter, keyboard nav (arrows/D), pan, responsive drawers.
Usage: a11y_smoke.py <sessionId>"""
import re, sys, pathlib
from playwright.sync_api import sync_playwright
SID = sys.argv[1]
BASE = "http://localhost:5173"
SHOT = pathlib.Path("/tmp/mycelia-a11y"); SHOT.mkdir(exist_ok=True)
BENIGN = re.compile(r"(favicon|react-refresh|React DevTools|sourcemap|\[vite\]|net::ERR|Failed to load resource|ERR_)", re.I)
errs = []; res = []
def rec(s, ok, n=""): res.append((s, ok, n)); print(f"{'PASS' if ok else 'FAIL'}  {s}  {n}", flush=True)

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context("/tmp/a11y-profile", headless=True, viewport={"width": 1440, "height": 900}, args=["--no-sandbox"])
    page = ctx.new_page()
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" and not BENIGN.search(m.text) else None)
    page.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))
    page.goto(BASE, wait_until="domcontentloaded", timeout=60000); page.wait_for_timeout(2500)
    page.fill("[data-testid=dev-userid]", "did:privy:demo"); page.click("[data-testid=dev-login]")
    page.wait_for_selector("[data-testid=create-session]", timeout=60000)
    # toolbar controls render even before a session
    rec("toolbar fit + type filters render", page.locator("[data-testid=fit]").count() > 0 and page.locator("[data-testid=filter-skill]").count() > 0)
    page.fill("[data-testid=join-session-id]", SID); page.click("[data-testid=join-session]")
    ok = False
    for _ in range(40):
        page.wait_for_timeout(2000)
        if page.locator("[data-testid=spore]").count() > 0: ok = True; break
    rec("graph renders", ok, f"{page.locator('[data-testid=spore]').count()} spores")
    page.screenshot(path=str(SHOT / "a1-graph.png"))

    # fit-to-view
    try: page.click("[data-testid=fit]"); page.wait_for_timeout(1200); rec("fit-to-view", True)
    except Exception as e: rec("fit-to-view", False, str(e)[:60])
    # type filter toggle
    try: page.click("[data-testid=filter-skill]"); page.wait_for_timeout(800); rec("type filter toggle", True)
    except Exception as e: rec("type filter toggle", False, str(e)[:60])
    page.click("[data-testid=filter-skill]")  # un-toggle
    # status strip shows depth
    body = page.inner_text("body")
    rec("status strip shows depth", "depth" in body.lower())
    # pure-keyboard path: Tab focuses a spore (tabIndex), Enter selects, arrows move, D cycles depth
    try:
        page.focus("[data-testid=canvas]")
        page.keyboard.press("Tab"); page.wait_for_timeout(300)   # focus first spore
        page.keyboard.press("Enter"); page.wait_for_timeout(400)  # select it
        sel1 = page.locator("[data-testid=inspector]").count()
        page.focus("[data-testid=canvas]")
        page.keyboard.press("ArrowRight"); page.wait_for_timeout(400)
        page.keyboard.press("d"); page.wait_for_timeout(500)
        rec("keyboard select + nav + depth (D)", sel1 > 0 and "depth" in page.inner_text("body").lower())
    except Exception as e: rec("keyboard nav", False, str(e)[:80])
    # pan via wheel zoom (no crash)
    try:
        box = page.locator("[data-testid=canvas]").bounding_box()
        page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        page.mouse.wheel(0, -300); page.wait_for_timeout(600)
        rec("wheel zoom", page.locator("[data-testid=spore]").count() > 0)
    except Exception as e: rec("wheel zoom", False, str(e)[:60])
    page.screenshot(path=str(SHOT / "a2-after.png"))
    # responsive drawer toggles exist
    rec("responsive drawer toggles", page.locator("[data-testid=toggle-left]").count() > 0 and page.locator("[data-testid=toggle-right]").count() > 0)
    ctx.close()

print("\n===== A11Y SMOKE =====")
for s, ok, n in res: print(f"{'PASS' if ok else 'FAIL'}  {s}  {n}")
print(f"real console errors: {len(errs)}")
for e in errs[:8]: print("  -", e[:160])
sys.exit(0 if all(ok for _, ok, _ in res) and len(errs) == 0 else 1)
