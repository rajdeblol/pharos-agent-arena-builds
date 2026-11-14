import { paidProxyHandler } from "../../12-x402-agent-buyer/api/upstream.mjs";
export default (req, res) => paidProxyHandler("/paid/activity-summary", req, res);
