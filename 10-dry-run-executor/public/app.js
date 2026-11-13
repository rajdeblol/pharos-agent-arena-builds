const I = {
  en: {
    kicker: "READ ONLY", before: "BEFORE YOU SIGN", title: "Dry-run the move.<br><em>See what changes.</em>",
    lead: "Simulate a Pacific transaction, review the estimated fee and predicted balances, then decide whether it is ready for your wallet.",
    note: "Simulation only. No wallet connection, signing, or broadcast.", info: "INFO", infoTitle: "BEFORE YOU SIGN",
    infoOne: "Dry-run calls are read-only. The report predicts what may happen at one block and shows a gas estimate. Nothing is signed or broadcast.",
    infoTwo: "Chain state can change after simulation. Review the unsigned transaction in your wallet before signing.",
    inputs: "TRANSACTION INPUTS", network: "PHAROS PACIFIC", examples: "TRY AN EXAMPLE", action: "Action", token: "Token",
    samples: { pass: "Pass", revert: "Revert", gas: "Low gas", custom: "Custom" },
    metaOne: "ETH_CALL + GAS ESTIMATE", metaTwo: "NO TRANSACTION SENT",
    privacy: "Reads public Pharos chain data. The gate only returns an unsigned transaction after checks pass.",
    report: "SIMULATION REPORT", emptyTitle: "Start with a dry run.",
    emptyCopy: "Choose a sample or enter transaction details. The report will show predicted balance changes and block unsafe execution.",
    flow: "CALL → GAS → STATE → GATE",
    go: "Simulate transaction", gate: "Gate check · no send", blocked: "Blocked until checks pass", wait: "Reading Pharos chain…",
    hint: { pass: "1 USDC from a public wallet that can cover the fee.", revert: "Same wallet, but far more USDC than it holds.", gas: "The transfer call passes, but this pool cannot pay its PROS gas fee.", custom: "Enter your own transfer, approve, or native PROS transaction." },
    labels: { from: "FROM · SENDER", to: "TO · RECIPIENT / SPENDER", amount: "AMOUNT" },
    status: { waiting: "WAITING FOR A SIMULATION", ready: "SIMULATION COMPLETE", failed: "SIMULATION FAILED" },
    coverage: { pass: "CLEAR TO REVIEW", revert: "EXECUTION BLOCKED", gas: "GAS CHECK FAILED" },
    columns: { label: "BALANCE / STATE", before: "BEFORE", after: "AFTER" }, unsigned: "VIEW UNSIGNED TRANSACTION", meta: "BLOCK" },
  pt: {
    kicker: "SOMENTE LEITURA", before: "ANTES DE ASSINAR", title: "Simule a ação.<br><em>Veja o que muda.</em>",
    lead: "Simule uma transação na Pacific, confira a taxa estimada e os saldos previstos antes de decidir se ela está pronta para sua carteira.",
    note: "Apenas simulação. Sem conexão de carteira, assinatura ou envio.", info: "INFO", infoTitle: "ANTES DE ASSINAR",
    infoOne: "As chamadas são somente leitura. O relatório prevê o resultado em um bloco e estima o gás. Nada é assinado nem enviado.",
    infoTwo: "O estado da rede pode mudar após a simulação. Revise a transação sem assinatura na carteira antes de assinar.",
    inputs: "DADOS DA TRANSAÇÃO", network: "PHAROS PACIFIC", examples: "TESTE UM EXEMPLO", action: "Ação", token: "Token",
    samples: { pass: "Aprovada", revert: "Reverte", gas: "Pouco gás", custom: "Personalizada" },
    metaOne: "CHAMADA + ESTIMATIVA DE GÁS", metaTwo: "NENHUMA TRANSAÇÃO ENVIADA",
    privacy: "Lê dados públicos da Pharos. A trava só libera uma transação sem assinatura após as verificações.",
    report: "RELATÓRIO DA SIMULAÇÃO", emptyTitle: "Comece com uma simulação.",
    emptyCopy: "Escolha um exemplo ou informe os dados. O relatório mostra as mudanças previstas e bloqueia a execução insegura.",
    flow: "CHAMADA → GÁS → ESTADO → TRAVA",
    go: "Simular transação", gate: "Checar trava · sem envio", blocked: "Bloqueado até passar", wait: "Lendo a rede Pharos…",
    hint: { pass: "1 USDC de uma carteira pública que cobre a taxa.", revert: "A mesma carteira, mas com muito mais USDC do que possui.", gas: "A chamada passa, mas o pool não paga a taxa de gás em PROS.", custom: "Informe uma transferência, aprovação ou transação PROS." },
    labels: { from: "DE · REMETENTE", to: "PARA · DESTINATÁRIO / OPERADOR", amount: "VALOR" },
    status: { waiting: "AGUARDANDO SIMULAÇÃO", ready: "SIMULAÇÃO CONCLUÍDA", failed: "SIMULAÇÃO FALHOU" },
    coverage: { pass: "LIBERADO PARA REVISÃO", revert: "EXECUÇÃO BLOQUEADA", gas: "FALHA NO GÁS" },
    columns: { label: "SALDO / ESTADO", before: "ANTES", after: "DEPOIS" }, unsigned: "VER TRANSAÇÃO SEM ASSINATURA", meta: "BLOCO" },
};
const DRY = {
  pass: { kind: "transfer", token: "USDC", amount: "1", from: "0x15dDce897D76ac39c188AdE4D353711A60395315", to: "0x000000000000000000000000000000000000dEaD" },
  revert: { kind: "transfer", token: "USDC", amount: "999999999999", from: "0x15dDce897D76ac39c188AdE4D353711A60395315", to: "0x000000000000000000000000000000000000dEaD" },
  gas: { kind: "transfer", token: "USDC", amount: "1", from: "0x912c9aDe24D44d8922f0866D8Dcb079f1363f647", to: "0x000000000000000000000000000000000000dEaD" },
};
const $ = (id) => document.getElementById(id);
let lang = localStorage.getItem("pharos-lang") === "pt" ? "pt" : "en";
let sample = "pass";
let cleared = false;
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function fill(next) {
  const row = DRY[next];
  if (!row) return;
  $("kind").value = row.kind;
  $("token").value = row.token;
  $("amount").value = row.amount;
  $("from").value = row.from;
  $("to").value = row.to;
  $("tokenWrap").hidden = row.kind === "native";
}
function apply() {
  const t = I[lang];
  document.documentElement.lang = lang;
  $("kicker").textContent = t.kicker;
  $("before-sign").textContent = t.before;
  $("title").innerHTML = t.title;
  $("lead").textContent = t.lead;
  $("hero-note").textContent = t.note;
  $("info-label").textContent = t.info;
  $("info-title").textContent = t.infoTitle;
  $("info-one").textContent = t.infoOne;
  $("info-two").textContent = t.infoTwo;
  $("kindL").textContent = t.inputs;
  $("network-tag").textContent = t.network;
  $("examples-label").textContent = t.examples;
  $("action-label").textContent = t.action;
  $("token-label").textContent = t.token;
  $("form-meta-one").textContent = t.metaOne;
  $("form-meta-two").textContent = t.metaTwo;
  $("privacy-note").textContent = t.privacy;
  $("report-title").textContent = t.report;
  $("empty-title").textContent = t.emptyTitle;
  $("empty-copy").textContent = t.emptyCopy;
  $("flow-label").textContent = t.flow;
  ["pass", "revert", "gas", "custom"].forEach((key) => { $("sample-" + key).textContent = t.samples[key]; });
  $("amountL").textContent = t.labels.amount;
  $("fromL").textContent = t.labels.from;
  $("toL").textContent = t.labels.to;
  $("go").querySelector("span").textContent = t.go;
  $("send").textContent = cleared ? t.gate : t.blocked;
  $("send").disabled = !cleared;
  $("hint").textContent = t.hint[sample];
  $("report-status").textContent = $("out").hidden ? t.status.waiting : t.status.ready;
  document.querySelectorAll("[data-sample]").forEach((button) => button.classList.toggle("on", button.dataset.sample === sample));
  document.querySelectorAll("[data-lang]").forEach((button) => button.classList.toggle("on", button.dataset.lang === lang));
}
function resetReport() {
  cleared = false;
  $("out").hidden = true;
  $("empty-state").hidden = false;
  $("report-status").textContent = I[lang].status.waiting;
  $("report-card").removeAttribute("data-verdict");
  $("status").className = "status";
  $("status").textContent = "";
}
function showRows(rows) {
  if (!rows.length) return "";
  const t = I[lang];
  return `<div class="diff"><div class="diff-row diff-head"><span>${t.columns.label}</span><span>${t.columns.before}</span><span>${t.columns.after}</span><span></span></div>${rows.map((row) => {
    const tone = row.same ? "flat" : String(row.delta || "").startsWith("+") ? "up" : "down";
    return `<div class="diff-row"><span>${esc(row.label)}</span><span>${esc(row.before)}</span><span>${esc(row.after)}</span><b class="${tone}">${esc(row.delta)}</b></div>`;
  }).join("")}</div>`;
}
async function run(execute) {
  const q = new URLSearchParams({ lang, execute: execute ? "1" : "0" });
  if (DRY[sample]) q.set("sample", sample);
  else {
    q.set("kind", $("kind").value); q.set("token", $("token").value); q.set("amount", $("amount").value.trim());
    q.set("from", $("from").value.trim()); q.set("to", $("to").value.trim());
  }
  $("status").className = "status busy"; $("status").textContent = I[lang].wait; $("go").disabled = true; $("send").disabled = true;
  $("report-card").setAttribute("aria-busy", "true");
  $("out").hidden = true;
  $("empty-state").hidden = true;
  $("report-status").textContent = lang === "pt" ? "SIMULANDO" : "SIMULATING";
  try {
    const res = await fetch("/api/dry-run?" + q);
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.error || res.statusText);
    $("status").className = "status"; $("status").textContent = ""; $("empty-state").hidden = true; $("out").hidden = false;
    $("report-status").textContent = I[lang].status.ready;
    $("report-card").dataset.verdict = data.verdict;
    $("head").textContent = data.headline;
    $("coverage").textContent = I[lang].coverage[data.verdict] || I[lang].coverage.revert;
    const notes = [data.gasLine, data.block != null ? `${I[lang].meta} ${data.block}` : "", data.reason, data.gate].filter(Boolean);
    const noteHtml = notes.map((line, i) => `<p class="result-note ${i === notes.length - 1 ? "gate" : ""} ${i === 1 ? "meta" : ""}">${esc(line)}</p>`).join("");
    const raw = data.unsigned ? `<details class="unsigned"><summary>${I[lang].unsigned}</summary><pre>${esc(JSON.stringify(data.unsigned, null, 2))}</pre></details>` : "";
    $("lines").innerHTML = showRows(data.rows || []) + `<div class="result-notes">${noteHtml}</div>` + raw;
    cleared = !data.blocked;
    $("send").textContent = cleared ? I[lang].gate : I[lang].blocked;
    $("send").disabled = !cleared;
  } catch (error) {
    $("status").className = "status err"; $("status").textContent = error.message; $("report-status").textContent = I[lang].status.failed;
    cleared = false; $("send").textContent = I[lang].blocked; $("send").disabled = true;
  } finally { $("go").disabled = false; $("report-card").setAttribute("aria-busy", "false"); }
}
$("samples").addEventListener("click", (event) => {
  const button = event.target.closest("[data-sample]"); if (!button) return;
  sample = button.dataset.sample; if (sample !== "custom") fill(sample); resetReport(); apply();
});
["kind", "token", "amount", "from", "to"].forEach((id) => {
  $(id).addEventListener("input", () => { sample = "custom"; resetReport(); apply(); });
  $(id).addEventListener("change", () => { sample = "custom"; $("tokenWrap").hidden = $("kind").value === "native"; resetReport(); apply(); });
});
$("form").addEventListener("submit", (event) => { event.preventDefault(); run(false); });
$("send").addEventListener("click", () => run(true));
const themeButton = $("theme-toggle");
function setTheme(mode) {
  document.documentElement.dataset.theme = mode;
  document.querySelector('meta[name="theme-color"]').content = mode === "dark" ? "#0b0b0b" : "#ffffff";
  themeButton.textContent = mode === "dark" ? "WHITE" : "DARK";
  themeButton.setAttribute("aria-pressed", String(mode === "dark"));
  themeButton.setAttribute("aria-label", `Switch to ${mode === "dark" ? "white" : "dark"} theme`);
}
setTheme(localStorage.getItem("pharos-theme") === "dark" ? "dark" : "light");
themeButton.addEventListener("click", () => { const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; localStorage.setItem("pharos-theme", next); setTheme(next); });
document.querySelectorAll("[data-lang]").forEach((button) => button.addEventListener("click", () => { lang = button.dataset.lang; localStorage.setItem("pharos-lang", lang); apply(); }));
fill("pass"); apply();
