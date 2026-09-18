const REPO = "lucaskerim123/OrbitFS-Developer-page";
const BASE_WORKFLOW = "base-release-control.yml";
const UPDATE_WORKFLOW = "update-release-control.yml";
const API = "https://api.github.com";
let token = sessionStorage.getItem("orbitfs_github_token") || "";

const $ = (id) => document.getElementById(id);
const badge = $("connection-badge");
const dialog = $("setup-dialog");
const tokenInput = $("github-token");
const message = $("setup-message");
const runList = $("run-list");
const toast = $("toast");

function authHeaders() {
  return {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Authorization": `Bearer ${token}`
  };
}
function showToast(text) {
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3500);
}
function setConnected(ok) {
  badge.textContent = ok ? "GitHub connected" : "GitHub not connected";
  badge.className = "status-badge " + (ok ? "ok" : "offline");
}
async function github(path, options = {}) {
  if (!token) throw new Error("Connect GitHub in Setup first.");
  const response = await fetch(API + path, { ...options, headers: { ...authHeaders(), ...(options.headers || {}) } });
  if (!response.ok) {
    let detail = "";
    try { const body = await response.json(); detail = body.message ? ": " + body.message : ""; } catch {}
    throw new Error("GitHub API " + response.status + detail);
  }
  return response.status === 204 ? null : response.json();
}
async function checkConnection() {
  try {
    await github(`/repos/${REPO}`);
    setConnected(true);
    return true;
  } catch (error) {
    setConnected(false);
    message.textContent = error.message;
    return false;
  }
}
async function dispatchWorkflow(workflow, inputs) {
  await github(`/repos/${REPO}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main", inputs })
  });
}
function stateClass(status, conclusion) {
  if (status !== "completed") return "state-progress";
  if (conclusion === "success") return "state-success";
  if (conclusion === "failure" || conclusion === "cancelled") return "state-failure";
  return "state-neutral";
}
function stateText(status, conclusion) {
  if (status !== "completed") return "running";
  return conclusion || "completed";
}
async function refreshRuns() {
  if (!token) {
    runList.innerHTML = '<div class="empty">Connect GitHub to load recent control runs.</div>';
    return;
  }
  try {
    const data = await github(`/repos/${REPO}/actions/runs?event=workflow_dispatch&per_page=12`);
    const runs = data.workflow_runs || [];
    if (!runs.length) {
      runList.innerHTML = '<div class="empty">No manual control runs yet.</div>';
      return;
    }
    runList.innerHTML = runs.map(run => {
      const short = (run.head_sha || "").slice(0, 7);
      return `<div class="run">
        <div class="run-main"><strong>${escapeHtml(run.name)}</strong><span>#${run.run_number} · ${short} · ${new Date(run.created_at).toLocaleString()}</span></div>
        <span class="run-state ${stateClass(run.status, run.conclusion)}">${escapeHtml(stateText(run.status, run.conclusion))}</span>
        <a class="run-link" href="${run.html_url}" target="_blank" rel="noreferrer">Open run</a>
      </div>`;
    }).join("");
  } catch (error) {
    runList.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
}

$("setup-open").addEventListener("click", () => {
  tokenInput.value = token;
  message.textContent = "";
  dialog.showModal();
});
$("refresh-runs").addEventListener("click", refreshRuns);

$("setup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const candidate = tokenInput.value.trim();
  if (!candidate) return;
  const old = token;
  token = candidate;
  message.textContent = "Checking GitHub access…";
  try {
    await github(`/repos/${REPO}`);
    sessionStorage.setItem("orbitfs_github_token", token);
    setConnected(true);
    message.textContent = "Connected.";
    dialog.close();
    showToast("GitHub connected.");
    refreshRuns();
  } catch (error) {
    token = old;
    message.textContent = error.message;
    setConnected(false);
  }
});

$("base-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!token && !(await checkConnection())) return dialog.showModal();
  const version = $("base-version").value.trim();
  const channel = $("base-channel").value;
  const source_ref = $("base-ref").value.trim();
  try {
    await dispatchWorkflow(BASE_WORKFLOW, { version, channel, source_ref });
    showToast("Base release control job started.");
    refreshRuns();
  } catch (error) {
    showToast(error.message);
  }
});

$("update-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!token && !(await checkConnection())) return dialog.showModal();
  const version = $("update-version").value.trim();
  const channel = $("update-channel").value.trim();
  const source_ref = $("update-ref").value.trim();
  const apex = $("addon-apex").checked;
  const mcp = $("addon-mcp").checked;
  const studio = $("addon-studio").checked;
  const minimum_deployer_protocol = $("update-protocol").value.trim();
  if (!apex && !mcp && !studio) {
    showToast("Select at least one addon: APEX, MCP or Studio.");
    return;
  }
  try {
    await dispatchWorkflow(UPDATE_WORKFLOW, { version, channel, source_ref, apex: String(apex), mcp: String(mcp), studio: String(studio), minimum_deployer_protocol });
    showToast("Update release control job started.");
    refreshRuns();
  } catch (error) {
    showToast(error.message);
  }
});

async function init() {
  if (!token) return setConnected(false);
  const ok = await checkConnection();
  if (ok) refreshRuns();
}
init();
