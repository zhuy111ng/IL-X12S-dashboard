import {entraConfig,readTransaction,clearTxCookie,sessionCookie,issueSession,
  verifyMicrosoftIdToken,isAllowed,baseUrl,safeRedirect} from '../../lib/x12sAuth.js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Set-Cookie',clearTxCookie());
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const fail=(reason)=>safeRedirect(res,baseUrl()+'/?login_error='+encodeURIComponent(reason));
  try{
    if(req.query.error)return fail('microsoft');
    const cfg=entraConfig();
    const tx=await readTransaction(req);
    if(!tx||typeof req.query.state!=='string'||tx.state!==req.query.state||
       typeof req.query.code!=='string')return fail('session');
    const response=await fetch('https://login.microsoftonline.com/'+cfg.tenant+'/oauth2/v2.0/token',{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({client_id:cfg.client,client_secret:cfg.secret,grant_type:'authorization_code',
        code:req.query.code,redirect_uri:cfg.redirect,code_verifier:tx.verifier})
    });
    if(!response.ok)throw new Error('Microsoft token exchange rejected '+response.status);
    const tokens=await response.json();
    if(!tokens.id_token)throw new Error('Microsoft response missing ID token');
    const identity=await verifyMicrosoftIdToken(tokens.id_token,cfg,tx.nonce);
    if(!isAllowed(identity.email))return fail('not_allowed');
    const cookie=await issueSession(identity.email,identity.oid,identity.tid);
    res.setHeader('Set-Cookie',[clearTxCookie(),sessionCookie(cookie)]);
    safeRedirect(res,baseUrl()+'/');
  }catch(e){
    console.error('X12S Microsoft callback failed:',e.message);
    fail('authentication');
  }
}
