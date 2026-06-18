#!/usr/bin/env python3
"""Record the Mycelia product-lifecycle demo (headless, production build).
login(dev) -> join a shared session -> reveal (decrypt) -> share panel ->
LIVE: a background A-push streams a new node onto the canvas -> logout.
Output: /tmp/demo_video/*.webm -> /tmp/demo.mp4 + per-step screenshots."""
import os, time, threading, subprocess, json
from playwright.sync_api import sync_playwright

BASE   = "http://localhost:4173"
UDIR   = "/tmp/demo-profile"
WARMUP = None
VID_DIR= "/tmp/demo_video"
MP4    = "/tmp/demo.mp4"
VP     = {"width": 1440, "height": 900}
REPO   = "/home/ubuntu/projects/sharegraph"
TSX    = REPO + "/node_modules/.bin/tsx"

SESSION = json.load(open("/tmp/rt_session.json"))["sessionId"]

# A pushes a new node ~30s in; ~85s of Walrus writes + a poll cycle => the new
# spore lands on B's canvas ~120s in, during the long "watch live" dwell below.
# push AFTER the demo has joined+revealed (~50s) so it doesn't race the join's
# manifest read; its head-bump then lands during the live-watch finale.
LIVE_PRODUCER = {"cmd": [TSX, "test/e2e/realtime_a.ts", "push", "Live insight from Ravi"], "cwd": REPO, "delay": 50}

STEPS = [
    {"do":"goto",     "target":"/",                              "wait":6000,  "label":"01-landing"},
    {"do":"fill",     "target":"[data-testid=dev-userid]", "value":"did:privy:demo", "wait":2000, "label":"02-identity"},
    {"do":"click_sel","target":"[data-testid=dev-login]",        "wait":13000, "label":"03-signin+fund"},
    {"do":"fill",     "target":"[data-testid=join-session-id]", "value":SESSION, "wait":2000, "label":"04-paste-session"},
    {"do":"click_sel","target":"[data-testid=join-session]",     "wait":16000, "label":"05-join-graph-blooms"},
    {"do":"click_sel","target":"[data-testid=spore]",            "wait":6000,  "label":"06-select-spore"},
    {"do":"click_sel","target":"[data-testid=reveal]",           "wait":14000, "label":"07-reveal-decrypt"},
    {"do":"click_sel","target":"[data-testid=open-share]",       "wait":8000,  "label":"08-share-panel"},
    {"do":"fill",     "target":"[data-testid=share-depth]", "value":"2",       "wait":6000,  "label":"09-depth-preview"},
    {"do":"click_sel","target":"[data-testid=capture-toggle]",   "wait":6000,  "label":"10-capture-form"},
    {"do":"click",    "target":"close",                          "wait":5000,  "label":"11-back-to-inspector"},
    {"do":"wait",     "target":"",                               "wait":45000, "label":"12-watch-live-A"},
    {"do":"wait",     "target":"",                               "wait":55000, "label":"13-watch-live-B-new-spore"},
    {"do":"click_sel","target":"[data-testid=feed-reveal]",      "wait":10000, "label":"14-reveal-new-node"},
    {"do":"click_sel","target":"[data-testid=logout]",           "wait":5000,  "label":"15-logout"},
]

SMOOTH = """(d)=>{const el=document.querySelector('.scroll')||document.scrollingElement||document.documentElement;
return new Promise(r=>{const n=14;let i=0;const per=d/n;const t=setInterval(()=>{el.scrollBy(0,per);if(++i>=n){clearInterval(t);r(1);}},55);});}"""

def start_producer():
    if not LIVE_PRODUCER: return
    def run():
        time.sleep(LIVE_PRODUCER.get("delay",60))
        try:
            subprocess.Popen(LIVE_PRODUCER["cmd"], cwd=LIVE_PRODUCER.get("cwd"),
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            print("  [producer] A push started")
        except Exception as e: print("  [producer] failed:", str(e)[:80])
    threading.Thread(target=run, daemon=True).start()

os.makedirs(VID_DIR, exist_ok=True)
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(UDIR, headless=True, args=["--no-sandbox"], viewport=VP,
              record_video_dir=VID_DIR, record_video_size=VP)
    pg = ctx.pages[0] if ctx.pages else ctx.new_page()
    pg.on("dialog", lambda d:(print("ALERT:",d.message[:80]), d.accept()))
    if WARMUP:
        pg.goto(BASE+WARMUP, wait_until="domcontentloaded", timeout=90000); pg.wait_for_timeout(9000)
    start_producer()
    for i,s in enumerate(STEPS):
        print(f"[{i}] {s.get('label','')}", flush=True)
        do=s["do"]
        try:
            if do=="goto": pg.goto(BASE+s["target"], wait_until="domcontentloaded", timeout=90000)
            elif do=="click": pg.get_by_text(s["target"], exact=False).first.click(timeout=30000)
            elif do=="click_sel": pg.locator(s["target"]).first.click(timeout=30000, force=True)
            elif do=="fill": pg.fill(s["target"], s["value"], timeout=15000)
            elif do=="scroll": pg.evaluate(SMOOTH, int(s["target"]))
        except Exception as e: print(f"  {do} '{s.get('target')}' failed: {str(e)[:70]}")
        pg.wait_for_timeout(s.get("wait",3000))
        try: pg.screenshot(path=f"/tmp/demo_step_{i:02d}_{s.get('label','')}.png")
        except Exception: pass
    path = pg.video.path() if pg.video else None
    ctx.close()
    print("WEBM:", path)
if path and os.path.exists(path):
    r=subprocess.run(["ffmpeg","-y","-i",path,"-c:v","libx264","-pix_fmt","yuv420p","-movflags","+faststart",MP4], capture_output=True)
    print("MP4:", MP4 if r.returncode==0 else "ffmpeg fail: "+r.stderr.decode()[:160])
