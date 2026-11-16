import {readSession} from '../../lib/x12sAuth.js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  try{
    const identity=await readSession(req);
    if(!identity)return res.status(401).json({authenticated:false});
    return res.status(200).json({authenticated:true,email:identity.email,role:'viewer'});
  }catch{
    return res.status(503).json({authenticated:false,error:'Authentication configuration unavailable'});
  }
}
