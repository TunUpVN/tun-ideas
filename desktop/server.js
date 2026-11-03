// Tun Ideas — máy chủ nội bộ cho bản Windows
// Gọi các AI (kể cả Claude qua Claude Code bằng gói Claude của người dùng) và phục vụ giao diện web.
// Không cần thư viện ngoài. Có thể chạy riêng: node desktop/server.js

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, exec } = require('child_process');

const IS_WIN = process.platform === 'win32';
const MOCK = process.env.MOCK === '1'; // chỉ để chạy thử, không gọi AI thật

// ---------------- Cấu hình mặc định ----------------
const DEFAULT_CONFIG = {
  onboarded: false,
  keys: { gemini: '', openrouter: '', anthropic: '', openai: '' },
  settings: {
    roundsPerTurn: 2,
    mode: 'fixed',          // 'fixed' = số vòng cố định, 'consensus' = đến khi đồng thuận
    consensusCap: 12,
    maxWords: 150,
    language: 'tiếng Việt',
    shuffle: false,
    contextLimit: 30,
    summarizerId: 'claude',
  },
  members: [
    { id: 'claude', avatar: 'cao', name: 'Claude', provider: 'claude-code', model: 'sonnet', color: '#D97757', enabled: true,
      persona: 'Người phân tích cẩn trọng: cân nhắc nhiều mặt, chỉ ra rủi ro và giả định ngầm.' },
    { id: 'gemini', avatar: 'sao', name: 'Gemini', provider: 'gemini', model: 'gemini-flash-latest', color: '#4285F4', enabled: true,
      persona: 'Người thực tế, thích dữ liệu và ví dụ cụ thể; hay hỏi "làm thế nào để triển khai?".' },
    { id: 'gpt', avatar: 'robot', name: 'GPT', provider: 'openrouter', model: 'openai/gpt-oss-120b:free', color: '#10A37F', enabled: true,
      persona: 'Người phản biện: chủ động tìm điểm yếu trong lập luận của người khác và đưa phương án thay thế.' },
    { id: 'guest', avatar: 'ma', name: 'Khách mời', provider: 'openrouter', model: 'openrouter/free', color: '#8B5CF6', enabled: false,
      persona: 'Người ngoài ngành, nhìn vấn đề bằng góc nhìn mới mẻ, đặt câu hỏi ngây thơ nhưng sắc.' },
  ],
};

function createStore(configFile) {
  return {
    load() {
      try {
        const saved = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        return {
          onboarded: !!saved.onboarded,
          keys: { ...DEFAULT_CONFIG.keys, ...(saved.keys || {}) },
          settings: { ...DEFAULT_CONFIG.settings, ...(saved.settings || {}) },
          members: Array.isArray(saved.members) && saved.members.length ? saved.members : DEFAULT_CONFIG.members,
        };
      } catch {
        return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      }
    },
    save(cfg) {
      fs.mkdirSync(path.dirname(configFile), { recursive: true });
      fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2), 'utf8');
    },
  };
}

// ---------------- Claude qua Claude Code ----------------
const CLAUDE_WORKDIR = path.join(os.tmpdir(), 'tun-ideas-claude');

