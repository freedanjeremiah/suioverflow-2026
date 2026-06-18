#!/usr/bin/env python3
"""Multi-party E2E: Builder grafts a slice; Collaborator (a different wallet)
is added, joins by id, and DECRYPTS the builder's shared node; then is removed.
Two isolated persistent profiles = two identities/wallets."""
import re, sys, pathlib
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
SHOT = pathlib.Path("/tmp/mycelia-mp"); SHOT.mkdir(exist_ok=True)
results = []
def rec(s, ok, n=""): results.append((s, ok, n)); print(f"{'PASS' if ok else 'FAIL'}  {s}  {n}", flush=True)

def login(page, who):
    page.goto(BASE, wait_until="domcontentloaded", timeout=60000); page.wait_for_timeout(2500)
    page.wait_for_selector("[data-testid=dev-userid]", timeout=20000)
    page.fill("[data-testid=dev-userid]", who); page.click("[data-testid=dev-login]")
    page.wait_for_selector("[data-testid=create-session]", timeout=60000)

with sync_playwright() as p:
    builder = p.chromium.launch_persistent_context("/tmp/mp-builder", headless=True, viewport={"width":1280,"height":860}, args=["--no-sandbox"])
    collab  = p.chromium.launch_persistent_context("/tmp/mp-collab",  headless=True, viewport={"width":1280,"height":860}, args=["--no-sandbox"])
    bp, cp = builder.new_page(), collab.new_page()
    try:
        login(bp, "did:privy:builder-mp"); rec("builder_login", True)
        login(cp, "did:privy:collab-mp");  rec("collab_login", True)
        collab_addr = cp.get_attribute("[data-testid=my-address]", "data-address")
        rec("collab_address", bool(collab_addr and collab_addr.startswith("0x")), collab_addr or "")

        # builder creates + grafts
        bp.fill("[data-testid=new-session-name]", "Shared Atlas"); bp.click("[data-testid=create-session]")
        bp.wait_for_selector("[data-testid=session-item]", timeout=120000)
        for _ in range(60):
            if bp.locator("[data-testid=open-share]").count() > 0: break
            bp.wait_for_timeout(2000)
        sid = bp.get_attribute("[data-testid=session-item]", "data-session-id")
        rec("create_session", bool(sid and sid.startswith("0x")), sid or "")
        bp.click("[data-testid=open-share]"); bp.wait_for_selector("[data-testid=local-node]", timeout=15000)
        bp.locator("[data-testid=local-node]").first.click(); bp.fill("[data-testid=share-depth]", "1")
        bp.click("[data-testid=graft]")
        try: bp.wait_for_selector("[data-testid=share-panel]", state="detached", timeout=280000)
        except Exception: pass
        rec("builder_graft", bp.locator("[data-testid=spore]").count() > 0, f"{bp.locator('[data-testid=spore]').count()} spores")
        bp.screenshot(path=str(SHOT/"b1-grafted.png"))

        # builder adds collaborator
        bp.fill("[data-testid=member-address]", collab_addr); bp.click("[data-testid=add-member]")
        ok=False
        for _ in range(30):
            bp.wait_for_timeout(1500)
            if bp.locator("[data-testid=member-chip]").count() >= 2: ok=True; break
        rec("add_member", ok, f"{bp.locator('[data-testid=member-chip]').count()} members")

        # collaborator joins by id + decrypts builder's node
        cp.fill("[data-testid=join-session-id]", sid); cp.click("[data-testid=join-session]")
        joined=False
        for _ in range(60):
            cp.wait_for_timeout(2000)
            if cp.locator("[data-testid=spore]").count() > 0: joined=True; break
        rec("collab_join", joined, f"{cp.locator('[data-testid=spore]').count()} spores visible")
        cp.screenshot(path=str(SHOT/"c1-joined.png"))

        revealed=False
        if joined:
            spores = cp.locator("[data-testid=spore]")
            for i in range(min(spores.count(), 6)):
                spores.nth(i).click(force=True)
                cp.wait_for_selector("[data-testid=inspector]", timeout=10000)
                if cp.locator("[data-testid=reveal]").count() > 0:
                    cp.click("[data-testid=reveal]")
                    try:
                        cp.wait_for_selector("[data-testid=node-title]", timeout=60000); revealed=True
                        rec("collab_cross_decrypt", True, cp.locator("[data-testid=node-title]").inner_text()); break
                    except Exception: pass
        if not revealed: rec("collab_cross_decrypt", False, "collaborator could not decrypt builder node")
        cp.screenshot(path=str(SHOT/"c2-revealed.png"))

        # builder removes collaborator
        bp.locator("[data-testid=member-chip]").first  # ensure list present
        # click the remove button next to a non-owner member
        removed=False
        btns = bp.locator("button:has-text('remove')")
        if btns.count() > 0:
            btns.first.click()
            for _ in range(30):
                bp.wait_for_timeout(1500)
                if bp.locator("[data-testid=member-chip]").count() == 1: removed=True; break
        rec("remove_member", removed, f"{bp.locator('[data-testid=member-chip]').count()} members after remove")
    finally:
        builder.close(); collab.close()

print("\n===== SUMMARY =====")
for s, ok, n in results: print(f"{'PASS' if ok else 'FAIL'}  {s}  {n}")
sys.exit(0 if all(ok for _, ok, _ in results) else 1)
