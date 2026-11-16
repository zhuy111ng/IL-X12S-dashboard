import {randomUrlSafe,pkceChallenge,issueTransaction,txCookie,entraConfig,safeRedirect} from '../../lib/x12sAuth.js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  try{
    const cfg=entraConfig();
    const state=randomUrlSafe(),nonce=randomUrlSafe(),verifier=randomUrlSafe();
    const transaction=await issueTransaction(state,nonce,verifier);
    res.setHeader('Set-Cookie',txCookie(transaction));
    const url=new URL('https://login.microsoftonline.com/'+cfg.tenant+'/oauth2/v2.0/authorize');
    const p=url.searchParams;
    p.set('client_id',cfg.client);p.set('response_type','code');p.set('redirect_uri',cfg.redirect);
    p.set('response_mode','query');p.set('scope','openid profile email');
    p.set('state',state);p.set('nonce',nonce);p.set('code_challenge',pkceChallenge(verifier));
    p.set('code_challenge_method','S256');p.set('prompt','select_account');
    safeRedirect(res,url.toString());
  }catch(e){
    console.error('X12S sign-in setup failed:',e.message);
    return res.status(503).json({error:'Company sign-in is not configured yet'});
  }
}
