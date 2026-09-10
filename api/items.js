function headers(){return {'Content-Type':'application/json','apikey':process.env.SUPABASE_SERVICE_ROLE_KEY,'Authorization':`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,'Prefer':'return=representation'}}
function base(){return process.env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1'}
async function sb(path,opts={}){const r=await fetch(base()+path,{...opts,headers:{...headers(),...(opts.headers||{})}});const text=await r.text();let data;try{data=text?JSON.parse(text):null}catch{data=text}if(!r.ok)throw new Error(typeof data==='string'?data:(data?.message||data?.hint||data?.details||'Supabase error'));return data}
function pointFromRow(p){return {...p}}
function historyFromRow(h){return {...h}}
export default async function handler(req,res){
 try{
  if(req.method==='GET'){
   const [points,history]=await Promise.all([
    sb('/lubrication_points?select=*&order=code.asc'),
    sb('/lubrication_history?select=*&order=performed_at.desc')
   ]);
   return res.status(200).json({points:points.map(pointFromRow),history:history.map(historyFromRow)});
  }
  if(req.method==='POST'){
   const body=req.body||{}; if(body.type!=='point') return res.status(400).json({error:'Tipo inválido.'});
   const p=body.data||{}; const rows=await sb('/lubrication_points',{method:'POST',body:JSON.stringify(p)}); return res.status(201).json({point:rows?.[0]||rows});
  }
  if(req.method==='PUT'){
   const {id,data}=req.body||{}; if(!id) return res.status(400).json({error:'ID obrigatório.'});
   const rows=await sb(`/lubrication_points?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(data||{})}); return res.status(200).json({point:rows?.[0]||rows});
  }
  if(req.method==='DELETE'){
   const id=new URL(req.url,'http://localhost').searchParams.get('id'); if(!id) return res.status(400).json({error:'ID obrigatório.'});
   await sb(`/lubrication_points?id=eq.${encodeURIComponent(id)}`,{method:'DELETE'}); return res.status(200).json({ok:true});
  }
  return res.status(405).json({error:'Método não permitido.'});
 }catch(e){console.error(e);return res.status(500).json({error:e.message||'Erro interno.'})}
}
