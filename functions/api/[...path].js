/**
 * 屿礼·香有时 - Vercel Serverless API
 * 代理前端请求到飞书多维表格 API
 */

const BASE = 'https://open.feishu.cn/open-apis';
const APP_ID = 'cli_aa1fb66872781bd4';
const APP_SECRET = '6uyhugMXLg7P5aDyKdThwh75cJwyPEJJ';
const BITABLE_APP = 'ADuXbTn2ia6UoOs98WecmaisnOh';
const ORDER_TABLE = 'tblEuzpVOREiNgUb';
const SALES_TABLE = 'tbl12lVzFXB10Wnd';
const WEBHOOK = 'https://open.feishu.cn/open-apis/bot/v2/hook/c185238b-c3db-4d48-a1d7-6d1fb04d3e3d';

// Token 缓存
let tokenCache = { token: null, expiresAt: 0 };

async function getToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60000) {
    return tokenCache.token;
  }
  const resp = await fetch(`${BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET })
  });
  const data = await resp.json();
  if (data.code !== 0) throw new Error('获取token失败: ' + data.msg);
  tokenCache.token = data.tenant_access_token;
  tokenCache.expiresAt = Date.now() + data.expire * 1000;
  return tokenCache.token;
}

async function feishuAPI(method, path, body = null) {
  const token = await getToken();
  const opts = { method, headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } };
  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    opts.body = JSON.stringify(body);
  }
  const resp = await fetch(`${BASE}${path}`, opts);
  return resp.json();
}

// ===== 订单 =====
async function listOrders() {
  const sort = [{ field_name: '下单时间', order: 'desc' }];
  const data = await feishuAPI('POST', `/bitable/v1/apps/${BITABLE_APP}/tables/${ORDER_TABLE}/records/search`, { sort, page_size: 100 });
  if (data.code !== 0) throw new Error(data.msg);
  return (data.data?.items || []).map(formatOrder);
}

async function createOrder(body) {
  const fields = {
    '订单号': body.orderNo || `ORD${Date.now()}`,
    '客户姓名': body.customer?.name || '',
    '客户电话': body.customer?.phone || '',
    '收货地址': body.customer?.address || '',
    '订单总额': String(body.total || 0),
    '销售人': body.salesperson || '',
    '快递单号': body.trackingNo || '',
    '商品明细': JSON.stringify(body.items || []),
    '下单时间': new Date().toISOString(),
    '状态': 'confirmed',
    '是否删除': false
  };
  const data = await feishuAPI('POST', `/bitable/v1/apps/${BITABLE_APP}/tables/${ORDER_TABLE}/records`, { fields });
  if (data.code !== 0) throw new Error(data.msg);
  return { recordId: data.data?.record?.record_id, ...body };
}

async function updateOrder(id, body) {
  const fields = {};
  if (body.status) fields['状态'] = body.status;
  if (body.trackingNo !== undefined) fields['快递单号'] = body.trackingNo;
  if (body.customer?.name) fields['客户姓名'] = body.customer.name;
  if (body.customer?.phone) fields['客户电话'] = body.customer.phone;
  if (body.customer?.address) fields['收货地址'] = body.customer.address;
  const data = await feishuAPI('PUT', `/bitable/v1/apps/${BITABLE_APP}/tables/${ORDER_TABLE}/records/${id}`, { fields });
  if (data.code !== 0) throw new Error(data.msg);
  return { ok: true };
}

async function deleteOrder(id) {
  const fields = { '是否删除': true, '删除时间': new Date().toISOString() };
  const data = await feishuAPI('PATCH', `/bitable/v1/apps/${BITABLE_APP}/tables/${ORDER_TABLE}/records/${id}`, { fields });
  if (data.code !== 0) throw new Error(data.msg);
  return { ok: true };
}

// ===== 销售人员 =====
async function listSales() {
  const data = await feishuAPI('POST', `/bitable/v1/apps/${BITABLE_APP}/tables/${SALES_TABLE}/records/search`, { page_size: 100 });
  if (data.code !== 0) throw new Error(data.msg);
  return (data.data?.items || []).map(formatSales);
}

async function createSales(body) {
  const fields = {
    '姓名': body.name || '',
    '工号': body.username || '',
    '密码': body.password || '',
    '启用': body.active !== false,
    '创建时间': new Date().toISOString(),
    '是否删除': false
  };
  const data = await feishuAPI('POST', `/bitable/v1/apps/${BITABLE_APP}/tables/${SALES_TABLE}/records`, { fields });
  if (data.code !== 0) throw new Error(data.msg);
  return { recordId: data.data?.record?.record_id, ...body };
}

async function updateSales(id, body) {
  const fields = {};
  if (body.name) fields['姓名'] = body.name;
  if (body.username) fields['工号'] = body.username;
  if (body.password) fields['密码'] = body.password;
  if (body.active !== undefined) fields['启用'] = body.active;
  const data = await feishuAPI('PUT', `/bitable/v1/apps/${BITABLE_APP}/tables/${SALES_TABLE}/records/${id}`, { fields });
  if (data.code !== 0) throw new Error(data.msg);
  return { ok: true };
}

async function deleteSales(id) {
  const fields = { '是否删除': true, '删除时间': new Date().toISOString() };
  const data = await feishuAPI('PATCH', `/bitable/v1/apps/${BITABLE_APP}/tables/${SALES_TABLE}/records/${id}`, { fields });
  if (data.code !== 0) throw new Error(data.msg);
  return { ok: true };
}

// ===== 通知 =====
async function sendNotify(body) {
  const resp = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return resp.json();
}

// ===== 格式转换 =====
function formatOrder(record) {
  const f = record.fields || {};
  let items = [];
  try { items = typeof f['商品明细'] === 'string' ? JSON.parse(f['商品明细']) : (f['商品明细'] || []); } catch(e) {}
  return {
    recordId: record.record_id,
    orderNo: f['订单号'] || '',
    id: f['订单号'] || record.record_id,
    time: f['下单时间'] || '',
    status: reverseStatus(f['状态']),
    customer: { name: f['客户姓名'] || '', phone: f['客户电话'] || '', address: f['收货地址'] || '' },
    items,
    total: parseFloat(f['订单总额']) || 0,
    salesperson: f['销售人'] || '',
    trackingNo: f['快递单号'] || '',
    deleted: f['是否删除'] || false,
    deletedAt: f['删除时间'] || null
  };
}

function formatSales(record) {
  const f = record.fields || {};
  return {
    recordId: record.record_id,
    name: f['姓名'] || '',
    username: f['工号'] || '',
    password: f['密码'] || '',
    active: f['启用'] !== false,
    createdAt: f['创建时间'] || '',
    deleted: f['是否删除'] || false,
    deletedAt: f['删除时间'] || null
  };
}

function reverseStatus(s) {
  const map = { 'confirmed': 'confirmed', 'paid': 'paid', 'shipped': 'shipped', 'delivered': 'delivered', 'cancelled': 'cancelled' };
  return map[s] || s || 'confirmed';
}

// ===== Vercel Serverless 入口 =====
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, data, status = 200) {
  setCors(res);
  res.status(status).json(data);
}

module.exports = async function handler(req, res) {
  setCors(res);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 从 req.url 提取路径，兼容 Vercel catch-all 路由
  const urlPath = (req.url || '').replace(/^\/api\/?/, '');
  const path = urlPath || '';

  try {
    // GET /api/sales
    if (path === 'sales' && req.method === 'GET') {
      const data = await listSales();
      return json(res, { ok: true, data });
    }

    // POST /api/sales
    if (path === 'sales' && req.method === 'POST') {
      const data = await createSales(req.body);
      return json(res, { ok: true, data });
    }

    // PUT /api/sales/:id
    if (path.startsWith('sales/') && req.method === 'PUT') {
      const id = path.split('/')[1];
      const data = await updateSales(id, req.body);
      return json(res, data);
    }

    // PATCH /api/sales/:id
    if (path.startsWith('sales/') && req.method === 'PATCH') {
      const id = path.split('/')[1];
      const data = await deleteSales(id);
      return json(res, data);
    }

    // DELETE /api/sales/:id
    if (path.startsWith('sales/') && req.method === 'DELETE') {
      const id = path.split('/')[1];
      const data = await deleteSales(id);
      return json(res, data);
    }

    // GET /api/orders
    if (path === 'orders' && req.method === 'GET') {
      const data = await listOrders();
      return json(res, { ok: true, data });
    }

    // POST /api/orders
    if (path === 'orders' && req.method === 'POST') {
      const data = await createOrder(req.body);
      return json(res, { ok: true, data });
    }

    // PUT /api/orders/:id
    if (path.startsWith('orders/') && req.method === 'PUT') {
      const id = path.split('/')[1];
      const data = await updateOrder(id, req.body);
      return json(res, data);
    }

    // PATCH /api/orders/:id
    if (path.startsWith('orders/') && req.method === 'PATCH') {
      const id = path.split('/')[1];
      const data = await deleteOrder(id);
      return json(res, data);
    }

    // DELETE /api/orders/:id
    if (path.startsWith('orders/') && req.method === 'DELETE') {
      const id = path.split('/')[1];
      const data = await deleteOrder(id);
      return json(res, data);
    }

    // POST /api/notify
    if (path === 'notify' && req.method === 'POST') {
      const data = await sendNotify(req.body);
      return json(res, { ok: true, data });
    }

    return json(res, { ok: false, error: 'Not found: ' + path }, 404);
  } catch (err) {
    console.error('API Error:', err);
    return json(res, { ok: false, error: err.message }, 500);
  }
}
