// 創業島「多人同島」轉播站：一個 Durable Object 房間，用 WebSocket 轉播每位訪客的
// 隨機名字、選的動物、衣服／毛色與位置，以及聊天訊息。不寫入任何儲存，訪客離線就消失。
// 房間：/ws?room=代碼 → 每個代碼一個獨立的 Durable Object（同班同學才看得到彼此）；沒帶代碼＝公開島 'main'。
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

export class Island extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.rate = new Map(); // ws -> {sec, n, chatAt}；休眠後重建無妨
    this.history = [];     // 最近的聊天訊息（只在記憶體）
  }

  async fetch() {
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) {
      return new Response('Island is full', { status: 503 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: null });
    return new Response(null, { status: 101, webSocket: client });
  }

  peers(except) {
    const out = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const a = ws.deserializeAttachment();
      if (a && a.id) out.push(a);
    }
    return out;
  }

  broadcast(msg, except) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const a = ws.deserializeAttachment();
      if (!a || !a.id) continue;
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

    if (m.t === 'hello' && !a.id) {
      const id = String(m.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 16);
      if (!id) return;
      const peer = {
        id,
        name: cleanName(m.name),
        shirt: cleanColor(m.shirt, '#ff6f59'),
        hair: cleanColor(m.hair, '#3b2a20'),
        animal: cleanAnimal(m.animal, ''),
        gx: clampNum(m.gx, -5, 25) ?? 11,
        gy: clampNum(m.gy, -5, 25) ?? 9,
      };
      // 同一個分頁重新連線：把舊連線踢掉，避免出現兩個自己
      for (const other of this.ctx.getWebSockets()) {
        if (other === ws) continue;
        const oa = other.deserializeAttachment();
        if (oa && oa.id === id) { other.serializeAttachment({ id: null }); try { other.close(4000, 'replaced'); } catch (e) {} }
      }
      ws.serializeAttachment(peer);
      ws.send(JSON.stringify({ t: 'snapshot', peers: this.peers(ws), chat: this.history }));
      this.broadcast({ t: 'join', peer }, ws);
      return;
    }
    if (!a.id) return;

    if (m.t === 'move') {
      const gx = clampNum(m.gx, -5, 25), gy = clampNum(m.gy, -5, 25);
      if (gx === null || gy === null) return;
      a.gx = gx; a.gy = gy;
      ws.serializeAttachment(a);
      this.broadcast({ t: 'move', id: a.id, gx, gy }, ws);
    } else if (m.t === 'look') {
      a.name = cleanName(m.name);
      a.shirt = cleanColor(m.shirt, a.shirt);
      a.hair = cleanColor(m.hair, a.hair);
      a.animal = cleanAnimal(m.animal, a.animal || '');
      ws.serializeAttachment(a);
      this.broadcast({ t: 'look', id: a.id, name: a.name, shirt: a.shirt, hair: a.hair, animal: a.animal }, ws);
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
      this.history.push(msg);
      if (this.history.length > CHAT_HISTORY) this.history.shift();
      this.broadcast(msg); // 連自己也送：發話的人看到的就是過濾後的版本
    }
    // 'ping' 只為了保持連線，不需回應
  }

  async webSocketClose(ws) { this.leave(ws); }
  async webSocketError(ws) { this.leave(ws); }

  leave(ws) {
    this.rate.delete(ws);
    const a = ws.deserializeAttachment();
    if (a && a.id) {
      ws.serializeAttachment({ id: null });
      this.broadcast({ t: 'leave', id: a.id }, ws);
    }
  }
}
