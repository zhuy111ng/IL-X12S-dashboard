import {clearSessionCookie,clearTxCookie,baseUrl,safeRedirect} from '../../lib/x12sAuth.js';
export default function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  // Origin check blocks cross-site logout requests.
  const expected=new URL(baseUrl()).origin;
  if(req.headers.origin!==expected)return res.status(403).json({error:'Forbidden'});
  res.setHeader('Set-Cookie',[clearSessionCookie(),clearTxCookie()]);
  return res.status(200).json({ok:true});
}