function findClaude() {
  if (IS_WIN) {
    const exe = path.join(os.homedir(), '.local', 'bin', 'claude.exe');
    if (fs.existsSync(exe)) return { cmd: exe, shell: false };
    return { cmd: 'claude', shell: true }; // cài bằng npm → claude.cmd
  }
  const local = path.join(os.homedir(), '.local', 'bin', 'claude');
  if (fs.existsSync(local)) return { cmd: local, shell: false };
  return { cmd: 'claude', shell: false };
}
function q(arg, shell) {
  if (!shell) return arg;
  if (arg === '') return '""';
  return /[\s"]/.test(arg) ? '"' + arg.replace(/"/g, '\\"') + '"' : arg;
}
function cleanEnv() {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

function claudeStatus() {
  return new Promise(resolve => {
    if (MOCK) return resolve({ installed: true, version: 'mock' });
    const { cmd, shell } = findClaude();
    let out = '';
    let child;
    try { child = spawn(cmd, ['--version'], { shell, env: cleanEnv(), windowsHide: true }); }
    catch { return resolve({ installed: false }); }
    const t = setTimeout(() => { child.kill(); resolve({ installed: false }); }, 15000);
    child.stdout.on('data', d => (out += d));
    child.on('error', () => { clearTimeout(t); resolve({ installed: false }); });
    child.on('close', code => {
      clearTimeout(t);
      const m = out.match(/\d+\.\d+\.\d+/);
      resolve(code === 0 && m ? { installed: true, version: m[0] } : { installed: false });
    });
  });
}

function callClaudeCode({ model, system, prompt }, signal) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(CLAUDE_WORKDIR, { recursive: true });
    const { cmd, shell } = findClaude();
    const sysFile = path.join(CLAUDE_WORKDIR, `system-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
    fs.writeFileSync(sysFile, system, 'utf8');
    const args = [
      '-p',
      '--model', model || 'sonnet',
      '--system-prompt-file', sysFile,
      '--tools', '',               // không dùng công cụ nào: chỉ hỏi–đáp, tiết kiệm quota
      '--setting-sources', '',     // không nạp cài đặt/hook riêng
      '--output-format', 'json',
      '--no-session-persistence',
    ].map(a => q(a, shell));

    const child = spawn(cmd, args, { cwd: CLAUDE_WORKDIR, shell, env: cleanEnv(), windowsHide: true });
    let out = '', err = '';
    const cleanup = () => { try { fs.unlinkSync(sysFile); } catch {} };
    const timer = setTimeout(() => child.kill(), 180000);
    if (signal) signal.addEventListener('abort', () => child.kill());

    child.stdout.on('data', d => (out += d));
    child.stderr.on('data', d => (err += d));
    child.on('error', e => {
      clearTimeout(timer); cleanup();
      reject(new Error(e.code === 'ENOENT'
        ? 'Chưa cài Claude Code trên máy này. Xem hướng dẫn trong màn hình Kết nối AI.'
        : e.message));
    });
    child.on('close', code => {
      clearTimeout(timer); cleanup();
      if (signal && signal.aborted) return reject(new Error('Đã dừng.'));
      let data;
      try { data = JSON.parse(out.trim().split('\n').filter(Boolean).pop()); } catch {}
      if (data && typeof data.result === 'string') {
        if (data.is_error) {
          let msg = data.result;
          if (/auth|log ?in|credential/i.test(msg)) msg += ' → Mở PowerShell, gõ "claude" và đăng nhập bằng tài khoản Claude của bạn.';
          if (/limit/i.test(msg)) msg += ' → Đã chạm hạn mức gói Claude, chờ reset rồi thử lại.';
          return reject(new Error(msg));
        }
        return resolve(data.result);
      }
      const detail = (err || out).trim().slice(0, 400);
      if (/not recognized|không được nhận dạng|command not found/i.test(detail)) {
        return reject(new Error('Không tìm thấy lệnh "claude". Hãy cài Claude Code rồi mở lại Tun Ideas.'));
      }
      reject(new Error(`Claude Code lỗi (mã ${code}): ${detail || 'không có thông báo'}`));
    });
    child.stdin.end(prompt, 'utf8');
  });
}

// ---------------- Các API qua mạng ----------------
async function postJSON(url, headers, body, signal) {
  const res = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = null; }
  if (!res.ok) {
    const raw = (data && (data.error?.message || data.error?.metadata?.raw || data.message)) || text.slice(0, 300);
    let hint = '';
    if (res.status === 401 || res.status === 403) hint = ' → Kiểm tra lại API key.';
    else if (res.status === 429) hint = ' → Hết lượt miễn phí hoặc gọi quá nhanh. Chờ một lúc, giảm số vòng, hoặc đổi model.';
    else if (res.status === 404) hint = ' → Tên model không đúng hoặc model đã ngừng. Chọn model khác trong Cài đặt.';
    if (/data policy/i.test(raw)) hint = ' → Vào openrouter.ai/settings/privacy, bật "Allow free endpoints that train on request data".';
    throw new Error(`Lỗi ${res.status}: ${raw}${hint}`);
  }
  return data;
}
async function callGemini({ model, system, prompt, key }, signal) {
  if (!key) throw new Error('Chưa có Gemini API key.');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const data = await postJSON(url, { 'x-goog-api-key': key }, {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  }, signal);
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('').trim();
  if (!text) throw new Error('Gemini không trả lời (' + (cand?.finishReason || data.promptFeedback?.blockReason || 'trống') + ').');
  return text;
}
async function callOpenAICompatible({ baseUrl, model, system, prompt, key, extraHeaders, keyName }, signal) {
  if (!key) throw new Error(`Chưa có ${keyName || 'API key'}.`);
  const data = await postJSON(baseUrl.replace(/\/$/, '') + '/chat/completions', {
    authorization: 'Bearer ' + key, ...(extraHeaders || {}),
  }, { model, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }, signal);
  const text = (data.choices?.[0]?.message?.content || '').trim();
  if (!text) throw new Error('Model trả về câu trả lời trống. Thử lại hoặc đổi model.');
  return text;
}
async function callAnthropicAPI({ model, system, prompt, key }, signal) {
  if (!key) throw new Error('Chưa có Anthropic API key.');
  const data = await postJSON('https://api.anthropic.com/v1/messages', {
    'x-api-key': key, 'anthropic-version': '2023-06-01',
  }, { model, max_tokens: 2048, system, messages: [{ role: 'user', content: prompt }] }, signal);
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
}

async function speak(store, member, system, prompt, signal, port) {
  const k = store.load().keys;
  if (MOCK) return mockReply(member, prompt, system);
  switch (member.provider) {
    case 'claude-code': return callClaudeCode({ model: member.model, system, prompt }, signal);
    case 'gemini': return callGemini({ model: member.model, system, prompt, key: k.gemini }, signal);
    case 'openrouter': return callOpenAICompatible({
      baseUrl: 'https://openrouter.ai/api/v1', model: member.model, system, prompt, key: k.openrouter, keyName: 'OpenRouter API key',
      extraHeaders: { 'HTTP-Referer': 'https://tun-ideas.app', 'X-Title': 'Tun Ideas' },
    }, signal);
    case 'anthropic': return callAnthropicAPI({ model: member.model, system, prompt, key: k.anthropic }, signal);
    case 'openai': return callOpenAICompatible({ baseUrl: 'https://api.openai.com/v1', model: member.model, system, prompt, key: k.openai, keyName: 'OpenAI API key' }, signal);
    case 'custom':
      if (!member.baseUrl) throw new Error('Thành viên kiểu "Tuỳ chỉnh" cần điền Base URL.');
      return callOpenAICompatible({ baseUrl: member.baseUrl, model: member.model, system, prompt, key: member.apiKey }, signal);
    default: throw new Error('Không rõ nhà cung cấp: ' + member.provider);
  }
}

async function mockReply(member, prompt, system = '') {
  await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
  if (/CHẾ ĐỘ BỎ PHIẾU/.test(system)) {
    const round = Number((prompt.match(/vòng (\d+)/) || [])[1] || 1);
    const forGemini = member.name === 'Gemini' || round >= 3;
    return `Theo mình phương án tốt nhất là ${forGemini ? 'của Gemini: thử nghiệm quán take-away nhỏ trước' : 'của mình: nghiên cứu thị trường kỹ thêm 3 tháng'}.\n\nPHIẾU: ${forGemini ? 'Gemini' : member.name}\nLÝ DO: ${forGemini && member.name !== 'Gemini' ? 'Lập luận về vốn thấp và rủi ro nhỏ của Gemini đã thuyết phục mình.' : 'Mình vẫn tin phương án của mình an toàn hơn.'}`;
  }
  const others = (prompt.match(/^\[([^\]]+)\]:/gm) || []).map(s => s.slice(1, -2)).filter(n => n !== 'Chủ phòng' && n !== member.name);
  const target = others[others.length - 1];
  if (/TỔNG KẾT/.test(prompt)) return `**Tổng kết:**\n- Các thành viên đã nêu nhiều góc nhìn.\n\nĐề xuất: thử nghiệm nhỏ trong 2 tuần rồi đánh giá.`;
  if (/nghe rõ không/.test(prompt)) return `Mình nghe rõ, ${member.name} sẵn sàng!`;
  return target
    ? `Mình đồng ý một phần với **${target}**, nhưng chỗ chưa ổn là thiếu số liệu. Theo mình nên bắt đầu từ:\n- một thử nghiệm nhỏ\n- đo kết quả sau 2 tuần`
    : `Mình mở đầu nhé: theo mình vấn đề cốt lõi là *xác định đúng mục tiêu* trước khi bàn giải pháp.`;
}

// ---------------- Danh sách model ----------------
let orCache = null, orCacheAt = 0;
async function openrouterFreeModels() {
  if (orCache && Date.now() - orCacheAt < 3600e3) return orCache;
  const data = await (await fetch('https://openrouter.ai/api/v1/models')).json();
  orCache = (data.data || []).filter(m => m.id.endsWith(':free') || m.id === 'openrouter/free')
    .map(m => ({ id: m.id, name: m.name })).sort((a, b) => a.id.localeCompare(b.id));
  orCacheAt = Date.now();
  return orCache;
}
async function geminiModels(key) {
  if (!key) return [];
  const data = await (await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } })).json();
  return (data.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => ({ id: m.name.replace(/^models\//, ''), name: m.displayName }));
}

// ---------------- Máy chủ web ----------------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.css': 'text/css' };

function sendJSON(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', d => { s += d; if (s.length > 5e6) req.destroy(); });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function createServer({ store, publicDir, desktop }) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) {
        if (url.pathname === '/api/config' && req.method === 'GET') {
          return sendJSON(res, 200, { ...store.load(), capabilities: { claudeCode: true, desktop: !!desktop } });
        }
        if (url.pathname === '/api/config' && req.method === 'POST') {
          const body = await readBody(req);
          const cfg = store.load();
          if (body.keys) cfg.keys = { ...cfg.keys, ...body.keys };
          if (body.settings) cfg.settings = { ...cfg.settings, ...body.settings };
          if (Array.isArray(body.members)) cfg.members = body.members;
          if (typeof body.onboarded === 'boolean') cfg.onboarded = body.onboarded;
          store.save(cfg);
          return sendJSON(res, 200, { ok: true });
        }
        if (url.pathname === '/api/speak' && req.method === 'POST') {
          const { member, system, prompt } = await readBody(req);
          const ctrl = new AbortController();
          res.on('close', () => { if (!res.writableEnded) ctrl.abort(); });
          try { return sendJSON(res, 200, { text: await speak(store, member, system, prompt, ctrl.signal) }); }
          catch (e) { if (!res.writableEnded && !res.destroyed) return sendJSON(res, 200, { error: e.message || String(e) }); return; }
        }
        if (url.pathname === '/api/models') {
          const out = { openrouter: [], gemini: [] };
          await Promise.all([
            openrouterFreeModels().then(v => (out.openrouter = v)).catch(() => {}),
            geminiModels(store.load().keys.gemini).then(v => (out.gemini = v)).catch(() => {}),
          ]);
          return sendJSON(res, 200, out);
        }
        if (url.pathname === '/api/claude-status') return sendJSON(res, 200, await claudeStatus());
        return sendJSON(res, 404, { error: 'not found' });
      }
      // Tệp tĩnh của giao diện
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/' || rel === '') rel = '/index.html';
      const file = path.normalize(path.join(publicDir, rel));
      if (!file.startsWith(path.normalize(publicDir)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); return res.end('Not found');
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      sendJSON(res, 500, { error: e.message });
    }
  });
}

// Khởi động; thử lần lượt các cổng để địa chỉ (và dữ liệu lưu trong trình duyệt) ổn định giữa các lần mở
function startServer({ ports = [47821, 47822, 47823, 47824, 47825], configDir, publicDir, desktop = false }) {
  const store = createStore(path.join(configDir, 'config.json'));
  const server = createServer({ store, publicDir, desktop });
  return new Promise((resolve, reject) => {
    const tryPort = i => {
      if (i >= ports.length) return reject(new Error('Không tìm được cổng trống để chạy Tun Ideas.'));
      server.once('error', e => (e.code === 'EADDRINUSE' ? tryPort(i + 1) : reject(e)));
      server.listen(ports[i], '127.0.0.1', () => resolve({ port: ports[i], server }));
    };
    tryPort(0);
  });
}

module.exports = { startServer };

// Chạy riêng bằng: node desktop/server.js
if (require.main === module) {
  const root = path.join(__dirname, '..');
  const ports = process.env.PORT ? [Number(process.env.PORT)] : undefined;
  startServer({ ports, configDir: process.env.CONFIG_DIR || root, publicDir: path.join(root, 'web'), desktop: false })
    .then(({ port }) => {
      const u = `http://localhost:${port}`;
      console.log('Tun Ideas đang chạy tại ' + u + (MOCK ? '  (MOCK: không gọi AI thật)' : ''));
      if (!process.env.NO_BROWSER) {
        if (IS_WIN) exec(`start "" "${u}"`); else if (process.platform === 'darwin') exec(`open "${u}"`);
      }
    })
    .catch(e => { console.error(e.message); process.exit(1); });
}
