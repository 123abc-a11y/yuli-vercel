const BASE = 'https://open.feishu.cn/open-apis';
const APP_ID = 'cli_aa1fb66872781bd4';
const APP_SECRET = '6uyhugMXLg7P5aDyKdThwh75cJwyPEJJ';
const BITABLE_APP = 'ADuXbTn2ia6UoOs98WecmaisnOh';
const ORDER_TABLE = 'tblEuzpVOREiNgUb';
const SALES_TABLE = 'tbl12lVzFXB10Wnd';
const WEBHOOK = 'https://open.feishu.cn/open-apis/bot/v2/hook/c185238b-c3db-4d48-a1d7-6d1fb04d3e3d';
const CORS_HEADERS = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
function jr(data, status) { return new Response(JSON.stringify(data), { status, headers: {'Content-Type':'application/json',...CORS_HEADERS} }); }
let tc = { token: null, expiresAt: 0 };
async function getToken() { if (tc.token && Date.now() < tc.expiresAt - 60000) return tc.token; const r = await fetch(BASE+'/auth/v3/tenant_access_token/internal', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({app_id:APP_ID,app_secret:APP_SECRET}) }); const d = await r.json(); if (d.code !== 0) throw new Error(d.msg); tc.token = d.tenant_access_token; tc.expiresAt = Date.now() + d.expire*1000; return tc.token; }
async function fapi(method, path, body) { const t = await getToken(); const o = { method, headers:{'Authorization':'Bearer '+t,'Content-Type':'application/json'} }; if (body && (method==='POST'||method==='PUT'||method==='PATCH')) o.body = JSON.stringify(body); const r = await fetch(BASE+path, o); return r.json(); }
async function listOrders() { const d = await fapi('POST', '/bitable/v1/apps/'+BITABLE_APP+'/tables/'+ORDER_TABLE+'/records/search', { sort:[{field_name:'下单时间',order:'desc'}], page_size:100 }); if (d.code!==0) throw new Error(d.msg); return (d.data?.items||[]).map(fmtOrder); }
async function createOrder(b) { const fields = {'订单号':b.orderNo||'ORD'+Date.now(),'客户姓名':b.customer?.name||'','客户电话':b.customer?.phone||'','收货地址':b.customer?.address||'','订单总额':String(b.total||0),'销售人':b.salesperson||'','快递单号':b.trackingNo||'','商品明细':JSON.stringify(b.items||[]),'下单时间':new Date().toISOString(),'状态':'confirmed','是否删除':false}; const d = await fapi('POST', '/bitable/v1/apps/'+BITABLE_APP+'/tables/'+ORDER_TABLE+'/records', {fields}); if (d.code!==0) throw new Error(d.msg); return {recordId:d.data?.record?.record_id,...b}; }
async function updateOrder(id,b) { const f = {}; if(b.status)f['状态']=b.status; if(b.trackingNo!==undefined)f['快递单号']=b.trackingNo; if(b.customer?.name)f['客户姓名']=b.customer.name; if(b.customer?.phone)f['客户电话']=b.customer.phone; if(b.customer?.address)f['收货地址']=b.customer.address; const d = await fapi('PUT','/bitable/v1/apps/'+BITABLE_APP+'/tables/'+ORDER_TABLE+'/records/'+id,{fields:f}); if(d.code!==0)throw new Error(d.msg); return {ok:true}; }
async function deleteOrder(id) { const d = await fapi('PATCH','/bitable/v1/apps/'+BITABLE_APP+'/tables/'+ORDER_TABLE+'/records/'+id,{fields:{'是否删除':true,'删除时间':new Date().toISOString()}}); if(d.code!==0)throw new Error(d.msg); return {ok:true}; }
async function listSales() { const d = await fapi('POST','/bitable/v1/apps/'+BITABLE_APP+'/tables/'+SALES_TABLE+'/records/search',{page_size:100}); if(d.code!==0)throw new Error(d.msg); return (d.data?.items||[]).map(fmtSales); }
async function createSales(b) { const fields = {'姓名':b.name||'','工号':b.username||'','密码':b.password||'','启用':b.active!==false,'创建时间':new Date().toISOString(),'是否删除':false}; const d = await fapi('POST','/bitable/v1/apps/'+BITABLE_APP+'/tables/'+SALES_TABLE+'/records',{fields}); if(d.code!==0)throw new Error(d.msg); return {recordId:d.data?.record?.record_id,...b}; }
async function updateSales(id,b) { const f={}; if(b.name)f['姓名']=b.name; if(b.username)f['工号']=b.username; if(b.password)f['密码']=b.password; if(b.active!==undefined)f['启用']=b.active; const d = await fapi('PUT','/bitable/v1/apps/'+BITABLE_APP+'/tables/'+SALES_TABLE+'/records/'+id,{fields:f}); if(d.code!==0)throw new Error(d.msg); return {ok:true}; }
async function deleteSales(id) { const d = await fapi('PATCH','/bitable/v1/apps/'+BITABLE_APP+'/tables/'+SALES_TABLE+'/records/'+id,{fields:{'是否删除':true,'删除时间':new Date().toISOString()}}); if(d.code!==0)throw new Error(d.msg); return {ok:true}; }
function fmtOrder(r) { const f=r.fields||{}; let items=[]; try{items=typeof f['商品明细']==='string'?JSON.parse(f['商品明细']):(f['商品明细']||[]);}catch(e){} return {recordId:r.record_id,orderNo:f['订单号']||'',id:f['订单号']||r.record_id,time:f['下单时间']||'',status:revStatus(f['状态']),customer:{name:f['客户姓名']||'',phone:f['客户电话']||'',address:f['收货地址']||''},items,total:parseFloat(f['订单总额'])||0,salesperson:f['销售人']||'',trackingNo:f['快递单号']||'',deleted:f['是否删除']||false,deletedAt:f['删除时间']||null}; }
function fmtSales(r) { const f=r.fields||{}; return {recordId:r.record_id,name:f['姓名']||'',username:f['工号']||'',password:f['密码']||'',active:f['启用']!==false,createdAt:f['创建时间']||'',deleted:f['是否删除']||false,deletedAt:f['删除时间']||null}; }
function revStatus(s) { const m={'confirmed':'confirmed','paid':'paid','shipped':'shipped','delivered':'delivered','cancelled':'cancelled'}; return m[s]||s||'confirmed'; }
async function sendNotify(b) { const r=await fetch(WEBHOOK,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}); return r.json(); }

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:CORS_HEADERS });
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/?/, '');
    let body = null;
    if (request.method==='POST'||request.method==='PUT'||request.method==='PATCH') { try { body = await request.json(); } catch(e) { body = {}; } }
    try {
      if (path==='sales'&&request.method==='GET') { const d=await listSales(); return jr({ok:true,data:d}); }
      if (path==='sales'&&request.method==='POST') { const d=await createSales(body); return jr({ok:true,data:d}); }
      if (path.startsWith('sales/')&&request.method==='PUT') { const d=await updateSales(path.split('/')[1],body); return jr(d); }
      if (path.startsWith('sales/')&&(request.method==='PATCH'||request.method==='DELETE')) { const d=await deleteSales(path.split('/')[1]); return jr(d); }
      if (path==='orders'&&request.method==='GET') { const d=await listOrders(); return jr({ok:true,data:d}); }
      if (path==='orders'&&request.method==='POST') { const d=await createOrder(body); return jr({ok:true,data:d}); }
      if (path.startsWith('orders/')&&request.method==='PUT') { const d=await updateOrder(path.split('/')[1],body); return jr(d); }
      if (path.startsWith('orders/')&&(request.method==='PATCH'||request.method==='DELETE')) { const d=await deleteOrder(path.split('/')[1]); return jr(d); }
      if (path==='notify'&&request.method==='POST') { const d=await sendNotify(body); return jr({ok:true,data:d}); }
      if (path===''||path==='/') return jr({ok:true,message:'API running',time:new Date().toISOString()});
      return jr({ok:false,error:'Not found'},404);
    } catch(e) { console.error(e); return jr({ok:false,error:e.message},500); }
  }
};
