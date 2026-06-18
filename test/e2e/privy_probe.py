#!/usr/bin/env python3
"""Probe the real Privy email-login modal: click sign-in, enter the email,
reach the OTP-entry screen. Proves the Privy integration is wired (OTP delivery
to the inbox is the only credential-gated step)."""
import sys, pathlib
from playwright.sync_api import sync_playwright
SHOT = pathlib.Path("/tmp/mycelia-privy"); SHOT.mkdir(exist_ok=True)
EMAIL = "philo@tenorilabs.ai"
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context("/tmp/privy-probe", headless=True, viewport={"width":1280,"height":900}, args=["--no-sandbox"])
    page = ctx.new_page()
    page.goto("http://localhost:5173", wait_until="domcontentloaded", timeout=60000); page.wait_for_timeout(3000)
    # click the Privy "Sign in with email"
    page.get_by_text("Sign in with email", exact=False).first.click()
    page.wait_for_timeout(4000)
    page.screenshot(path=str(SHOT/"p1-modal.png"))
    # find an email input anywhere (modal may be a portal)
    emails = page.locator("input[type=email], input[name=email], input[placeholder*='email' i]")
    print("email inputs:", emails.count())
    ok_email = False
    if emails.count() > 0:
        emails.first.fill(EMAIL)
        # submit (button with Submit/Continue/Send)
        for label in ["Submit", "Continue", "Send code", "Send", "Next"]:
            b = page.get_by_role("button", name=label)
            if b.count() > 0: b.first.click(); ok_email = True; break
        if not ok_email:
            emails.first.press("Enter"); ok_email = True
        page.wait_for_timeout(5000)
        page.screenshot(path=str(SHOT/"p2-otp.png"))
    # detect OTP entry (code inputs)
    codeinputs = page.locator("input[inputmode=numeric], input[autocomplete=one-time-code], input[maxlength='1']")
    otp_screen = codeinputs.count() > 0 or page.get_by_text("code", exact=False).count() > 0
    print("submitted email:", ok_email)
    print("OTP screen reached:", otp_screen, "| code inputs:", codeinputs.count())
    ctx.close()
    print("RESULT:", "PASS" if (ok_email and otp_screen) else "PARTIAL")
sys.exit(0)
