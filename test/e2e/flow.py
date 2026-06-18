#!/usr/bin/env python3
"""Mycelia E2E flow test (headless, persistent profile).
dev-login -> create session -> graft slice (real in-browser Walrus write) ->
reveal (Seal decrypt) -> capture. Screenshots each step to /tmp/mycelia-e2e."""
import re, sys, time, pathlib
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
UDIR = "/tmp/mycelia-profile"
SHOT = pathlib.Path("/tmp/mycelia-e2e"); SHOT.mkdir(exist_ok=True)
# Walrus probes every storage node; many testnet nodes are down/bad-cert -> benign.
BENIGN = re.compile(r"(favicon|react-refresh|React DevTools|Lit is in dev mode|sourcemap|preload|\[vite\]|"
                    r"ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_REFUSED|ERR_CERT|ERR_CONNECTION_TIMED_OUT|"
                    r"ERR_CONNECTION_CLOSED|Failed to load resource|ERR_ADDRESS_UNREACHABLE|net::ERR)", re.I)

results, console_errs = [], []
def rec(step, ok, note=""): results.append((step, ok, note)); print(f"{'PASS' if ok else 'FAIL'}  {step}  {note}", flush=True)

def shot(page, name):
    try: page.screenshot(path=str(SHOT / f"{name}.png"))
    except Exception: pass

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(UDIR, headless=True, viewport={"width": 1440, "height": 900},
                                               args=["--no-sandbox"])
    page = ctx.new_page()
    page.on("console", lambda m: console_errs.append(m.text) if m.type == "error" and not BENIGN.search(m.text) else None)
    page.on("pageerror", lambda e: console_errs.append(f"pageerror: {e}"))

    try:
        page.goto(BASE, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(3000)
        shot(page, "01-landing")

        # ---- dev login ----
        try:
            page.wait_for_selector("[data-testid=dev-userid]", timeout=15000)
            page.fill("[data-testid=dev-userid]", "did:privy:builder-e2e")
            page.click("[data-testid=dev-login]")
            page.wait_for_selector("[data-testid=create-session]", timeout=60000)
            rec("login", True, "reached app shell")
        except Exception as e:
            rec("login", False, str(e)[:120]); shot(page, "02-login-fail"); raise
        shot(page, "02-loggedin")

        # ---- create session ----
        try:
            page.fill("[data-testid=new-session-name]", "Atlas with Ravi")
            page.click("[data-testid=create-session]")
            page.wait_for_selector("[data-testid=session-item]", timeout=120000)
            # wait until busy clears (createSession publishes empty manifest + head)
            for _ in range(60):
                if page.locator("[data-testid=open-share]").count() > 0: break
                page.wait_for_timeout(2000)
            rec("create_session", page.locator("[data-testid=session-item]").count() > 0, "")
        except Exception as e:
            rec("create_session", False, str(e)[:160]); shot(page, "03-create-fail")
        shot(page, "03-session")

        # ---- graft a depth slice (real browser Walrus write) ----
        try:
            page.click("[data-testid=open-share]")
            page.wait_for_selector("[data-testid=local-node]", timeout=15000)
            page.locator("[data-testid=local-node]").first.click()
            page.fill("[data-testid=share-depth]", "2")
            page.wait_for_selector("[data-testid=share-preview]", timeout=10000)
            shot(page, "04-share-panel")
            page.click("[data-testid=graft]")
            # graft = several encrypt+publish round trips; wait for the panel to
            # close (full completion), not just for the daemon's live refresh.
            try:
                page.wait_for_selector("[data-testid=share-panel]", state="detached", timeout=280000)
            except Exception:
                pass
            for _ in range(20):
                if page.locator("[data-testid=spore]").count() > 0: break
                page.wait_for_timeout(2000)
            ok = page.locator("[data-testid=spore]").count() > 0
            rec("graft", ok, f"{page.locator('[data-testid=spore]').count()} spores")
        except Exception as e:
            rec("graft", False, str(e)[:200])
        shot(page, "05-grafted")

        # ---- reveal a node (Seal decrypt in-browser) ----
        try:
            page.wait_for_timeout(1500)  # let live refresh settle
            spores = page.locator("[data-testid=spore]")
            revealed_ok = False
            for i in range(min(spores.count(), 6)):
                spores.nth(i).click(force=True)
                page.wait_for_selector("[data-testid=inspector]", timeout=10000)
                if page.locator("[data-testid=reveal]").count() > 0:
                    page.click("[data-testid=reveal]")
                    page.wait_for_selector("[data-testid=node-title]", timeout=60000)
                    revealed_ok = True
                    rec("reveal", True, page.locator("[data-testid=node-title]").inner_text())
                    break
                elif page.locator("[data-testid=node-title]").count() > 0:
                    revealed_ok = True; rec("reveal", True, "already decrypted"); break
            if not revealed_ok: rec("reveal", False, "no revealable node found")
        except Exception as e:
            rec("reveal", False, str(e)[:200])
        shot(page, "06-revealed")

        # ---- capture a new memory ----
        try:
            if page.locator("[data-testid=open-share]").count() == 0:
                pass
            else:
                if page.locator("[data-testid=share-panel]").count() == 0:
                    page.click("[data-testid=open-share]")
            page.wait_for_selector("[data-testid=capture-toggle]", timeout=8000)
            page.click("[data-testid=capture-toggle]")
            page.fill("[data-testid=capture-title]", "Postmortem Q2")
            page.fill("[data-testid=capture-body]", "What we learned shipping the policy module.")
            page.click("[data-testid=capture-save]")
            page.wait_for_timeout(1500)
            rec("capture", page.locator("[data-testid=local-node]").count() >= 7, "added to local graph")
        except Exception as e:
            rec("capture", False, str(e)[:160])
        shot(page, "07-capture")

    finally:
        ctx.close()

print("\n===== SUMMARY =====")
for s, ok, n in results: print(f"{'PASS' if ok else 'FAIL'}  {s}  {n}")
print(f"console errors ({len(console_errs)}):")
for e in console_errs[:20]: print("  -", e[:200])
sys.exit(0 if all(ok for _, ok, _ in results) else 1)
