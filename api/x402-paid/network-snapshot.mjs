import { paidProxyHandler } from "../../12-x402-agent-buyer/api/upstream.mjs";
export default (req, res) => paidProxyHandler("/paid/network-snapshot", req, res);
