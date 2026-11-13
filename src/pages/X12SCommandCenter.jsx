import React, { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, Cell } from 'recharts';
import { Download, Upload } from 'lucide-react';

// Frontend-only first phase: data imported from an authorized private JSON file.
// DO NOT commit real sales, retail budgets, media plans or credentials to a public repo.
const EMPTY = {
  model: 'X12S', dataAsOf: null, salesPeriod: 'Launch period (dates to confirm)',
  target: 700, targets: { MH:245, ALM:154, KSP:105, 'Other / Online':196 },
  so: { October: { MH:null, ALM:null, KSP:null, 'Other / Online':null }, November: {} },
  budgets: { months:{}, streams:{}, retailerLines:[], sharedLines:[] },
  activities: [], retail: {}, actualSpend: [], issues: [], evidence:[]
};
const CHANNELS = ['MH','ALM','KSP'];
const C={ navy:'#122b48', blue:'#3b63da', teal:'#0d91a3', gray:'#a5b4c7', amber:'#c98a31', green:'#14846d' };
const total = arr=>arr.reduce((a,b)=>a+(Number(b)||0),0);
const money=(x)=> x==null||x===''?'Pending':`$${Math.round(Number(x)).toLocaleString('en-US')}`;
const integer=x=>x==null||x===''?'Pending':Math.round(Number(x)).toLocaleString('en-US');
const percent=x=>x==null||!Number.isFinite(x)?'Pending':`${(x*100).toFixed(1)}%`;
const dateLabel=d=>d||'Date not reported';
const hasNumber=x=>typeof x==='number'&&Number.isFinite(x);
const sMonth=(data,m)=>data?.so?.[m]||{};
function Chip({children,tone='neutral'}){return <span className={`xchip ${tone}`}>{children}</span>}
function Stat({label,value,sub,tone='navy'}){return <div className="xstat"><span className="xstat-label">{label}</span><strong style={{color:C[tone]||C.navy}}>{value}</strong><small>{sub}</small></div>}
function Panel({title,sub,children}){return <section className="xpanel"><div className="xpanel-head"><h3>{title}</h3>{sub&&<small>{sub}</small>}</div>{children}</section>}
function Empty({children='Not reported / pending verification'}){return <span className="xmuted">{children}</span>}
function Pr({value,max=1,color=C.blue}) {return <div className="xprogress"><span style={{width:`${Math.min(100,Math.max(0,100*Number(value||0)/max))}%`,background:color}} /></div>}
function ValueRow({label,value,note}){return <div className="xvalue-row"><span>{label}</span><strong>{value}</strong>{note&&<small>{note}</small>}</div>}
function getRetailerBudget(data, ch){const lines=(data.budgets?.retailerLines||[]).filter(x=>x.channel===ch&&x.scope==='Exclusive');return total(lines.map(x=>x.amount))}
function getRetailerShared(data,ch){return (data.budgets?.retailerLines||[]).filter(x=>x.channel===ch&&x.scope==='Shared')}
function getActualSpend(data, ch){const rows=(data.actualSpend||[]).filter(x=>x.channel===ch && hasNumber(x.amount));return rows.length?total(rows.map(x=>x.amount)):null}
function actionStatus(data,ch,category){return (data.activities||[]).filter(x=>x.channel===ch&&(!category||x.category===category));}
function confirmedSO(data,m,ch){const v=sMonth(data,m)[ch];return hasNumber(v)?v:null}
function allConfirmedSO(data,m){const vals=Object.values(sMonth(data,m));return vals.some(hasNumber)?total(vals):null}
function activityTotals(data){const acts=(data.activities||[]).filter(x=>x.status!=='Not scoped');const completed=acts.filter(x=>x.status==='Verified / Completed');const submitted=acts.filter(x=>['Verified / Completed','In progress','Not completed','Delayed','Blocked'].includes(x.status));return {planned:acts.length,completed:completed.length,rate:submitted.length&&acts.length?completed.length/acts.length:null}}
function decisionFor(data,ch){const so=confirmedSO(data,'November',ch),active=actionStatus(data,ch);const actual=getActualSpend(data,ch);const evidence=active.some(x=>x.status==='Verified / Completed');if(so===null||!hasNumber(actual)||!evidence)return {name:'HOLD / VALIDATE',tone:'warning',reason:'Need November SO, retailer-attributed actual spend and verified activation evidence before scale/cut.'};return {name:'REVIEW / OPTIMIZE',tone:'neutral',reason:'Compare sales trend, retail execution, promotion, and budget delivery; directional only.'}}
const defaultIssue=(ch)=>ch==='ALM'?'Confirm retailer cooperation, BF promotion and CO-ADS proof.':ch==='KSP'?'Confirm X12S store coverage and independent marketing allocation.':'Verify store readiness and MH/PAYNGO shared CO-ADS allocation.';

