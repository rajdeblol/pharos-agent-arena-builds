import { paidProxyHandler } from "../upstream.mjs";
export default (req, res) => paidProxyHandler("/paid/network-snapshot", req, res);
