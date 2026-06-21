// Links into a Sui block explorer (Suiscan). Network comes from the public config.
type Net = "testnet" | "mainnet" | "devnet";

const base = (net: Net) => `https://suiscan.xyz/${net}`;

export function explorerTx(net: Net, digest: string) {
  return `${base(net)}/tx/${digest}`;
}
export function explorerObject(net: Net, id: string) {
  return `${base(net)}/object/${id}`;
}
export function explorerAccount(net: Net, addr: string) {
  return `${base(net)}/account/${addr}`;
}

export function shortId(x: string) {
  return x.length > 14 ? `${x.slice(0, 8)}…${x.slice(-6)}` : x;
}
