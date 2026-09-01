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
  if (!data.tenant_access_token) throw new Error('获取飞书Token失败: ' + JSON.stringify(data));
  tokenCache = { token: data.tenant_access_token, expiry: Date.now() + (data.expire - 300) * 1000 };
  return tokenCache.token;
}

async function feishuAPI(method, path, body) {
  const token = await getTenantToken();
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const resp = await fetch('https://open.feishu.cn/open-apis' + path, opts);
  const data = await resp.json();
  if (data.code && data.code !== 0) throw new Error(`飞书API错误 [${data.code}]: ${data.msg}`);
  return data;
}

function extractText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(item => {
      if (typeof item === 'string') return item;
      if (item && item.text) return item.text;
      return String(item);
    }).join(',');
  }
  if (typeof value === 'object' && value.text) return value.text;
  return String(value);
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get('Origin') || '*';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // 只处理 /api/* 路径
    if (!path.startsWith('/api/')) {
      return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
    }

    try {
      const apiPath = path.replace(/^\/api/, '') || '/';

      // GET /api/ - 健康检查
      if (apiPath === '/' && request.method === 'GET') {
        return new Response(JSON.stringify({ ok: true, message: 'API running', time: new Date().toISOString() }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
        });
      }

      // GET /api/orders - 获取订单列表
      if (apiPath === '/orders' && request.method === 'GET') {
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
        return new Response(JSON.stringify({ ok: true, data: orders }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
        });
      }

      // POST /api/orders - 创建订单
      if (apiPath === '/orders' && request.method === 'POST') {
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
        // 发送飞书通知
        try {
          await fetch(FEISHU_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ msg_type: 'interactive', card: { elements: [{ tag: 'div', text: { tag: 'lark_md', content: `**新订单通知**\n客户：${body.customerName || body.name}\n手机：${body.phone || ''}\n产品：${(body.products||[]).map(p=>p.name).join('、')}\n金额：¥${body.totalAmount || 0}` } }], header: { title: { tag: 'plain_text', content: '屿礼·新订单' } } } })
          });
        } catch(e) {}
        return new Response(JSON.stringify({ ok: true, data: { recordId: data.data?.record_id } }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
        });
      }

      // GET /api/sales - 获取销售人员列表
      if (apiPath === '/sales' && request.method === 'GET') {
        const data = await feishuAPI('GET', `/bitable/v1/apps/${BITABLE_APP_TOKEN}/tables/${SALES_TABLE_ID}/records?filter=${encodeURIComponent(JSON.stringify({conjunction:"and",conditions:[{field_name:"deleted",operator:"is",value:[false]}]}))}&page_size=100`);
        const sales = (data.data?.items || []).map(item => ({
          recordId: item.record_id,
          name: extractText(item.fields?.name),
          username: extractText(item.fields?.username),
          password: extractText(item.fields?.password),
          active: item.fields?.active !== false,
          createdAt: extractText(item.fields?.created_time),
          deleted: false
        }));
        return new Response(JSON.stringify({ ok: true, data: sales }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
        });
      }

      // POST /api/sales - 添加销售人员
      if (apiPath === '/sales' && request.method === 'POST') {
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
        return new Response(JSON.stringify({ ok: true, data: { recordId: data.data?.record_id } }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
        });
      }

      // PUT /api/sales/:id - 更新销售人员
      if (apiPath.match(/^\/sales\/[^/]+$/) && request.method === 'PUT') {
        const recordId = apiPath.split('/')[2];
        const body = await request.json();
        const fields = {};
        if (body.name !== undefined) fields.name = [{ type: 'text', text: body.name }];
        if (body.username !== undefined) fields.username = [{ type: 'text', text: body.username }];
        if (body.password !== undefined) fields.password = [{ type: 'text', text: body.password }];
        if (body.active !== undefined) fields.active = body.active;
        if (body.deleted !== undefined) fields.deleted = body.deleted;
        if (body.deletedAt !== undefined) fields.deleted_at = [{ type: 'text', text: body.deletedAt }];
        await feishuAPI('PUT', `/bitable/v1/apps/${BITABLE_APP_TOKEN}/tables/${SALES_TABLE_ID}/records/${recordId}`, { fields });
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
        });
      }

      // DELETE /api/sales/:id - 删除销售人员（软删除）
      if (apiPath.match(/^\/sales\/[^/]+$/) && request.method === 'DELETE') {
        const recordId = apiPath.split('/')[2];
        await feishuAPI('PUT', `/bitable/v1/apps/${BITABLE_APP_TOKEN}/tables/${SALES_TABLE_ID}/records/${recordId}`, {
          fields: { deleted: true, deleted_at: [{ type: 'text', text: new Date().toISOString() }] }
        });
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
        });
      }

      // PUT /api/orders/:id - 更新订单
      if (apiPath.match(/^\/orders\/[^/]+$/) && request.method === 'PUT') {
        const recordId = apiPath.split('/')[2];
        const body = await request.json();
        const fields = {};
        if (body.status !== undefined) fields.status = [{ type: 'text', text: body.status }];
        if (body.remark !== undefined) fields.remark = [{ type: 'text', text: body.remark }];
        await feishuAPI('PUT', `/bitable/v1/apps/${BITABLE_APP_TOKEN}/tables/${ORDER_TABLE_ID}/records/${recordId}`, { fields });
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
        });
      }

      return new Response(JSON.stringify({ ok: false, error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
      });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
      });
    }
  }
};
