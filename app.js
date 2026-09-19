const REPO = "lucaskerim123/OrbitFS-Developer-page";
const SOURCES = {
  base: { repo: "lucaskerim123/V1-vercel-base", workflow: "release-to-license-master.yml", ref: "base-release", label: "Base" },
  update: { repo: "lucaskerim123/V1-vercel-engine", workflow: "publish-engine-release.yml", ref: "UPDATE_RELEASE", label: "Engine Update" }
};
const API = "https://api.github.com";
let token = sessionStorage.getItem("orbitfs_github_token") || "";

const $ = (id) => document.getElementById(id);
const badge = $("connection-badge"), dialog = $("setup-dialog"), tokenInput = $("github-token");
const message = $("setup-message"), runList = $("run-list"), toast = $("toast");

function authHeaders() {
  return { Accept:"application/vnd.github+json", "X-GitHub-Api-Version":"2022-11-28", Authorization:`Bearer ${token}` };
}
function showToast(text) {
  toast.textContent=text; toast.classList.add("show");
  clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>toast.classList.remove("show"),3500);
}
function setConnected(ok) {
  badge.textContent=ok?"GitHub connected":"GitHub not connected";
  badge.className="status-badge "+(ok?"ok":"offline");
}
async function github(path, options={}) {
  if(!token) throw new Error("Connect GitHub in Setup first.");
  const response=await fetch(API+path,{...options,headers:{...authHeaders(),...(options.headers||{})}});
  if(!response.ok) {
    let detail="";
    try { const body=await response.json(); detail=body.message?": "+body.message:""; } catch {}
    throw new Error("GitHub API "+response.status+detail);
  }
  return response.status===204?null:response.json();
}
async function checkConnection() {
  try {
    await github(`/repos/${REPO}`);
    setConnected(true); return true;
  } catch(error) { setConnected(false); message.textContent=error.message; return false; }
}
async function dispatch(source, inputs) {
  const cfg=SOURCES[source];
  await github(`/repos/${cfg.repo}/actions/workflows/${cfg.workflow}/dispatches`,{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ref:cfg.ref,inputs})
  });
}
function stateClass(status, conclusion) {
  if(status!=="completed") return "state-progress";
  if(conclusion==="success") return "state-success";
  if(conclusion==="failure"||conclusion==="cancelled") return "state-failure";
  return "state-neutral";
}
function stateText(status, conclusion) { return status!=="completed"?"running":(conclusion||"completed"); }

async function cancelRun(repo,id) {
  await github(`/repos/${repo}/actions/runs/${id}/cancel`,{method:"POST"});
  showToast("Run cancellation requested."); refreshRuns();
}
async function retryRun(repo,id) {
  await github(`/repos/${repo}/actions/runs/${id}/rerun-failed-jobs`,{method:"POST"});
  showToast("Failed jobs queued again."); refreshRuns();
}
function runRow(run, source) {
  const repo=SOURCES[source].repo, short=(run.head_sha||"").slice(0,7);
  const active=run.status!=="completed";
  return `<div class="run">
    <div class="run-main"><strong>${escapeHtml(SOURCES[source].label)} · ${escapeHtml(run.name)}</strong><span>#${run.run_number} · ${short} · ${new Date(run.created_at).toLocaleString()}</span></div>
    <span class="run-state ${stateClass(run.status,run.conclusion)}">${escapeHtml(stateText(run.status,run.conclusion))}</span>
    <div class="run-actions">
      <a class="run-link" href="${run.html_url}" target="_blank" rel="noreferrer">Logs</a>
      ${active?`<button class="mini-button" data-action="cancel" data-repo="${repo}" data-id="${run.id}">Cancel</button>`:
      `<button class="mini-button" data-action="retry" data-repo="${repo}" data-id="${run.id}">Retry</button>`}
    </div>
  </div>`;
}
async function refreshRuns() {
  if(!token){runList.innerHTML='<div class="empty">Connect GitHub to load release runs.</div>';return;}
  try {
    const results=await Promise.all(Object.entries(SOURCES).map(async ([source,cfg])=>{
      const data=await github(`/repos/${cfg.repo}/actions/runs?per_page=8`);
      return (data.workflow_runs||[]).map(r=>({...r,__source:source}));
    }));
    const runs=results.flat().sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,16);
    runList.innerHTML=runs.length?runs.map(r=>runRow(r,r.__source)).join(""):'<div class="empty">No release workflow runs yet.</div>';
  } catch(error) { runList.innerHTML=`<div class="empty">${escapeHtml(error.message)}</div>`; }
}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));}

