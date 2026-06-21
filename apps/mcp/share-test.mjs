// Does sharing a node to an address make it show up in THAT address's graph?
// philo shares a slice to master, then we read master two ways:
//   (a) master's PERSONAL session (what the web /graph shows)  -> expect: NOT there
//   (b) the SHARED session master was added to (sync/reveal)   -> expect: IS there
import {
  loadPublicConfig, loadServerSecrets, makeSuiClient, keypairFromSecret, addressOf,
  Crypto, Storage, SessionClient, Mycelia, SessionKey,
} from '@mycelia/core';

const pub = loadPublicConfig(process.env);
const sec = loadServerSecrets(process.env);
const net = pub.suiNetwork === 'mainnet' ? 'mainnet' : 'testnet';
const mk = (label) => {
  const client = makeSuiClient({ network: pub.suiNetwork, tatumJsonRpcUrl: pub.tatumSuiJsonRpc, tatumApiKey: sec.tatumApiKey, fullnodeUrl: pub.suiFullnodeUrl });
  const crypto = new Crypto({ suiClient: client, keyServerIds: pub.sealKeyServerIds, threshold: pub.sealThreshold, packageId: pub.myceliaPackageId });
  const storage = new Storage({ network: net, suiClient: client, aggregatorUrl: pub.walrusAggregator });
  const sessions = new SessionClient(client, pub.myceliaPackageId);
  return { client, service: new Mycelia(sessions, crypto, storage, { storageEpochs: pub.storageEpochs }) };
};

// owner = master (avoids gas conflict with the philo writes running in parallel)
const ownerKp = keypairFromSecret(process.env.MASTER_SUI_PRIVKEY.trim());
const owner = addressOf(ownerKp);
// recipient = philo
const recipientKp = keypairFromSecret(process.env.MYCELIA_KEY.trim());
const recipient = addressOf(recipientKp);
const master = recipient; // (var names below: "master" plays the recipient role)
const masterKp = recipientKp;
console.log('owner (sharer)   :', owner);
console.log('recipient        :', recipient, '\n');

const P = mk('owner');
const philoKp = ownerKp; const philo = owner;
// 1) load owner's graph, pick a root to share
const pp = await P.service.findPersonalSession(owner);
const psk = await SessionKey.create({ address: owner, packageId: pub.myceliaPackageId, ttlMin: 30, signer: ownerKp, suiClient: P.client });
const pstate = await P.service.state(pp.sessionId);
const pg = await P.service.loadFullGraph(pstate, psk);
const root = pg.nodes.find((n) => n.title === 'Rust ownership') ?? pg.nodes[0];
console.log('sharing root:', root.title, '(depth 1) to recipient\n');

// 2) create a SEPARATE share session, share the slice, add recipient as member
const endEpoch = (await P.service.storage.currentEpoch().catch(() => 0)) + pub.storageEpochs;
const created = await P.service.createSession('shared-demo', philoKp, philo, endEpoch);
const res = await P.service.shareSlice({ sessionId: created.sessionId, rootId: root.id, depth: 1, nodes: pg.nodes, edges: pg.edges, signer: philoKp, owner: philo });
await P.service.addMember(created.capId, created.sessionId, master, philoKp);
console.log('shared session   :', created.sessionId);
console.log('published nodes  :', res.publishedNodeIds.length, '\n');

// 3) read AS the recipient (master)
const M = mk('master');
const msk = await SessionKey.create({ address: master, packageId: pub.myceliaPackageId, ttlMin: 30, signer: masterKp, suiClient: M.client });

// (a) master's personal graph — what the web /graph renders
const mp = await M.service.findPersonalSession(master);
let personalTitles = [];
if (mp) { const mstate = await M.service.state(mp.sessionId); personalTitles = (await M.service.loadFullGraph(mstate, msk)).nodes.map((n) => n.title); }
console.log('(a) recipient PERSONAL graph (web /graph) titles:', personalTitles);
console.log('    contains "' + root.title + '"? ->', personalTitles.includes(root.title), '  <-- this is what the web shows\n');

// (b) the shared session master was added to
const sstate = await M.service.state(created.sessionId);
const shared = await M.service.loadFullGraph(sstate, msk);
console.log('(b) recipient via the SHARED session titles:', shared.nodes.map((n) => n.title));
console.log('    contains "' + root.title + '"? ->', shared.nodes.some((n) => n.title === root.title), '  <-- accessible on-chain, but NOT in /graph today');
