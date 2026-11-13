const defaults = [
  ["0x912c9aDe24D44d8922f0866D8Dcb079f1363f647", "Busiest USDC/WPROS flow"],
  ["0x936564245B69f5a293b42cbd752E0eE3bb68b470", "Second-busiest flow"],
  ["0x768B959191cE5876cabBbC014a08D72615BDdE54", "Frequent USDC trader"],
  ["0xB53F6cB429B8e14b6b87362B5a20Ba69FC9C3B47", "Large USDC round-trips"],
  ["0xA1204366ce65678872ece7F7a9eDEFe858574777", "Large USDC round-trips"],
  ["0x7927d0297e903A2AaDf617760F17a975034d0C10", "Large USDC round-trips"],
  ["0xf48Ff1e0aBc740C167049c46435E753b083bC317", "Active WPROS flow"],
  ["0x4146D192Da6428c9e1C243D2A953c625B5765623", "WPROS seller"],
];
const $ = (id) => document.getElementById(id);
const form = $("scan-form");
const addressField = $("addresses");
const report = $("report-card");
const scanButton = $("scan-button");
const buttonLabel = $("button-label");
const stateNodes = [$("empty-state"), $("loading-state"), $("error-state"), $("results")];

addressField.value = defaults.map(([address, label]) => `${address} | ${label}`).join("\n");
function parseAddresses() {
  return addressField.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const [address, ...labels] = line.split("|");
    return { address: address.trim(), label: labels.join("|").trim() || `Wallet ${index + 1}` };
  });
}
function updateCount() {
  const count = parseAddresses().length;
  $("address-count").textContent = `${count} ${count === 1 ? "address" : "addresses"} loaded`;
  $("address-count").classList.toggle("count-warning", count < 5 || count > 20);
}
addressField.addEventListener("input", updateCount);
function setState(state) {
  stateNodes.forEach((node, index) => { node.hidden = index !== state; });
  report.setAttribute("aria-busy", String(state === 1));
  scanButton.disabled = state === 1;
  buttonLabel.textContent = state === 1 ? "Scanning recent activity…" : "Scan recent activity";
  $("report-status").textContent = ["READY TO SCAN", "READING PHAROS", "SCAN FAILED", "SCAN COMPLETE"][state];
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function renderSummary(summary) {
  const list = $("summary-list");
  list.replaceChildren();
  for (const wallet of summary) {
    const row = element("article", "summary-row");
    const main = element("div", "summary-wallet");
    main.append(element("strong", "", wallet.label), element("code", "", wallet.address));
    const stats = element("div", "wallet-stats");
    for (const symbol of ["USDC", "WPROS"]) {
      const token = wallet.byToken[symbol];
      const stat = element("span", "token-stat");
      stat.append(element("b", "", symbol), element("span", "", `↑ ${token.in} · ↓ ${token.out}`));
      stats.append(stat);
    }
    const countText = wallet.count ? `${wallet.count} TX · ${wallet.significantCount} LARGE` : "QUIET";
    const count = element("span", `move-total${wallet.count ? " active" : ""}`, countText);
    row.append(main, stats, count);
    list.append(row);
  }
}
function renderMoves(events) {
  const list = $("move-list");
  list.replaceChildren();
  if (!events.length) {
    list.append(element("div", "no-moves", "No transfers crossed your thresholds in this block window. Try lowering a threshold or scanning more blocks."));
    return;
  }
  for (const move of events) {
    const item = element("article", "move-card");
    const header = element("div", "move-top");
    const direction = element("span", `direction ${move.direction.toLowerCase()}`, `${move.direction === "IN" ? "↓ IN" : "↑ OUT"} · ${move.kind}`);
    const amount = element("strong", "move-amount", `${move.amount} ${move.symbol}`);
    header.append(direction, amount);
    const message = element("p", "move-explanation", move.explanation);
    const foot = element("div", "move-foot");
    foot.append(element("span", "", `BLOCK ${move.block.toLocaleString()}`));
    const tx = element("a", "", "VIEW TRANSACTION ↗");
    tx.href = `https://www.pharosscan.xyz/tx/${encodeURIComponent(move.tx)}`;
    tx.target = "_blank";
    tx.rel = "noreferrer";
    foot.append(tx);
    item.append(header, message, foot);
    list.append(item);
  }
}
function render(data) {
  $("scan-range").textContent = `BLOCKS ${data.fromBlock.toLocaleString()}–${data.toBlock.toLocaleString()}`;
  $("event-total").textContent = `${data.eventCount} SIGNIFICANT ${data.eventCount === 1 ? "MOVE" : "MOVES"}`;
  $("move-count").textContent = `${data.events.length} SHOWN`;
  const blockLink = $("block-link");
  blockLink.href = `https://www.pharosscan.xyz/block/${data.toBlock}`;
  renderSummary(data.summary);
  renderMoves(data.events);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setState(1);
  try {
    const response = await fetch("/api/whale-watching", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        addresses: parseAddresses(),
        thresholds: { USDC: $("usdc-threshold").value, WPROS: $("wpros-threshold").value },
        lookback: Number($("lookback").value),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "The scan could not be completed.");
    render(data);
    setState(3);
  } catch (error) {
    $("error-message").textContent = error.message || "Check your connection and try again.";
    setState(2);
  }
});

const themeButton = $("theme-toggle");
function setTheme(mode) {
  document.documentElement.dataset.theme = mode;
  document.querySelector('meta[name="theme-color"]').content = mode === "dark" ? "#0b0d12" : "#ffffff";
  themeButton.textContent = mode === "dark" ? "LIGHT" : "DARK";
  themeButton.setAttribute("aria-pressed", String(mode === "dark"));
}
setTheme(localStorage.getItem("pharos-theme") === "dark" ? "dark" : "light");
themeButton.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("pharos-theme", next);
  setTheme(next);
});
updateCount();
