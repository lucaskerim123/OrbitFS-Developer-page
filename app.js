const REPO="lucaskerim123/OrbitFS-Developer-page";
const SOURCES={
  base:{repo:"lucaskerim123/V1-vercel-base",workflow:"release-to-license-master.yml",ref:"base-release",controlWorkflow:"base-release-control.yml",label:"Base"},
  update:{repo:"lucaskerim123/V1-vercel-engine",workflow:"publish-engine-release.yml",ref:"UPDATE_RELEASE",controlWorkflow:"update-release-control.yml",label:"Engine Update"}
};
const API="https://api.github.com";
const TOKEN_KEY="orbitfs_github_token";
const TRACKING_KEY="orbitfs_release_jobs";
let token=localStorage.getItem(TOKEN_KEY)||sessionStorage.getItem("orbitfs_github_token")||"";
if(token&&!localStorage.getItem(TOKEN_KEY))localStorage.setItem(TOKEN_KEY,token);
let polling=null;
let releaseJobs=JSON.parse(localStorage.getItem(TRACKING_KEY)||"[]");
const lastDetected={base:[],update:[]};
function saveReleaseJobs(){localStorage.setItem(TRACKING_KEY,JSON.stringify(releaseJobs.slice(0,50)))}
function rememberReleaseJob(job){releaseJobs=[job,...releaseJobs.filter(x=>x.key!==job.key)].slice(0,50);saveReleaseJobs()}
function updateTrackedRun(key,patch){const i=releaseJobs.findIndex(x=>x.key===key);if(i>=0){releaseJobs[i]={...releaseJobs[i],...patch};saveReleaseJobs()}}

const $=id=>document.getElementById(id),badge=$("connection-badge"),dialog=$("setup-dialog"),tokenInput=$("github-token");
const message=$("setup-message"),runList=$("run-list"),toast=$("toast");

