const form = document.querySelector("#read-form");
const addressInput = document.querySelector("#address");
const readButton = document.querySelector(".read-button");
const buttonLabel = document.querySelector(".button-label");
const resultPanel = document.querySelector("#result-panel");
const statusLabel = document.querySelector("#status-label");
const emptyState = document.querySelector("#empty-state");
const loadingState = document.querySelector("#loading-state");
const errorState = document.querySelector("#error-state");
const dataState = document.querySelector("#data-state");

const showOnly = (state) => {
  for (const element of [emptyState, loadingState, errorState, dataState]) {
    element.hidden = element !== state;
  }
};

function shortTime(iso) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

function abbreviateAddress(value) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function setLoading(isLoading) {
  resultPanel.setAttribute("aria-busy", String(isLoading));
  readButton.disabled = isLoading;
  buttonLabel.textContent = isLoading ? "Reading the chain…" : "Read this contract";
}

function showError(message) {
  showOnly(errorState);
  statusLabel.textContent = "READ DIDN’T LAND";
  statusLabel.parentElement.classList.remove("is-live");
  statusLabel.parentElement.classList.add("is-error");
  document.querySelector("#error-message").textContent = message;
}

function fillResult(result) {
  showOnly(dataState);
  statusLabel.textContent = "SNAPSHOT READY";
  statusLabel.parentElement.classList.remove("is-error");
  statusLabel.parentElement.classList.add("is-live");
  document.querySelector("#token-name").textContent = result.token.name;
  document.querySelector("#token-symbol").textContent = result.token.symbol;
  document.querySelector("#token-emblem").textContent = (result.token.symbol || "?").slice(0, 1).toUpperCase();
  document.querySelector("#total-supply").textContent = result.token.totalSupply;
  document.querySelector("#supply-caption").textContent = `${result.token.symbol} · ${result.token.decimals} decimals`;
  document.querySelector("#decimals").textContent = result.token.decimals;
  document.querySelector("#result-address").textContent = abbreviateAddress(result.address);
  document.querySelector("#result-address").title = result.address;
  document.querySelector("#block-number").textContent = Number(result.block).toLocaleString();
  document.querySelector("#read-time").textContent = shortTime(result.readAt);
  const explorer = document.querySelector("#explorer-link");
  explorer.href = result.explorer;

  const rawValues = document.querySelector("#raw-values");
  rawValues.replaceChildren();
  for (const [label, value] of Object.entries(result.raw)) {
    const row = document.createElement("div");
    const name = document.createElement("span");
    const code = document.createElement("code");
    name.textContent = label;
    code.textContent = value;
    row.append(name, code);
    rawValues.append(row);
  }
  rawValues.hidden = true;
  document.querySelector("#raw-toggle").setAttribute("aria-expanded", "false");
  document.querySelector("#raw-toggle").innerHTML = "SHOW RAW VALUES <span>＋</span>";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusLabel.parentElement.classList.remove("is-live", "is-error");
  statusLabel.textContent = "READING NOW";
  showOnly(loadingState);
  setLoading(true);

  try {
    const response = await fetch("/api/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: addressInput.value.trim() }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The Pharos read failed.");
    fillResult(result);
  } catch (error) {
    showError(error instanceof Error ? error.message : "The Pharos read failed.");
  } finally {
    setLoading(false);
  }
});

document.querySelectorAll("[data-address]").forEach((button) => {
  button.addEventListener("click", () => {
    addressInput.value = button.dataset.address;
    addressInput.focus();
  });
});

document.querySelector("#copy-address").addEventListener("click", async () => {
  const fullAddress = addressInput.value.trim();
  try {
    await navigator.clipboard.writeText(fullAddress);
    const button = document.querySelector("#copy-address");
    button.textContent = "COPIED";
    window.setTimeout(() => { button.textContent = "COPY"; }, 1200);
  } catch {
    showError("Clipboard access is unavailable here. Select and copy the address from the field above.");
  }
});

document.querySelector("#raw-toggle").addEventListener("click", (event) => {
  const button = event.currentTarget;
  const rawValues = document.querySelector("#raw-values");
  const isOpen = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!isOpen));
  rawValues.hidden = isOpen;
  button.innerHTML = isOpen ? "SHOW RAW VALUES <span>＋</span>" : "HIDE RAW VALUES <span>−</span>";
});
