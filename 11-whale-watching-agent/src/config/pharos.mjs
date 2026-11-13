export const PHAROS_MCP_URL = process.env.PHAROS_MCP_URL || "https://mcp.pharos.xyz/mcp";
export const PHAROS_CHAIN_ID = 1672;
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export const DEFAULT_ADDRESSES = [
  { address: "0x912c9aDe24D44d8922f0866D8Dcb079f1363f647", label: "Busiest USDC/WPROS flow" },
  { address: "0x936564245B69f5a293b42cbd752E0eE3bb68b470", label: "Second-busiest flow" },
  { address: "0x768B959191cE5876cabBbC014a08D72615BDdE54", label: "Frequent USDC trader" },
  { address: "0xB53F6cB429B8e14b6b87362B5a20Ba69FC9C3B47", label: "Large USDC round-trips" },
  { address: "0xA1204366ce65678872ece7F7a9eDEFe858574777", label: "Large USDC round-trips" },
  { address: "0x7927d0297e903A2AaDf617760F17a975034d0C10", label: "Large USDC round-trips" },
  { address: "0xf48Ff1e0aBc740C167049c46435E753b083bC317", label: "Active WPROS flow" },
  { address: "0x4146D192Da6428c9e1C243D2A953c625B5765623", label: "WPROS seller" },
];

export const TOKENS = [
  { symbol: "USDC", address: "0xc879c018db60520f4355c26ed1a6d572cdac1815", decimals: 6 },
  { symbol: "WPROS", address: "0x52c48d4213107b20bc583832b0d951fb9ca8f0b0", decimals: 18 },
];
