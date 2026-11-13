// 創業島「多人同島」轉播站：一個 Durable Object 房間，用 WebSocket 轉播每位訪客的
// 隨機名字、選的動物、衣服／毛色與位置，以及聊天訊息。訪客資料不寫入儲存，離線就消失（唯一例外：教室模式的老師金鑰與密碼，最後一人離開就刪除）。
// 房間：/ws?room=代碼 → 每個代碼一個獨立的 Durable Object（同班同學才看得到彼此）；沒帶代碼＝公開島 'main'。另有「教室模式」（cls=1），見 Island 類別上方說明。
import { DurableObject } from 'cloudflare:workers';
import { hasBadWord, maskBadWords } from './badwords.js';

const ALLOWED_ORIGINS = [
  /^https:\/\/m255525\.github\.io$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  /^null$/, // file:// 直接開檔
];
const MAX_SOCKETS = 200;
const MAX_MSG_PER_SEC = 15;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const ROOM = /^[A-Z0-9]{3,12}$/;
const CHAT_MAX = 60;          // 每則最多字數
const CHAT_GAP_MS = 2500;     // 同一人兩則之間至少隔多久（網頁端是 3 秒，這裡留一點網路延遲的餘裕）
const CHAT_HISTORY = 20;      // 只存在記憶體，給剛進來的人看前面的對話；房間休眠後就清空
// 網址、網域一律拿掉，避免有人貼釣魚連結
const URLISH = /(https?:\/\/|www\.)\S*|[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|tw|io|me|ly|cc|xyz|app|dev|link|top|co|gg|info|site|online|shop|vip|club)\b\S*/gi;
// 可以選的動物（跟 index.html 的 ANIMALS 同一份 id）；不在清單上的一律當成沒選，前端會依 id 自動配一隻
const ANIMALS = ['cat', 'dog', 'rabbit', 'bear', 'fox', 'panda', 'penguin', 'chick', 'frog', 'koala', 'tiger', 'pig'];

function clampNum(v, lo, hi) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null;
}
function cleanName(v) {
  const n = String(v || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) || '旅人';
  return hasBadWord(n) ? '旅人' : n; // 含禁用字詞一律改成「旅人」
}
function cleanRoom(v) {
  const r = String(v || '').toUpperCase();
  return ROOM.test(r) ? r : 'main';
}
function cleanChat(v) {
  const t = Array.from(String(v || '').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim())
    .slice(0, CHAT_MAX).join('');
  return maskBadWords(t.replace(URLISH, '〔網址〕')).trim();
}
function cleanAnimal(v, fallback) {
  return ANIMALS.includes(String(v)) ? String(v) : fallback;
}
function cleanColor(v, fallback) {
  return COLOR.test(String(v)) ? String(v) : fallback;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/lobby') {
      const origin = request.headers.get('Origin') || 'null';
      const okO = ALLOWED_ORIGINS.some((re) => re.test(origin));
      const h = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
      if (okO) { h['Access-Control-Allow-Origin'] = origin; h['Vary'] = 'Origin'; }
      if (request.method === 'OPTIONS') return new Response(null, { headers: h });
      if (!okO) return new Response('{"rooms":[]}', { status: 403, headers: h });
      const stub = env.ISLAND.get(env.ISLAND.idFromName(LOBBY));
      const res = await stub.fetch('https://lobby/lobby/list');
      return new Response(await res.text(), { headers: h });
    }
    if (url.pathname !== '/ws') {
      return new Response('startup-island presence: ok', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }
    const origin = request.headers.get('Origin') || 'null';
    if (!ALLOWED_ORIGINS.some((re) => re.test(origin))) {
      return new Response('Forbidden origin', { status: 403 });
    }
    const code = cleanRoom(url.searchParams.get('room'));
    const room = env.ISLAND.get(env.ISLAND.idFromName(code === 'main' ? 'main' : 'room:' + code));
    return room.fetch(request);
  },
};

