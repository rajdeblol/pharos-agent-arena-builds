const form = document.querySelector("#inspect-form");
const hashInput = document.querySelector("#tx-hash");
const hashCount = document.querySelector("#hash-count");
const resultCard = document.querySelector("#result-card");
const resultStatus = document.querySelector("#result-status");
const inspectButton = document.querySelector("#inspect-button");
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

hashInput.addEventListener("input", () => { hashCount.textContent = `${hashInput.value.trim().length} / 66`; });
document.querySelector("#clear-hash").addEventListener("click", () => {
  hashInput.value = "";
  hashCount.textContent = "0 / 66";
  hashInput.focus();
});

function setLoading(loading) {
  resultCard.setAttribute("aria-busy", String(loading));
  inspectButton.disabled = loading;
  buttonLabel.textContent = loading ? "Checking Pharos…" : "Explain this transaction";
}

function addFact(label, value) {
  if (!value) return null;
  const fact = document.createElement("div");
  fact.className = "fact";
  const caption = document.createElement("span");
  caption.className = "micro-label";
  caption.textContent = label;
  const text = document.createElement("code");
  text.textContent = value;
  fact.append(caption, text);
  return fact;
}

function renderAnalysis(data) {
  if (data.status === "not-found" || data.status === "pending") {
    throw new Error(data.status === "pending"
      ? "The transaction is visible, but its receipt is not available yet. Wait for it to be included, then check again."
      : "Pharos Chain MCP could not find this hash on Pharos mainnet.");
  }
  const diagnosis = data.diagnosis;
  if (!diagnosis) throw new Error("The chain response did not include a diagnosis.");

  analysisState.classList.toggle("is-success", data.status === "success");
  resultStatus.textContent = data.status === "success" ? "TRANSACTION SUCCEEDED" : data.status === "failed" ? "TRANSACTION FAILED" : "STATUS UNCONFIRMED";
  document.querySelector("#diagnosis-type").textContent = diagnosis.type.replaceAll("-", " ").toUpperCase();
  document.querySelector("#diagnosis-title").textContent = diagnosis.title;
  document.querySelector("#confidence").textContent = `${diagnosis.confidence} CONFIDENCE`;
  document.querySelector("#explanation").textContent = diagnosis.explanation;
  document.querySelector("#fix").textContent = diagnosis.fix;

  const facts = document.querySelector("#tx-facts");
  facts.replaceChildren();
  const block = data.transaction?.blockNumber;
  const formatBlock = (value) => {
    try { return BigInt(value).toLocaleString(); } catch { return String(value); }
  };
  for (const entry of [
    addFact("FROM", data.transaction?.from),
    addFact("TO", data.transaction?.to),
    addFact("BLOCK", block ? formatBlock(block) : "—"),
    addFact("GAS USED", data.transaction?.gasUsed ? `${data.transaction.gasUsed}${data.transaction.gasLimit ? ` / ${data.transaction.gasLimit}` : ""}` : null),
  ]) if (entry) facts.append(entry);

  const evidence = document.querySelector("#evidence-list");
  evidence.replaceChildren();
  for (const item of data.evidence ?? []) {
    const row = document.createElement("li");
    row.textContent = item;
    evidence.append(row);
  }
  const explorer = document.querySelector("#explorer-link");
  explorer.href = data.explorerUrl;
  showOnly(analysisState);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const hash = hashInput.value.trim();
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
    resultStatus.textContent = "HASH FORMAT NOT VALID";
    document.querySelector("#error-message").textContent = "Use a Pharos transaction hash beginning with 0x and followed by 64 hexadecimal characters.";
    showOnly(errorState);
    return;
  }

  resultStatus.textContent = "READING TRANSACTION";
  showOnly(loadingState);
  setLoading(true);
  try {
    const response = await fetch("/api/dapp-support", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hash }),
      signal: AbortSignal.timeout(25_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "The Pharos read failed.");
    renderAnalysis(payload);
  } catch (error) {
    resultStatus.textContent = "CHECK DIDN’T COMPLETE";
    document.querySelector("#error-message").textContent = error instanceof Error ? error.message : "The Pharos read failed.";
    showOnly(errorState);
  } finally {
    setLoading(false);
  }
});
