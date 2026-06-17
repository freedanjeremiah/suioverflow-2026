// Phase-0/3 bootstrap: build + publish the mycelia::session Move package with
// the Sui CLI (active address must be the master + funded), parse the package id,
// and write MYCELIA_PACKAGE_ID into .env.
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ENV = join(process.cwd(), '.env');
const MOVE = join(process.cwd(), 'move');

function setEnv(key: string, val: string) {
  let env = existsSync(ENV) ? readFileSync(ENV, 'utf8') : '';
  const line = `${key}=${val}`;
  env = new RegExp(`^${key}=.*$`, 'm').test(env) ? env.replace(new RegExp(`^${key}=.*$`, 'm'), line) : env + (env.endsWith('\n') || env === '' ? '' : '\n') + line + '\n';
  writeFileSync(ENV, env);
}

function main() {
  const budget = process.env.PUBLISH_GAS_BUDGET ?? '200000000';
  console.log('publishing Move package (sui client publish)…');
  const out = execSync(`sui client publish --gas-budget ${budget} --json`, { cwd: MOVE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  const d = JSON.parse(out);
  if (d.effects?.status?.status !== 'success') throw new Error('publish failed: ' + JSON.stringify(d.effects?.status));
  const pkg = (d.objectChanges ?? []).find((c: any) => c.type === 'published')?.packageId;
  if (!pkg) throw new Error('could not find published packageId in output');
  setEnv('MYCELIA_PACKAGE_ID', pkg);
  console.log('PACKAGE_ID =', pkg, '(written to .env)\ndigest:', d.digest);
}
main();
