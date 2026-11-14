import { paidProxyHandler } from "../upstream.mjs";
export default (req, res) => paidProxyHandler("/paid/activity-summary", req, res);
