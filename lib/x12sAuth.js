import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';

const ISSUER='x12s-internal';
const AUDIENCE='x12s-viewer';
const DEFAULT_BASE='https://il-x12-s-dashboard.vercel.app';
const cookieName='x12s_session';
const txnCookie='x12s_oauth_txn';

export function baseUrl(){
  const value=(process.env.X12S_AUTH_BASE_URL||DEFAULT_BASE).replace(/\/$/,'');
  if(!/^https:\/\/[^/?#]+$/.test(value)) throw new Error('Invalid X12S_AUTH_BASE_URL');
  return value;
}
export function entraConfig(){
  const tenant=process.env.MS_ENTRA_TENANT_ID||'';
  const client=process.env.MS_ENTRA_CLIENT_ID||'';
  const secret=process.env.MS_ENTRA_CLIENT_SECRET||'';
  // Do not use /common: only company-controlled Microsoft Entra tenants.
  if(!/^[0-9a-f-]{36}$/i.test(tenant)||!client||!secret){
    throw new Error('Microsoft Entra application is not fully configured');
  }
  return {tenant,client,secret,redirect:baseUrl()+'/api/auth/callback',
    issuer:'https://login.microsoftonline.com/'+tenant+'/v2.0'};
}
function secretKey(){
  const secret=process.env.X12S_SESSION_SECRET||'';
  if(secret.length<32) throw new Error('X12S_SESSION_SECRET must contain at least 32 characters');
  return new TextEncoder().encode(secret);
}
export function allowedEmails(){
  return new Set((process.env.X12S_ALLOWED_EMAILS||'')
    .split(',').map(x=>x.trim().toLowerCase()).filter(Boolean));
}
export function isAllowed(email){return Boolean(email)&&allowedEmails().has(String(email).toLowerCase());}
export const randomUrlSafe=()=>randomBytes(32).toString('base64url');
export const pkceChallenge=(value)=>createHash('sha256').update(value).digest('base64url');
const serialise=(name,value,maxAge)=>name+'='+encodeURIComponent(value)+
  '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+maxAge;
export const sessionCookie=(value)=>serialise(cookieName,value,8*60*60);
export const txCookie=(value)=>serialise(txnCookie,value,10*60);
export const clearTxCookie=()=>serialise(txnCookie,'',0);
export const clearSessionCookie=()=>serialise(cookieName,'',0);
export function cookieValue(req,name){
  const header=req.headers.cookie||'';
  const pair=header.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='));
  if(!pair)return null;
  try{return decodeURIComponent(pair.substring(name.length+1));}catch{return null;}
}
async function sign(payload,ttl,audience){
  return new SignJWT(payload).setProtectedHeader({alg:'HS256'})
    .setIssuer(ISSUER).setAudience(audience).setIssuedAt().setExpirationTime(ttl)
    .sign(secretKey());
}
async function verify(value,audience){
  if(!value)return null;
  try{
    const out=await jwtVerify(value,secretKey(),{issuer:ISSUER,audience,algorithms:['HS256']});
    return out.payload;
  }catch{return null;}
}
export async function issueTransaction(state,nonce,verifier){
  return sign({state,nonce,verifier},'10m','x12s-oauth-txn');
}
export async function readTransaction(req){
  return verify(cookieValue(req,txnCookie),'x12s-oauth-txn');
}
export async function issueSession(email,oid,tid){
  return sign({email:email.toLowerCase(),oid,tid},'8h',AUDIENCE);
}
export async function readSession(req){
  const payload=await verify(cookieValue(req,cookieName),AUDIENCE);
  if(!payload||!isAllowed(payload.email))return null;
  return payload;
}
export function safeRedirect(res,url){
  res.statusCode=302;
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Location',url);
  res.end();
}
export async function verifyMicrosoftIdToken(idToken,{tenant,client,issuer},expectedNonce){
  const jwks=createRemoteJWKSet(new URL('https://login.microsoftonline.com/'+tenant+'/discovery/v2.0/keys'));
  const {payload}=await jwtVerify(idToken,jwks,{issuer,audience:client,algorithms:['RS256']});
  if(payload.nonce!==expectedNonce||payload.tid!==tenant||!payload.oid){
    throw new Error('Invalid Microsoft identity token claims');
  }
  // 'preferred_username' is asserted in the tenant-signed ID token; always require exact allowlist match.
  const email=String(payload.preferred_username||payload.email||'').trim().toLowerCase();
  if(!email||!email.includes('@'))throw new Error('Microsoft account has no usable email claim');
  return {email,oid:payload.oid,tid:payload.tid};
}
