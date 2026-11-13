/**
 * Private X12S Sheets API (disabled until OIDC + Deployment Protection are configured).
 * Zero service-account private keys or business values in this public repository.
 *
 * Deployment security: Vercel Authentication must protect ALL deployments.
 * This endpoint is for internal authorized Vercel team members only; it does not
 * provide separate Sales / MKT / Agency role-based authorisation.
 */
const GOOGLE_STS = 'https://sts.googleapis.com/v1/token';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const CLOUD_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

function cell(row, index) { return (row || [])[index] ?? null; }
function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function str(value) { return value == null ? '' : String(value).trim(); }
function assertEnvironment() {
  const vars = ['GOOGLE_WIF_AUDIENCE','GOOGLE_SERVICE_ACCOUNT_EMAIL','X12S_MASTER_SHEET_ID','X12S_AGENCY_SHEET_ID','VERCEL_OIDC_TOKEN'];
  const missing = vars.filter(key => !process.env[key]);
  if (missing.length) throw new Error('Missing server-side configuration: ' + missing.join(', '));
}
async function responseJSON(url, init) {
  const response = await fetch(url, init);
  const raw = await response.text();
  if (!response.ok) {
    // Do not leak access tokens / complete upstream response to the client.
    throw new Error('Google upstream request rejected (HTTP ' + response.status + ')');
  }
  try { return JSON.parse(raw); } catch { throw new Error('Unexpected Google API response'); }
}
async function googleAccessToken() {
  // Requires Vercel OIDC token issuance and Google Cloud workload identity federation.
  const form = new URLSearchParams({
    audience: process.env.GOOGLE_WIF_AUDIENCE,
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    subject_token: process.env.VERCEL_OIDC_TOKEN,
    scope: CLOUD_SCOPE
  });
  const sts = await responseJSON(GOOGLE_STS, {
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form
  });
  const email = encodeURIComponent(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const result = await responseJSON(
    'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/' + email + ':generateAccessToken',
    {method:'POST',headers:{Authorization:'Bearer '+sts.access_token,'Content-Type':'application/json'},
      body:JSON.stringify({scope:[GOOGLE_SCOPE],lifetime:'900s'})}
  );
  if (!result.accessToken) throw new Error('Service-account impersonation returned no access token');
  return result.accessToken;
}
async function sheetsBatchGet(token, spreadsheetId, ranges) {
  const params = new URLSearchParams();
  for (const range of ranges) params.append('ranges',range);
  const url='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(spreadsheetId)+'/values:batchGet?'+params.toString();
  const data = await responseJSON(url,{headers:{Authorization:'Bearer '+token}});
  return (data.valueRanges||[]).map(v=>v.values||[]);
}
function mapSO(rows) {
  const so = {October:{}, November:{}}, sources={};
  for (const row of rows.slice(1)) {
    const ch = str(cell(row,0));
    if (!['MH','ALM','KSP','Other Offline','Online'].includes(ch)) continue;
    so.October[ch]=num(cell(row,1));
    so.November[ch]=num(cell(row,2));
    sources[ch]={asOf:cell(row,5),validation:cell(row,7)};
  }
  const combine=(month)=>{
    const a=so[month]['Other Offline'],b=so[month].Online;
    // Only combine when both components are provided; unknown is not zero.
    so[month]['Other / Online']=(a!==null&&b!==null)?a+b:null;
  };
  combine('October');combine('November');
  return {so,sources};
}
function mapActivities(rows) {
  return rows.slice(1).filter(row=>str(cell(row,1)).toUpperCase()==='X12S').map(row=>{
    const proof=str(cell(row,15)),verification=str(cell(row,19));
    const submitted=str(cell(row,12));
    const verified=verification==='Verified'&&Boolean(proof);
    return {
      id:str(cell(row,0)),channel:str(cell(row,4)),category:str(cell(row,5)),
      description:str(cell(row,6)),planStart:cell(row,7),planEnd:cell(row,8),
      plannedQty:num(cell(row,9)),deliveredQty:verified?num(cell(row,11)):null,
      status:verified?'Verified / Completed':submitted,
      executionStatus:submitted,verification,proof:proof||null,
      owner:cell(row,16),updatedAt:cell(row,17),blocker:cell(row,18)
    };
  });
}
function mapApprovedSpend(rows) {
  // Spend claims are NOT actual spend until MKT status is Approved
  // and the approved amount is supplied. Shared spend stays Shared.
  return rows.slice(1).filter(row=>
    str(cell(row,1)).toUpperCase()==='X12S'&&
    str(cell(row,14))==='Approved'&&
    str(cell(row,7))==='USD'&&num(cell(row,15))!==null
  ).map(row=>({
    id:str(cell(row,0)),channel:str(cell(row,4))==='Shared'?'Shared':str(cell(row,3)),
    attribution:str(cell(row,4)),workstream:str(cell(row,5)),
    month:str(cell(row,2)),amount:num(cell(row,15)),currency:'USD',
    approver:cell(row,16),approvalDate:cell(row,17),
    activityId:str(cell(row,6))
  }));
}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('Vary','Cookie, Authorization');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(process.env.X12S_LIVE_SYNC_ENABLED!=='true'){
    return res.status(503).json({error:'Live data endpoint not enabled'});
  }
  try {
    assertEnvironment();
    const token=await googleAccessToken();
    const [master,agency]=await Promise.all([
      sheetsBatchGet(token,process.env.X12S_MASTER_SHEET_ID,["'SO Reporting'!A5:I11"]),
      sheetsBatchGet(token,process.env.X12S_AGENCY_SHEET_ID,
        ["'01 Activity Delivery'!A1:T300","'02 Spend Claims'!A1:S300"])
    ]);
    const result=mapSO(master[0]||[]);
    return res.status(200).json({
      model:'X12S',source:'verified-private-google-sheets',
      retrievedAt:new Date().toISOString(),
      dataAsOf:null, // Reporting as-of must come from sales / MKT, not API fetch timestamp.
      salesPeriod:'Launch period (dates to confirm)',
      target:700,targets:{MH:245,ALM:154,KSP:105,'Other / Online':196},
      so:result.so,soSources:result.sources,
      budgets:{months:{},streams:{},retailerLines:[],sharedLines:[]},
      activities:mapActivities(agency[0]||[]),
      actualSpend:mapApprovedSpend(agency[1]||[]),
      retail:{},issues:[],evidence:[],
      notes:['Master budget remains pending until approved X12S USD plan is normalized in Google Sheets.',
        'Agency claims are excluded from actual spend until MKT approved.',
        'Weekly SO is provisional and is not added to HQ monthly SO.']
    });
  } catch(err) {
    console.error('Private X12S data API failed:',err.message);
    return res.status(503).json({error:'Live data temporarily unavailable. Confirm server configuration and authorized access.'});
  }
}
