// Add ~20 general-info memories to philo's account THROUGH the MCP (mycelia_remember).
// Each is a write-through to philo's personal Walrus session. Uses MYCELIA_KEY from
// env (set to philo by derive-philo.mjs). Run from apps/mcp with env sourced.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const key = process.env.MYCELIA_KEY;
if (!key) { console.error('FATAL: MYCELIA_KEY not set (run derive-philo.mjs first)'); process.exit(1); }

const NODES = [
  { title: 'Water boils at 100°C', body: 'At sea-level pressure; the boiling point drops at higher altitude.', tags: ['science', 'general'] },
  { title: 'Speed of light', body: 'About 299,792 km per second in a vacuum — the cosmic speed limit.', tags: ['science', 'physics'] },
  { title: 'Mount Everest', body: 'Earth’s highest peak at 8,849 m, on the Nepal–Tibet border.', tags: ['geography', 'general'] },
  { title: 'Photosynthesis', body: 'Plants turn sunlight, CO2 and water into glucose and oxygen.', tags: ['science', 'biology'] },
  { title: 'Great Wall of China', body: 'A series of fortifications totalling ~21,000 km, built over many centuries.', tags: ['history', 'general'] },
  { title: 'The human body has 206 bones', body: 'Adults have 206; babies are born with around 270 that fuse over time.', tags: ['health', 'biology'] },
  { title: 'Pacific Ocean', body: 'The largest and deepest ocean, covering about 165 million km2.', tags: ['geography', 'general'] },
  { title: 'HTTP 404 means not found', body: 'The server reached but the requested resource does not exist.', tags: ['tech', 'web'] },
  { title: 'Pi is about 3.14159', body: 'The ratio of a circle’s circumference to its diameter; irrational.', tags: ['math', 'general'] },
  { title: 'Honey never spoils', body: 'Low moisture and acidity make it last for millennia if sealed.', tags: ['food', 'general'] },
  { title: 'The Sun is a star', body: 'A G-type main-sequence star about 4.6 billion years old.', tags: ['science', 'astronomy'] },
  { title: 'DNA is a double helix', body: 'Structure described by Watson and Crick in 1953; carries genetic code.', tags: ['science', 'biology'] },
  { title: 'Eiffel Tower', body: 'A 330 m iron tower in Paris, completed in 1889 for the World’s Fair.', tags: ['geography', 'history'] },
  { title: 'Octopuses have three hearts', body: 'Two pump blood to the gills, one to the rest of the body.', tags: ['biology', 'general'] },
  { title: 'Sahara Desert', body: 'The largest hot desert on Earth, roughly 9.2 million km2.', tags: ['geography', 'general'] },
  { title: 'Binary is base-2', body: 'Computers represent everything with 0s and 1s.', tags: ['tech', 'cs'] },
  { title: 'Lightning is hotter than the Sun’s surface', body: 'A bolt can reach ~30,000 K, far hotter than the Sun’s ~5,800 K surface.', tags: ['science', 'physics'] },
  { title: 'Shakespeare wrote ~37 plays', body: 'Plus 154 sonnets; among the most influential writers in English.', tags: ['history', 'literature'] },
  { title: 'Bananas are berries', body: 'Botanically a berry, while strawberries are not.', tags: ['food', 'biology'] },
  { title: 'The Moon causes ocean tides', body: 'Its gravity pulls the seas, creating high and low tides twice a day.', tags: ['science', 'astronomy'] },
];
const LINKS = {
  'The Sun is a star': [{ to: 'Speed of light', rel: 'relates' }],
  'The Moon causes ocean tides': [{ to: 'Pacific Ocean', rel: 'relates' }, { to: 'The Sun is a star', rel: 'relates' }],
  'DNA is a double helix': [{ to: 'Photosynthesis', rel: 'relates' }],
  'Lightning is hotter than the Sun’s surface': [{ to: 'The Sun is a star', rel: 'relates' }],
  'Binary is base-2': [{ to: 'HTTP 404 means not found', rel: 'relates' }],
};

const transport = new StdioClientTransport({
  command: process.execPath, args: [join(here, 'dist', 'index.js')], cwd: repoRoot,
  env: { ...process.env, MYCELIA_KEY: key }, stderr: 'inherit',
});
const client = new Client({ name: 'mycelia-add-nodes', version: '0.0.0' });
await client.connect(transport);
const CALL = { timeout: 300000, resetTimeoutOnProgress: true };
const text = (r) => (r?.content ?? []).map((c) => c.text).join('\n');

const ident = await client.readResource({ uri: 'mycelia://identity' });
console.log('IDENTITY:', ident.contents?.[0]?.text);

let i = 0, ok = 0;
for (const n of NODES) {
  i++;
  const args = { title: n.title, body: n.body, type: 'concept', tags: n.tags };
  if (LINKS[n.title]) args.links = LINKS[n.title];
  try {
    const r = await client.callTool({ name: 'mycelia_remember', arguments: args }, undefined, CALL);
    if (r.isError) console.log(`[${i}/${NODES.length}] ERROR ${n.title}: ${text(r)}`);
    else { ok++; console.log(`[${i}/${NODES.length}] ok  ${n.title}  -> ${text(r)}`); }
  } catch (e) {
    console.log(`[${i}/${NODES.length}] THREW ${n.title}: ${e.message}`);
  }
}
const rec = await client.callTool({ name: 'mycelia_recall', arguments: { query: 'science geography', depth: 1 } }, undefined, CALL);
const recObj = JSON.parse(text(rec));
console.log(`\nWROTE ${ok}/${NODES.length} nodes. recall returned ${recObj.nodes?.length ?? 0} nodes, ${recObj.edges?.length ?? 0} edges.`);
await client.close();
console.log('DONE');
