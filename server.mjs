import http from "node:http";
import fs from "node:fs";
import pathMod from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = pathMod.dirname(fileURLToPath(import.meta.url));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "zhoushan2026";
const PORT = process.env.PORT || 8081;
const HOST = process.env.HOST || "0.0.0.0";

// PostgreSQL connection (Render injects DATABASE_URL)
let pool = null;
let dbReady = false;

function initDB() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log("No DATABASE_URL, using in-memory storage");
    return null;
  }
  const client = new pg.Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });
  return client;
}

// In-memory fallback storage
const memData = [];

async function ensureTable() {
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS survey_responses (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        company VARCHAR(200) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        email VARCHAR(200) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    dbReady = true;
    console.log("Database table ready");
  } catch (e) {
    console.error("DB init error:", e.message);
  }
}

async function saveRecord(name, company, phone, email) {
  if (pool && dbReady) {
    await pool.query(
      "INSERT INTO survey_responses (name, company, phone, email) VALUES ($1, $2, $3, $4)",
      [name, company, phone, email]
    );
  } else {
    memData.push({
      name, company, phone, email,
      created_at: new Date().toISOString().replace("T", " ").substring(0, 19)
    });
  }
}

async function listRecords() {
  if (pool && dbReady) {
    const result = await pool.query(
      "SELECT name, company, phone, email, TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at FROM survey_responses ORDER BY created_at DESC LIMIT 10000"
    );
    return result.rows;
  }
  return memData;
}

// Initialize
pool = initDB();
ensureTable();

function genToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const validTokens = new Set();

function getSurveyPageHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>千问办公 · 试用登记</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif; background: #f5f7fa; min-height: 100vh; }
  .header { background: linear-gradient(135deg, #1677ff 0%, #0052d9 100%); padding: 32px 24px 28px; text-align: center; }
  .header .logo-area { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 12px; }
  .header .brand { font-size: 18px; color: #fff; font-weight: 600; }
  .header .brand-sep { color: rgba(255,255,255,0.4); font-size: 18px; }
  .header .brand-2 { font-size: 18px; color: #fff; font-weight: 600; }
  .header h1 { font-size: 22px; color: #fff; margin-bottom: 6px; }
  .header p { font-size: 14px; color: rgba(255,255,255,0.75); }
  .form-container { max-width: 480px; margin: -16px auto 0; background: #fff; border-radius: 12px 12px 0 0; box-shadow: 0 -2px 12px rgba(0,0,0,0.04); padding: 28px 24px 40px; }
  .form-group { margin-bottom: 20px; }
  .form-group label { display: block; font-size: 14px; color: #333; font-weight: 500; margin-bottom: 8px; }
  .form-group label .required { color: #ff4d4f; margin-left: 2px; }
  .form-group input { width: 100%; height: 44px; border: 1px solid #e0e0e0; border-radius: 8px; padding: 0 12px; font-size: 16px; color: #333; outline: none; transition: border-color 0.2s; -webkit-appearance: none; }
  .form-group input:focus { border-color: #1677ff; box-shadow: 0 0 0 2px rgba(22,119,255,0.08); }
  .form-group input.err { border-color: #ff4d4f; }
  .form-group .tip { font-size: 12px; color: #999; margin-top: 4px; }
  .submit-btn { width: 100%; height: 46px; background: #1677ff; color: #fff; border: none; border-radius: 8px; font-size: 16px; font-weight: 500; cursor: pointer; transition: background 0.2s; }
  .submit-btn:active { background: #0052d9; }
  .submit-btn:disabled { background: #a0c4ff; }
  .success-screen { text-align: center; padding: 20px 0; display: none; }
  .success-screen .check-icon { width: 64px; height: 64px; background: #52c41a; border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; font-size: 32px; color: #fff; }
  .success-screen h2 { font-size: 18px; color: #333; margin-bottom: 8px; }
  .success-screen p { font-size: 14px; color: #999; }
  .error-msg { color: #ff4d4f; font-size: 13px; margin-top: 8px; display: none; }
  .footer-note { text-align: center; font-size: 12px; color: #ccc; margin-top: 24px; }
</style>
</head>
<body>
<div class="header">
  <div class="logo-area">
    <span class="brand">阿里云</span>
    <span class="brand-sep">|</span>
    <span class="brand-2">千问办公</span>
  </div>
  <h1>千问办公试用登记</h1>
  <p>阿里云 × 企业家宣讲活动</p>
</div>
<div class="form-container">
  <form id="surveyForm">
    <div class="form-group">
      <label>姓名<span class="required">*</span></label>
      <input type="text" id="name" name="name" placeholder="请输入您的姓名" maxlength="20">
    </div>
    <div class="form-group">
      <label>公司名称<span class="required">*</span></label>
      <input type="text" id="company" name="company" placeholder="请输入您所在公司名称" maxlength="100">
    </div>
    <div class="form-group">
      <label>联系电话<span class="required">*</span></label>
      <input type="tel" id="phone" name="phone" placeholder="请输入手机号码" maxlength="11">
      <div class="tip">用于开通试用账号，请确保可联系到您</div>
    </div>
    <div class="form-group">
      <label>电子邮箱<span class="required">*</span></label>
      <input type="email" id="email" name="email" placeholder="请输入您的工作邮箱" maxlength="100">
      <div class="tip">试用邀请将发送至此邮箱</div>
    </div>
    <div class="error-msg" id="errorMsg"></div>
    <button type="submit" class="submit-btn" id="submitBtn">提交登记</button>
  </form>
  <div class="success-screen" id="successScreen">
    <div class="check-icon">&#10003;</div>
    <h2>登记成功！</h2>
    <p>感谢您的关注，我们将尽快为您开通千问办公试用账号</p>
  </div>
  <div class="footer-note">阿里云 × 千问办公</div>
</div>
<script>
  var form = document.getElementById('surveyForm');
  var successScreen = document.getElementById('successScreen');
  var errorMsg = document.getElementById('errorMsg');
  var submitBtn = document.getElementById('submitBtn');

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    errorMsg.style.display = 'none';

    var name = document.getElementById('name').value.trim();
    var company = document.getElementById('company').value.trim();
    var phone = document.getElementById('phone').value.trim();
    var email = document.getElementById('email').value.trim();

    if (!name) { showErr('请输入姓名'); return; }
    if (!company) { showErr('请输入公司名称'); return; }
    if (!phone) { showErr('请输入联系电话'); return; }
    if (!/^1[3-9]\\d{9}$/.test(phone)) { showErr('请输入正确的手机号码'); return; }
    if (!email) { showErr('请输入电子邮箱'); return; }
    if (!/^[^@]+@[^@]+\\.[^@]+$/.test(email)) { showErr('请输入正确的邮箱地址'); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = '提交中...';

    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/submit', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        try {
          var data = JSON.parse(xhr.responseText);
          if (data.ok) {
            form.style.display = 'none';
            successScreen.style.display = 'block';
          } else {
            showErr(data.msg || '提交失败，请重试');
            submitBtn.disabled = false;
            submitBtn.textContent = '提交登记';
          }
        } catch(e) {
          showErr('网络异常，请稍后重试');
          submitBtn.disabled = false;
          submitBtn.textContent = '提交登记';
        }
      }
    };
    xhr.send(JSON.stringify({ name: name, company: company, phone: phone, email: email }));
  });

  function showErr(msg) {
    errorMsg.textContent = msg;
    errorMsg.style.display = 'block';
  }
</script>
</body>
</html>`;
}

function getAdminPageHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>管理后台 · 千问办公试用登记</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif; background: #f5f7fa; }
  .login-wrap { max-width: 400px; margin: 120px auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); padding: 32px 28px; }
  .login-wrap h1 { font-size: 20px; color: #1677ff; text-align: center; margin-bottom: 24px; }
  .login-wrap .field { margin-bottom: 16px; }
  .login-wrap input { width: 100%; height: 44px; border: 1px solid #e0e0e0; border-radius: 8px; padding: 0 12px; font-size: 16px; outline: none; }
  .login-wrap input:focus { border-color: #1677ff; }
  .login-wrap button { width: 100%; height: 44px; background: #1677ff; color: #fff; border: none; border-radius: 8px; font-size: 15px; cursor: pointer; }
  .login-wrap button:hover { background: #0052d9; }
  .login-err { color: #ff4d4f; font-size: 13px; text-align: center; margin-top: 8px; display: none; }
  .dashboard { display: none; }
  .dash-header { background: #fff; padding: 0 24px; height: 56px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 1px 4px rgba(0,0,0,0.04); position: sticky; top: 0; z-index: 10; }
  .dash-header .title { font-size: 16px; color: #1677ff; font-weight: 600; }
  .dash-header .actions { display: flex; gap: 12px; align-items: center; }
  .dash-header .count { font-size: 13px; color: #999; }
  .dash-header .btn { padding: 6px 16px; border-radius: 6px; font-size: 14px; cursor: pointer; border: none; }
  .dash-header .btn-export { background: #52c41a; color: #fff; }
  .dash-header .btn-export:hover { background: #389e0d; }
  .dash-header .btn-logout { background: #f0f0f0; color: #666; }
  .dash-header .btn-logout:hover { background: #e0e0e0; }
  .table-wrap { padding: 24px; max-width: 1200px; margin: 0 auto; }
  .data-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
  .data-table th { background: #fafafa; padding: 12px 16px; text-align: left; font-size: 14px; color: #666; font-weight: 600; border-bottom: 1px solid #f0f0f0; }
  .data-table td { padding: 12px 16px; font-size: 14px; color: #333; border-bottom: 1px solid #f5f5f5; }
  .data-table tr:hover { background: #f9fbff; }
  .data-table .row-num { color: #999; text-align: center; width: 50px; }
  .empty { text-align: center; padding: 48px 0; color: #ccc; font-size: 14px; }
</style>
</head>
<body>
<div class="login-wrap" id="loginWrap">
  <h1>管理后台 · 试用登记</h1>
  <div class="field">
    <input type="password" id="pwdInput" placeholder="请输入管理密码" autofocus>
  </div>
  <button id="loginBtn">登录</button>
  <div class="login-err" id="loginErr">密码错误，请重试</div>
</div>
<div class="dashboard" id="dashboard">
  <div class="dash-header">
    <span class="title">千问办公试用登记 · 管理后台</span>
    <div class="actions">
      <span class="count" id="totalCount"></span>
      <button class="btn btn-export" id="exportBtn">导出 Excel (CSV)</button>
      <button class="btn btn-logout" id="logoutBtn">退出</button>
    </div>
  </div>
  <div class="table-wrap">
    <table class="data-table">
      <thead>
        <tr>
          <th class="row-num">序号</th>
          <th>姓名</th>
          <th>公司</th>
          <th>电话</th>
          <th>邮箱</th>
          <th>提交时间</th>
        </tr>
      </thead>
      <tbody id="tableBody"></tbody>
    </table>
  </div>
</div>
<script>
  var token = '';
  try { token = sessionStorage.getItem('admin_token') || ''; } catch(e) {}
  if (token) showDashboard();

  document.getElementById('loginBtn').addEventListener('click', doLogin);
  document.getElementById('pwdInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') doLogin(); });
  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('logoutBtn').addEventListener('click', function() {
    try { sessionStorage.removeItem('admin_token'); } catch(e) {}
    token = '';
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('loginWrap').style.display = 'block';
  });

  function doLogin() {
    var pwd = document.getElementById('pwdInput').value;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/login', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        try {
          var data = JSON.parse(xhr.responseText);
          if (data.ok) {
            token = data.token;
            try { sessionStorage.setItem('admin_token', token); } catch(e) {}
            showDashboard();
          } else {
            document.getElementById('loginErr').style.display = 'block';
          }
        } catch(e) {
          document.getElementById('loginErr').style.display = 'block';
        }
      }
    };
    xhr.send(JSON.stringify({ password: pwd }));
  }

  function showDashboard() {
    document.getElementById('loginWrap').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/list', true);
    xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        if (xhr.status === 401) {
          try { sessionStorage.removeItem('admin_token'); } catch(e) {}
          token = '';
          document.getElementById('dashboard').style.display = 'none';
          document.getElementById('loginWrap').style.display = 'block';
          return;
        }
        try {
          var data = JSON.parse(xhr.responseText);
          var tbody = document.getElementById('tableBody');
          document.getElementById('totalCount').textContent = '共 ' + data.list.length + ' 条';
          if (data.list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty">暂无登记数据</td></tr>';
            return;
          }
          var html = '';
          for (var i = 0; i < data.list.length; i++) {
            var item = data.list[i];
            html += '<tr><td class="row-num">' + (i + 1) + '</td><td>' + esc(item.name) + '</td><td>' + esc(item.company) + '</td><td>' + esc(item.phone) + '</td><td>' + esc(item.email) + '</td><td>' + esc(item.created_at) + '</td></tr>';
          }
          tbody.innerHTML = html;
        } catch(e) {}
      }
    };
    xhr.send();
  }

  function esc(s) { return s ? String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''; }

  function exportData() {
    window.location.href = '/api/export?token=' + encodeURIComponent(token);
  }
</script>
</body>
</html>`;
}

const srv = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const reqPath = url.pathname;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // Survey form page
  if (reqPath === "/" || reqPath === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(getSurveyPageHtml());
    return;
  }

  // Admin page
  if (reqPath === "/admin") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(getAdminPageHtml());
    return;
  }

  // QR code page — on public deployment, use request host
  if (reqPath === "/qr.html") {
    try {
      let qrHtml = fs.readFileSync(pathMod.join(__dirname, "qr.html"), "utf-8");
      // On public deployment, the QR code should point to the public URL
      const protocol = req.headers["x-forwarded-proto"] || "http";
      const host = req.headers.host || "localhost:8081";
      const publicUrl = `${protocol}://${host}/`;
      qrHtml = qrHtml.replace(
        "//__QR_URL__",
        JSON.stringify(publicUrl).replace(/"/g, "")
      );
      // Also set via script injection
      const inject = `<script>window.__PUBLIC_URL__ = ${JSON.stringify(publicUrl)};</script>`;
      const cdnTag = '<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>';
      qrHtml = qrHtml.replace(cdnTag, inject + "\n" + cdnTag);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(qrHtml);
    } catch {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h1>qr.html not found</h1>");
    }
    return;
  }

  // API: submit form
  if (reqPath === "/api/submit" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const data = JSON.parse(body);
      const name = (data.name || "").trim().slice(0, 50);
      const company = (data.company || "").trim().slice(0, 200);
      const phone = (data.phone || "").trim().slice(0, 20);
      const email = (data.email || "").trim().slice(0, 200);

      if (!name || !company || !phone || !email) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, msg: "所有字段均为必填" }));
        return;
      }
      if (!/^1[3-9]\d{9}$/.test(phone)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, msg: "手机号格式不正确" }));
        return;
      }
      if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, msg: "邮箱格式不正确" }));
        return;
      }

      await saveRecord(name, company, phone, email);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, msg: "请求格式错误" }));
    }
    return;
  }

  // API: admin login
  if (reqPath === "/api/login" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const data = JSON.parse(body);
      if (data.password === ADMIN_PASSWORD) {
        const t = genToken();
        validTokens.add(t);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, token: t }));
      } else {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, msg: "密码错误" }));
      }
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, msg: "请求格式错误" }));
    }
    return;
  }

  // API: list responses
  if (reqPath === "/api/list" && req.method === "GET") {
    const auth = req.headers.authorization || "";
    const tk = auth.replace("Bearer ", "");
    if (!validTokens.has(tk)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, msg: "未授权" }));
      return;
    }
    const records = await listRecords();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, list: records }));
    return;
  }

  // API: export CSV
  if (reqPath === "/api/export" && req.method === "GET") {
    const tk = url.searchParams.get("token") || "";
    if (!validTokens.has(tk)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, msg: "未授权" }));
      return;
    }
    const records = await listRecords();
    const headers = ["序号", "姓名", "公司", "电话", "邮箱", "提交时间"];
    let csv = "\uFEFF" + headers.join(",") + "\n";
    records.forEach((row, i) => {
      const vals = [i + 1, row.name, row.company, row.phone, row.email, row.created_at];
      csv += vals.map(v => {
        const s = String(v || "").replace(/"/g, '""');
        return /[,"\n\r]/.test(s) ? `"${s}"` : s;
      }).join(",") + "\n";
    });
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="survey_export_${Date.now()}.csv"`
    });
    res.end(csv);
    return;
  }

  // 404
  res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
  res.end("<h1>404 - Page Not Found</h1>");
});

srv.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
