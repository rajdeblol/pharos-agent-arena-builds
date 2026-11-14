import { createPublicClient, defineChain, getAddress, http } from "viem";

const CHAIN_ID = 688689;
const RPC = "https://atlantic.dplabs-internal.com";
const TOKEN = "0xcfC8330f4BCAB529c625D12781b1C19466A9Fc8B";
const chain = defineChain({ id: CHAIN_ID, name: "Pharos Atlantic Testnet", nativeCurrency: { name: "PHRS", symbol: "PHRS", decimals: 18 }, rpcUrls: { default: { http: [RPC] } }, testnet: true });
const client = createPublicClient({ chain, transport: http(RPC, { timeout: 12000, retryCount: 1 }) });
const balanceAbi = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] }];

export default async function handler(req, res) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Use GET for a read-only Pharos address lookup." }); }
  let address;
  try { address = getAddress(String(req.query?.address || "").trim()); }
  catch { return res.status(400).json({ error: "Enter a valid 0x Pharos address." }); }
  try {
    const blockNumber = await client.getBlockNumber();
    const [nativeBalance, usdcBalance] = await Promise.all([
      client.getBalance({ address, blockNumber }),
      client.readContract({ address: TOKEN, abi: balanceAbi, functionName: "balanceOf", args: [address], blockNumber }),
    ]);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ address, blockNumber: blockNumber.toString(), nativeBalanceWei: nativeBalance.toString(), usdcBalanceAtomic: usdcBalance.toString(), token: TOKEN, network: "eip155:688689", readOnly: true });
  } catch {
    return res.status(502).json({ error: "Pharos Atlantic could not read this address right now." });
  }
}