async function draft(source, notesId, versionId, refId) {
  const version=$(versionId).value.trim(), ref=$(refId).value.trim(), cfg=SOURCES[source];
  if(!version){showToast("Enter a version first.");return;}
  try {
    const base=`/repos/${cfg.repo}/compare/${encodeURIComponent(source==="base"?"HEAD":cfg.ref)}...${encodeURIComponent(ref)}`;
    const data=await github(base);
    const commits=(data.commits||[]).slice(0,100).map(c=>`- ${c.commit?.message?.split("\n")[0]||c.sha.slice(0,7)} (${c.sha.slice(0,7)})`).join("\n");
    $(notesId).value=`# OrbitFS ${cfg.label} — v${version}\n\n**Source:** ${cfg.repo}@${ref}\n\n## Changes\n${commits||"- No commits returned for this comparison."}`;
    showToast("Draft changelog generated. Edit it before running.");
  } catch(error) { showToast("Draft failed: "+error.message); }
}

$("setup-open").addEventListener("click",()=>{tokenInput.value=token;message.textContent="";dialog.showModal();});
$("refresh-runs").addEventListener("click",refreshRuns);
runList.addEventListener("click",async e=>{
  const button=e.target.closest("button[data-action]"); if(!button)return;
  try {
    if(button.dataset.action==="cancel") await cancelRun(button.dataset.repo,button.dataset.id);
    else await retryRun(button.dataset.repo,button.dataset.id);
  } catch(error){showToast(error.message);}
});
$("setup-form").addEventListener("submit",async e=>{
  e.preventDefault(); const candidate=tokenInput.value.trim(); if(!candidate)return;
  const old=token; token=candidate; message.textContent="Checking GitHub access…";
  try {
    await Promise.all([github(`/repos/${REPO}`),github(`/repos/${SOURCES.base.repo}`),github(`/repos/${SOURCES.update.repo}`)]);
    sessionStorage.setItem("orbitfs_github_token",token); setConnected(true); dialog.close(); showToast("GitHub connected."); refreshRuns();
  } catch(error){token=old;setConnected(false);message.textContent=error.message;}
});

$("base-draft").addEventListener("click",()=>draft("base","base-notes","base-version","base-ref"));
$("update-draft").addEventListener("click",()=>draft("update","update-notes","update-version","update-ref"));

$("base-form").addEventListener("submit",async e=>{
  e.preventDefault(); if(!token&&!(await checkConnection()))return dialog.showModal();
  const inputs={version:$("base-version").value.trim(),channel:$("base-channel").value};
  try { await dispatch("base",inputs); showToast("Existing Base release workflow started."); setTimeout(refreshRuns,1500); }
  catch(error){showToast(error.message);}
});
$("update-form").addEventListener("submit",async e=>{
  e.preventDefault(); if(!token&&!(await checkConnection()))return dialog.showModal();
  const apex=$("addon-apex").checked,mcp=$("addon-mcp").checked,studio=$("addon-studio").checked;
  if(!apex&&!mcp&&!studio){showToast("Select at least one component.");return;}
  const inputs={version:$("update-version").value.trim(),channel:$("update-channel").value.trim(),apex:String(apex),mcp:String(mcp),studio:String(studio),minimum_deployer_protocol:$("update-protocol").value.trim()};
  try { await dispatch("update",inputs); showToast("Existing Engine release workflow started."); setTimeout(refreshRuns,1500); }
  catch(error){showToast(error.message);}
});
async function init(){if(!token){setConnected(false);return;}if(await checkConnection())refreshRuns();}
init();