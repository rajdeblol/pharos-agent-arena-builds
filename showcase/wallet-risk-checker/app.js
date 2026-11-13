const form = document.querySelector("#scan-form");
const addressInput = document.querySelector("#address-input");
const reportCard = document.querySelector("#report-card");
const reportStatus = document.querySelector("#report-status");
const scanButton = document.querySelector("#scan-button");
const buttonLabel = document.querySelector("#button-label");
const emptyState = document.querySelector("#empty-state");
const loadingState = document.querySelector("#loading-state");
const errorState = document.querySelector("#error-state");
const analysisState = document.querySelector("#analysis-state");
const states = [emptyState, loadingState, errorState, analysisState];
const themeButton = document.querySelector("#theme-toggle");

function showOnly(selected) {
  for (const state of states) state.hidden = state !== selected;
}

function setTheme(mode) {
  document.documentElement.dataset.theme = mode;
  document.querySelector('meta[name="theme-color"]').content = mode === "dark" ? "#0b0b0b" : "#ffffff";
  themeButton.textContent = mode === "dark" ? "WHITE" : "DARK";
  themeButton.setAttribute("aria-pressed", String(mode === "dark"));
}

setTheme(localStorage.getItem("pharos-theme") === "dark" ? "dark" : "light");
themeButton.addEventListener("click", () => {
  const mode = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("pharos-theme", mode);
  setTheme(mode);
});

document.querySelectorAll(".preset").forEach((button) => {
  button.addEventListener("click", () => {
    addressInput.value = button.dataset.address;
    addressInput.focus();
  });
});

document.querySelector("#clear-address").addEventListener("click", () => {
  addressInput.value = "";
  addressInput.focus();
});

function setLoading(loading) {
  reportCard.setAttribute("aria-busy", String(loading));
  scanButton.disabled = loading;
  buttonLabel.textContent = loading ? "Reading Pharos…" : "Check this address";
}

function addMetric(label, value) {
  const item = document.createElement("div");
  item.className = "metric";
  const caption = document.createElement("span");
  caption.className = "micro-label";
  caption.textContent = label;
  const detail = document.createElement("strong");
  detail.textContent = value ?? "Unknown";
  item.append(caption, detail);
  return item;
}

function renderReport(report) {
  if (!report || !["low", "medium", "high"].includes(report.riskLevel)) throw new Error("The chain response did not include a valid risk report.");
  analysisState.dataset.level = report.riskLevel;
  document.querySelector("#risk-level").textContent = report.riskLevel.toUpperCase();
  document.querySelector("#risk-score").textContent = String(report.riskScore);
  document.querySelector("#score-fill").style.width = `${Math.max(0, Math.min(100, report.riskScore))}%`;
  document.querySelector("#coverage").textContent = report.coverage === "complete" ? "CHECKS COMPLETE" : "PARTIAL DATA";
  document.querySelector("#summary").textContent = report.summary;
  document.querySelector("#recommendation").textContent = report.recommendation;
  reportStatus.textContent = `${report.riskLevel.toUpperCase()} RISK · ${report.signals.length} SIGNALS`;
  const metrics = document.querySelector("#metrics");
  metrics.replaceChildren(
    addMetric("ADDRESS TYPE", report.metrics.addressType),
    addMetric("NATIVE BALANCE", report.metrics.nativeBalance),
    addMetric("TX NONCE", report.metrics.transactionCount),
    addMetric("RECENT USDC TRANSFERS", report.metrics.recentUsdcTransfers),
  );

  const signals = document.querySelector("#signals");
  signals.replaceChildren();
  for (const signal of report.signals) {
    const item = document.createElement("article");
    item.className = `signal signal-${signal.severity}`;
    const tag = document.createElement("span");
    tag.className = "signal-tag";
    tag.textContent = signal.severity.toUpperCase();
    const content = document.createElement("div");
    const title = document.createElement("h4");
    title.textContent = signal.title;
    const detail = document.createElement("p");
    detail.textContent = signal.detail;
    content.append(title, detail);
    item.append(tag, content);
    signals.append(item);
  }
  document.querySelector("#signal-count").textContent = `${report.signals.length} SIGNAL${report.signals.length === 1 ? "" : "S"}`;
  document.querySelector("#snapshot").textContent = `PHAROS BLOCK ${report.blockNumber?.toLocaleString?.() ?? report.blockNumber ?? "UNKNOWN"} · LAST ${report.metrics.checkedBlocks.toLocaleString()} BLOCKS`;
  const explorer = document.querySelector("#explorer-link");
  explorer.href = report.explorerUrl;

  const sources = document.querySelector("#sources");
  sources.replaceChildren();
  for (const source of report.sources ?? []) {
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = `${source.title} ↗`;
    sources.append(link);
  }
  showOnly(analysisState);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const address = addressInput.value.trim();
  if (address.toUpperCase() !== "USDC" && !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    reportStatus.textContent = "ADDRESS FORMAT NOT VALID";
    document.querySelector("#error-message").textContent = "Enter a 0x address with 40 hexadecimal characters, or use the USDC example.";
    showOnly(errorState);
    return;
  }

  reportStatus.textContent = "READING CHAIN DATA";
  showOnly(loadingState);
  setLoading(true);
  try {
    const response = await fetch("/api/wallet-risk-checker", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address, lookback: Number(document.querySelector("#lookback").value) }),
      signal: AbortSignal.timeout(27_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "The Pharos read failed.");
    renderReport(payload);
  } catch (error) {
    reportStatus.textContent = "CHECK DIDN’T COMPLETE";
    document.querySelector("#error-message").textContent = error instanceof Error ? error.message : "The Pharos read failed.";
    showOnly(errorState);
  } finally {
    setLoading(false);
  }
});
