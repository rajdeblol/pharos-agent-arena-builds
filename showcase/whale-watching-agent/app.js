const defaults = [
  ["0x912c9aDe24D44d8922f0866D8Dcb079f1363f647", "Busiest USDC/WPROS flow"], ["0x936564245B69f5a293b42cbd752E0eE3bb68b470", "Second-busiest flow"],
  ["0x768B959191cE5876cabBbC014a08D72615BDdE54", "Frequent USDC trader"], ["0xB53F6cB429B8e14b6b87362B5a20Ba69FC9C3B47", "Large USDC round-trips"],
  ["0xA1204366ce65678872ece7F7a9eDEFe858574777", "Large USDC round-trips"], ["0x7927d0297e903A2AaDf617760F17a975034d0C10", "Large USDC round-trips"],
  ["0xf48Ff1e0aBc740C167049c46435E753b083bC317", "Active WPROS flow"], ["0x4146D192Da6428c9e1C243D2A953c625B5765623", "WPROS seller"],
];
const $ = (id) => document.getElementById(id);
const form = $("scan-form"), addressField = $("addresses"), report = $("report-card"), scanButton = $("scan-button"), buttonLabel = $("button-label");
const stateNodes = [$("empty-state"), $("loading-state"), $("error-state"), $("results")];
let watchTimer = null, countdownTimer = null, watching = false, activeConfig = null, nextAt = 0, lastBlock = null;
let activity = new Map(), events = new Map(), initialSummary = [], scanStart = 0, snapshotBlock = 0;
function parseAddresses() { return addressField.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => { const [address, ...labels] = line.split("|"); return { address: address.trim(), label: labels.join("|").trim() || `Wallet ${index + 1}` }; }); }
function updateCount() { const count = parseAddresses().length; $("address-count").textContent = count ? `${count} custom ${count === 1 ? "wallet" : "wallets"}` : "Using preset watchlist · 8 wallets"; $("address-count").classList.toggle("count-warning", count > 20); }
addressField.addEventListener("input", updateCount);
function setState(state) { stateNodes.forEach((node, index) => { node.hidden = index !== state; }); report.setAttribute("aria-busy", String(state === 1)); $("report-status").textContent = ["READY TO SCAN", "READING PHAROS", "SCAN FAILED", watching ? "LIVE WATCHING" : "SCAN COMPLETE"][state]; }
function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function short(address) { return `${address.slice(0, 7)}…${address.slice(-5)}`; }
function explorer(path, text, full) { const link = element("a", "chain-link", text); link.href = `https://www.pharosscan.xyz/${path}/${encodeURIComponent(full)}`; link.target = "_blank"; link.rel = "noreferrer"; link.title = full; return link; }
function renderSummary(data) {
  const list = $("summary-list"); list.replaceChildren();
  const live = new Map();
  for (const item of activity.values()) {
    const key = item.wallet.toLowerCase();
    if (!live.has(key)) live.set(key, []);
    live.get(key).push(item);
  }
  for (const base of initialSummary) {
    const items = live.get(base.address.toLowerCase()) || [];
    const row = element("article", "summary-row"), identity = element("div", "summary-wallet");
    identity.append(element("strong", "", base.label), explorer("address", short(base.address), base.address));
    const stats = element("div", "wallet-stats");
    for (const symbol of ["USDC", "WPROS"]) {
      const token = base.byToken[symbol], stat = element("div", "token-stat");
      const inRaw = items.filter((item) => item.symbol === symbol && item.direction === "IN").reduce((n, item) => n + BigInt(item.raw), 0n);
      const outRaw = items.filter((item) => item.symbol === symbol && item.direction === "OUT").reduce((n, item) => n + BigInt(item.raw), 0n);
      const decimals = symbol === "USDC" ? 6 : 18;
      const compact = (raw) => { const scale = 10n ** BigInt(decimals); const whole = raw / scale; const frac = (raw % scale).toString().padStart(decimals, "0").slice(0, 2).replace(/0+$/, ""); return `${whole}${frac ? `.${frac}` : ""}`; };
      stat.append(element("b", "", symbol), element("span", "", `IN ${compact(inRaw)} · OUT ${compact(outRaw)}`), element("small", "", `HOLD ${token.hold === "—" ? "OFF" : token.hold}`)); stats.append(stat);
    }
    const count = element("span", `move-total${items.length ? " active" : ""}`, `${items.length} MOVES · ${base.significantCount} LARGE`);
    const largest = `PROS HOLD ${base.nativeHold === "—" ? "OFF" : base.nativeHold} · ${base.largest ? `${base.largest.direction} ${base.largest.amount} ${base.largest.symbol}` : "No large moves"}`;
    row.append(identity, stats, element("div", "summary-end", largest), count); list.append(row);
  }
}
function renderMoves() {
  const list = $("move-list"); list.replaceChildren();
  const rows = [...events.values()].sort((a, b) => b.block - a.block || b.logIndex - a.logIndex).slice(0, 250);
  $("move-count").textContent = `${rows.length} SHOWN · ${events.size} TOTAL`;
  if (!rows.length) { const row = document.createElement("tr"), cell = element("td", "no-moves", "No transfers crossed your thresholds in this block window. Lower a threshold or watch a larger range."); cell.colSpan = 6; row.append(cell); list.append(row); return; }
  for (const move of rows) {
    const row = document.createElement("tr"); row.tabIndex = 0; row.className = "move-row";
    const block = document.createElement("td"); block.append(explorer("block", move.block.toLocaleString(), String(move.block)));
    const direction = element("td", `direction ${move.direction.toLowerCase()}`, move.direction === "IN" ? "↓ IN" : "↑ OUT");
    const amount = element("td", "move-amount", `${move.amount} ${move.symbol}`);
    const from = document.createElement("td"); from.append(explorer("address", short(move.from), move.from));
    const to = document.createElement("td"); to.append(explorer("address", short(move.to), move.to));
    const tx = document.createElement("td"); tx.append(explorer("tx", `${move.tx.slice(0, 8)}…`, move.tx));
    row.append(block, direction, amount, from, to, tx);
    const showDetail = () => { const detail = $("move-detail"); detail.hidden = false; detail.replaceChildren(element("span", "detail-tag", `${move.label} · ${move.kind}`), element("p", "", move.explanation)); };
    row.addEventListener("click", showDetail); row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") showDetail(); }); list.append(row);
  }
}
function render(data) {
  lastBlock = Math.max(lastBlock || 0, data.toBlock); $("scan-range").textContent = `BLOCKS ${scanStart.toLocaleString()}–${lastBlock.toLocaleString()}`;
  $("event-total").textContent = `${events.size.toLocaleString()} SIGNIFICANT MOVES`; const blockLink = $("block-link"); blockLink.href = `https://www.pharosscan.xyz/block/${lastBlock}`;
  renderSummary(data); renderMoves(); $("snapshot-note").textContent = `${activeConfig.includeBalances ? `Balance snapshot at block ${snapshotBlock.toLocaleString()}` : "Balance snapshot skipped for a faster scan"} · flow totals cover the selected ${Number(activeConfig.lookback).toLocaleString()} block window.`;
}
async function scan(payload) {
  const response = await fetch("/api/whale-watching", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const body = await response.text(); let data;
  try { data = JSON.parse(body); } catch { throw new Error(response.ok ? "The scan returned an unreadable response." : "The scan service is temporarily unavailable. Try again shortly."); }
  if (!response.ok) throw new Error(data.error || "The scan could not be completed.");
  for (const item of data.activity || []) activity.set(item.id, item);
  for (const item of data.events || []) events.set(item.id, item);
  if (!initialSummary.length) { initialSummary = data.summary; snapshotBlock = data.toBlock; scanStart = data.fromBlock; }
  const floor = Math.max(scanStart, data.toBlock - Number(activeConfig.lookback) + 1);
  for (const [id, item] of activity) if (item.block < floor) activity.delete(id);
  for (const [id, item] of events) if (item.block < floor) events.delete(id);
  render(data); return data;
}
function startCountdown() { clearInterval(countdownTimer); countdownTimer = setInterval(() => { const seconds = Math.max(0, Math.ceil((nextAt - Date.now()) / 1000)); $("next-check").textContent = `NEXT SCAN IN ${seconds}S`; }, 250); }
async function poll() {
  if (!watching || document.hidden) { if (watching) schedulePoll(); return; }
  $("watch-message").textContent = `Checking from block ${Math.max(0, lastBlock - 4).toLocaleString()} · ${activeConfig.addresses.length} wallets`;
  try { const data = await scan({ ...activeConfig, lookback: 1000, fromBlock: Math.max(0, lastBlock - 4), includeBalances: false }); $("watch-message").textContent = `Watching ${activeConfig.addresses.length} wallets · checked through ${data.toBlock.toLocaleString()}`; }
  catch (error) { $("watch-message").textContent = `Retrying after scan issue: ${error.message}`; }
  schedulePoll();
}
function schedulePoll() { clearTimeout(watchTimer); nextAt = Date.now() + 7000; startCountdown(); watchTimer = setTimeout(poll, 7000); }
function stopWatching() { watching = false; clearTimeout(watchTimer); clearInterval(countdownTimer); scanButton.classList.remove("stop"); buttonLabel.textContent = "Start watching"; $("next-check").textContent = "WATCH PAUSED"; $("watch-status").classList.remove("is-live"); $("report-status").textContent = "WATCH PAUSED"; }
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (watching) { stopWatching(); return; }
  const enteredAddresses = parseAddresses();
  activeConfig = { addresses: enteredAddresses.length ? enteredAddresses : defaults.map(([address, label]) => ({ address, label })), thresholds: { USDC: $("usdc-threshold").value, WPROS: $("wpros-threshold").value }, lookback: Number($("lookback").value), includeBalances: $("include-balances").checked };
  activity = new Map(); events = new Map(); initialSummary = []; lastBlock = null; setState(1); scanButton.disabled = true;
  try {
    const data = await scan(activeConfig); watching = true; scanButton.disabled = false; scanButton.classList.add("stop"); buttonLabel.textContent = "Stop watching";
    $("watch-status").classList.add("is-live"); $("watch-message").textContent = `Watching ${activeConfig.addresses.length} wallets · checked through ${data.toBlock.toLocaleString()}`;
    $("report-status").textContent = "LIVE WATCHING"; schedulePoll();
  } catch (error) { $("error-message").textContent = error.message || "Check your connection and try again."; setState(2); scanButton.disabled = false; }
});
document.addEventListener("visibilitychange", () => { if (watching && !document.hidden) poll(); });
const themeButton = $("theme-toggle");
function setTheme(mode) { document.documentElement.dataset.theme = mode; document.querySelector('meta[name="theme-color"]').content = mode === "dark" ? "#0b0d12" : "#ffffff"; themeButton.textContent = mode === "dark" ? "LIGHT" : "DARK"; themeButton.setAttribute("aria-pressed", String(mode === "dark")); }
setTheme(localStorage.getItem("pharos-theme") === "dark" ? "dark" : "light");
themeButton.addEventListener("click", () => { const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; localStorage.setItem("pharos-theme", next); setTheme(next); });
updateCount();
