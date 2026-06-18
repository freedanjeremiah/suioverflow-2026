#!/usr/bin/env python3
"""REAL Privy email-OTP login. Triggers the OTP, then waits for the code to be
written to /tmp/otp.txt (so a human can paste the freshly-emailed code), enters
it, and verifies the bridged wallet + app shell. Keeps ONE session alive so the
emitted code stays valid."""
import os, time, pathlib
from playwright.sync_api import sync_playwright
EMAIL = "philo@tenorilabs.ai"
OTP_FILE = "/tmp/otp.txt"
SHOT = pathlib.Path("/tmp/mycelia-privy"); SHOT.mkdir(exist_ok=True)
if os.path.exists(OTP_FILE): os.remove(OTP_FILE)

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context("/tmp/privy-login", headless=True, viewport={"width":1280,"height":900}, args=["--no-sandbox"])
    page = ctx.new_page()
    page.goto("http://localhost:5173", wait_until="domcontentloaded", timeout=60000); page.wait_for_timeout(2500)
    page.get_by_text("Sign in with email", exact=False).first.click(); page.wait_for_timeout(3500)
    em = page.locator("input[type=email], input[name=email], input[placeholder*='email' i]")
    em.first.fill(EMAIL)
    clicked = False
    for label in ["Submit", "Continue", "Send code", "Send", "Next"]:
        b = page.get_by_role("button", name=label)
        if b.count() > 0: b.first.click(); clicked = True; break
    if not clicked: em.first.press("Enter")
    page.wait_for_selector("input[maxlength='1'], input[inputmode=numeric], input[autocomplete=one-time-code]", timeout=20000)
    print("OTP_SENT — fresh code emailed to", EMAIL, "— write 6 digits to", OTP_FILE, flush=True)

    code = ""
    for _ in range(110):  # ~9 min
        if os.path.exists(OTP_FILE):
            c = "".join(ch for ch in open(OTP_FILE).read() if ch.isdigit())
            if len(c) >= 6: code = c[:6]; break
        time.sleep(5)
    if not code:
        print("RESULT: FAIL (no code provided)"); ctx.close(); raise SystemExit(1)
    print("entering code", code, flush=True)

    boxes = page.locator("input[maxlength='1']")
    if boxes.count() >= 6:
        for i, ch in enumerate(code): boxes.nth(i).fill(ch)
    else:
        page.locator("input[inputmode=numeric], input[autocomplete=one-time-code]").first.fill(code)
    page.wait_for_timeout(1500)
    for label in ["Submit", "Continue", "Verify", "Log in", "Confirm"]:
        b = page.get_by_role("button", name=label)
        if b.count() > 0 and b.first.is_enabled(): b.first.click(); break

    ok = False
    try:
        page.wait_for_selector("[data-testid=create-session]", timeout=90000)
        ok = True
        print("REAL PRIVY LOGIN OK -> bridged wallet:", page.get_attribute("[data-testid=my-address]", "data-address"), flush=True)
    except Exception as e:
        page.screenshot(path=str(SHOT/"login-fail.png"))
        print("LOGIN NOT CONFIRMED:", str(e)[:100], "| body:", page.inner_text("body")[:200].replace("\n"," "), flush=True)
    page.screenshot(path=str(SHOT/"login-result.png"))
    ctx.close()
    print("RESULT:", "PASS" if ok else "FAIL", flush=True)
    raise SystemExit(0 if ok else 1)