function authHeaders(){return{Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28",Authorization:`Bearer ${token}`}}
function showToast(text){toast.textContent=text;toast.classList.add("show");clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.classList.remove("show"),3600)}
function setConnected(ok){badge.textContent=ok?"GitHub connected":"GitHub not connected";badge.className="status-badge "+(ok?"ok":"offline")}
async function github(path,options={}){
  if(!token)throw new Error("Connect GitHub in Setup first.");
  const response=await fetch(API+path,{...options,headers:{...authHeaders(),...(options.headers||{})}});
  if(!response.ok){let detail="";try{const body=await response.json();detail=body.message?": "+body.message:""}catch{}throw new Error("GitHub API "+response.status+detail)}
  return response.status===204?null:response.json();
}
async function checkConnection(){
  try{await Promise.all([github(`/repos/${REPO}`),github(`/repos/${SOURCES.base.repo}`),github(`/repos/${SOURCES.update.repo}`)]);setConnected(true);return true}
  catch(error){setConnected(false);message.textContent=error.message;return false}
}
async function dispatch(source,inputs){
  const cfg=SOURCES[source];
  const {__changedFiles,...workflowInputs}=inputs;
  const job={key:crypto.randomUUID(),source,sourceRepo:cfg.repo,sourceWorkflow:cfg.workflow,inputs:{...workflowInputs},changedFiles:__changedFiles||((typeof workflowInputs.changed_files==="string")?(()=>{try{return JSON.parse(workflowInputs.changed_files)}catch{return []}})():workflowInputs.changed_files||[]),submittedAt:new Date().toISOString(),status:"queued"};
  rememberReleaseJob(job);
  await github(`/repos/${REPO}/actions/workflows/${cfg.controlWorkflow}/dispatches`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ref:"main",inputs:workflowInputs})});
  setTimeout(()=>findDispatchedRun(job),1500);
  return job;
}
async function findDispatchedRun(job){
  try{
    const branch=job.inputs.source_ref||SOURCES[job.source].ref;
    const data=await github(`/repos/${job.sourceRepo}/actions/runs?event=workflow_dispatch&branch=${encodeURIComponent(branch)}&per_page=20`);
    const submitted=Date.parse(job.submittedAt);
    const run=(data.workflow_runs||[]).find(r=>Date.parse(r.created_at)>=submitted-10000);
    if(run){updateTrackedRun(job.key,{runId:run.id,runNumber:run.run_number,runUrl:run.html_url,status:run.status,conclusion:run.conclusion});await refreshRuns()}
    else setTimeout(()=>findDispatchedRun(job),2500);
  }catch{}
}
function stateClass(status,conclusion){if(status!=="completed")return"state-progress";if(conclusion==="success")return"state-success";if(conclusion==="failure"||conclusion==="cancelled")return"state-failure";return"state-neutral"}
function stateText(status,conclusion){return status!=="completed"?"running":(conclusion||"completed")}
async function cancelRun(repo,id){await github(`/repos/${repo}/actions/runs/${id}/cancel`,{method:"POST"});showToast("Run cancellation requested.");await refreshRuns()}
async function retryRun(repo,id){await github(`/repos/${repo}/actions/runs/${id}/rerun-failed-jobs`,{method:"POST"});showToast("Failed jobs queued again.");await refreshRuns()}
function runRow(run,source){
  const repo=SOURCES[source].repo,short=(run.head_sha||"").slice(0,7),active=run.status!=="completed";
  return `<div class="run"><div class="run-main"><strong>${escapeHtml(SOURCES[source].label)} · ${escapeHtml(run.name)}</strong><span>#${run.run_number} · ${short} · ${new Date(run.created_at).toLocaleString()}</span></div><span class="run-state ${stateClass(run.status,run.conclusion)}">${escapeHtml(stateText(run.status,run.conclusion))}</span><div class="run-actions"><a class="run-link" href="${run.html_url}" target="_blank" rel="noreferrer">Logs</a>${active?`<button class="mini-button" data-action="cancel" data-repo="${repo}" data-id="${run.id}">Cancel</button>`:`<button class="mini-button" data-action="retry" data-repo="${repo}" data-id="${run.id}">Retry</button>`}</div></div>`
}
async function refreshRuns(){
  if(!token){runList.innerHTML='<div class="empty">Connect GitHub to load release runs.</div>';return}
  try{
    const results=await Promise.all(Object.entries(SOURCES).map(async([source,cfg])=>{
      const data=await github(`/repos/${cfg.repo}/actions/runs?per_page=10`);
      return(data.workflow_runs||[]).map(r=>({...r,__source:source}))
    }));
    const runs=results.flat().sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,20);
    const tracked=releaseJobs.map(j=>`<div class="run"><div class="run-main"><strong>${escapeHtml(SOURCES[j.source].label)} · submitted from Developer Page</strong><span>${j.runNumber?`#${j.runNumber} · `:""}${new Date(j.submittedAt).toLocaleString()}</span><div class="tracked-inputs">${Object.entries(j.inputs||{}).filter(([k])=>k!=="changed_files").map(([k,v])=>`<span>${escapeHtml(k)}: ${escapeHtml(String(v))}</span>`).join("")}</div>${(j.changedFiles||[]).length?`<div class="detection-files">${j.changedFiles.slice(0,40).map(f=>`<div>${escapeHtml(f.status||"M")} · ${escapeHtml(f.filename||f)}</div>`).join("")}</div>`:""}</div><span class="run-state ${stateClass(j.status,j.conclusion)}">${escapeHtml(j.conclusion||j.status||"queued")}</span><div class="run-actions">${j.runUrl?`<a class="run-link" href="${j.runUrl}" target="_blank" rel="noreferrer">Logs</a>`:""}</div></div>`).join("");
runList.innerHTML=(tracked+runs.map(r=>runRow(r,r.__source)).join(""))||'<div class="empty">No release workflow runs yet.</div>';
  }catch(error){runList.innerHTML=`<div class="empty">${escapeHtml(error.message)}</div>`}
}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]))}
function detectComponents(files){
  const paths=files.map(x=>x.filename.toLowerCase());
  return {base:paths.some(p=>p.includes("base")),apex:paths.some(p=>p.includes("apex")||p.includes("sorter")||p.includes("converter")),mcp:paths.some(p=>p.includes("mcp")),studio:paths.some(p=>p.includes("studio")),files:files.length};
}
function renderDetection(source,files){
  lastDetected[source]=files.slice(0,150).map(f=>({filename:f.filename,status:f.status||"M",additions:f.additions||0,deletions:f.deletions||0}));
  const target=$(source==="base"?"base-detection":"update-detection");
  if(!files.length){target.innerHTML="<strong>No changed files returned.</strong>";return}
  const d=detectComponents(files);
  if(source==="update"){
    $("addon-base").checked=d.base;$("addon-apex").checked=d.apex;$("addon-mcp").checked=d.mcp;$("addon-studio").checked=d.studio;
  }
  const comps=source==="base"?"Base package":"Detected: "+[d.base?"Base":"",d.apex?"APEX":"",d.mcp?"MCP":"",d.studio?"Studio":""].filter(Boolean).join(", ");
  const listed=files.slice(0,40).map(f=>`<div>${escapeHtml(f.status||"M")} · ${escapeHtml(f.filename)}</div>`).join("");
  target.innerHTML=`<strong>${escapeHtml(comps)}</strong> · ${d.files} changed file${d.files===1?"":"s"}<div class="detection-files">${listed}</div>`;
}
async function draft(source,notesId,versionId,refId){
  const version=$(versionId).value.trim(),ref=SOURCES[source].ref,cfg=SOURCES[source];
  if(!version){showToast("Enter a version first.");return}
  try{
    const baseRef="main",data=await github(`/repos/${cfg.repo}/compare/${encodeURIComponent(baseRef)}...${encodeURIComponent(ref)}`);
    const commits=(data.commits||[]).slice(0,100).map(c=>`- ${c.commit?.message?.split("\n")[0]||c.sha.slice(0,7)} (${c.sha.slice(0,7)})`).join("\n");
    renderDetection(source,data.files||[]);
    $(notesId).value=`# OrbitFS ${cfg.label} — v${version}\n\n**Source:** ${cfg.repo}@${ref}\n\n## Changes\n${commits||"- No commits returned for this comparison."}\n\n## Changed files\n${(data.files||[]).slice(0,150).map(f=>`- ${f.status||"M"} ${f.filename}`).join("\n")||"- None reported."}`;
    showToast("Source diff analysed and changelog draft generated.");
  }catch(error){showToast("Draft failed: "+error.message)}
}
$("setup-open").addEventListener("click",()=>{tokenInput.value=token;message.textContent="";dialog.showModal()});
$("refresh-runs").addEventListener("click",refreshRuns);
runList.addEventListener("click",async e=>{
  const button=e.target.closest("button[data-action]");if(!button)return;
  try{if(button.dataset.action==="cancel")await cancelRun(button.dataset.repo,button.dataset.id);else await retryRun(button.dataset.repo,button.dataset.id)}catch(error){showToast(error.message)}
});
$("setup-form").addEventListener("submit",async e=>{
  e.preventDefault();const candidate=tokenInput.value.trim();if(!candidate)return;
  const old=token;token=candidate;message.textContent="Checking GitHub access…";
  try{await checkConnection();localStorage.setItem(TOKEN_KEY,token);dialog.close();showToast("GitHub connected.");await refreshRuns();startPolling()}
  catch(error){token=old;setConnected(false);message.textContent=error.message}
});
$("base-draft").addEventListener("click",()=>draft("base","base-notes","base-version","base-ref"));
$("update-draft").addEventListener("click",()=>draft("update","update-notes","update-version","update-ref"));
$("base-form").addEventListener("submit",async e=>{
  e.preventDefault();if(!token&&!(await checkConnection()))return dialog.showModal();
  if(!lastDetected.base.length)await draft("base","base-notes","base-version","base-ref");
  const version=$("base-version").value.trim(),channel=$("base-channel").value;
  if(!version){showToast("Version is required.");return}
  try{const notes=$("base-notes").value.trim();const run=await dispatch("base",{version,channel,notes,__changedFiles:lastDetected.base});showToast(run?.workflow_run?.id?`Base build queued (#${run.workflow_run.run_number||"?"}).`:"Base release workflow queued.");setTimeout(refreshRuns,1000)}catch(error){showToast(error.message)}
});
$("update-form").addEventListener("submit",async e=>{
  e.preventDefault();if(!token&&!(await checkConnection()))return dialog.showModal();
  if(!lastDetected.update.length)await draft("update","update-notes","update-version","update-ref");
  const base=$("addon-base").checked,apex=$("addon-apex").checked,mcp=$("addon-mcp").checked,studio=$("addon-studio").checked;
  if(!base&&!apex&&!mcp&&!studio){showToast("Detect changes or select at least one component.");return}
  const inputs={version:$("update-version").value.trim(),channel:$("update-channel").value,source_ref:SOURCES.update.ref,base:String(base),apex:String(apex),mcp:String(mcp),studio:String(studio),minimum_deployer_protocol:$("update-protocol").value.trim(),minimum_base_version:$("update-min-base").value.trim(),notes:$("update-notes").value.trim(),changed_files:JSON.stringify(lastDetected.update)};
  try{const run=await dispatch("update",inputs);showToast(run?.workflow_run?.id?`Engine update queued (#${run.workflow_run.run_number||"?"}).`:"Engine update workflow queued.");setTimeout(refreshRuns,1000)}catch(error){showToast(error.message)}
});
function startPolling(){clearInterval(polling);polling=setInterval(()=>{if(document.visibilityState==="visible")refreshRuns()},5000)}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&token){refreshRuns();startPolling()}});
async function init(){if(!token){setConnected(false);return}if(await checkConnection()){await refreshRuns();startPolling()}}
init();