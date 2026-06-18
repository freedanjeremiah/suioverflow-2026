#!/bin/bash
# Full testnet flow: wait for master funding, then run every live-tx stage in
# sequence and print a consolidated PASS/FAIL table.
export PATH="$HOME/.local/bin:$PATH"
cd /home/ubuntu/projects/sharegraph || exit 1
TSX=node_modules/.bin/tsx
bal() { $TSX -e "import('dotenv/config').then(async()=>{const c=await import('./packages/core/src/index.js');const s=c.loadServerSecrets(process.env);const cl=c.makeSuiClient({network:'testnet',fullnodeUrl:process.env.SUI_FULLNODE_URL||'https://fullnode.testnet.sui.io'});const a=c.addressOf(c.keypairFromSecret(s.masterSuiPrivkey));process.stdout.write(String(await c.balanceOf(cl,a)))})" 2>/dev/null; }

echo "[flow] waiting for master funding (>= 0.3 SUI)…"
for i in $(seq 1 120); do
  m=$(bal); m=${m:-0}
  if [ "$m" -ge 300000000 ] 2>/dev/null; then echo "[flow] funded: $((m/1000000)) mSUI"; break; fi
  sleep 15
done
m=$(bal); if [ "${m:-0}" -lt 200000000 ] 2>/dev/null; then echo "[flow] ABORT — master still unfunded ($((${m:-0}/1000000)) mSUI)"; exit 2; fi

declare -A R
run() { echo "=== STAGE: $1 ==="; timeout "$3" $TSX "$2" > "/tmp/flow-$1.log" 2>&1; R[$1]=$?; tail -3 "/tmp/flow-$1.log"; }
rm -f /tmp/persona-collab.json
run phase123 test/integration/phase123.ts 420
run phase5 test/integration/phase5.ts 480
run renewal test/integration/renewal.ts 240
run gc test/integration/gc.ts 240
run personas test/integration/personas.ts 700

echo ""; echo "===== FULL TESTNET FLOW SUMMARY ====="
ok=1
for s in phase123 phase5 renewal gc personas; do
  if [ "${R[$s]}" = "0" ]; then echo "PASS  $s"; else echo "FAIL  $s (exit ${R[$s]})"; ok=0; fi
done
[ "$ok" = "1" ] && printf '\nALL STAGES PASS\n' || printf '\nSOME STAGES FAILED\n'
exit $([ "$ok" = "1" ] && echo 0 || echo 1)