export default function X12SCommandCenter(){
  const [data,setData]=useState(()=>{
    try {const s=localStorage.getItem('x12s-preview-state');return s?JSON.parse(s):EMPTY;} catch {return EMPTY;}
  });
  const [liveStatus,setLiveStatus]=useState('local');
  const [tab,setTab]=useState('overall');
  const [channel,setChannel]=useState('MH');
  const [error,setError]=useState('');
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState({month:'November',channel:'MH',value:'',owner:'',asOf:''});
  useEffect(()=>{try{localStorage.setItem('x12s-preview-state',JSON.stringify(data))}catch{}},[data]);
  // Protected read-only sync. API returns 503 until workload identity and server
  // access controls are configured; never convert missing responses into zero.
  useEffect(()=>{
    let active=true;
    async function refresh(){
      try{
        const response=await fetch('/api/dashboard',{credentials:'same-origin',cache:'no-store'});
        if(!response.ok){if(active)setLiveStatus('local');return;}
        const payload=await response.json();
        if(active&&payload?.model==='X12S'&&payload.source==='verified-private-google-sheets'){
          setData(payload);
          setLiveStatus('live');
        }
      }catch{if(active)setLiveStatus('local');}
    }
    refresh();
    const interval=setInterval(refresh,5*60*1000);
    return()=>{active=false;clearInterval(interval);};
  },[]);

  const reported=allConfirmedSO(data,'October'), nov=allConfirmedSO(data,'November');
  // Target gap below is DOCUMENTED-only, never labeled current confirmed remaining target.
  const known=total(['October','November'].flatMap(m=>Object.values(sMonth(data,m)).filter(hasNumber)));
  const gap=Math.max(0,(Number(data.target)||700)-known);
  const planMonths=['Oct','Nov','Dec'].map(m=>({name:m,plan:data.budgets?.months?.[m]??null, actual: (data.actualSpend||[]).filter(x=>x.month===m&&hasNumber(x.amount)).length?total(data.actualSpend.filter(x=>x.month===m&&hasNumber(x.amount)).map(x=>x.amount)):null}));
  const q4Total=total(Object.values(data.budgets?.months||{}));
  const knownSpent=(data.actualSpend||[]).filter(x=>hasNumber(x.amount));
  const q4Actual=knownSpent.length?total(knownSpent.map(x=>x.amount)):null;
  const acts=activityTotals(data);
  const channels=CHANNELS.map(ch=>({ch,goal:data.targets?.[ch],oct:confirmedSO(data,'October',ch),nov:confirmedSO(data,'November',ch)}));
  const streamData=Object.entries(data.budgets?.streams||{}).map(([stream,amount])=>({stream,amount})).sort((a,b)=>b.amount-a.amount);
  const monthsReady=planMonths.some(x=>hasNumber(x.plan));

  const importJSON=async(e)=>{const file=e.target.files?.[0];if(!file)return;try{const payload=JSON.parse(await file.text());if(payload.model!=='X12S')throw new Error('This file is not marked X12S.');if(!payload.targets||!payload.so||!payload.budgets)throw new Error('Missing required data sections.');setData(payload);setError('');}catch(ex){setError(`Import failed: ${ex.message}`)}e.target.value=''};
  const exportJSON=()=>{const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download='X12S_private_data_export.json';a.click();URL.revokeObjectURL(u)};
  const saveSales=()=>{const n=draft.value.trim()===''?null:Number(draft.value);if(n!==null&&(!Number.isFinite(n)||n<0)){setError('SO must be a nonnegative number, or blank for unreported.');return;}setData(d=>({...d,so:{...d.so,[draft.month]:{...d.so[draft.month],[draft.channel]:n}},dataAsOf:draft.asOf||d.dataAsOf}));setEditing(false);setError('')};

  return <div className="x12s-app"><header className="xheader"><div className="xheader-inner"><div><div className="xeyebrow">ECOVACS · ISRAEL · X12S ONLY</div><h1>Retail Business & MKT Investment Command Center</h1><p>Business results → retail execution → marketing support → weekly decisions</p></div><div className="xheader-actions"><label className="xbutton xbutton-light"><Upload size={15}/> Import private X12S data<input aria-label="Import X12S JSON" type="file" accept="application/json,.json" hidden onChange={importJSON}/></label><button className="xbutton xbutton-light" onClick={exportJSON}><Download size={15}/> Export updates</button></div></div></header>
  <div className="xnav"><div className="xnav-inner">{[['overall','01 Overall · Plan vs Actual'],['channels','02 Retailer Deep Dive'],['decisions','03 Decisions & Actions']].map(([id,title])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{title}</button>)}<span className="xasof">Source as of: {dateLabel(data.dataAsOf)} · <b>{liveStatus==='live'?'Protected Sheets sync · refresh every 5 min':'Local preview · private sync not enabled'}</b></span></div></div>
  {error&&<div className="xerror" role="alert">{error}</div>}
  <main className="xmain">
  {tab==='overall'&&<><div className="xsection-title"><div><h2>01 · Launch performance vs plan</h2><p>X12S-only. Teal: confirmed October · Blue: November plan · Grey: not reported.</p></div><Chip>700-unit goal: launch period; exact end date to confirm</Chip></div>
    <div className="xstats"><Stat label="LAUNCH SO TARGET" value={`${integer(data.target)} units`} sub="MH 245 · ALM 154 · KSP 105 · Other/Online 196" tone="blue"/><Stat label="OCTOBER CONFIRMED SO" value={reported===null?'Pending':`${integer(reported)} units`} sub="Historical SO, not November actual" tone="teal"/><Stat label="NOVEMBER CONFIRMED SO" value={nov===null?'Pending':`${integer(nov)} units`} sub="HQ as-of date required" tone={nov===null?'gray':'blue'}/><Stat label="DOCUMENTED-ONLY GOAL GAP" value={`${integer(gap)} units`} sub="Not current remaining-to-sell without complete SO" tone="navy"/></div>
    <div className="xcols xcols-2"><Panel title="SO: retailer vs launch target" sub="October baseline, November reporting shown separately"><ResponsiveContainer width="100%" height={280}><BarChart data={channels} margin={{top:15,right:14,bottom:0,left:0}}><CartesianGrid strokeDasharray="3 4" stroke="#e8edf3"/><XAxis dataKey="ch"/><YAxis/><Tooltip/><Legend/><Bar dataKey="goal" name="Launch goal" fill="#c7d8f7" radius={[4,4,0,0]}/><Bar dataKey="oct" name="Oct confirmed SO" fill={C.teal} radius={[4,4,0,0]}/><Bar dataKey="nov" name="Nov confirmed SO" fill={C.blue} radius={[4,4,0,0]}/></BarChart></ResponsiveContainer><p className="xnote">Missing November SO is not zero. Do not add October SO into November achievement.</p></Panel>
    <Panel title="X12S MKT budget: plan vs actual" sub="USD · Q4 model-specific only"><div className="xbudget-pair"><div><small>Q4 planned</small><strong>{q4Total?money(q4Total):'Pending'}</strong></div><div><small>Reported actual spend</small><strong>{money(q4Actual)}</strong></div><div><small>Budget utilization</small><strong>{q4Actual!==null&&q4Total?percent(q4Actual/q4Total):'Pending'}</strong></div></div>{monthsReady?<ResponsiveContainer height={230} width="100%"><BarChart data={planMonths}><CartesianGrid strokeDasharray="3 4" stroke="#e8edf3"/><XAxis dataKey="name"/><YAxis tickFormatter={v=>`${Math.round(v/1000)}k`}/><Tooltip formatter={money}/><Legend/><Bar dataKey="plan" name="Planned (USD)" fill={C.blue}/><Bar dataKey="actual" name="Reported spend" fill={C.teal}/></BarChart></ResponsiveContainer>:<Empty>Import X12S plan to display monthly budget bars.</Empty>}<p className="xnote">Actual spend has no verified report yet. Unknown ≠ $0. No ALL-model budget included.</p></Panel></div>
    <div className="xcols xcols-2"><Panel title="MKT workstreams · planned allocation" sub="X12S model-specific planned budget"><div className="xstream-list">{streamData.length?streamData.map(x=><div className="xstream" key={x.stream}><div className="xrow"><span>{x.stream}</span><b>{money(x.amount)} <em>({percent(x.amount/q4Total)})</em></b></div><Pr value={x.amount} max={q4Total}/></div>):<Empty>Import private X12S source data.</Empty>}</div></Panel><Panel title="Marketing activity delivery" sub="Verified deliverables, not booked budget"><div className="xbig-metric">{acts.rate===null?'Pending':percent(acts.rate)}<small>{acts.rate===null?'No verified execution plan submitted':`${acts.completed}/${acts.planned} scoped actions verified`}</small></div><Pr value={acts.completed} max={acts.planned||1} color={C.teal}/><p className="xnote">Scope and proof needed for CO-ADS, POSM, Demo, Paid Media, KOL/UGC and DOOH. Existing generic photos are not X12S POSM proof.</p></Panel></div>
    <Panel title="Timeline & reporting checkpoints" sub="Launch phases and data refresh responsibility"><div className="xtimeline">{[['Oct','Teaser / launch','Oct SO baseline · plan budget'],['Nov','Launch / Black Friday','HQ SO pending · promotions / CO-ADS'],['Dec','Maintenance','Always-on / reviews']].map(([m,title,detail])=><div key={m}><b>{m} 2026</b><strong>{title}</strong><small>{detail}</small></div>)}</div></Panel>
  </>}
  {tab==='channels'&&<><div className="xsection-title"><div><h2>02 · Retailer business-to-marketing review</h2><p>Sales conversion → retail readiness → MKT support → budget → diagnosis</p></div><div className="xchannel-tabs">{CHANNELS.map(ch=><button key={ch} className={channel===ch?'active':''} onClick={()=>setChannel(ch)}>{ch}</button>)}</div></div>
  {(()=>{const ch=channel;const goal=data.targets[ch],oct=confirmedSO(data,'October',ch),n=confirmedSO(data,'November',ch),exclusive=getRetailerBudget(data,ch),shared=getRetailerShared(data,ch),actual=getActualSpend(data,ch),act=actionStatus(data,ch),decision=decisionFor(data,ch),retail=data.retail?.[ch];return <>
    <div className="xstats"><Stat label={`${ch} LAUNCH SO GOAL`} value={`${goal} units`} sub={`${percent(goal/data.target)} of 700-unit total`} tone="blue"/><Stat label="OCT SO (ACTUAL)" value={oct===null?'Pending':`${integer(oct)} units`} sub="Historical baseline" tone="teal"/><Stat label="NOV SO (ACTUAL)" value={n===null?'Pending':`${integer(n)} units`} sub="No unverified zero values" tone={n===null?'gray':'blue'}/><Stat label="EXCLUSIVE RETAILER MKT PLAN" value={exclusive?money(exclusive):'Unallocated'} sub="Shared and global spending excluded" tone="navy"/></div>
    <div className="xcols xcols-2"><Panel title={`${ch} · sales & retail readiness`}><ValueRow label="October confirmed SO" value={oct===null?'Pending':`${integer(oct)} units`} note="Previous month"/><ValueRow label="November confirmed SO" value={n===null?<Empty/>:`${integer(n)} units`}/><ValueRow label="Known store photo matches" value={retail?.photoMatches==null?<Empty/>:`${retail.photoMatches} / ${retail.photoMaster}`} note="Generic brand photography only; not X12S installation"/><ValueRow label="X12S POSM / Demo verified" value={retail?.x12sVerified==null?<Empty/>:integer(retail.x12sVerified)}/><ValueRow label="Black Friday promotion status" value={<Empty/>}/></Panel>
    <Panel title={`${ch} · attributable marketing investment`} sub="USD; Q4 plan by ownership"><ValueRow label="Exclusive named CO-ADS / retailer activity" value={exclusive?money(exclusive):'No exclusive amount verified'}/><ValueRow label="Shared retailer budget" value={shared.length?money(total(shared.map(x=>x.amount))):'Not separately identified'} note={shared.length?shared.map(x=>x.note||x.channel).join(' · '):'No source-backed allocation'}/><ValueRow label="Actual spend attributed to retailer" value={money(actual)}/><ValueRow label="Budget utilization" value={actual!==null&&exclusive?percent(actual/exclusive):'Pending'} note="Cannot divide by unallocated shared budget"/><p className="xnote">Global MKT budget is displayed on Overall page, not copied into each retailer.</p></Panel></div>
    <div className="xcols xcols-2"><Panel title={`${ch} · planned marketing support vs delivery`} sub="Only X12S-specific or explicitly X12S-linked activities"><table className="xtable"><thead><tr><th>Activity / plan</th><th>Period</th><th>Delivery</th></tr></thead><tbody>{act.length?act.map((x,i)=><tr key={i}><td><b>{x.category}</b><small>{x.label||''}</small></td><td>{x.period||'Q4'}</td><td><Chip tone={x.status==='Verified / Completed'?'good':'neutral'}>{x.status||'Awaiting proof'}</Chip></td></tr>):<tr><td colSpan="3"><Empty>No scoped retailer activity imported.</Empty></td></tr>}</tbody></table></Panel><Panel title="Business diagnosis & next resource decision"><Chip tone={decision.tone}>{decision.name}</Chip><p className="xdiag">{decision.reason}</p><h4>Next evidence to request</h4><div className="xdiag-points"><div>1. Local Sales: confirmed latest SO, inventory and retailer promotion.</div><div>2. Agency: POSM / Demo proof, CO-ADS placement and reporting dates.</div><div>3. MKT / Finance: approved budget, attributable spend and invoices.</div></div><p className="xnote">{defaultIssue(ch)} A spending-to-SO ratio is descriptive, not causal ROAS.</p></Panel></div>
  </>})()}
  </>}
  {tab==='decisions'&&<><div className="xsection-title"><div><h2>03 · Diagnosis, ownership & next decisions</h2><p>Scale / Optimize / Fix Retail / Hold only when evidence supports the decision.</p></div><Chip tone="warning">Current recommendation: validate missing data</Chip></div>
    <div className="xcols xcols-3">{CHANNELS.map(ch=>{const d=decisionFor(data,ch);return <Panel key={ch} title={ch}><Chip tone={d.tone}>{d.name}</Chip><p className="xdiag">{d.reason}</p><ValueRow label="Launch target" value={`${data.targets[ch]} units`}/><ValueRow label="Oct SO" value={confirmedSO(data,'October',ch)===null?'Pending':`${integer(confirmedSO(data,'October',ch))} units`}/><ValueRow label="Nov SO" value={integer(confirmedSO(data,'November',ch))}/><ValueRow label="Exclusive MKT plan" value={money(getRetailerBudget(data,ch)||null)}/></Panel>})}</div>
    <Panel title="Cross-team weekly action register" sub="Do not bury issues in emails or chat threads"><table className="xtable"><thead><tr><th>Priority / issue</th><th>Responsible party</th><th>Next checkpoint</th><th>Status</th></tr></thead><tbody>{(data.issues||[]).length?(data.issues.map((issue,i)=><tr key={i}><td>{issue.issue}</td><td>{issue.owner||'Unassigned'}</td><td>{issue.due||'To confirm'}</td><td><Chip>{issue.status||'Open'}</Chip></td></tr>)):[['Confirm launch-period SO baseline','HQ / Local Sales'],['Validate CO-ADS spend allocation','MKT / Finance'],['Confirm X12S-specific POSM and Demo completion','Local Agency']].map(([title,owner],i)=><tr key={i}><td>{title}</td><td>{owner}</td><td>Next weekly review</td><td><Chip tone="warning">Pending</Chip></td></tr>)}</tbody></table></Panel>
    <Panel title="Inputs & reporting controls" sub="Private local preview, not connected to live POS systems"><div className="xeditline"><p>For internal review, import the private X12S JSON file; edit SO using the form and export the updated dataset. To enable cross-device agency editing, implement authenticated backend / Google Sheets API sync; localStorage is single-browser only.</p><button className="xbutton" onClick={()=>setEditing(x=>!x)}>{editing?'Close editor':'Edit reported SO'}</button></div>{editing&&<div className="xeditform"><label>Month<select value={draft.month} onChange={e=>setDraft({...draft,month:e.target.value})}><option>October</option><option>November</option></select></label><label>Retailer<select value={draft.channel} onChange={e=>setDraft({...draft,channel:e.target.value})}>{[...CHANNELS,'Other / Online'].map(x=><option key={x}>{x}</option>)}</select></label><label>Confirmed units<input type="number" min="0" placeholder="Leave empty if not reported" value={draft.value} onChange={e=>setDraft({...draft,value:e.target.value})}/></label><label>Report as-of<input type="date" value={draft.asOf} onChange={e=>setDraft({...draft,asOf:e.target.value})}/></label><button className="xbutton" onClick={saveSales}>Save local preview</button></div>}</Panel>
  </>}
  </main><footer className="xfooter">Confidential X12S data — do not commit imported private JSON to public GitHub. Planned amounts ≠ actual spend; October SO ≠ November SO; reported photo coverage ≠ X12S POSM readiness.</footer></div>
}
