const FEISHU_APP_ID = 'cli_aa1fb66872781bd4';
const FEISHU_APP_SECRET = '6uyhugMXLg7P5aDyKdThwh75cJwyPEJJ';
const BITABLE_APP_TOKEN = 'ADuXbTn2ia6UoOs98WecmaisnOh';
const ORDER_TABLE_ID = 'tblEuzpVOREiNgUb';
const SALES_TABLE_ID = 'tbl12lVzFXB10Wnd';
const FEISHU_WEBHOOK = 'https://open.feishu.cn/open-apis/bot/v2/hook/c185238b-c3db-4d48-a1d7-6d1fb04d3e3d';
const ADMIN_PASSWORD = 'jiutu2026';

let tokenCache = { token: null, expiry: 0 };

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

async function getTenantToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiry) return tokenCache.token;
  const resp = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: FEISHU_APP_ID, app_secret: FEISHU_APP_SECRET })
  });
  const data = await resp.json();
  if (!data.tenant_access_token) throw new Error('获取飞书Token失败');
  tokenCache = { token: data.tenant_access_token, expiry: Date.now() + (data.expire - 300) * 1000 };
  return tokenCache.token;
}

async function feishuAPI(method, path, body) {
  const token = await getTenantToken();
  const opts = { method, headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const resp = await fetch('https://open.feishu.cn/open-apis' + path, opts);
  const data = await resp.json();
  if (data.code && data.code !== 0) throw new Error('飞书API错误: ' + data.msg);
  return data;
}

function extractText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(item => typeof item === 'string' ? item : (item && item.text ? item.text : String(item))).join(',');
  if (typeof value === 'object' && value.text) return value.text;
  return String(value);
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
  });
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, '') || '/';
  const origin = request.headers.get('Origin') || '*';

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  try {
    // GET /api/ - 健康检查
    if (path === '/' && request.method === 'GET') {
      return jsonResponse({ ok: true, message: 'API running', time: new Date().toISOString() }, 200, origin);
    }

    // GET /api/orders
    if (path === '/orders' && request.method === 'GET') {
      const data = await feishuAPI('GET', `/bitable/v1/apps/${BITABLE_APP_TOKEN}/tables/${ORDER_TABLE_ID}/records?page_size=100`);
      const orders = (data.data?.items || []).map(item => ({
        recordId: item.record_id,
        name: extractText(item.fields?.name),
        customerName: extractText(item.fields?.customer_name),
        phone: extractText(item.fields?.phone),
        address: extractText(item.fields?.address),
        products: item.fields?.products || [],
        totalAmount: item.fields?.total_amount || 0,
        status: extractText(item.fields?.status || '待处理'),
        salesName: extractText(item.fields?.sales_name),
        salesUsername: extractText(item.fields?.sales_username),
        createdAt: extractText(item.fields?.created_time),
        remark: extractText(item.fields?.remark)
      }));
      return jsonResponse({ ok: true, data: orders }, 200, origin);
    }

    // POST /api/orders
    if (path === '/orders' && request.method === 'POST') {
      const body = await request.json();
      const fields = {
        name: [{ type: 'text', text: body.name || '' }],
        customer_name: [{ type: 'text', text: body.customerName || '' }],
        phone: [{ type: 'text', text: body.phone || '' }],
        address: [{ type: 'text', text: body.address || '' }],
        products: body.products || [],
        total_amount: body.totalAmount || 0,
        status: [{ type: 'text', text: body.status || '待处理' }],
        sales_name: [{ type: 'text', text: body.salesName || '' }],
        sales_username: [{ type: 'text', text: body.salesUsername || '' }],
        remark: [{ type: 'text', text: body.remark || '' }]
      };
      const data = await feishuAPI('POST', `/bitable/v1/apps/${BITABLE_APP_TOKEN}/tables/${ORDER_TABLE_ID}/records`, { fields });
      try {
        await fetch(FEISHU_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ msg_type: 'interactive', card: { elements: [{ tag: 'div', text: { tag: 'lark_md', content: `**新订单通知**\n客户：${body.customerName || body.name}\n手机：${body.phone || ''}\n产品：${(body.products||[]).map(p=>p.name).join('、')}\n金额：¥${body.totalAmount || 0}` } }], header: { title: { tag: 'plain_text', content: '屿礼·新订单' } } } })
        });
      } catch(e) {}
      return jsonResponse({ ok: true, data: { recordId: data.data?.record_id } }, 200, origin);
    }

    // GET /api/sales
    if (path === '/sales' && request.method === 'GET') {
      const filter = JSON.stringify({conjunction:"and",conditions:[{field_name:"deleted",operator:"is",value:[false]}]});
      const data = await feishuAPI('GET', `/bitable/v1/apps/${BITABLE_APP_TOKEN}/tables/${SALES_TABLE_ID}/records?filter=${encodeURIComponent(filter)}&page_size=100`);
      const sales = (data.data?.items || []).map(item => ({
        recordId: item.record_id,
        name: extractText(item.fields?.name),
        username: extractText(item.fields?.username),
        password: extractText(item.fields?.password),
        active: item.fields?.active !== false,
        createdAt: extractText(item.fields?.created_time)
      }));
      return jsonResponse({ ok: true, data: sales }, 200, origin);
    }

    // POST /api/sales
    if (path === '/sales' && request.method === 'POST') {
      const body = await request.json();
      const fields = {
        name: [{ type: 'text', text: body.name }],
        username: [{ type: 'text', text: body.username }],
        password: [{ type: 'text', text: body.password }],
        active: true,
        created_time: [{ type: 'text', text: new Date().toISOString() }],
        deleted: false
      };
      const data = await feishuAPI('POST', `/bitable/v1/apps/${BITABLE_APP_TOKEN}/tables/${SALES_TABLE_ID}/records`, { fields });
      return jsonResponse({ ok: true, data: { recordId: data.data?.record_id } }, 200, origin);
    }

    // PUT /api/sales/:id
    if (path.match(/^\/sales\/[^/]+$/) && request.method === 'PUT') {
      const recordId = path.split('/')[2];
      const body = await request.json();
      const fields = {};
      if (body.name !== undefined) fields.name = [{ type: 'text', text: body.name }];
      if (body.username !== undefined) fields.username = [{ type: 'text', text: body.username }];
      if (body.password !== undefined) fields.password = [{ type: 'text', text: body.password }];
      if (body.active !== undefined) fields.active = body.active;
      if (body.deleted !== undefined) fields.deleted = body.deleted;
      await feishuAPI('PUT', `/bitable/v1/apps/${BITABLE_APP_TOKEN}/tables/${SALES_TABLE_ID}/records/${recordId}`, { fields });
      return jsonResponse({ ok: true }, 200, origin);
    }

    // DELETE /api/sales/:id
    if (path.match(/^\/sales\/[^/]+$/) && request.method === 'DELETE') {
      const recordId = path.split('/')[2];
      await feishuAPI('PUT', `/bitable/v1/apps/${BITABLE_APP_TOKEN}/tables/${SALES_TABLE_ID}/records/${recordId}`, {
        fields: { deleted: true, deleted_at: [{ type: 'text', text: new Date().toISOString() }] }
      });
      return jsonResponse({ ok: true }, 200, origin);
    }

    // PUT /api/orders/:id
    if (path.match(/^\/orders\/[^/]+$/) && request.method === 'PUT') {
      const recordId = path.split('/')[2];
      const body = await request.json();
      const fields = {};
      if (body.status !== undefined) fields.status = [{ type: 'text', text: body.status }];
      if (body.remark !== undefined) fields.remark = [{ type: 'text', text: body.remark }];
      await feishuAPI('PUT', `/bitable/v1/apps/${BITABLE_APP_TOKEN}/tables/${ORDER_TABLE_ID}/records/${recordId}`, { fields });
      return jsonResponse({ ok: true }, 200, origin);
    }

    return jsonResponse({ ok: false, error: 'Not found' }, 404, origin);
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message }, 500, origin);
  }
}