// 教室模式（講師課堂小幫手用，網址帶 cls=1）：
// - 帶 tkey 的是老師：房間第一個老師金鑰會記在這個房間的 storage，之後金鑰不同就不能當老師（關閉碼 4001）。
// - 其他人是學生：學生只看得到老師（snapshot、join、look、move、leave、聊天都不轉給其他學生），老師看得到所有人。
// - 老師可以設教室密碼 pw；學生密碼不對就關閉連線（關閉碼 4003）。房間最後一個人離開就把金鑰與密碼刪掉。
// - 教室大廳（/lobby）：老師幫教室命名並公開，就會列在大廳（見下方 LOBBY）。
// - 學生只能進「老師正開著」的教室，否則 4004；老師送 {t:'close'}（關閉教室）會把全部人 4004 並刪掉金鑰，舊連結從此失效。
// 沒帶 cls=1 的連線（創業島、創作者小鎮）行為完全不變。
const KEY_RE = /^[A-Za-z0-9]{12,32}$/;
// 教室大廳：一個獨立的 DO（idFromName(LOBBY)）存「公開」的教室 r:<房間> → {code, name, pw, n, since, t}
// 教室有變動就回報；老師每 5 分鐘（ping）再回報一次，超過 15 分鐘沒回報就從清單拿掉（老師直接關網頁也會消失）
const LOBBY = '__lobby__';
const LOBBY_TTL = 15 * 60 * 1000;
const LOBBY_MAX = 100;
const VOTE_ROOM = /^VOTE[A-Z0-9]{6}$/;
const cleanRoomName = (v) => { const n = Array.from(String(v || '').replace(/[\u0000-\u001f<>|]/g, '').replace(/\s+/g, ' ').trim()).slice(0, 20).join(''); return n && !hasBadWord(n) ? n : ''; };
const PW_RE = /^[A-Za-z0-9]{1,12}$/;
const pub = (a) => ({ id: a.id, name: a.name, shirt: a.shirt, hair: a.hair, animal: a.animal, gx: a.gx, gy: a.gy });
// viewer 看不看得到 subject：學生只讓老師看到
const canSee = (viewer, subject) => !subject || subject.role !== 's' || (viewer && viewer.role === 't');

export class Island extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.rate = new Map(); // ws -> {sec, n, chatAt}；休眠後重建無妨
    this.history = [];     // 最近的聊天訊息（只在記憶體）：{msg, role}
  }

  async fetch(request) {
    const u0 = new URL(request.url);
    if (u0.pathname.startsWith('/lobby/')) return this.lobby(request, u0); // 只有本 Worker 內部會打到這裡
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) {
      return new Response('Island is full', { status: 503 });
    }
    const url = new URL(request.url);
    let role = '', closeCode = 0, pw = '';
    if (url.searchParams.get('cls') === '1') {
      const tkey = String(url.searchParams.get('tkey') || '');
      pw = String(url.searchParams.get('pw') || '').toUpperCase();
      if (!PW_RE.test(pw)) pw = '';
      const room = (await this.ctx.storage.get('cls')) || null;
      if (KEY_RE.test(tkey)) {
        if (!room || room.tkey === tkey) {
          role = 't';
          const code = String(url.searchParams.get('room') || '').toUpperCase();
          if (!room || room.pw !== pw || (VOTE_ROOM.test(code) && room.code !== code)) {
            await this.ctx.storage.put('cls', Object.assign({}, room || {}, { tkey, pw, code: VOTE_ROOM.test(code) ? code : (room && room.code) || '' }));
            this.regSoon = true;
            // 密碼改了：已在房間但密碼不符的學生請他重新輸入
            if (pw) for (const o of this.ctx.getWebSockets()) { const oa = o.deserializeAttachment(); if (oa && oa.role === 's' && oa.pw !== pw) { this.leave(o); try { o.close(4003, 'password'); } catch (e) {} } }
          }
        } else closeCode = 4001;
      } else {
        role = 's';
        if (!room) closeCode = 4004;                          // 老師沒開（或已關閉）的教室不能進
        else if (room.pw && room.pw !== pw) closeCode = 4003;
      }
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    // 拒絕的連線先接受、等第一則訊息再用關閉碼關掉（在回應 101 之前就 close，關閉碼送不到瀏覽器，踩過）
    server.serializeAttachment({ id: null, role, pw, deny: closeCode });
    return new Response(null, { status: 101, webSocket: client });
  }

  peers(except) {
    const me = except ? except.deserializeAttachment() : null;
    const out = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const a = ws.deserializeAttachment();
      if (a && a.id && canSee(me, a)) out.push(pub(a));
    }
    return out;
  }

  // from：發送者的 attachment（決定誰看得到）
  broadcast(msg, except, from) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const a = ws.deserializeAttachment();
      if (!a || !a.id) continue;
      if (from && !canSee(a, from)) continue;
      try { ws.send(data); } catch (e) { /* 對方已斷線 */ }
    }
  }

  async webSocketMessage(ws, raw) {
    const sec = Math.floor(Date.now() / 1000);
    const r = this.rate.get(ws) || { sec, n: 0 };
    if (r.sec !== sec) { r.sec = sec; r.n = 0; }
    r.n += 1;
    this.rate.set(ws, r);
    if (r.n > MAX_MSG_PER_SEC || typeof raw !== 'string' || raw.length > 500) return;

    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    const a = ws.deserializeAttachment() || { id: null };
    if (a.deny) { try { ws.close(a.deny, a.deny === 4001 ? 'teacher key' : a.deny === 4004 ? 'closed' : 'password'); } catch (e) {} return; }
    // 老師「關閉教室」：所有人關閉碼 4004、刪掉金鑰與密碼，之後舊連結都進不來
    if (m.t === 'room' && a.role === 't') {
      const room = await this.ctx.storage.get('cls');
      if (room) { room.name = cleanRoomName(m.name); room.pub = !!m.pub && !!room.name; await this.ctx.storage.put('cls', room); await this.regRoom(); }
      ws.send(JSON.stringify({ t: 'room', name: room ? room.name : '', pub: room ? room.pub : false }));
      return;
    }
    if (m.t === 'close' && a.role === 't') {
      await this.regRoom(true);
      try { await this.ctx.storage.delete('cls'); } catch (e) {}
      for (const o of this.ctx.getWebSockets()) { if (o === ws) continue; const oa = o.deserializeAttachment(); if (oa && (oa.role === 's' || oa.role === 't')) { o.serializeAttachment({ id: null }); try { o.close(4004, 'closed'); } catch (e) {} } }
      ws.serializeAttachment({ id: null }); try { ws.close(4004, 'closed'); } catch (e) {}
      return;
    }

    if (m.t === 'hello' && !a.id) {
      const id = String(m.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 16);
      if (!id) return;
      const peer = {
        id,
        name: cleanName(m.name),
        shirt: cleanColor(m.shirt, '#ff6f59'),
        hair: cleanColor(m.hair, '#3b2a20'),
        animal: cleanAnimal(m.animal, ''),
        gx: clampNum(m.gx, -15, 45) ?? 11,
        gy: clampNum(m.gy, -15, 45) ?? 9,
        role: a.role || '',
        pw: a.pw || '',
      };
      // 同一個分頁重新連線：把舊連線踢掉，避免出現兩個自己（教室模式只踢同身分的，學生拿老師的 id 也踢不掉老師）
      for (const other of this.ctx.getWebSockets()) {
        if (other === ws) continue;
        const oa = other.deserializeAttachment();
        if (oa && oa.id === id) {
          if ((oa.role || '') !== peer.role) { try { ws.close(4002, 'id in use'); } catch (e) {} return; }
          other.serializeAttachment({ id: null }); try { other.close(4000, 'replaced'); } catch (e) {}
        }
      }
      ws.serializeAttachment(peer);
      ws.send(JSON.stringify({ t: 'snapshot', peers: this.peers(ws), chat: this.history.filter((h) => canSee(peer, { role: h.role })).map((h) => h.msg) }));
      this.broadcast({ t: 'join', peer: pub(peer) }, ws, peer);
      if (peer.role === 's' || this.regSoon) { this.regSoon = false; await this.regRoom(); }
      return;
    }
    if (!a.id) return;

    if (m.t === 'move') {
      const gx = clampNum(m.gx, -15, 45), gy = clampNum(m.gy, -15, 45);
      if (gx === null || gy === null) return;
      a.gx = gx; a.gy = gy;
      ws.serializeAttachment(a);
      this.broadcast({ t: 'move', id: a.id, gx, gy }, ws, a);
    } else if (m.t === 'look') {
      a.name = cleanName(m.name);
      a.shirt = cleanColor(m.shirt, a.shirt);
      a.hair = cleanColor(m.hair, a.hair);
      a.animal = cleanAnimal(m.animal, a.animal || '');
      ws.serializeAttachment(a);
      this.broadcast({ t: 'look', id: a.id, name: a.name, shirt: a.shirt, hair: a.hair, animal: a.animal }, ws, a);
    } else if (m.t === 'chat') {
      const now = Date.now();
      if (r.chatAt && now - r.chatAt < CHAT_GAP_MS) {
        ws.send(JSON.stringify({ t: 'chatSlow', wait: CHAT_GAP_MS - (now - r.chatAt) }));
        return;
      }
      const text = cleanChat(m.text);
      if (!text) return;
      r.chatAt = now;
      const msg = { t: 'chat', id: a.id, name: a.name, shirt: a.shirt, animal: a.animal, text, at: now };
      // 「對某人說」：仍然轉給同房間所有人（刻意不做私訊，大家看得到才好管理），只標出對象
      const to = String(m.to || '').replace(/[^a-z0-9]/gi, '').slice(0, 16);
      const target = to && to !== a.id ? this.peers(ws).find((p) => p.id === to) : null;
      if (target) { msg.to = target.id; msg.toName = target.name; }
      this.history.push({ msg, role: a.role || '' });
      if (this.history.length > CHAT_HISTORY) this.history.shift();
      // 連自己也送：發話的人看到的就是過濾後的版本
      if (a.role === 's') try { ws.send(JSON.stringify(msg)); } catch (e) {}
      this.broadcast(msg, a.role === 's' ? ws : null, a);
    }
    if (m.t === 'ping' && a.role === 't' && Date.now() - (this.lastReg || 0) > 5 * 60 * 1000) await this.regRoom();
    // 'ping' 只為了保持連線，不需回應
  }

  async webSocketClose(ws) { await this.closeRoom(ws); }
  async webSocketError(ws) { await this.closeRoom(ws); }

  async closeRoom(ws) {
    const a = ws.deserializeAttachment();
    const cls = a && (a.role === 't' || a.role === 's');
    const wasId = a && a.id;
    this.leave(ws);
    // 教室裡最後一個人離開：刪掉老師金鑰與密碼，下次同一個代碼重新開始
    if (cls && !this.ctx.getWebSockets().some((o) => o !== ws && o.readyState === 1)) {
      await this.regRoom(true);
      try { await this.ctx.storage.delete('cls'); } catch (e) {}
    } else if (cls && wasId && a.role === 's') await this.regRoom();
  }

  // 把這間教室的狀態回報給大廳（沒命名或沒公開＝從大廳移除）
  async regRoom(remove) {
    let room = null;
    try { room = await this.ctx.storage.get('cls'); } catch (e) {}
    if (!room || !VOTE_ROOM.test(room.code || '')) return;
    this.lastReg = Date.now();
    let n = 0;
    for (const o of this.ctx.getWebSockets()) { if (o.readyState !== 1) continue; const oa = o.deserializeAttachment(); if (oa && oa.id && oa.role === 's') n++; }
    const body = remove || !room.pub || !room.name ? { code: room.code, remove: true } : { code: room.code, name: room.name, pw: !!room.pw, n };
    try { await this.env.ISLAND.get(this.env.ISLAND.idFromName(LOBBY)).fetch('https://lobby/lobby/set', { method: 'POST', body: JSON.stringify(body) }); } catch (e) {}
  }

  // 大廳 DO 自己的處理
  async lobby(request, url) {
    const now = Date.now(), json = (o) => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json; charset=utf-8' } });
    if (url.pathname === '/lobby/list') {
      const all = await this.ctx.storage.list({ prefix: 'r:' }), rooms = [];
      for (const [k, v] of all) { if (now - v.t > LOBBY_TTL) { await this.ctx.storage.delete(k); continue; } rooms.push({ code: v.code.slice(4), name: v.name, pw: v.pw, n: v.n, since: v.since }); }
      rooms.sort((x, y) => x.since - y.since);
      return json({ rooms, count: rooms.length, at: now });
    }
    if (url.pathname === '/lobby/set' && request.method === 'POST') {
      let b; try { b = await request.json(); } catch (e) { return json({ ok: false }); }
      const code = String(b.code || '');
      if (!VOTE_ROOM.test(code)) return json({ ok: false });
      if (b.remove) { await this.ctx.storage.delete('r:' + code); return json({ ok: true }); }
      const old = await this.ctx.storage.get('r:' + code);
      if (!old && (await this.ctx.storage.list({ prefix: 'r:' })).size >= LOBBY_MAX) return json({ ok: false, full: true });
      const name = cleanRoomName(b.name); if (!name) { await this.ctx.storage.delete('r:' + code); return json({ ok: true }); }
      await this.ctx.storage.put('r:' + code, { code, name, pw: !!b.pw, n: Math.max(0, Math.min(999, +b.n || 0)), since: old ? old.since : now, t: now });
      return json({ ok: true });
    }
    return json({ ok: false });
  }

  leave(ws) {
    this.rate.delete(ws);
    const a = ws.deserializeAttachment();
    if (a && a.id) {
      ws.serializeAttachment({ id: null });
      this.broadcast({ t: 'leave', id: a.id }, ws, a);
    }
  }
}
