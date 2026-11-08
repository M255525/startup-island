/* ================= 創業島：立體漫遊 =================
 * 切到「立體」檢視時才載入 Three.js。地形、建築、河流、道路、樹、人物全部沿用 index.html 的資料
 * （TOOLS／ZONES／RIVER_S／ROAD_S／HILLS／WATERS／L.trees／walker／PEERS），不另外維護一份島。
 * 座標：x = gx、z = gy、y = 高度；SVG 像素高度 × HK = 立體單位。
 */
(function(){
'use strict';
var THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
var KEY_3D = 'startupIsland3d';
var HK = 1 / 30, SEA = .2, LAND = .5, DECK = .58;
var T3 = null, loading = null, built = false, active = false, failed = false;
var renderer, scene, camera, hemi, sun, raycaster, ndc;
var world = $('world3d'), canvas = $('c3d'), labRoot = $('lab3d');
var prefs = lsGet(KEY_3D, {sky:'now', sound:false, hint:true});
var cam = {yaw:Math.PI / 4, pitch:.55, dist:8.5, tx:0, ty:0, tz:0, overview:false, ovYaw:0};
var O = {blds:{}, pick:[], tags:[], zoneTags:[], avs:{}, lamps:[], anim:[]};
var keys = {}, lastT = 0, rafId = 0, sky = {dk:-1}, lastZone = null, bannerT = 0;

var PAL = {grass:'#9edb6f', grass2:'#8ad062', sand:'#fdf1cf', wet:'#d9c08a', deep:'#2a86a8', shallow:'#6fd0d8',
  park:'#7fd35e', lawn:'#b8e58f', yard:'#f0dca8', paving:'#e4ded0', wood:'#e0bd8c', road:'#f5eedb',
  hilltop:'#aee07f', hillside:'#76b850', rim:'#e2c98e'};
// 景色主題（兩座島共用景色程式，只有這裡不同）：熱帶潟湖——飽和晴空、翠綠淺水、白沙
var THEME = {id:'tropic', top:'#1677e6', hor:'#b4f0ff', topN:'#061233', horN:'#1a3466', topD:'#5f55b8', horD:'#ff9c86', fog:[40, 110],
  sun:'#fff6e2', sunD:'#ffb06b', sunN:'#9db8ff', hemi:'#e4f7ff', ground:'#86b866', hemiN:'#3a4f88', groundN:'#1a2238',
  shallow:'#6ff5df', mid:'#1fb5d6', deep:'#1767b8', lagoon:3.4, waterOp:.76, waterNight:'#2a4a8a', waterDusk:'#ffb3a0',
  glint:'#ffffff', glintNight:'#cfe0ff', glints:260, glintK:1};
var INK = '#3b2f3a';                                              // 描邊色：深褐紫，比純黑柔和
var CREAM = {house:1, pavilion:1, school:1, civic:1, lighthouse:1, tent:1};

function smooth(a, b, x){ var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function col(h){ return new T3.Color(h); }
function hexMix(a, b, t){ return mix(a, b, t); }
function groundKey(z){ var m = /--([a-z]+)/.exec(z.ground || ''); return m ? m[1] : 'grass'; }

/* ---------- 地形高度 ---------- */
function hillAt(gx, gy){
  var e = 0;
  HILLS.forEach(function(H){
    var d = Math.hypot(gx - H.at[0], gy - H.at[1]);
    H.layers.forEach(function(Ly){ var v = Ly[1] * (1 - smooth(Ly[0] - .35, Ly[0] + .25, d)); if (v > e) e = v; });
  });
  return e * HK;
}
function edgeD(gx, gy){ var dx = gx - C[0], dy = gy - C[1]; return Math.hypot(dx, dy) - islandR(Math.atan2(dy, dx)); }
function landY(gx, gy){
  var d = edgeD(gx, gy);
  var y = LAND - smooth(-.5, .8, d) * .44;                       // 草地 → 沙灘 → 淺水
  if (d > .8) y = Math.max(-1.7, .06 - (d - .8) * .5);           // 往外海變深
  y += hillAt(gx, gy) * (1 - smooth(-.6, .1, d));
  var rd = riverDist(gx, gy);
  if (rd < .82) y += (.03 - y) * (1 - smooth(.36, .82, rd));      // 河道
  WATERS.forEach(function(w){ var wd = Math.hypot(gx - w.at[0], gy - w.at[1]); if (wd < w.r + .35) y += (.06 - y) * (1 - smooth(w.r - .12, w.r + .3, wd)); });
  return y;
}
function onBridge(gx, gy){ return riverDist(gx, gy) < .85 && minDist(BRIDGE_S, gx, gy) < .42; }
function standY(gx, gy){
  if (farBridgeDist(gx, gy) < .3) return LAND + .12;            // 跨海大橋橋面
  if (onFarIsland(gx, gy, -.1)) return LAND + .09;               // 對面小島
  var y = landY(gx, gy); return onBridge(gx, gy) ? Math.max(y, DECK + .04) : Math.max(y, SEA - .05); }

function zoneOfPoint(gx, gy){
  for (var i = 0; i < ZONES.length; i++){ var b = ZONES[i].box; if (gx > b[0] && gx < b[2] && gy > b[1] && gy < b[3]) return ZONES[i]; }
  return null;
}
function terrainColor(gx, gy, y, n){
  var d = edgeD(gx, gy);
  if (y < SEA + .03){ var depth = SEA - y; return hexMix(PAL.wet, PAL.deep, smooth(-.05, 1.5, depth)); }
  if (d > -.55) return hexMix(PAL.grass, PAL.sand, smooth(-.55, -.25, d));
  var c = n > .5 ? PAL.grass : PAL.grass2, h = hillAt(gx, gy);
  if (h > .03) c = hexMix(PAL.hillside, PAL.hilltop, Math.min(1, h / (26 * HK)));
  GREENS.forEach(function(G){ if (Math.hypot(gx - G.at[0], gy - G.at[1]) < G.r) c = PAL.park; });
  var z = zoneOfPoint(gx, gy);
  if (z && z.id !== 'strategy') c = hexMix(PAL[groundKey(z)] || PAL.grass, z.color, .22);   // 地面帶場地主色，一眼分得出區塊
  if (z && z.id === 'brand' && gx > 6.95 && gx < 7.65) c = PAL.road;
  var rd = riverDist(gx, gy);
  if (rd < 1.0) c = hexMix(c, PAL.rim, 1 - smooth(.7, 1.0, rd));
  WATERS.forEach(function(w){ var wd = Math.hypot(gx - w.at[0], gy - w.at[1]); if (wd < w.r + .45) c = hexMix(c, w === WATERS[1] ? '#d8d0bd' : PAL.rim, 1 - smooth(w.r + .2, w.r + .45, wd)); });
  return c;
}

/* ---------- 建場景 ---------- */
// 卡通著色：三段色階的 MeshToonMaterial（亮面／陰影面分明，像動畫賽璐璐上色）
var GRAD = null;
function toonGrad(){
  if (GRAD) return GRAD;
  GRAD = new T3.DataTexture(new Uint8Array([120, 200, 255]), 3, 1, T3.RedFormat);
  GRAD.minFilter = GRAD.magFilter = T3.NearestFilter; GRAD.generateMipmaps = false; GRAD.needsUpdate = true;
  return GRAD;
}
function std(c, o){
  o = o || {}; o.color = c; delete o.roughness; delete o.metalness; delete o.flatShading;
  o.gradientMap = toonGrad();
  return new T3.MeshToonMaterial(o);
}
// 描邊：背面外推法（inverted hull）。外推方向用「同一位置的平均法線」，方塊轉角才不會裂開
var INK_MATS = {};
function inkMat(th){
  var k = th.toFixed(4);
  if (INK_MATS[k]) return INK_MATS[k];
  var m = new T3.MeshBasicMaterial({color:INK, side:T3.BackSide});
  m.onBeforeCompile = function(sh){
    sh.vertexShader = 'attribute vec3 onrm;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(onrm) * ' + k + ';');
  };
  m.customProgramCacheKey = function(){ return 'ink' + k; };
  return (INK_MATS[k] = m);
}
function ensureOnrm(g){
  if (g.attributes.onrm) return;
  if (!g.attributes.normal) g.computeVertexNormals();
  var p = g.attributes.position, n = g.attributes.normal, acc = {}, out = new Float32Array(p.count * 3), i, key, a;
  for (i = 0; i < p.count; i++){
    key = Math.round(p.getX(i) * 1e3) + ',' + Math.round(p.getY(i) * 1e3) + ',' + Math.round(p.getZ(i) * 1e3);
    a = acc[key] || (acc[key] = [0, 0, 0]); a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i);
  }
  for (i = 0; i < p.count; i++){
    key = Math.round(p.getX(i) * 1e3) + ',' + Math.round(p.getY(i) * 1e3) + ',' + Math.round(p.getZ(i) * 1e3);
    a = acc[key]; var l = Math.hypot(a[0], a[1], a[2]) || 1; out[i * 3] = a[0] / l; out[i * 3 + 1] = a[1] / l; out[i * 3 + 2] = a[2] / l;
  }
  g.setAttribute('onrm', new T3.BufferAttribute(out, 3));
}
function noPick(){}
function inkMesh(m, th){
  ensureOnrm(m.geometry);
  var o = m.isInstancedMesh ? new T3.InstancedMesh(m.geometry, inkMat(th), m.count) : new T3.Mesh(m.geometry, inkMat(th));
  if (m.isInstancedMesh){ o.instanceMatrix = m.instanceMatrix; o.frustumCulled = false; m.parent.add(o); }
  else m.add(o);
  o.raycast = noPick; o.userData.ink = true; o.castShadow = false; o.receiveShadow = false;
  return o;
}
function inkAll(g, th){
  var list = [], out = [];
  g.traverse(function(m){ if (m.isMesh && !m.userData.ink && !m.userData.noInk) list.push(m); });
  list.forEach(function(m){ out.push(inkMesh(m, th)); });
  g.userData.inks = out;
  return g;
}
function shadowAll(g){ g.traverse(function(m){ if (m.isMesh){ m.castShadow = true; m.receiveShadow = true; } }); return g; }

function buildTerrain(){
  var x0 = -6, x1 = 24, step = .2, n = Math.round((x1 - x0) / step) + 1;
  var pos = new Float32Array(n * n * 3), cols = new Float32Array(n * n * 3), idx = [], c = new T3.Color();
  for (var j = 0; j < n; j++) for (var i = 0; i < n; i++){
    var gx = x0 + i * step, gy = x0 + j * step, y = landY(gx, gy), k = (j * n + i) * 3;
    var noise = .5 + .5 * Math.sin(gx * 1.7 + Math.sin(gy * 1.3) * 2) * Math.cos(gy * 1.1 - gx * .4);
    pos[k] = gx; pos[k + 1] = y; pos[k + 2] = gy;
    c.set(terrainColor(gx, gy, y, noise));
    var v = .94 + noise * .08; cols[k] = c.r * v; cols[k + 1] = c.g * v; cols[k + 2] = c.b * v;
    if (i < n - 1 && j < n - 1){ var a = j * n + i; idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1); }
  }
  var g = new T3.BufferGeometry();
  g.setAttribute('position', new T3.BufferAttribute(pos, 3));
  g.setAttribute('color', new T3.BufferAttribute(cols, 3));
  g.setIndex(idx); g.computeVertexNormals();
  var m = new T3.Mesh(g, new T3.MeshToonMaterial({vertexColors:true, gradientMap:toonGrad()}));
  m.receiveShadow = true; m.name = 'terrain';
  var bed = new T3.Mesh(new T3.PlaneGeometry(160, 160), std(PAL.deep, {roughness:1})); bed.rotation.x = -Math.PI / 2; bed.position.set(C[0], -1.72, C[1]); scene.add(bed);
  scene.add(m); O.terrain = m;
}

function buildWater(){
  var g = new T3.PlaneGeometry(120, 120, 90, 90); g.rotateX(-Math.PI / 2); g.translate(C[0], SEA, C[1]);
  var wp = g.attributes.position, wc = new Float32Array(wp.count * 3), cS = col(THEME.shallow), cM = col(THEME.mid), cD = col(THEME.deep), cc = new T3.Color();
  for (var wi = 0; wi < wp.count; wi++){
    var ed = Math.min(edgeD(wp.getX(wi), wp.getZ(wi)), farEdge(wp.getX(wi), wp.getZ(wi)));
    cc.copy(cS).lerp(cM, smooth(.2, THEME.lagoon, ed)).lerp(cD, smooth(THEME.lagoon, THEME.lagoon * 3.5, ed));
    wc[wi * 3] = cc.r; wc[wi * 3 + 1] = cc.g; wc[wi * 3 + 2] = cc.b;
  }
  g.setAttribute('color', new T3.BufferAttribute(wc, 3));
  var m = new T3.Mesh(g, new T3.MeshToonMaterial({color:'#ffffff', vertexColors:true, transparent:true, opacity:THEME.waterOp, gradientMap:toonGrad()}));
  m.receiveShadow = true; scene.add(m);
  O.water = m; O.waterBase = Float32Array.from(g.attributes.position.array);
  // 浪花：沿海岸一圈
  var ring = [], N = 160;
  for (var i = 0; i <= N; i++){ var a = i / N * Math.PI * 2, r = islandR(a) + .55; ring.push(new T3.Vector3(C[0] + Math.cos(a) * r, SEA + .012, C[1] + Math.sin(a) * r)); }
  var foamG = new T3.TubeGeometry(new T3.CatmullRomCurve3(ring, true), 240, .07, 4, true);
  O.foam = new T3.Mesh(foamG, new T3.MeshBasicMaterial({color:'#ffffff', transparent:true, opacity:.6}));
  O.foam.scale.y = .25; O.foam.position.y = SEA * .75;
  scene.add(O.foam);
}

function ribbon(points, half, lift, mat){
  var pos = [], idx = [];
  points.forEach(function(p, i){
    var a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    var dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * half, ny = dx / l * half;
    pos.push(p[0] + nx, landY(p[0] + nx, p[1] + ny) + lift, p[1] + ny, p[0] - nx, landY(p[0] - nx, p[1] - ny) + lift, p[1] - ny);
    if (i){ var k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  });
  var g = new T3.BufferGeometry(); g.setAttribute('position', new T3.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  var m = new T3.Mesh(g, mat); m.receiveShadow = true; scene.add(m); return m;
}
function buildRoads(){
  var mat = std(PAL.road, {roughness:.9, polygonOffset:true, polygonOffsetFactor:-2, side:T3.DoubleSide});
  var edge = std('#c9c0a6', {roughness:.95, polygonOffset:true, polygonOffsetFactor:-1, side:T3.DoubleSide});
  var plank = std('#c79a62'), beam = std('#7d5530'), lampPole = std('#3c4a52', {roughness:.5}), bulbMat = std('#fff3c4', {emissive:'#ffcf6b', emissiveIntensity:0});
  O.bulbMat = bulbMat;
  for (var s = 0; s + 48 < ROAD_S.length; s += 49){
    var road = ROAD_S.slice(s, s + 49), runs = [], run = [], land = [], seg = [];
    road.forEach(function(q, i){
      var wet = riverDist(q[0], q[1]) < .78;
      if (wet){ run.push(q); if (seg.length){ land.push(seg); seg = []; } }
      else { seg.push(q); if (run.length){ runs.push(run); run = []; } }
    });
    if (seg.length) land.push(seg); if (run.length) runs.push(run);
    land.forEach(function(sg){ if (sg.length > 1){ ribbon(sg, .27, .025, edge); ribbon(sg, .22, .035, mat); } });
    runs.forEach(function(rn){                                   // 木橋
      var a = rn[0], b = rn[rn.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) + .9, ang = Math.atan2(dx, dy);
      var g = new T3.Group(); g.position.set((a[0] + b[0]) / 2, DECK, (a[1] + b[1]) / 2); g.rotation.y = ang;
      var deck = new T3.Mesh(new T3.BoxGeometry(.56, .07, len), plank); g.add(deck);
      [-.3, .3].forEach(function(x){
        var rail = new T3.Mesh(new T3.BoxGeometry(.04, .04, len), beam); rail.position.set(x, .2, 0); g.add(rail);
        for (var z = -len / 2 + .1; z <= len / 2; z += .35){ var post = new T3.Mesh(new T3.BoxGeometry(.05, .2, .05), beam); post.position.set(x, .1, z); g.add(post); }
      });
      var arch = new T3.Mesh(new T3.BoxGeometry(.5, .5, .12), beam); arch.position.set(0, -.3, 0); g.add(arch);
      scene.add(inkAll(shadowAll(g), .014));
    });
    // 路燈
    road.forEach(function(q, i){
      if (i % 12 !== 6 || riverDist(q[0], q[1]) < 1.1) return;
      var a = road[Math.max(0, i - 1)], b = road[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      var px = q[0] - dy / l * .34, py = q[1] + dx / l * .34;
      if (TOOLS.some(function(t){ return Math.abs(px - t.gx) < t.s + .2 && Math.abs(py - t.gy) < t.s + .2; })) return;
      var y = landY(px, py), pole = new T3.Mesh(new T3.CylinderGeometry(.018, .025, .55, 6), lampPole);
      pole.position.set(px, y + .275, py); pole.castShadow = true; scene.add(pole);
      var bulb = new T3.Mesh(new T3.SphereGeometry(.05, 10, 8), bulbMat); bulb.position.set(px, y + .58, py); scene.add(bulb);
      O.lamps.push(bulb);
    });
  }
}

/* ---------- 建築 ---------- */
var winCanvas = null;
function windowTextures(){
  if (winCanvas) return winCanvas;
  function mk(wall, glass){
    var c = document.createElement('canvas'); c.width = 32; c.height = 32;
    var x = c.getContext('2d'); x.fillStyle = wall; x.fillRect(0, 0, 32, 32); x.fillStyle = glass; x.fillRect(8, 9, 16, 15);
    var t = new T3.CanvasTexture(c); t.wrapS = t.wrapT = T3.RepeatWrapping; t.colorSpace = T3.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  winCanvas = {map:mk('#ffffff', '#8fa9b8'), emi:mk('#000000', '#ffffff')};
  winCanvas.emi.colorSpace = T3.NoColorSpace;
  return winCanvas;
}
function wallMat(color, cols, rows){
  var w = windowTextures(), map = w.map.clone(), emi = w.emi.clone();
  map.repeat.set(cols, rows); emi.repeat.set(cols, rows); map.needsUpdate = emi.needsUpdate = true;
  return std(color, {map:map, emissive:'#ffd27a', emissiveMap:emi, emissiveIntensity:0, roughness:.7});
}
function gable(w, d, rh, mat){
  var sh = new T3.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(0, rh); sh.lineTo(-w / 2, 0);
  var g = new T3.ExtrudeGeometry(sh, {depth:d, bevelEnabled:false}); g.translate(0, 0, -d / 2);
  return new T3.Mesh(g, mat);
}
function pyramid(w, rh, mat){ var g = new T3.ConeGeometry(w * .74, rh, 4); g.rotateY(Math.PI / 4); var m = new T3.Mesh(g, mat); m.position.y = rh / 2; return m; }

function buildBuilding(t){
  var z = zoneById[t.zone], st = t.style, w = t.s * 2, h = t.h * HK, rh = t.roof * HK, hv = hash(t.id);
  var base = Math.min(landY(t.gx, t.gy), landY(t.gx - t.s, t.gy - t.s), landY(t.gx + t.s, t.gy - t.s), landY(t.gx - t.s, t.gy + t.s), landY(t.gx + t.s, t.gy + t.s));
  var g = new T3.Group(); g.position.set(t.gx, base, t.gy);
  var wall = CREAM[st] ? '#f3ead9' : hexMix(z.color, '#ffffff', .5), accent = hexMix(z.color, '#14303d', .3);
  var roofM = std(z.color, {roughness:.6}), accM = std(accent), wallPlain = std(wall);
  var cols = Math.max(1, Math.round(w / .26)), rows = Math.max(1, Math.round(h / .42));
  var wm = st === 'pavilion' || st === 'civic' || st === 'lighthouse' ? null : wallMat(wall, cols, st === 'house' || st === 'warehouse' ? 1 : rows);
  var foot = new T3.Mesh(new T3.BoxGeometry(w + .12, .4, w + .12), std('#cfc6b4')); foot.position.y = -.17; g.add(foot);
  var top = h;

  function body(height, mat, width){ var bw = width || w, m = new T3.Mesh(new T3.BoxGeometry(bw, height, bw), mat); m.position.y = height / 2; g.add(m); return m; }
  if (st === 'pavilion'){
    var floor = new T3.Mesh(new T3.CylinderGeometry(w * .7, w * .74, .08, 8), std('#e8dcc6')); floor.position.y = .04; g.add(floor);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function(p){ var post = new T3.Mesh(new T3.CylinderGeometry(.035, .035, h, 8), std('#9a6b3f')); post.position.set(p[0] * w * .38, h / 2, p[1] * w * .38); g.add(post); });
    var lantern = new T3.Mesh(new T3.SphereGeometry(.07, 12, 10), std('#fff1c9', {emissive:'#ffc35c', emissiveIntensity:0})); lantern.position.y = h - .12; g.add(lantern);
    t.emis = [lantern.material];
    var r = pyramid(w * 1.25, rh, roofM); r.position.y += h; g.add(r); top = h + rh;
  } else if (st === 'tent'){                                     // 歡樂遊樂園：直條紋馬戲帳篷＋三角旗
    var tc = z.color, stripe = function(n, wd){ return canvasTex(256, 64, function(x, W, H){ x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H); x.fillStyle = tc; for (var i = 0; i < n; i++) if (i % 2 === 0) x.fillRect(i * W / n, 0, W / n + 1, H); if (wd){ x.fillStyle = '#ffd23f'; x.fillRect(0, H - 6, W, 6); } }); };
    var wallT = mesh(new T3.CylinderGeometry(w * .62, w * .66, h, 16, 1, true), std('#ffffff', {map:stripe(16, true), side:T3.DoubleSide}), 0, h / 2, 0, g);
    mesh(new T3.CylinderGeometry(w * .6, w * .6, .02, 16), std('#e8dcc6'), 0, .01, 0, g);
    var cone = mesh(new T3.ConeGeometry(w * .8, rh, 16, 1, true), std('#ffffff', {map:stripe(16), side:T3.DoubleSide}), 0, h + rh / 2, 0, g);
    var trim = mesh(new T3.TorusGeometry(w * .78, .03, 6, 24), std('#ffd23f'), 0, h + .01, 0, g); trim.rotation.x = Math.PI / 2;
    var door = mesh(new T3.BoxGeometry(.2, .3, .04), std(hexMix(tc, '#14303d', .45)), 0, .15, w * .64, g);
    mesh(new T3.CylinderGeometry(.01, .01, .35, 5), std('#14303d'), 0, h + rh + .17, 0, g);
    var pen = mesh(new T3.PlaneGeometry(.2, .12), std(['#ffd23f', '#4f9dff', '#6fcf5a', '#ff6f59'][hv % 4], {side:T3.DoubleSide}), .1, h + rh + .28, 0, g); pen.userData.noInk = true;
    O.anim.push(function(tm){ pen.rotation.y = Math.sin(tm * 3 + hv) * .3; });
    var lampT = mesh(new T3.SphereGeometry(.05, 10, 8), std('#fff1c9', {emissive:'#ffc35c', emissiveIntensity:0}), 0, .36, w * .66, g);
    t.emis = [lampT.material]; top = h + rh + .35;
  } else if (st === 'lighthouse'){
    var tower = new T3.Mesh(new T3.CylinderGeometry(.17, .27, h, 18), wallPlain); tower.position.y = h / 2; g.add(tower);
    [.25, .6].forEach(function(f){ var band = new T3.Mesh(new T3.CylinderGeometry(.27 - f * .1 + .006, .27 - (f + .12) * .1 + .006, h * .12, 18), std('#e05a47')); band.position.y = h * (f + .06); g.add(band); });
    var lampM = std('#fff6d0', {emissive:'#ffd36b', emissiveIntensity:.3, transparent:true, opacity:.9});
    var lamp = new T3.Mesh(new T3.CylinderGeometry(.15, .15, .2, 12), lampM); lamp.position.y = h + .1; g.add(lamp);
    var cap = new T3.Mesh(new T3.ConeGeometry(.2, rh + .1, 12), std('#e05a47')); cap.position.y = h + .2 + (rh + .1) / 2; g.add(cap);
    var beam = new T3.Mesh(new T3.ConeGeometry(.9, 6, 20, 1, true), new T3.MeshBasicMaterial({color:'#ffe9a3', transparent:true, opacity:0, depthWrite:false, side:T3.DoubleSide, blending:T3.AdditiveBlending}));
    beam.geometry.translate(0, -3, 0); beam.rotation.z = Math.PI / 2; beam.userData.noInk = true;
    var pivot = new T3.Group(); pivot.position.y = h + .1; pivot.add(beam); g.add(pivot);
    O.beam = {pivot:pivot, mat:beam.material}; t.emis = [lampM]; top = h + rh + .3;
  } else {
    var main = body(h, wm ? [wm, wm, wallPlain, wallPlain, wm, wm] : wallPlain);
    if (wm) t.emis = [wm];
    if (st === 'house' || st === 'warehouse'){
      var gr = gable(w + .14, w + .14, rh || .3, roofM); gr.position.y = h; g.add(gr); top = h + (rh || .3);
      var door = new T3.Mesh(new T3.BoxGeometry(st === 'warehouse' ? w * .4 : .16, st === 'warehouse' ? h * .6 : .26, .02), std(st === 'warehouse' ? '#5a4632' : '#8a5a34'));
      door.position.set(0, (st === 'warehouse' ? h * .6 : .26) / 2, w / 2 + .011); g.add(door);
      if (st === 'house'){ var ch = new T3.Mesh(new T3.BoxGeometry(.1, .25, .1), std('#9b6b4b')); ch.position.set(w * .25, h + .22, -w * .15); g.add(ch); }
    } else if (st === 'school'){
      var slab = new T3.Mesh(new T3.BoxGeometry(w + .1, .07, w + .1), roofM); slab.position.y = h + .035; g.add(slab);
      var pole = new T3.Mesh(new T3.CylinderGeometry(.015, .015, .8, 6), std('#3c4a52')); pole.position.set(-w / 2 + .08, h + .4, -w / 2 + .08); g.add(pole);
      var flag = new T3.Mesh(new T3.PlaneGeometry(.32, .2), std(z.color, {side:T3.DoubleSide})); flag.position.set(-w / 2 + .25, h + .68, -w / 2 + .08); flag.userData.noInk = true; g.add(flag);
      O.anim.push(function(tm){ flag.rotation.y = Math.sin(tm * 3 + hv) * .25; });
      var clockM = new T3.Mesh(new T3.CylinderGeometry(.11, .11, .02, 20), std('#ffffff')); clockM.rotation.x = Math.PI / 2; clockM.position.set(0, h - .2, w / 2 + .012); g.add(clockM);
      top = h + .9;
    } else if (st === 'civic'){
      main.scale.set(.82, 1, .82);
      var podium = new T3.Mesh(new T3.BoxGeometry(w + .2, .1, w + .2), std('#e8e1d2')); podium.position.y = .05; g.add(podium);
      var colM = std('#ffffff'), face = w * .41 + .06;
      [-.36, -.12, .12, .36].forEach(function(f){
        [[f * w, face], [face, f * w]].forEach(function(p){ var c2 = new T3.Mesh(new T3.CylinderGeometry(.045, .05, h - .1, 10), colM); c2.position.set(p[0], h / 2, p[1]); g.add(c2); });
      });
      var roof = new T3.Mesh(new T3.BoxGeometry(w + .16, .1, w + .16), accM); roof.position.y = h + .05; g.add(roof);
      var ped = gable(w + .16, w + .16, .22, roofM); ped.position.y = h + .1; g.add(ped);
      top = h + .35;
    } else if (st === 'shop'){
      var roofS = new T3.Mesh(new T3.BoxGeometry(w + .04, .05, w + .04), accM); roofS.position.y = h + .025; g.add(roofS);
      [0, 1].forEach(function(side){
        for (var i = 0; i < 6; i++){
          var stripe = new T3.Mesh(new T3.BoxGeometry(w / 6, .02, .26), std(i % 2 ? '#ffffff' : z.color));
          var a = new T3.Group(); a.add(stripe); stripe.position.z = .13;
          a.position.set(-w / 2 + w / 12 + i * w / 6, .48, w / 2); a.rotation.x = .45;
          var holder = new T3.Group(); holder.add(a); holder.rotation.y = side ? Math.PI / 2 : 0; g.add(holder);
        }
      });
      top = h + .05;
    } else if (st === 'observatory'){
      var dome = new T3.Mesh(new T3.SphereGeometry(w * .45, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), std('#eef2f4', {roughness:.35, metalness:.3}));
      dome.position.y = h; g.add(dome);
      var slit = new T3.Mesh(new T3.BoxGeometry(.06, .02, w * .9), accM); slit.position.y = h + w * .44; g.add(slit);
      top = h + w * .45;
    } else if (st === 'spire'){
      main.scale.set(.8, 1, .8);
      var step2 = new T3.Mesh(new T3.BoxGeometry(w * .55, .35, w * .55), std(z.color, {roughness:.5})); step2.position.y = h + .175; g.add(step2);
      var ant = new T3.Mesh(new T3.CylinderGeometry(.012, .02, .9, 6), std('#14303d')); ant.position.y = h + .8; g.add(ant);
      var orbM = std('#ff6f59', {emissive:'#ff6f59', emissiveIntensity:1});
      var orb = new T3.Mesh(new T3.SphereGeometry(.07, 14, 10), orbM); orb.position.y = h + 1.27; g.add(orb);
      O.anim.push(function(tm){ orbM.emissiveIntensity = .6 + .6 * Math.abs(Math.sin(tm * 2.2)); });
      top = h + 1.35;
    } else {                                                   // office、tower
      var cap2 = new T3.Mesh(new T3.BoxGeometry(w + .04, .06, w + .04), roofM); cap2.position.y = h + .03; g.add(cap2);
      if (hv % 2){ var rb = .22 + (hv % 3) * .1, box = new T3.Mesh(new T3.BoxGeometry(w * .42, rb, w * .42), accM); box.position.y = h + rb / 2; g.add(box); top = h + rb; }
      if (st === 'tower' && hv % 3 === 0){ var ant2 = new T3.Mesh(new T3.CylinderGeometry(.01, .01, .5, 5), std('#14303d')); ant2.position.y = top + .25; g.add(ant2); top += .5; }
    }
  }
  // 探索過的小旗
  var fl = new T3.Group(); fl.position.set(w * .3, top + .02, w * .3);
  var fp = new T3.Mesh(new T3.CylinderGeometry(.01, .01, .45, 5), std('#14303d')); fp.position.y = .22; fl.add(fp);
  var ff = new T3.Mesh(new T3.PlaneGeometry(.22, .13), std('#ff6f59', {side:T3.DoubleSide})); ff.position.set(.11, .38, 0); ff.userData.noInk = true; fl.add(ff);
  fl.visible = false; g.add(fl);
  shadowAll(g);
  g.traverse(function(m){ if (m.isMesh){ m.userData.id = t.id; O.pick.push(m); } });
  scene.add(g);
  var mats = [];
  g.traverse(function(m){ if (m.isMesh) (Array.isArray(m.material) ? m.material : [m.material]).forEach(function(mt){ if (mats.indexOf(mt) < 0){ mt.userData.op = mt.opacity; mats.push(mt); } }); });
  inkAll(g, .016);
  O.blds[t.id] = {t:t, g:g, flag:fl, base:base, top:base + top, mats:mats, lines:g.userData.inks, fade:1, box:new T3.Box3().setFromObject(g)};
}

function buildDecor(){
  // 學校操場
  var tc = SCHOOL_TRACK, ty = landY(tc[0], tc[1]);
  var track = new T3.Mesh(new T3.RingGeometry(.56, .86, 40), std('#cf7458', {polygonOffset:true, polygonOffsetFactor:-2}));
  track.rotation.x = -Math.PI / 2; track.position.set(tc[0], ty + .02, tc[1]); track.receiveShadow = true; scene.add(track);
  var field = new T3.Mesh(new T3.CircleGeometry(.56, 40), std('#79c266', {polygonOffset:true, polygonOffsetFactor:-2}));
  field.rotation.x = -Math.PI / 2; field.position.set(tc[0], ty + .021, tc[1]); field.receiveShadow = true; scene.add(field);
  // 噴水池
  var f = WATERS[1], fy = SEA;
  var rim = new T3.Mesh(new T3.TorusGeometry(f.r + .05, .07, 8, 32), std('#d8d0bd')); rim.rotation.x = Math.PI / 2; rim.position.set(f.at[0], LAND - .02, f.at[1]); shadowAll(rim); scene.add(rim);
  var basin = new T3.Mesh(new T3.CylinderGeometry(f.r, f.r, .4, 28), std('#3ea3c4', {transparent:true, opacity:.85, roughness:.15})); basin.position.set(f.at[0], LAND - .22, f.at[1]); scene.add(basin);
  var col2 = new T3.Mesh(new T3.CylinderGeometry(.05, .08, .4, 10), std('#e9e3d6')); col2.position.set(f.at[0], LAND + .1, f.at[1]); scene.add(col2);
  var NJ = 90, jp = new Float32Array(NJ * 3), jv = [];
  for (var i = 0; i < NJ; i++) jv.push({a:Math.random() * Math.PI * 2, t:Math.random()});
  var jg = new T3.BufferGeometry(); jg.setAttribute('position', new T3.BufferAttribute(jp, 3));
  var jets = new T3.Points(jg, new T3.PointsMaterial({color:'#e8fbff', size:.06, transparent:true, opacity:.85, depthWrite:false}));
  scene.add(jets);
  O.anim.push(function(tm, dt){
    for (var i = 0; i < NJ; i++){
      var p = jv[i]; p.t += dt * .8; if (p.t > 1) { p.t -= 1; p.a = Math.random() * Math.PI * 2; }
      var r = p.t * (f.r * .8), y = LAND + .3 + p.t * 1.1 - p.t * p.t * 1.3;
      jp[i * 3] = f.at[0] + Math.cos(p.a) * r; jp[i * 3 + 1] = y; jp[i * 3 + 2] = f.at[1] + Math.sin(p.a) * r;
    }
    jg.attributes.position.needsUpdate = true;
  });
  // 公園池塘的荷葉
  var w0 = WATERS[0];
  for (var k = 0; k < 4; k++){ var pad = new T3.Mesh(new T3.CircleGeometry(.09 + k * .015, 14), std('#6fb85c', {side:T3.DoubleSide})); pad.rotation.x = -Math.PI / 2; pad.position.set(w0.at[0] - .25 + k * .17, SEA + .01, w0.at[1] + .1 - (k % 2) * .25); scene.add(pad); }
  // 河口碼頭的木棧橋
  var pier = new T3.Group(); pier.position.set((DOCK_PIER[0][0] + DOCK_PIER[1][0]) / 2, DECK - .05, (DOCK_PIER[0][1] + DOCK_PIER[2][1]) / 2);
  pier.add(new T3.Mesh(new T3.BoxGeometry(1.55, .06, .65), std('#d0a46e')));
  [-.7, 0, .7].forEach(function(x){ [-.28, .28].forEach(function(zz){ var p = new T3.Mesh(new T3.CylinderGeometry(.03, .03, .8, 6), std('#7d5530')); p.position.set(x, -.38, zz); pier.add(p); }); });
  scene.add(inkAll(shadowAll(pier), .014));
  // 場地邊框旗桿＋地塊外框淡淡的彩色緣石
  ZONES.forEach(function(z){
    if (z.id === 'strategy') return;
    var b = z.box, pts3 = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]];
    for (var i = 0; i < 4; i++){
      var a = pts3[i], c = pts3[i + 1], len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      var curb = new T3.Mesh(new T3.BoxGeometry(len, .05, .06), std(z.color, {roughness:.6}));
      curb.position.set((a[0] + c[0]) / 2, landY((a[0] + c[0]) / 2, (a[1] + c[1]) / 2) + .025, (a[1] + c[1]) / 2);
      curb.rotation.y = -Math.atan2(c[1] - a[1], c[0] - a[0]); curb.receiveShadow = true; scene.add(curb);
    }
  });
}

/* ---------- 場地特色：每區一座主題地標＋寫著名字的入口拱門 ---------- */
function roundRect(x, a, b, w, h, r){ x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
function canvasTex(w, h, draw){
  var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  var t = new T3.CanvasTexture(c); t.colorSpace = T3.SRGBColorSpace; t.anisotropy = 4; return t;
}
function signTex(z){
  return canvasTex(512, 176, function(x){
    x.fillStyle = z.color; roundRect(x, 8, 8, 496, 160, 36); x.fill();
    x.lineWidth = 10; x.strokeStyle = INK; x.stroke();
    x.fillStyle = 'rgba(255,255,255,.22)'; roundRect(x, 26, 20, 460, 44, 22); x.fill();
    x.textAlign = 'center'; x.lineJoin = 'round';
    x.font = '400 80px Huninn, "Noto Sans TC", sans-serif'; x.lineWidth = 12; x.strokeStyle = hexMix(z.color, '#14303d', .55);
    x.strokeText(z.name, 256, 108); x.fillStyle = '#ffffff'; x.fillText(z.name, 256, 108);
    x.font = '700 24px "JetBrains Mono", monospace'; x.fillStyle = 'rgba(255,255,255,.92)'; x.fillText(z.en, 256, 150);
  });
}
function blockWalk(gx, gy, r){ if (walkCells) blockArea(gx, gy, r + BODY * .6); }   // 地標擋路：角色會繞過去（平面地圖也一樣）
function freeSpot(z, avoid){
  var b = z.box, best = null, bs = -9, M = 1.4;                  // 場地裡太擠時，可以放在場地外緣的空地
  for (var gx = b[0] - M; gx <= b[2] + M; gx += .15) for (var gy = b[1] - M; gy <= b[3] + M; gy += .15){
    var oz = zoneOfPoint(gx, gy); if (oz && oz !== z) continue;
    var out = Math.max(b[0] - gx, gx - b[2], b[1] - gy, gy - b[3], 0);
    var sc = 9 - out * .5;
    TOOLS.forEach(function(t){ var d = Math.max(Math.abs(gx - t.gx), Math.abs(gy - t.gy)) - t.s; if (d < sc) sc = d; });
    sc = Math.min(sc, minDist(ROAD_S, gx, gy) - .25, riverDist(gx, gy) - .85, -edgeD(gx, gy) - .6);
    WATERS.forEach(function(w){ sc = Math.min(sc, Math.hypot(gx - w.at[0], gy - w.at[1]) - w.r - .25); });
    (avoid || []).forEach(function(a){ sc = Math.min(sc, Math.hypot(gx - a[0], gy - a[1]) - .9); });
    (O.markSpots || []).forEach(function(m){ sc = Math.min(sc, Math.hypot(gx - m[0], gy - m[1]) - m[2] - .3); });
    if (z.id === 'school') sc = Math.min(sc, Math.hypot(gx - 11, gy - 1.3) - .95);
    if (z.id === 'brand' && gx > 6.8 && gx < 7.8) sc -= 1;
    if (sc > bs){ bs = sc; best = [gx, gy]; }
  }
  return {at:best, room:bs};
}
// 看板畫面：上方主色標題列、副標、三行內容、底部提示；背景淡淡的損益兩平圖
function fitText(x, text, maxW, size, weight, family){
  var sz = size; x.font = weight + ' ' + sz + 'px ' + family;
  while (x.measureText(text).width > maxW && sz > size * .55){ sz -= 1; x.font = weight + ' ' + sz + 'px ' + family; }
  return sz;
}
function drawBoardCanvas(cv){
  var x = cv.getContext('2d'), W = cv.width, H = cv.height, c = board.color || '#2ec4b6', F = '"Noto Sans TC", sans-serif', HF = 'Huninn, "Noto Sans TC", sans-serif';
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
  x.globalAlpha = .14;                                            // 淡淡的長條圖＋上升線當背景
  [60, 95, 130, 170, 215].forEach(function(v, i){ x.fillStyle = c; x.fillRect(360 + i * 52, H - 60 - v, 34, v); });
  x.strokeStyle = '#ff6f59'; x.lineWidth = 8; x.lineCap = 'round'; x.beginPath(); x.moveTo(360, H - 110); x.lineTo(470, H - 170); x.lineTo(610, H - 285); x.stroke();
  x.globalAlpha = 1;
  x.fillStyle = c; x.fillRect(0, 0, W, 104);
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#ffffff';
  fitText(x, board.title, W - 50, 70, '400', HF); x.lineWidth = 8; x.strokeStyle = mix(c, '#14303d', .45); x.lineJoin = 'round'; x.strokeText(board.title, W / 2, 56); x.fillText(board.title, W / 2, 56);
  x.fillStyle = mix(c, '#14303d', .55); fitText(x, board.sub, W - 50, 34, '700', F); x.fillText(board.sub, W / 2, 140);
  x.textAlign = 'left'; x.fillStyle = '#3b2f3a';
  ['l1', 'l2', 'l3'].filter(function(k){ return board[k]; }).forEach(function(k, i){
    var y = 196 + i * 50;
    x.fillStyle = c; x.beginPath(); x.arc(44, y, 8, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#3b2f3a'; fitText(x, board[k], W - 100, 34, '700', F); x.fillText(board[k], 64, y + 1);
  });
  x.fillStyle = mix(c, '#ffffff', .82); x.fillRect(0, H - 52, W, 52);
  x.textAlign = 'center'; x.fillStyle = mix(c, '#14303d', .5); fitText(x, board.foot, W - 40, 26, '700', F); x.fillText(board.foot, W / 2, H - 26);
  x.lineWidth = 10; x.strokeStyle = '#3b2f3a'; x.strokeRect(5, 5, W - 10, H - 10);
}
function glow(color, day, night){ var m = std(color, {emissive:color, emissiveIntensity:day}); O.glows.push({m:m, day:day, night:night}); return m; }
function mesh(geo, mat, x, y, z, parent){ var m = new T3.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); if (parent) parent.add(m); return m; }

var MARKS = {
  idea:function(g, z){                                            // 大燈泡：點子亮了
    mesh(new T3.CylinderGeometry(.2, .24, .16, 16), std('#e9e1d0'), 0, .08, 0, g);
    var base = mesh(new T3.CylinderGeometry(.1, .11, .16, 16), std('#b9c2c8'), 0, .24, 0, g);
    [.2, .26].forEach(function(y){ mesh(new T3.TorusGeometry(.105, .012, 6, 18), std('#8d979e'), 0, y, 0, g).rotation.x = Math.PI / 2; });
    var bulb = mesh(new T3.SphereGeometry(.24, 24, 18), glow('#ffe066', .35, 1.8), 0, .52, 0, g); bulb.scale.set(1, 1.08, 1);
    var neck = mesh(new T3.CylinderGeometry(.11, .14, .1, 16), bulb.material, 0, .34, 0, g);
    var fil = mesh(new T3.TorusGeometry(.06, .01, 6, 16, Math.PI), new T3.MeshBasicMaterial({color:'#ff9a3c'}), 0, .5, 0, g); fil.userData.noInk = true;
    for (var i = 0; i < 6; i++){ var ray = mesh(new T3.BoxGeometry(.025, .1, .025), glow('#fff3a8', .6, 2), 0, 0, 0, g); var a = i / 6 * Math.PI * 2; ray.position.set(Math.cos(a) * .36, .56 + Math.sin(a) * .36, 0); ray.rotation.z = a - Math.PI / 2; ray.userData.noInk = true; }
    var FL = ['#ff9ec4', '#ffe066', '#ffffff', '#c7a6ff', '#ff8f8f'];
    for (var k = 0; k < 14; k++){ var b = k / 14 * Math.PI * 2; mesh(new T3.SphereGeometry(.035, 8, 6), std(FL[k % 5]), Math.cos(b) * .3, .17, Math.sin(b) * .3, g); }
    O.anim.push(function(tm){ g.rotation.y = tm * .4; });
    return .38;
  },
  strategy:function(g, z){                                        // 西洋棋：國王＋城堡＋小兵
    var light = std('#f1ecff'), dark = std(hexMix(z.color, '#14303d', .45));
    function piece(x, zz, mat, h, top){
      var p = new T3.Group(); p.position.set(x, 0, zz); g.add(p);
      mesh(new T3.CylinderGeometry(.13, .15, .06, 18), mat, 0, .03, 0, p);
      mesh(new T3.CylinderGeometry(.06, .1, h, 18), mat, 0, .06 + h / 2, 0, p);
      mesh(new T3.TorusGeometry(.075, .02, 8, 18), mat, 0, .06 + h, 0, p).rotation.x = Math.PI / 2;
      top(p, .06 + h, mat);
    }
    piece(0, 0, light, .42, function(p, y, m){ mesh(new T3.SphereGeometry(.085, 16, 12), m, 0, y + .07, 0, p); mesh(new T3.BoxGeometry(.03, .14, .03), m, 0, y + .2, 0, p); mesh(new T3.BoxGeometry(.1, .03, .03), m, 0, y + .22, 0, p); });
    piece(.32, .12, dark, .24, function(p, y, m){ mesh(new T3.CylinderGeometry(.09, .08, .08, 4), m, 0, y + .04, 0, p).rotation.y = Math.PI / 4; for (var i = 0; i < 4; i++){ var a = i / 4 * Math.PI * 2; mesh(new T3.BoxGeometry(.04, .05, .04), m, Math.cos(a) * .06, y + .1, Math.sin(a) * .06, p); } });
    piece(-.28, .18, dark, .14, function(p, y, m){ mesh(new T3.SphereGeometry(.07, 14, 10), m, 0, y + .05, 0, p); });
    var flagPole = mesh(new T3.CylinderGeometry(.012, .012, .9, 6), std('#3c4a52'), -.12, .45, -.25, g);
    var flag = mesh(new T3.PlaneGeometry(.32, .2), std(z.color, {side:T3.DoubleSide}), .04, .78, -.25, g); flag.userData.noInk = true;
    O.anim.push(function(tm){ flag.rotation.y = Math.sin(tm * 2.6) * .3; });
    return .4;
  },
  school:function(g, z){                                          // 大鉛筆＋鞦韆
    var p = new T3.Group(); p.rotation.z = .12; g.add(p);
    mesh(new T3.CylinderGeometry(.075, .075, .62, 6), std('#ffd23f'), 0, .38, 0, p);
    mesh(new T3.CylinderGeometry(.078, .078, .06, 6), std('#c9ced3'), 0, .72, 0, p);
    mesh(new T3.CylinderGeometry(.075, .075, .09, 16), std('#ff8fab'), 0, .8, 0, p);
    var tip = mesh(new T3.ConeGeometry(.075, .14, 6), std('#f3d4a5'), 0, 0, 0, p); tip.rotation.x = Math.PI; tip.position.y = .0;
    var lead = mesh(new T3.ConeGeometry(.026, .05, 6), std('#3b2f3a'), 0, -.05, 0, p); lead.rotation.x = Math.PI;
    p.position.y = .07;
    var sw = new T3.Group(); sw.position.set(.42, 0, 0); g.add(sw);
    var wood = std('#e07a5f');
    [-1, 1].forEach(function(s){ [-1, 1].forEach(function(k){ var leg = mesh(new T3.CylinderGeometry(.015, .015, .5, 6), wood, s * .2, .23, k * .08, sw); leg.rotation.x = k * .3; }); });
    mesh(new T3.CylinderGeometry(.015, .015, .44, 6), wood, 0, .47, 0, sw).rotation.z = Math.PI / 2;
    var seat = new T3.Group(); seat.position.y = .46; sw.add(seat);
    [-1, 1].forEach(function(s){ mesh(new T3.BoxGeometry(.006, .3, .006), std('#5a4632'), s * .06, -.15, 0, seat); });
    mesh(new T3.BoxGeometry(.16, .02, .07), std(z.color), 0, -.3, 0, seat);
    O.anim.push(function(tm){ seat.rotation.x = Math.sin(tm * 1.8) * .45; });
    return .55;
  },
  calc:function(g, z){                                            // 創業看板：文字來自 Google 試算表（board，見 index.html）
    var cv = document.createElement('canvas'); cv.width = 640; cv.height = 392;
    var tex = new T3.CanvasTexture(cv); tex.colorSpace = T3.SRGBColorSpace; tex.anisotropy = 4;
    O.boardDraw = function(){ drawBoardCanvas(cv); tex.needsUpdate = true; };
    O.boardDraw();
    [-1, 1].forEach(function(s){ mesh(new T3.CylinderGeometry(.025, .025, .9, 8), std('#5b6770'), s * .45, .45, 0, g); });
    mesh(new T3.BoxGeometry(1.06, .68, .05), std(hexMix(z.color, '#14303d', .3)), 0, .95, 0, g);
    var face = mesh(new T3.PlaneGeometry(.98, .6), std('#ffffff', {map:tex, emissive:'#ffffff', emissiveMap:tex, emissiveIntensity:.05}), 0, .95, .027, g); face.userData.noInk = true;
    O.glows.push({m:face.material, day:.05, night:.9});
    var back = face.clone(); back.rotation.y = Math.PI; back.position.z = -.027; g.add(back);
    var star = mesh(new T3.OctahedronGeometry(.09, 0), glow('#ffd23f', .5, 1.6), 0, 1.45, 0, g);   // 頂上轉動的星星：一眼找到看板
    O.anim.push(function(tm){ star.rotation.y = tm * 2; star.position.y = 1.45 + Math.sin(tm * 2.4) * .04; });
    g.userData.board = true;
    return .5;
  },
  fund:function(g, z){                                            // 金色撲滿＋金幣
    var gold = std('#f7c948', {emissive:'#f7c948', emissiveIntensity:.08}), pig = new T3.Group(); pig.position.y = .26; g.add(pig);
    var body = mesh(new T3.SphereGeometry(.24, 24, 18), gold, 0, 0, 0, pig); body.scale.set(1.25, 1, 1);
    var sn = mesh(new T3.CylinderGeometry(.08, .09, .07, 18), gold, .3, -.02, 0, pig); sn.rotation.z = Math.PI / 2;
    [-1, 1].forEach(function(s){ mesh(new T3.SphereGeometry(.012, 6, 6), new T3.MeshBasicMaterial({color:INK}), .336, -.02, s * .03, pig).userData.noInk = true; });
    [-1, 1].forEach(function(s){ var e = mesh(new T3.ConeGeometry(.06, .09, 4), gold, .14, .2, s * .1, pig); e.rotation.x = s * .4; });
    [[.14, .12], [.14, -.12], [-.14, .12], [-.14, -.12]].forEach(function(q){ mesh(new T3.CylinderGeometry(.05, .05, .12, 12), gold, q[0], -.2, q[1], pig); });
    [-1, 1].forEach(function(s){ mesh(new T3.SphereGeometry(.022, 10, 8), new T3.MeshBasicMaterial({color:'#2b2140'}), .23, .07, s * .085, pig).userData.noInk = true; });
    mesh(new T3.BoxGeometry(.14, .01, .03), new T3.MeshBasicMaterial({color:INK}), 0, .24, 0, pig).userData.noInk = true;
    var coin = mesh(new T3.CylinderGeometry(.08, .08, .02, 24), gold, 0, .5, 0, g); coin.rotation.x = Math.PI / 2;
    O.anim.push(function(tm){ var k = (tm * .5) % 1; coin.position.y = .62 - k * .3; coin.rotation.y = tm * 3; coin.visible = k < .9; });
    [[.42, .1, 4], [.38, -.22, 6], [-.4, .2, 3]].forEach(function(st){ for (var i = 0; i < st[2]; i++) mesh(new T3.CylinderGeometry(.07, .07, .03, 20), gold, st[0], .015 + i * .032, st[1], g).rotation.y = i; });
    return .5;
  },
  brand:function(g, z){                                           // 愛心氣球
    var heart = new T3.Shape(); heart.moveTo(0, -.12); heart.bezierCurveTo(-.24, .02, -.14, .2, 0, .09); heart.bezierCurveTo(.14, .2, .24, .02, 0, -.12);
    var hg = new T3.ExtrudeGeometry(heart, {depth:.08, bevelEnabled:true, bevelSize:.03, bevelThickness:.03, bevelSegments:3}); hg.translate(0, 0, -.04);
    var balloons = [];
    [[0, '#ff6f91', 1], [.2, '#ffb3c6', .8], [-.18, '#ff8fa8', .85]].forEach(function(b, i){
      var h = mesh(hg, std(b[1]), b[0], .95 + i * .08, 0, g); h.scale.setScalar(b[2] * 1.3); balloons.push(h);
      var str = mesh(new T3.CylinderGeometry(.004, .004, .8, 4), std('#ffffff'), b[0] * .5, .45, 0, g); str.rotation.z = -b[0] * .4; str.userData.noInk = true;
    });
    mesh(new T3.BoxGeometry(.2, .1, .14), std(hexMix(z.color, '#14303d', .2)), 0, .05, 0, g);
    O.anim.push(function(tm){ balloons.forEach(function(h, i){ h.position.y = .95 + i * .08 + Math.sin(tm * 1.4 + i) * .04; h.rotation.y = Math.sin(tm * .8 + i) * .5; }); });
    return .35;
  },
  ecom:function(g, z){                                            // 貨櫃＋吊車
    function ribs(c){ return canvasTex(64, 32, function(x, w, h){ x.fillStyle = c; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(0,0,0,.16)'; for (var i = 0; i < w; i += 8) x.fillRect(i, 0, 3, h); x.fillStyle = 'rgba(255,255,255,.25)'; x.fillRect(0, 0, w, 3); }); }
    var C3 = ['#e85d5d', '#4f9dff', '#f4b942', '#2ec4b6', '#9d8cf2'];
    [[0, 0, 0], [0, 0, .3], [0, .3, 0], [.62, 0, .15], [.62, .3, .15]].forEach(function(q, i){
      var m = mesh(new T3.BoxGeometry(.6, .28, .28), std('#ffffff', {map:ribs(C3[i])}), q[0] - .3, .14 + q[1], q[2] - .15, g); m.rotation.y = i === 3 ? .08 : 0;
    });
    var crane = new T3.Group(); crane.position.set(.55, 0, -.45); g.add(crane);
    var yel = std('#ffc93c');
    mesh(new T3.BoxGeometry(.08, 1.3, .08), yel, 0, .65, 0, crane);
    var jib = new T3.Group(); jib.position.y = 1.3; crane.add(jib);
    mesh(new T3.BoxGeometry(1.1, .07, .07), yel, -.35, 0, 0, jib);
    mesh(new T3.BoxGeometry(.18, .16, .14), std('#3c4a52'), .2, -.1, 0, jib);
    var rope = mesh(new T3.CylinderGeometry(.004, .004, .5, 4), std('#3b2f3a'), -.75, -.25, 0, jib); rope.userData.noInk = true;
    mesh(new T3.BoxGeometry(.3, .14, .14), std('#ffffff', {map:ribs('#ff8f5a')}), -.75, -.56, 0, jib);
    O.anim.push(function(tm){ jib.rotation.y = Math.sin(tm * .35) * .9; });
    return .7;
  },
  play:function(g, z){                                            // 摩天輪：慢慢轉，車廂保持水平，晚上亮燈
    var legM = std('#b98a5a');
    [-1, 1].forEach(function(s){ [-1, 1].forEach(function(f){ var leg = mesh(new T3.CylinderGeometry(.025, .035, 1.25, 6), legM, s * .32, .58, f * .14, g); leg.rotation.z = -s * .27; }); });
    mesh(new T3.BoxGeometry(.9, .06, .45), std('#e8dcc6'), 0, .03, 0, g);
    var wheel = new T3.Group(); wheel.position.y = 1.15; g.add(wheel);
    var rimM = glow(z.color, .15, 1.2), spokeM = std('#f6d6ee');
    [-.07, .07].forEach(function(zz){ mesh(new T3.TorusGeometry(.75, .025, 8, 40), rimM, 0, 0, zz, wheel); });
    mesh(new T3.CylinderGeometry(.07, .07, .24, 12), std('#ffd23f'), 0, 0, 0, wheel).rotation.x = Math.PI / 2;
    var cars = [], CC = ['#ffd23f', '#4f9dff', '#6fcf5a', '#ff6f59', '#9d8cf2', '#2ec4b6'];
    for (var i = 0; i < 12; i++){
      var a = i / 12 * Math.PI * 2, sp = mesh(new T3.BoxGeometry(.015, .75, .015), spokeM, Math.cos(a) * .375, Math.sin(a) * .375, 0, wheel); sp.rotation.z = a - Math.PI / 2;
      mesh(new T3.SphereGeometry(.03, 8, 6), glow('#fff3a8', .3, 2), Math.cos(a) * .75, Math.sin(a) * .75, .1, wheel).userData.noInk = true;
      if (i % 2) continue;
      var car = new T3.Group(); car.position.set(Math.cos(a) * .75, Math.sin(a) * .75, 0); wheel.add(car);
      mesh(new T3.CylinderGeometry(.1, .08, .14, 10), std(CC[i / 2 % 6]), 0, -.1, 0, car);
      mesh(new T3.ConeGeometry(.11, .07, 10), std('#ffffff'), 0, .0, 0, car);
      cars.push(car);
    }
    O.anim.push(function(tm){ wheel.rotation.z = tm * .2; cars.forEach(function(c){ c.rotation.z = -wheel.rotation.z; }); });
    return .5;
  },
  ops:function(g, z){                                             // 大齒輪＋菜園
    var gear = new T3.Group(); gear.position.y = .42; g.add(gear);
    var gm = std(hexMix(z.color, '#ffffff', .1));
    var disc = mesh(new T3.CylinderGeometry(.25, .25, .08, 24), gm, 0, 0, 0, gear); disc.rotation.x = Math.PI / 2;
    for (var i = 0; i < 10; i++){ var a = i / 10 * Math.PI * 2, tooth = mesh(new T3.BoxGeometry(.09, .09, .08), gm, Math.cos(a) * .28, Math.sin(a) * .28, 0, gear); tooth.rotation.z = a; }
    var hub2 = mesh(new T3.CylinderGeometry(.08, .08, .1, 18), std('#ffffff'), 0, 0, 0, gear); hub2.rotation.x = Math.PI / 2;
    mesh(new T3.BoxGeometry(.08, .2, .08), std('#8d979e'), 0, .1, 0, g);
    O.anim.push(function(tm){ gear.rotation.z = tm * .6; });
    for (var r = 0; r < 3; r++){
      mesh(new T3.BoxGeometry(.5, .05, .1), std('#a0714a'), .55, .025, -.18 + r * .18, g);
      for (var c = 0; c < 4; c++) mesh(new T3.SphereGeometry(.04, 8, 6), std(r === 1 ? '#ff7f6b' : '#6fcf5a'), .38 + c * .11, .08, -.18 + r * .18, g);
    }
    return .45;
  }
};
function buildFarBridge(){                                        // 跨海大橋（立體）：橋面、欄杆、橋墩，角色走在橋面上
  var a = FAR.bridge[0], b = FAR.bridge[1], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) + .5;
  var g = new T3.Group(); g.position.set((a[0] + b[0]) / 2, LAND + .04, (a[1] + b[1]) / 2); g.rotation.y = Math.atan2(dx, dy);
  var deckM = std('#c79a62'), beamM = std('#7d5530');
  g.add(new T3.Mesh(new T3.BoxGeometry(.56, .08, len), deckM));
  var n = Math.max(2, Math.round(len / .9));
  for (var i = 1; i < n; i++){ var pier = new T3.Mesh(new T3.BoxGeometry(.18, 1.9, .18), beamM); pier.position.set(0, -.98, -len / 2 + len * i / n); g.add(pier); }
  [-.27, .27].forEach(function(x){
    var rail = new T3.Mesh(new T3.BoxGeometry(.035, .035, len), beamM); rail.position.set(x, .24, 0); g.add(rail);
    for (var z = -len / 2 + .1; z <= len / 2; z += .3){ var post = new T3.Mesh(new T3.BoxGeometry(.04, .22, .04), beamM); post.position.set(x, .12, z); g.add(post); }
    if (FAR.self === 'creator'){ var ar = new T3.Mesh(new T3.TorusGeometry(len / 2, .03, 6, 32, Math.PI), deckM); ar.rotation.y = Math.PI / 2; ar.scale.set(1, .3, 1); ar.position.set(x, .04, 0); g.add(ar); }
  });
  g.traverse(function(m){ if (m.isMesh) m.userData.noPickWalk = true; });
  scene.add(inkAll(shadowAll(g), .013));
}
function buildFar(){
  buildFarBridge();                                              // 海的另一端：照真實比例的鄰島（兩站共用；外觀依 FARB.style），點了或走過去就切到對面網站
  var H = FARB.style === 'harbor', g = new T3.Group(), cx = FARB.c[0], cz = FARB.c[1];
  function slab(off, depth, color, y){                            // 依輪廓擠出一塊地（頂面在 y）
    var sh = new T3.Shape(); farOutline(off, 96).forEach(function(q, i){ var x = q[0] - cx, z = q[1] - cz; if (i) sh.lineTo(x, z); else sh.moveTo(x, z); });
    var geo = new T3.ExtrudeGeometry(sh, {depth:depth, bevelEnabled:false, curveSegments:1}); geo.rotateX(Math.PI / 2);
    var m = new T3.Mesh(geo, std(color)); m.position.set(cx, y, cz); g.add(m); return m;
  }
  slab(H ? .05 : .4, 2.4, H ? '#9a8f7c' : '#f3d798', LAND - .02);
  slab(H ? -.3 : -.05, .1, H ? '#93c25e' : '#9edb6f', LAND + .06);
  var M = {}; function mat(c){ return M[c] || (M[c] = std(c)); }
  FAR_THINGS.forEach(function(o){
    var y = LAND + .06, s = o.s;
    if (o.k === 'w'){ var h = o.h * HK * .8; mesh(new T3.BoxGeometry(s * 2, h, s * 2), mat('#f2e2c4'), o.x, y + h / 2, o.y, g); var gr = gable(s * 2.15, s * 2.15, .3, mat(o.c < .33 ? '#5f9e8f' : '#cf6a3f')); gr.position.set(o.x, y + h, o.y); g.add(gr); mesh(new T3.BoxGeometry(s * .8, .26, .02), mat('#f4e3c4'), o.x, y + .14, o.y + s + .01, g); }
    else if (o.k === 'c'){ var c1 = FAR_COL.box[Math.floor(o.c * 7)], c2 = FAR_COL.box[Math.floor(o.c * 7 + 3) % 7]; mesh(new T3.BoxGeometry(s * 2, .3, s * 1.5), mat(c1), o.x, y + .15, o.y, g); mesh(new T3.BoxGeometry(s * 1.8, .3, s * 1.4), mat(c2), o.x + .05, y + .45, o.y, g); }
    else if (o.k === 'p'){ mesh(new T3.CylinderGeometry(.028, .045, .8, 6), mat('#8a6a48'), o.x, y + .4, o.y, g); for (var i = 0; i < 6; i++){ var f = mesh(new T3.ConeGeometry(.06, .5, 4), mat('#4fae55'), o.x, y + .82, o.y, g); f.rotation.set(0, i, -1.95); } }
    else if (o.k === 'k'){ var cr = new T3.Group(); cr.position.set(o.x, y, o.y); g.add(cr);
      [[-.22, -.22], [.22, -.22], [-.22, .22], [.22, .22]].forEach(function(p){ mesh(new T3.BoxGeometry(.05, 1.4, .05), mat('#d9533b'), p[0], .7, p[1], cr); });
      mesh(new T3.BoxGeometry(.5, .06, .5), mat('#d9533b'), 0, 1.4, 0, cr); var bm = mesh(new T3.BoxGeometry(1.3, .05, .06), mat('#d9533b'), .35, 1.85, 0, cr); bm.rotation.z = 1.15; cr.rotation.y = Math.atan2(o.x - cx, o.y - cz); }
    else if (o.k === 'h'){ var hh = o.h * HK; mesh(new T3.BoxGeometry(s * 2, hh, s * 2), mat('#f3ead9'), o.x, y + hh / 2, o.y, g); var rf = pyramid(s * 2.3, .5, mat(FAR_COL.roof[Math.floor(o.c * 6)])); rf.position.set(o.x, y + hh, o.y); g.add(rf); }
    else if (o.k === 't'){ if (o.c > .5){ mesh(new T3.ConeGeometry(.24, .62, 9), mat('#4f9a5a'), o.x, y + .4, o.y, g); }
      else { mesh(new T3.CylinderGeometry(.035, .05, .26, 7), mat('#9a6a3f'), o.x, y + .13, o.y, g); mesh(new T3.IcosahedronGeometry(.24, 1), mat(FAR_COL.leaf[o.c < .08 ? 3 : Math.floor(o.c * 3)]), o.x, y + .45, o.y, g); } }
    else if (o.k === 'L'){ mesh(new T3.CylinderGeometry(.13, .19, 1.3, 14), mat('#faf4e8'), o.x, y + .65, o.y, g); mesh(new T3.CylinderGeometry(.15, .17, .16, 14), mat('#e05a47'), o.x, y + .5, o.y, g); mesh(new T3.ConeGeometry(.19, .3, 14), mat('#e05a47'), o.x, y + 1.5, o.y, g); mesh(new T3.SphereGeometry(.1, 12, 10), glow('#ffe08a', .5, 2), o.x, y + 1.32, o.y, g); }
    else if (o.k === 'T'){
      if (H){ mesh(new T3.BoxGeometry(1.4, 2.3, 1.4), mat('#f2e2c4'), o.x, y + 1.15, o.y, g); mesh(new T3.BoxGeometry(.9, 3.2, .9), mat('#55697a'), o.x, y + 1.6, o.y, g); mesh(new T3.CylinderGeometry(.02, .02, 1, 6), mat('#3b2f3a'), o.x, y + 3.7, o.y, g); mesh(new T3.SphereGeometry(.09, 10, 8), glow('#ff6f59', .6, 2.2), o.x, y + 4.2, o.y, g); }
      else { mesh(new T3.BoxGeometry(1.2, 2.7, 1.2), mat('#f3ead9'), o.x, y + 1.35, o.y, g); var sp = pyramid(1.4, 1.2, mat('#ff6f59')); sp.position.set(o.x, y + 2.7, o.y); g.add(sp); mesh(new T3.SphereGeometry(.08, 10, 8), glow('#ffe08a', .5, 2.2), o.x, y + 4, o.y, g); }
    }
  });
  g.traverse(function(m){ if (m.isMesh){ m.userData.id = '__far'; O.pick.push(m); } });
  scene.add(inkAll(shadowAll(g), .012));
  farLabel(FAR.sign, 2.1);
}
function farLabel(text, y){
  var d = document.createElement('button'); d.type = 'button'; d.className = 'tag3 board3'; d.textContent = text; d.title = '點一下前往' + FAR.name;
  d.addEventListener('click', function(e){ e.stopPropagation(); farGoClick(); }); d.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
  labRoot.appendChild(d); O.zoneTags.push({el:d, x:FAR.at[0], z:FAR.at[1], y:LAND + y});
}
// 智者梅林（立體）：紫色星星長袍、尖帽、白鬍子、手杖頂端發光水晶；會轉身面向你，點他就開問答（index.html openMerlin）
function buildMerlin(){
  var x0 = MERLIN_AT[0], z0 = MERLIN_AT[1], g = new T3.Group(); g.position.set(x0, landY(x0, z0) - .01, z0); scene.add(g);
  var body = new T3.Group(); g.add(body);
  var robe = std('#5b3fc4'), robe2 = std('#4a32a8'), gold = std('#f7c948', {emissive:'#f7c948', emissiveIntensity:.18}), skin = std('#f6d2b8'), beardM = std('#fbfaff'), wood = std('#8a5a2b');
  mesh(new T3.CylinderGeometry(.13, .27, .56, 24), robe, 0, .28, 0, body);                          // 長袍
  mesh(new T3.TorusGeometry(.268, .022, 8, 32), gold, 0, .025, 0, body).rotation.x = Math.PI / 2;     // 下擺金邊
  mesh(new T3.CylinderGeometry(.188, .192, .045, 24), gold, 0, .36, 0, body);                        // 腰帶
  for (var i = 0; i < 9; i++){                                                                     // 袍子上的小星星
    var a = i * 2.4 + .3, y = .08 + (i % 3) * .1 + (i * .013), r = .27 - .14 * (y / .56) + .006;
    var st = mesh(new T3.OctahedronGeometry(.024, 0), gold, Math.sin(a) * r, y, Math.cos(a) * r, body); st.userData.noInk = true;
  }
  [-1, 1].forEach(function(s){                                                                     // 袖子＋手
    var sl = mesh(new T3.CylinderGeometry(.05, .085, .27, 12), robe2, s * .17, .42, .05, body); sl.rotation.z = s * .55; sl.rotation.x = -.35;
    mesh(new T3.SphereGeometry(.045, 12, 10), skin, s * .245, .33, .12, body);
  });
  mesh(new T3.SphereGeometry(.12, 22, 18), skin, 0, .67, 0, body);                                   // 頭
  var beard = mesh(new T3.ConeGeometry(.105, .34, 18), beardM, 0, .5, .07, body); beard.rotation.x = Math.PI + .25;   // 長白鬍子
  mesh(new T3.SphereGeometry(.07, 14, 10), beardM, 0, .62, .085, body).scale.set(1.4, .55, .8);       // 八字鬍
  mesh(new T3.SphereGeometry(.028, 10, 8), std('#eab49a'), 0, .665, .118, body);                     // 鼻子
  [-1, 1].forEach(function(s){
    var e = mesh(new T3.CapsuleGeometry(.011, .03, 4, 8), flatM('#3b2f3a'), s * .045, .7, .105, body); e.rotation.z = Math.PI / 2; e.userData.noInk = true;   // 瞇瞇眼
    var br = mesh(new T3.CapsuleGeometry(.016, .05, 4, 8), beardM, s * .05, .735, .1, body); br.rotation.z = Math.PI / 2 + s * .25;                       // 白眉毛
  });
  var hat = new T3.Group(); hat.position.y = .76; body.add(hat);
  mesh(new T3.CylinderGeometry(.215, .215, .028, 28), robe2, 0, 0, 0, hat);                         // 帽簷
  var cone = mesh(new T3.ConeGeometry(.135, .46, 22), robe, 0, .23, -.02, hat); cone.rotation.x = -.22;
  mesh(new T3.TorusGeometry(.128, .02, 8, 26), gold, 0, .035, 0, hat).rotation.x = Math.PI / 2;     // 帽帶
  var hs = mesh(new T3.OctahedronGeometry(.04, 0), gold, 0, .17, .09, hat); hs.userData.noInk = true;
  var staff = new T3.Group(); staff.position.set(.27, 0, .1); body.add(staff);                      // 手杖＋水晶
  mesh(new T3.CylinderGeometry(.017, .022, 1.08, 8), wood, 0, .54, 0, staff);
  mesh(new T3.TorusGeometry(.05, .014, 6, 14), wood, 0, 1.1, 0, staff);
  var orb = mesh(new T3.SphereGeometry(.065, 18, 14), glow('#9fe8ff', .7, 2.2), 0, 1.15, 0, staff); orb.userData.noInk = true;
  var halo = new T3.Sprite(new T3.SpriteMaterial({map:glowTex('rgba(190,240,255,.9)', 'rgba(150,120,255,0)'), transparent:true, depthWrite:false, blending:T3.AdditiveBlending}));
  halo.scale.set(.42, .42, 1); halo.position.y = 1.15; halo.raycast = noPick; staff.add(halo);
  g.scale.setScalar(1.15);
  inkAll(shadowAll(g), .01);
  g.traverse(function(m){ if (m.isMesh && !m.userData.ink){ m.userData.id = '__merlin'; O.pick.push(m); } });
  var ring = mesh(new T3.RingGeometry(.36, .43, 40), new T3.MeshBasicMaterial({color:'#9b7bff', transparent:true, opacity:.75, depthWrite:false}), x0, landY(x0, z0) + .03, z0);   // 腳下脈動光圈
  ring.rotation.x = -Math.PI / 2; ring.raycast = noPick; scene.add(ring);
  O.merlin = {g:g};
  O.anim.push(function(tm, dt){                                   // 位置由 index.html 的 merlinMove() 模擬，這裡只負責畫
    var gy0 = standY(merlin.gx, merlin.gy) - .01;
    g.position.set(merlin.gx, gy0, merlin.gy); ring.position.set(merlin.gx, gy0 + .04, merlin.gy);
    var want = merlin.moving ? Math.atan2(merlin.dirX, merlin.dirY) : Math.atan2(walker.gx - merlin.gx, walker.gy - merlin.gy), d = want - g.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * Math.min(1, (dt || .016) * (merlin.moving ? 6 : 3));
    if (merlin.moving){ body.position.y = Math.abs(Math.sin(merlin.phase)) * .045; body.rotation.z = Math.sin(merlin.phase) * .06; staff.rotation.x = Math.sin(merlin.phase) * .15; }
    else { body.position.y = Math.sin(tm * 1.6) * .012; body.rotation.z = Math.sin(tm * .8) * .025; staff.rotation.x *= .9; }
    orb.scale.setScalar(1 + Math.sin(tm * 3) * .12); halo.material.opacity = .6 + Math.sin(tm * 3) * .3;
    hs.rotation.y = tm * 2;
    var k = 1 + (Math.sin(tm * 3.2) * .5 + .5) * .22; ring.scale.set(k, k, 1); ring.material.opacity = .85 - (k - 1) * 2.4;
  });
}
function buildZoneMarks(){
  O.glows = O.glows || []; O.markSpots = [[MERLIN_AT[0], MERLIN_AT[1], .7]];   // 梅林的位置先占好，地標、樹、花都會讓開
  var hub = zoneById.hub, gates = [];
  ZONES.forEach(function(z){
    if (z.id === 'hub') return;
    // 入口拱門：場地中心往指揮塔方向，和地塊邊界的交點（就是道路出口）
    var dx = hub.cx - z.cx, dy = hub.cy - z.cy, b = z.box;
    var tx = dx ? ((dx > 0 ? b[2] : b[0]) - z.cx) / dx : 1e9, ty = dy ? ((dy > 0 ? b[3] : b[1]) - z.cy) / dy : 1e9, t = Math.min(tx, ty);
    var gx = z.cx + dx * t, gy = z.cy + dy * t, gate = new T3.Group();
    gate.position.set(gx, Math.min(landY(gx - .5, gy), landY(gx + .5, gy), landY(gx, gy)) - .03, gy); gate.rotation.y = Math.atan2(dx, dy);
    var postM = std(hexMix(z.color, '#ffffff', .2)), beamM = std(hexMix(z.color, '#14303d', .3));
    [-1, 1].forEach(function(s){
      mesh(new T3.CylinderGeometry(.045, .055, 1.05, 10), postM, s * .52, .52, 0, gate);
      mesh(new T3.SphereGeometry(.06, 12, 10), O.bulbMat, s * .52, 1.1, 0, gate);
    });
    mesh(new T3.BoxGeometry(1.3, .08, .1), beamM, 0, .98, 0, gate);
    var tex = signTex(z), sm = std('#ffffff', {map:tex});
    mesh(new T3.BoxGeometry(1.0, .34, .05), beamM, 0, 1.22, 0, gate);
    var f1 = mesh(new T3.PlaneGeometry(.96, .33), sm, 0, 1.22, .027, gate), f2 = mesh(new T3.PlaneGeometry(.96, .33), sm, 0, 1.22, -.027, gate);
    f2.rotation.y = Math.PI; f1.userData.noInk = f2.userData.noInk = true;
    scene.add(inkAll(shadowAll(gate), .012));
    gates.push([gx, gy]);
    [-1, 1].forEach(function(s){ var c = Math.cos(gate.rotation.y), sn = Math.sin(gate.rotation.y); blockWalk(gx + s * .52 * c, gy - s * .52 * sn, .12); });
    // 地標
    var mk = MARKS[z.id]; if (!mk) return;
    var spot = z.id === 'calc' ? {at:BOARD_AT, room:.55} : z.id === 'play' ? {at:PLAY_WHEEL, room:.35} : freeSpot(z, gates); if (!spot.at || spot.room < .05) return;   // 看板位置固定，平面地圖和小地圖才對得上
    var g = new T3.Group(); scene.add(g);
    var r = mk(g, z), k = Math.max(1.1, Math.min(2.1, (spot.room + .2) / r));
    g.scale.setScalar(k); g.position.set(spot.at[0], landY(spot.at[0], spot.at[1]) - .01, spot.at[1]);
    g.rotation.y = Math.atan2(C[0] - spot.at[0], C[1] - spot.at[1]) - Math.PI / 2 + (z.id === 'calc' || z.id === 'ops' || z.id === 'play' ? Math.PI / 2 : 0);
    if (z.id === 'idea') g.rotation.y = 0;
    inkAll(shadowAll(g), .012);
    if (g.userData.board) g.traverse(function(m){ if (m.isMesh && !m.userData.ink){ m.userData.id = '__board'; O.pick.push(m); } });
    O.markSpots.push([spot.at[0], spot.at[1], r * k + .25]);
    blockWalk(spot.at[0], spot.at[1], r * k * .85);
  });
  // 品牌商店街：街道上方掛三角旗
  var bz = zoneById.brand, FLG = ['#ff6f91', '#ffd23f', '#4f9dff', '#6fcf5a', '#ffffff', '#c7a6ff'];
  var tri = new T3.Shape(); tri.moveTo(-.05, 0); tri.lineTo(.05, 0); tri.lineTo(0, -.1); tri.lineTo(-.05, 0);
  var tg = new T3.ShapeGeometry(tri);
  for (var gy = bz.box[1] + .6; gy < bz.box[3] - .3; gy += 1.1){
    var sx = bz.cx, y0 = landY(sx, gy) + .95;
    [sx - .55, sx + .55].forEach(function(x){ var pole = mesh(new T3.CylinderGeometry(.015, .015, 1, 6), std('#3c4a52'), x, y0 - .45, gy); pole.castShadow = true; scene.add(pole); });
    for (var i = 0; i <= 10; i++){
      var u = i / 10, x = sx - .55 + u * 1.1, sag = Math.sin(u * Math.PI) * .12;
      var f = mesh(tg, std(FLG[i % FLG.length], {side:T3.DoubleSide}), x, y0 - sag, gy); scene.add(f);
    }
    var line = mesh(new T3.CylinderGeometry(.004, .004, 1.12, 4), std('#3b2f3a'), sx, y0 - .06, gy); line.rotation.z = Math.PI / 2; scene.add(line);
  }
  // 指揮塔：繞塔旋轉的光環
  var sp = O.blds['content-workflow-studio-cf'];
  if (sp){
    O.rings = [];
    [[.45, '#ff6f59', .7], [.85, '#2ec4b6', -.5], [1.25, '#ffd23f', .35]].forEach(function(q){
      var ring = mesh(new T3.TorusGeometry(.5 - q[0] * .1, .018, 8, 40), glow(q[1], .6, 1.8), sp.t.gx, sp.base + q[0] * 2.2, sp.t.gy);
      ring.rotation.x = Math.PI / 2 + .25; ring.userData.sp = q[2]; ring.raycast = noPick; scene.add(ring); O.rings.push(ring);
    });
    O.anim.push(function(tm){ O.rings.forEach(function(r2, i){ r2.rotation.z = tm * r2.userData.sp; r2.rotation.x = Math.PI / 2 + Math.sin(tm * .7 + i) * .25; }); });
  }
}

function mergeGeo(list){                          // 簡易合併（全部轉成非索引）
  var pos = [], nor = [];
  list.forEach(function(g){ g = g.index ? g.toNonIndexed() : g; pos.push.apply(pos, g.attributes.position.array); nor.push.apply(nor, g.attributes.normal.array); });
  var out = new T3.BufferGeometry(); out.setAttribute('position', new T3.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new T3.Float32BufferAttribute(nor, 3));
  return out;
}
function blob(r, x, y, z){ var g = new T3.IcosahedronGeometry(r, 2); g.translate(x, y, z); return g; }
function buildTrees(){
  var list = (L.trees || []).filter(function(t){ return landY(t.gx, t.gy) > SEA + .15 && !O.markSpots.some(function(m){ return Math.hypot(t.gx - m[0], t.gy - m[1]) < m[2]; }); });
  var trunkG = new T3.CylinderGeometry(.035, .05, .26, 7); trunkG.translate(0, .13, 0);
  var roundG = mergeGeo([blob(.2, 0, .44, 0), blob(.15, .13, .36, .04), blob(.14, -.12, .37, -.03), blob(.13, .02, .6, -.02)]);
  var c1 = new T3.ConeGeometry(.22, .36, 9); c1.translate(0, .38, 0);
  var c2 = new T3.ConeGeometry(.16, .3, 9); c2.translate(0, .6, 0);
  var pineG = mergeGeo([c1, c2]);
  var pines = list.filter(function(t){ return hash(t.gx.toFixed(2) + t.gy.toFixed(2)) % 3 === 0; }), rounds = list.filter(function(t){ return pines.indexOf(t) < 0; });
  var trunk = new T3.InstancedMesh(trunkG, std('#9a6a3f'), list.length);
  var pineM = new T3.InstancedMesh(pineG, std('#ffffff'), pines.length);
  var roundM = new T3.InstancedMesh(roundG, std('#ffffff'), rounds.length);
  var m = new T3.Matrix4(), q = new T3.Quaternion(), s = new T3.Vector3(), p = new T3.Vector3(), c = new T3.Color(), e = new T3.Euler();
  function place(t, k){ var sc = (t.big ? 1.3 : 1) * k; e.set(0, (t.gx * 7 + t.gy * 3) % 6.28, 0); q.setFromEuler(e); s.set(sc, sc, sc); p.set(t.gx, landY(t.gx, t.gy) - .02, t.gy); m.compose(p, q, s); return m; }
  list.forEach(function(t, i){ trunk.setMatrixAt(i, place(t, 1)); });
  var LEAF = ['#5cc45a', '#48b354', '#7ed35f', '#3fa65c', '#93db6a', '#f2a7c3'];   // 偶爾一棵櫻花
  pines.forEach(function(t, i){ pineM.setMatrixAt(i, place(t, 1)); pineM.setColorAt(i, c.set(LEAF[hash(i + 'p') % 4])); });
  rounds.forEach(function(t, i){ roundM.setMatrixAt(i, place(t, .95)); roundM.setColorAt(i, c.set(LEAF[hash(i + 'r') % 11 === 0 ? 5 : hash(i + 'r') % 5])); });
  [trunk, pineM, roundM].forEach(function(o){ o.castShadow = true; o.receiveShadow = true; scene.add(o); inkMesh(o, .014); });
  // 記下每棵樹在哪個 InstancedMesh 的第幾個，擋到視線時暫時縮成 0
  O.trees = list.map(function(t, i){
    var isPine = pines.indexOf(t) >= 0, mesh = isPine ? pineM : roundM, k = isPine ? pines.indexOf(t) : rounds.indexOf(t);
    var a = new T3.Matrix4(), b = new T3.Matrix4(); trunk.getMatrixAt(i, a); mesh.getMatrixAt(k, b);
    return {gx:t.gx, gy:t.gy, y:landY(t.gx, t.gy), parts:[[trunk, i, a], [mesh, k, b]], hidden:false};
  });
}
function buildFlowers(){
  var pts = [], r = rng(7), tries = 0;
  while (pts.length < 520 && tries++ < 9000){
    var a = r() * Math.PI * 2, d = Math.sqrt(r()) * 12 * SPREAD, gx = C[0] + Math.cos(a) * d, gy = C[1] + Math.sin(a) * d;
    if (edgeD(gx, gy) > -.8 || landY(gx, gy) < LAND - .05 || riverDist(gx, gy) < 1.0 || minDist(ROAD_S, gx, gy) < .35) continue;
    var z = zoneOfPoint(gx, gy); if (z && z.id !== 'idea') continue;
    if (Math.hypot(gx - MERLIN_AT[0], gy - MERLIN_AT[1]) < .6) continue;
    if (TOOLS.some(function(t){ return Math.abs(gx - t.gx) < t.s + .2 && Math.abs(gy - t.gy) < t.s + .2; })) continue;
    pts.push([gx, gy]);
  }
  var g = new T3.IcosahedronGeometry(.02, 0), mesh = new T3.InstancedMesh(g, new T3.MeshBasicMaterial({color:'#ffffff'}), pts.length);
  var stem = new T3.Matrix4(), c = new T3.Color(), FL = ['#ff9ec4', '#ffe066', '#ffffff', '#c7a6ff', '#ff8f8f', '#ffd1e3'];
  pts.forEach(function(q, i){ stem.makeTranslation(q[0], landY(q[0], q[1]) + .018, q[1]); mesh.setMatrixAt(i, stem); mesh.setColorAt(i, c.set(FL[i % FL.length])); });
  scene.add(mesh);
}
function buildSkyStuff(){
  // 雲
  O.clouds = [];
  for (var i = 0; i < 7; i++){
    var g = new T3.Group(), cm = std('#ffffff', {transparent:true, opacity:.96});
    for (var k = 0; k < 7; k++){ var b = new T3.Mesh(new T3.IcosahedronGeometry(.45 + (k % 3) * .22, 2), cm); b.position.set((k - 3) * .45, Math.abs(3 - k) < 2 ? .25 : 0, Math.cos(k * 1.7) * .3); b.scale.y = .78; b.castShadow = true; g.add(b); }
    g.position.set(-8 + i * 5, 9 + (i % 3) * .9, -2 + ((i * 7) % 22));
    g.userData.sp = .25 + (i % 3) * .1; scene.add(g); O.clouds.push(g);
  }
  // 地平線的積雨雲（入道雲）：不受霧影響，遠遠就看得到
  O.farClouds = [];
  var fm = std('#ffffff', {fog:false});
  for (var fc = 0; fc < 11; fc++){
    var fgp = new T3.Group(), ang = fc / 11 * Math.PI * 2 + .3, rad = 72 + (fc % 3) * 8;
    for (var kk = 0; kk < 9; kk++){
      var bb = new T3.Mesh(new T3.IcosahedronGeometry(1, 2), fm), up = kk < 3 ? 0 : kk < 6 ? 1 : 2;
      var sz = (3.2 - up * .7) * (1 + (fc % 2) * .3);
      bb.scale.set(sz, sz * .85, sz); bb.position.set((kk % 3 - 1) * sz * 1.1 + up * .6, up * sz * 1.25, (kk % 2) * 1.2);
      fgp.add(bb);
    }
    fgp.position.set(C[0] + Math.cos(ang) * rad, -1.5, C[1] + Math.sin(ang) * rad); fgp.lookAt(C[0], -1.5, C[1]);
    scene.add(fgp); O.farClouds.push(fgp);
  }
  O.farMat = fm;
  // 星星
  var N = 500, sp = new Float32Array(N * 3);
  for (var j = 0; j < N; j++){ var a = Math.random() * Math.PI * 2, el2 = Math.random() * 1.3 + .1, r = 80; sp[j * 3] = C[0] + Math.cos(a) * Math.cos(el2) * r; sp[j * 3 + 1] = Math.sin(el2) * r; sp[j * 3 + 2] = C[1] + Math.sin(a) * Math.cos(el2) * r; }
  var sg = new T3.BufferGeometry(); sg.setAttribute('position', new T3.BufferAttribute(sp, 3));
  O.stars = new T3.Points(sg, new T3.PointsMaterial({color:'#ffffff', size:.45, transparent:true, opacity:0, depthWrite:false, fog:false}));
  scene.add(O.stars);
  // 螢火蟲（夜晚在公園與綠地）
  var NF = 70, fp = new Float32Array(NF * 3), seeds = [];
  for (var f = 0; f < NF; f++){ var G = f % 2 ? {at:spr([1.0, 9.6]), r:2.6 * SPREAD} : GREENS[0]; var a2 = Math.random() * 6.28, r2 = Math.sqrt(Math.random()) * G.r; seeds.push([G.at[0] + Math.cos(a2) * r2, G.at[1] + Math.sin(a2) * r2, Math.random() * 6.28]); }
  var fg = new T3.BufferGeometry(); fg.setAttribute('position', new T3.BufferAttribute(fp, 3));
  O.flies = new T3.Points(fg, new T3.PointsMaterial({color:'#e8ff8a', size:.09, transparent:true, opacity:0, depthWrite:false, blending:T3.AdditiveBlending}));
  scene.add(O.flies);
  O.anim.push(function(tm){
    if (O.flies.material.opacity < .02) return;
    for (var f = 0; f < NF; f++){ var s = seeds[f]; fp[f * 3] = s[0] + Math.sin(tm * .6 + s[2]) * .3; fp[f * 3 + 1] = landY(s[0], s[1]) + .35 + Math.sin(tm * 1.3 + s[2] * 2) * .15; fp[f * 3 + 2] = s[1] + Math.cos(tm * .5 + s[2]) * .3; }
    fg.attributes.position.needsUpdate = true;
  });
  // 小船
  O.boats = [{a:0, r:14.4 * SPREAD, s:.024}, {a:2.3, r:15.2 * SPREAD, s:-.018}, {a:4.4, r:14.8 * SPREAD, s:.02}].map(function(b){
    var g = new T3.Group(), hull = new T3.Mesh(new T3.BoxGeometry(.9, .2, .34), std('#ffffff')); hull.position.y = .1; g.add(hull);
    var sail = new T3.Mesh(new T3.ConeGeometry(.28, .8, 3), std('#ff6f59', {flatShading:true})); sail.scale.z = .15; sail.position.set(.05, .6, 0); g.add(sail);
    b.g = inkAll(shadowAll(g), .014); scene.add(g); return b;
  });
  // 海鷗
  O.birds = [];
  for (var bi = 0; bi < 6; bi++){
    var bg = new T3.Group(), wm = std('#ffffff', {side:T3.DoubleSide});
    var wl = new T3.Mesh(new T3.PlaneGeometry(.28, .08), wm), wr = wl.clone(); wl.geometry.translate(-.14, 0, 0); wr.geometry = wl.geometry.clone(); wr.geometry.translate(.28, 0, 0);
    wl.rotation.x = wr.rotation.x = -Math.PI / 2; var pl = new T3.Group(), pr = new T3.Group(); pl.add(wl); pr.add(wr); bg.add(pl); bg.add(pr);
    bg.userData = {pl:pl, pr:pr, a:bi * 1.05, r:(4 + (bi % 3) * 1.6) * SPREAD, y:4 + (bi % 2) * .9, sp:.25 + (bi % 3) * .05};
    scene.add(bg); O.birds.push(bg);
  }
}

/* ---------- 飛龍與史萊姆（立體）：位置讀 index.html 的 SLIMES／DRAGONS（平面 tick 在模擬），這裡只負責長相與姿勢 ---------- */
function buildSlime3(s){
  var g = new T3.Group(), b = new T3.Group(); g.add(b);
  var prof = [[0, 0], [.15, 0], [.175, .035], [.17, .09], [.14, .155], [.085, .205], [0, .225]].map(function(p){ return new T3.Vector2(p[0], p[1]); });
  var body = new T3.Mesh(new T3.LatheGeometry(prof, 22), std(s.c, {transparent:true, opacity:.9})); b.add(body);
  var ink = new T3.Group(); ink.add(body); b.add(ink); inkAll(ink, .008);
  var eyeM = std('#2a2230'), whiteM = new T3.MeshBasicMaterial({color:'#ffffff'}), blushM = new T3.MeshBasicMaterial({color:'#ff8fa3', transparent:true, opacity:.6});
  var eyes = new T3.Group(); b.add(eyes);
  [-1, 1].forEach(function(sd){
    var e = new T3.Mesh(new T3.SphereGeometry(.022, 10, 8), eyeM); e.scale.set(.6, 1.35, 1); e.position.set(.142, .115, sd * .048); eyes.add(e);
    var gl = new T3.Mesh(new T3.SphereGeometry(.008, 6, 4), whiteM); gl.position.set(.152, .128, sd * .044); eyes.add(gl);
    var bl = new T3.Mesh(new T3.SphereGeometry(.02, 8, 6), blushM); bl.scale.set(.3, .5, 1); bl.position.set(.15, .075, sd * .085); b.add(bl);
  });
  var hl = new T3.Mesh(new T3.SphereGeometry(.03, 8, 6), new T3.MeshBasicMaterial({color:'#ffffff', transparent:true, opacity:.8}));
  hl.scale.set(1, .6, 1.5); hl.position.set(.02, .19, -.06); b.add(hl);
  body.castShadow = true;
  g.scale.setScalar(s.size * 1.25);
  g.userData = {b:b, eyes:eyes};
  scene.add(g); return g;
}
// 卡通飛龍（立體）：大頭大眼、圓胖身體＋條紋肚皮、彎角＋耳鰭、兩段式蝙蝠翼（翼骨＋翼膜，外段會跟著捲）、9 節圓滾尾巴＋黑桃尾尖
function dShape(pts){                                  // [[x,y], ['q',cx,cy,x,y], ...] → Shape
  var sh = new T3.Shape(); sh.moveTo(pts[0][0], pts[0][1]);
  for (var i = 1; i < pts.length; i++){ var p = pts[i]; if (p[0] === 'q') sh.quadraticCurveTo(p[1], p[2], p[3], p[4]); else sh.lineTo(p[0], p[1]); }
  return sh;
}
function dFlat(sh, side, mat){                         // 形狀平面 (x,y) → 水平 (x,z)，翼展朝 side 那一側
  var geo = new T3.ShapeGeometry(sh, 8); geo.rotateX(Math.PI / 2); if (side < 0) geo.scale(1, 1, -1);
  var m = new T3.Mesh(geo, mat); m.castShadow = true; m.userData.noInk = true; return m;
}
function dBone(a, b, r0, r1, mat){                     // 從 a 到 b 的圓錐骨頭（有描邊）
  var len = a.distanceTo(b), m = new T3.Mesh(new T3.CylinderGeometry(r1, r0, len, 7), mat);
  m.position.copy(a).add(b).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new T3.Vector3(0, 1, 0), b.clone().sub(a).normalize()); return m;
}
function dragonWing(lk, side){
  var mem = std(lk.wing, {side:T3.DoubleSide}), bone = std(lk.wingDark), claw = std(lk.horn);
  var V = function(x, z){ return new T3.Vector3(x, 0, z * side); };
  var piv = new T3.Group(), outer = new T3.Group();
  // 內段：肩膀→手肘，後緣兩道弧
  piv.add(dFlat(dShape([[0, 0], [.14, .55], [-.34, .55], ['q', -.26, .36, -.4, .24], ['q', -.28, .12, -.32, 0], [0, 0]]), side, mem));
  piv.add(dBone(V(0, 0), V(.14, .55), .045, .035, bone));
  var elbow = new T3.Mesh(new T3.SphereGeometry(.04, 10, 8), bone); elbow.position.copy(V(.14, .55)); piv.add(elbow);
  outer.position.copy(V(.14, .55)); piv.add(outer);
  // 外段（以手肘為原點）：前臂→手腕，三根指骨撐開翼膜，指尖之間是扇貝形缺口
  var W = [.06, .42], tips = [[-.22, .92], [-.5, .66], [-.56, .28]];
  outer.add(dFlat(dShape([[0, 0], W, tips[0], ['q', -.27, .66, tips[1][0], tips[1][1]], ['q', -.42, .44, tips[2][0], tips[2][1]], ['q', -.42, .12, -.48, 0], [0, 0]]), side, mem));
  outer.add(dBone(V(0, 0), V(W[0], W[1]), .035, .028, bone));
  var wrist = new T3.Mesh(new T3.SphereGeometry(.032, 10, 8), bone); wrist.position.copy(V(W[0], W[1])); outer.add(wrist);
  tips.forEach(function(t){ outer.add(dBone(V(W[0], W[1]), V(t[0], t[1]), .024, .008, bone)); });
  var thumb = new T3.Mesh(new T3.ConeGeometry(.022, .09, 6), claw); thumb.position.copy(V(W[0] + .04, W[1] + .02)); thumb.rotation.z = -1.2; outer.add(thumb);
  inkAll(piv, .01);
  piv.userData.outer = outer;
  return piv;
}
function buildDragon3(D){
  var lk = D.lk, g = new T3.Group(), body = new T3.Group(); g.add(body); g.rotation.order = 'YXZ';
  var bm = std(lk.body), belly = std(lk.belly), bellyLine = std(hexMix(lk.belly, lk.body, .45)), horn = std(lk.horn), fin = std(lk.wing, {side:T3.DoubleSide}), dark = std('#2a2230');
  var white = new T3.MeshBasicMaterial({color:'#ffffff'});
  function ball(r, x, y, z, sx, sy, sz, m, parent){ var o = new T3.Mesh(new T3.SphereGeometry(r, 18, 14), m || bm); o.position.set(x, y, z); o.scale.set(sx || 1, sy || 1, sz || 1); (parent || body).add(o); return o; }
  // 身體：圓胖，肚皮一圈一圈的條紋
  ball(.27, 0, 0, 0, 1.3, .95, .95);
  ball(.24, .05, -.08, 0, 1.2, .8, .82, belly);
  [-.14, -.03, .08, .18].forEach(function(x){
    var k = Math.sqrt(Math.max(.05, 1 - Math.pow((x - .05) / .3, 2))), st = new T3.Mesh(new T3.TorusGeometry(.19 * k, .009, 5, 18, Math.PI), bellyLine);
    st.rotation.set(Math.PI, Math.PI / 2, 0); st.position.set(x, -.075, 0); st.scale.set(1, .98, 1.05); st.userData.noInk = true; body.add(st);
  });
  // 脖子：三顆球接到頭
  [[.27, .13, .16], [.38, .24, .14], [.47, .33, .125]].forEach(function(p){ ball(p[2], p[0], p[1], 0); });
  ball(.1, .38, .16, 0, 1, 1, .9, belly);
  // 頭：大頭、圓鼻子、大眼睛、彎角、耳鰭
  var head = new T3.Group(); head.position.set(.6, .44, 0); body.add(head);
  ball(.2, 0, 0, 0, 1.08, .95, 1, bm, head);
  ball(.14, .19, -.05, 0, 1.2, .75, .9, bm, head);
  ball(.1, .2, -.1, 0, 1.15, .45, .8, belly, head);
  var smile = new T3.Mesh(new T3.TorusGeometry(.07, .008, 6, 16, Math.PI * .8), dark); smile.position.set(.25, -.07, 0); smile.rotation.set(Math.PI / 2, 0, Math.PI * 1.1); smile.rotation.order = 'ZXY'; smile.userData.noInk = true; head.add(smile);
  [-1, 1].forEach(function(sd){
    var ns = ball(.016, .34, -.02, sd * .045, 1, 1, 1, dark, head); ns.userData.noInk = true;
    var ew = ball(.07, .1, .06, sd * .115, .75, 1, .9, white, head);
    var pu = ball(.042, .145, .06, sd * .135, .7, 1, .9, dark, head); pu.userData.noInk = true;
    var gl = ball(.014, .17, .085, sd * .14, 1, 1, 1, white, head); gl.userData.noInk = true;
    var brow = new T3.Mesh(new T3.CapsuleGeometry(.018, .07, 4, 8), bm); brow.position.set(.1, .135, sd * .1); brow.rotation.set(sd * .3, 0, 1.75); head.add(brow);
    var h1 = new T3.Group(); h1.position.set(-.06, .14, sd * .08); h1.rotation.set(sd * -.35, 0, .85); head.add(h1);       // 彎角：兩節，越往後越細並往上翹
    var hc = new T3.Mesh(new T3.CylinderGeometry(.026, .038, .14, 8), horn); hc.position.y = .07; h1.add(hc);
    var h2 = new T3.Group(); h2.position.y = .14; h2.rotation.z = -.55; h1.add(h2);
    var ht = new T3.Mesh(new T3.ConeGeometry(.026, .14, 8), horn); ht.position.y = .07; h2.add(ht);
    var ear = dFlat(dShape([[0, 0], [-.16, .06], ['q', -.1, .1, -.17, .16], ['q', -.06, .14, 0, .06], [0, 0]]), sd, fin);     // 耳鰭
    ear.position.set(-.1, .03, sd * .15); ear.rotation.x = sd * .5; head.add(ear);
    var ch = ball(.03, .2, -.02, sd * .115, .4, .6, 1, new T3.MeshBasicMaterial({color:'#ff8fa3', transparent:true, opacity:.55}), head); ch.userData.noInk = true;
    // 前腳（縮在胸前）＋後腳（往後伸）
    ball(.06, .2, -.17, sd * .12);
    body.add(dBone(new T3.Vector3(.2, -.17, sd * .12), new T3.Vector3(.3, -.25, sd * .1), .04, .03, bm));
    for (var c = 0; c < 3; c++){ var cl = new T3.Mesh(new T3.ConeGeometry(.012, .04, 5), horn); cl.position.set(.32, -.27, sd * (.08 + c * .02)); cl.rotation.z = Math.PI * .75; body.add(cl); }
    ball(.11, -.18, -.12, sd * .15, 1.2, 1, .9);
    body.add(dBone(new T3.Vector3(-.2, -.17, sd * .15), new T3.Vector3(-.36, -.24, sd * .14), .05, .035, bm));
    ball(.045, -.39, -.25, sd * .14, 1.5, .7, 1);
    for (var c2 = 0; c2 < 3; c2++){ var cl2 = new T3.Mesh(new T3.ConeGeometry(.013, .045, 5), horn); cl2.position.set(-.45, -.26, sd * (.12 + c2 * .02)); cl2.rotation.z = Math.PI / 2; body.add(cl2); }
  });
  // 背刺：從頭頂一路到背
  [[.48, .64, .05], [.41, .5, .05], [.31, .4, .055], [.16, .3, .06], [0, .29, .06], [-.16, .26, .055], [-.3, .2, .05]].forEach(function(p){
    var s = new T3.Mesh(new T3.ConeGeometry(p[2] * .7, p[2] * 1.6, 6), std(lk.wingDark)); s.position.set(p[0], p[1], 0); s.rotation.z = .25; body.add(s);
  });
  // 尾巴：9 顆漸小的球一節套一節，靜止姿勢是往下再往上捲的 S 形；擺動在 syncCreatures
  var segs = [], parent = body, r = .14;
  for (var i = 0; i < 9; i++){
    var seg = new T3.Group(); seg.position.set(i ? -r * 1.25 : -.33, i ? 0 : -.04, 0); seg.userData.rz = [.18, .12, .05, -.05, -.12, -.16, -.2, -.22, -.2][i]; seg.rotation.z = seg.userData.rz; parent.add(seg);
    var nr = r * .86; ball(nr, -nr * .6, 0, 0, 1.2, 1, 1, bm, seg);
    if (i < 8 && i % 2 === 0){ var ts = new T3.Mesh(new T3.ConeGeometry(nr * .35, nr * .8, 5), std(lk.wingDark)); ts.position.set(-nr * .6, nr * .95, 0); ts.rotation.z = .3; seg.add(ts); }
    segs.push(seg); parent = seg; r = nr;
  }
  var sp = new T3.Mesh(new T3.ExtrudeGeometry(dShape([[0, 0], [-.1, .1], ['q', -.14, .04, -.24, 0], ['q', -.14, -.04, -.1, -.1], [0, 0]]), {depth:.025, bevelEnabled:true, bevelThickness:.012, bevelSize:.012, bevelSegments:2}), std(lk.wingDark));
  sp.geometry.translate(0, 0, -.0125); sp.position.x = -r * 1.1; parent.add(sp);
  inkAll(body, .011);
  // 翅膀：肩膀在背上，比身體大很多
  var wl = dragonWing(lk, 1), wr = dragonWing(lk, -1); wl.position.set(.08, .2, .12); wr.position.set(.08, .2, -.12); wl.scale.setScalar(1.3); wr.scale.setScalar(1.3); g.add(wl); g.add(wr);
  // 噴火
  var fire = new T3.Mesh(new T3.ConeGeometry(.12, .7, 12, 1, true), new T3.MeshBasicMaterial({color:'#ff7a2b', transparent:true, opacity:.85, blending:T3.AdditiveBlending, depthWrite:false, side:T3.DoubleSide}));
  fire.rotation.z = Math.PI / 2; fire.position.set(.68, -.06, 0); fire.visible = false; head.add(fire);
  var core = new T3.Mesh(new T3.ConeGeometry(.06, .42, 10, 1, true), new T3.MeshBasicMaterial({color:'#fff1a8', transparent:true, opacity:.9, blending:T3.AdditiveBlending, depthWrite:false, side:T3.DoubleSide}));
  core.position.y = .12; fire.add(core);
  shadowAll(g);
  g.scale.setScalar(lk.size * 1.55);
  g.userData = {wl:wl, wr:wr, segs:segs, fire:fire, head:head};
  scene.add(g); return g;
}
function syncCreatures(){
  if (typeof SLIMES === 'undefined' || !SLIMES.length) return;
  if (!O.slimes){ O.slimes = SLIMES.map(buildSlime3); O.dragons = DRAGONS.map(buildDragon3); }
  SLIMES.forEach(function(s, i){
    var g = O.slimes[i], u = g.userData, sy = s.sq, sx = 1 + (1 - sy) * .9;
    g.position.set(s.gx, standY(s.gx, s.gy) + s.h * .7, s.gy);
    g.rotation.y = -s.ang;
    u.b.scale.set(sx, sy, sx);
    u.eyes.scale.y = ((tm + s.ph) % 4.3) < .13 ? .15 : 1;
  });
  DRAGONS.forEach(function(D, i){
    var g = O.dragons[i], u = g.userData;
    g.position.set(D.gx, LAND + D.y, D.gy);
    g.rotation.y = -D.hd;
    g.rotation.x = (D.sp > 0 ? -1 : 1) * .22;                       // 轉彎時身體往圓心傾
    g.rotation.z = Math.sin(tm * .7 + D.ph) * .08;
    var f = D.flap * .7 + .15, fo = Math.sin(tm * 4.2 + D.ph - .7) * .45 + .05;     // 外段翼晚一點跟上，拍下時往下捲
    u.wl.rotation.x = -f; u.wr.rotation.x = f;
    u.wl.userData.outer.rotation.x = -fo; u.wr.userData.outer.rotation.x = fo;
    u.segs.forEach(function(sg, k){ sg.rotation.y = Math.sin(tm * 2.1 + D.ph - k * .45) * .13; sg.rotation.z = sg.userData.rz + Math.sin(tm * 1.5 + D.ph - k * .4) * .05; });
    u.head.rotation.z = Math.sin(tm * 1.1 + D.ph) * .08 - (D.fire > 0 ? .12 : 0);
    var fi = D.fire > 0 ? Math.sin(Math.PI * D.fire) : 0;
    u.fire.visible = fi > .02; u.fire.scale.set(.4 + fi * .8, .4 + fi, .4 + fi * .8); u.fire.position.x = .4 + .32 * fi;
  });
}

/* ---------- 景色主題：兩座島共用這段程式，外觀差異全部由檔案開頭的 THEME 決定 ----------
 * tropic（創業島）：熱帶潟湖——淺水翠綠漸層、海底珊瑚、白沙灘陽傘、彩虹、熱氣球、蝴蝶。
 * harbor（創作者小鎮）：港邊倉庫的黃金時刻——暖色薄霧、深青港灣與金色波光、街道串燈、煙囪炊煙、夜晚天燈與探照燈。 */
function glowTex(inner, outer){
  return canvasTex(128, 128, function(x, w, h){
    var g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, inner); g.addColorStop(.25, inner); g.addColorStop(1, outer);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
}
function sceneSprite(tex, size, add){
  var s = new T3.Sprite(new T3.SpriteMaterial({map:tex, transparent:true, depthWrite:false, fog:false, blending:add ? T3.AdditiveBlending : T3.NormalBlending}));
  s.scale.set(size, size, 1); s.raycast = noPick; scene.add(s); return s;
}
function freeLand(gx, gy, pad){                    // 空地：不在建築、道路、河、場地、地標、橋上
  if (riverDist(gx, gy) < 1.1 || minDist(ROAD_S, gx, gy) < .55 + (pad || 0)) return false;
  if (TOOLS.some(function(t){ return Math.abs(gx - t.gx) < t.s + .45 && Math.abs(gy - t.gy) < t.s + .45; })) return false;
  if ((O.markSpots || []).some(function(m){ return Math.hypot(gx - m[0], gy - m[1]) < m[2] + .3; })) return false;
  if (typeof farBridgeDist === 'function' && farBridgeDist(gx, gy) < .9) return false;
  if (Math.hypot(gx - BOARD_AT[0], gy - BOARD_AT[1]) < 1) return false;
  return true;
}
function buildScenery(){
  var S = O.scene2 = {sun:null, halo:null, moon:null, items:[]}, r = rng(THEME.id === 'tropic' ? 11 : 23);
  // 太陽、光暈、月亮（畫在天空上，不受霧影響）
  S.halo = sceneSprite(glowTex('rgba(255,244,214,.55)', 'rgba(255,220,160,0)'), 46, true);
  S.sun = sceneSprite(glowTex('rgba(255,252,236,1)', 'rgba(255,240,200,0)'), 11, true);
  S.moon = sceneSprite(canvasTex(128, 128, function(x){
    var g = x.createRadialGradient(64, 64, 18, 64, 64, 64); g.addColorStop(0, 'rgba(255,250,228,.35)'); g.addColorStop(1, 'rgba(255,250,228,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    x.fillStyle = '#fff8dc'; x.beginPath(); x.arc(64, 64, 20, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(214,204,170,.6)'; [[56, 58, 5], [71, 70, 4], [66, 52, 3]].forEach(function(c){ x.beginPath(); x.arc(c[0], c[1], c[2], 0, Math.PI * 2); x.fill(); });
  }), 14, false);
  // 水面波光：兩組點輪流閃爍
  S.glints = [0, 1].map(function(k){
    var N = THEME.glints, p = new Float32Array(N * 3), n = 0;
    while (n < N){ var a = r() * 6.28, d = 13 * SPREAD + r() * 22, gx = C[0] + Math.cos(a) * d, gy = C[1] + Math.sin(a) * d; if (edgeD(gx, gy) < .8 || farEdge(gx, gy) < .8) continue; p[n * 3] = gx; p[n * 3 + 1] = SEA + .05; p[n * 3 + 2] = gy; n++; }
    var g = new T3.BufferGeometry(); g.setAttribute('position', new T3.BufferAttribute(p, 3));
    var pts = new T3.Points(g, new T3.PointsMaterial({color:THEME.glint, size:.16, transparent:true, opacity:.6, depthWrite:false, blending:T3.AdditiveBlending}));
    pts.raycast = noPick; scene.add(pts); return pts;
  });
  if (THEME.id === 'tropic') buildTropicScene(S, r); else buildHarborScene(S, r);
}
// ---- 創業島：熱帶潟湖 ----
function buildTropicScene(S, r){
  // 海底珊瑚：在潟湖淺水裡，透過水面看得到
  var cor = [], tries = 0;
  while (cor.length < 260 && tries++ < 8000){
    var a = r() * 6.28, rr = islandR(a) + .5 + r() * 2.6, gx = C[0] + Math.cos(a) * rr, gy = C[1] + Math.sin(a) * rr, y = landY(gx, gy);
    if (y > SEA - .07 || y < SEA - .7) continue;
    if (typeof farBridgeDist === 'function' && farBridgeDist(gx, gy) < .6) continue;
    cor.push([gx, y, gy, r()]);
  }
  var cg = mergeGeo([blob(.09, 0, .04, 0), blob(.06, .07, .02, .03), blob(.05, -.05, .03, -.05)]);
  var cm = new T3.InstancedMesh(cg, std('#ffffff'), cor.length), mm = new T3.Matrix4(), c = new T3.Color(), CC = ['#ff7f9e', '#ffb35c', '#b48cff', '#ffe066', '#5fe3c4', '#ff6f59'];
  cor.forEach(function(q, i){ var s = .7 + q[3] * .9; mm.makeScale(s, s * (.6 + q[3] * .6), s); mm.setPosition(q[0], q[1] + .01, q[2]); cm.setMatrixAt(i, mm); cm.setColorAt(i, c.set(CC[i % CC.length])); });
  cm.raycast = noPick; scene.add(cm);
  // 白沙灘上的陽傘與浴巾
  var spots = [], k = 0;
  while (spots.length < 14 && k++ < 4000){
    var a2 = r() * 6.28, gx2 = C[0] + Math.cos(a2) * (islandR(a2) - .22), gy2 = C[1] + Math.sin(a2) * (islandR(a2) - .22);
    if (landY(gx2, gy2) < LAND - .08 || zoneOfPoint(gx2, gy2) || !freeLand(gx2, gy2, .2)) continue;
    if (spots.some(function(s){ return Math.hypot(s[0] - gx2, s[1] - gy2) < 1.6; })) continue;
    spots.push([gx2, gy2, a2]);
  }
  var UMB = [['#ff6f59', '#ffffff'], ['#2ec4b6', '#ffffff'], ['#f4b942', '#ff6f59'], ['#9d8cf2', '#ffffff'], ['#4f9dff', '#ffe066']];
  spots.forEach(function(s, i){
    var g = new T3.Group(), u = UMB[i % UMB.length], y = landY(s[0], s[1]);
    mesh(new T3.CylinderGeometry(.012, .012, .5, 6), std('#f4f1ea'), 0, .25, 0, g);
    for (var j = 0; j < 8; j++){ var seg = mesh(new T3.ConeGeometry(.3, .13, 3, 1, true, j / 8 * Math.PI * 2, Math.PI / 4), std(u[j % 2], {side:T3.DoubleSide}), 0, .5, 0, g); seg.userData.noInk = true; }
    mesh(new T3.SphereGeometry(.025, 8, 6), std(u[0]), 0, .57, 0, g);
    var towel = mesh(new T3.BoxGeometry(.18, .008, .34), std(u[1] === '#ffffff' ? u[0] : u[1]), .2, .005, .05, g); towel.rotation.y = .3;
    g.position.set(s[0], y, s[1]); g.rotation.y = -s[2];
    inkAll(shadowAll(g), .008); scene.add(g); blockWalk(s[0], s[1], .12);
  });
  // 彩虹：遠方天空的七色弧（白天才看得到）
  var RB = ['#ff5a5a', '#ff9f43', '#ffe066', '#6bdc6b', '#4fb3ff', '#6a6cff', '#b06bff'];
  S.rainbow = new T3.Group();
  RB.forEach(function(cl, i){
    var t = new T3.Mesh(new T3.TorusGeometry(34 - i * .9, .48, 6, 64, Math.PI), new T3.MeshBasicMaterial({color:cl, transparent:true, opacity:.3, depthWrite:false, fog:false}));
    t.raycast = noPick; S.rainbow.add(t);
  });
  S.rainbow.position.set(C[0] - 34, -4, C[1] - 40); S.rainbow.lookAt(C[0], -4, C[1]); scene.add(S.rainbow);
  // 熱氣球：慢慢繞著島飄
  var BAL = [['#ff6f59', '#ffe066'], ['#4f9dff', '#ffffff'], ['#2ec4b6', '#f4b942'], ['#ef6b8a', '#ffffff'], ['#9d8cf2', '#ffe066']];
  S.balloons = BAL.map(function(b, i){
    var g = new T3.Group();
    var tex = canvasTex(256, 64, function(x, w, h){ for (var j = 0; j < 8; j++){ x.fillStyle = b[j % 2]; x.fillRect(j * w / 8, 0, w / 8 + 1, h); } });
    var env = mesh(new T3.SphereGeometry(.55, 24, 16), std('#ffffff', {map:tex}), 0, 1.05, 0, g); env.scale.set(1, 1.18, 1);
    var neck = mesh(new T3.CylinderGeometry(.2, .12, .22, 16), std(b[0]), 0, .42, 0, g);
    mesh(new T3.BoxGeometry(.2, .14, .2), std('#b07a45'), 0, .12, 0, g);
    [-1, 1].forEach(function(sx){ [-1, 1].forEach(function(sz){ var rp = mesh(new T3.CylinderGeometry(.006, .006, .3, 4), std('#5a4030'), sx * .09, .3, sz * .09, g); rp.userData.noInk = true; }); });
    inkAll(shadowAll(g), .012); scene.add(g);
    return {g:g, a:i / BAL.length * 6.28, rad:(9 + (i % 3) * 2.2) * SPREAD, h:4.6 + (i % 2) * 1.6 + i * .3, sp:.018 + (i % 2) * .01};
  });
  // 蝴蝶：白天在公園、綠地附近飛
  var spots2 = GREENS.map(function(G){ return [G.at[0], G.at[1]]; }).concat(ZONES.filter(function(z){ return z.id === 'idea'; }).map(function(z){ return [z.cx, z.cy]; }));
  if (!spots2.length) spots2 = [[C[0], C[1]]];
  var BF = ['#ffb3c6', '#ffe066', '#9fd8ff', '#ffffff', '#ffa94d'];
  S.flies2 = [];
  for (var bi = 0; bi < 18; bi++){
    var home = spots2[bi % spots2.length], g2 = new T3.Group(), wm = new T3.MeshBasicMaterial({color:BF[bi % BF.length], side:T3.DoubleSide});
    var wg = new T3.CircleGeometry(.05, 10); wg.scale(1, .75, 1); wg.translate(.05, 0, 0);
    var L1 = new T3.Mesh(wg, wm), R1 = new T3.Mesh(wg, wm); L1.rotation.x = R1.rotation.x = -Math.PI / 2;
    var pl = new T3.Group(), pr = new T3.Group(); pl.add(L1); pr.add(R1); pr.scale.x = -1; g2.add(pl); g2.add(pr);
    g2.traverse(function(m){ m.raycast = noPick; }); scene.add(g2);
    S.flies2.push({g:g2, pl:pl, pr:pr, hx:home[0] + (r() - .5) * 2, hz:home[1] + (r() - .5) * 2, ph:r() * 6.28, sp:.5 + r() * .5});
  }
  O.anim.push(function(tm){
    S.balloons.forEach(function(b){ var a = b.a + tm * b.sp; b.g.position.set(C[0] + Math.cos(a) * b.rad, b.h + Math.sin(tm * .5 + b.a) * .35, C[1] + Math.sin(a) * b.rad); b.g.rotation.y = tm * .1 + b.a; });
    S.flies2.forEach(function(f){
      var t = tm * f.sp + f.ph, x = f.hx + Math.sin(t * .7) * 1.1 + Math.sin(t * 1.9) * .25, z = f.hz + Math.cos(t * .55) * 1.1;
      f.g.position.set(x, landY(x, z) + .35 + Math.sin(t * 2.3) * .12, z); f.g.rotation.y = -t * .7;
      var fl = Math.sin(tm * 18 + f.ph) * .9; f.pl.rotation.z = fl; f.pr.rotation.z = -fl;
    });
  });
}
// ---- 創作者小鎮：港邊倉庫的黃金時刻 ----
function buildHarborScene(S, r){
  // 街道串燈：沿著道路左右交錯立柱，燈串之字形跨過街道
  var bulbs = [], cableG = [], poleG = [], n = Math.floor(ROAD_S.length / 49);
  for (var k = 0; k < n; k++){
    var road = ROAD_S.slice(k * 49, k * 49 + 49), side = 1, last = null;
    for (var i = 2; i < road.length - 2; i += 3){
      var p = road[i], q = road[Math.min(road.length - 1, i + 1)], dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz) || 1;
      if (riverDist(p[0], p[1]) < 1.1 || zoneOfPoint(p[0], p[1]) && zoneOfPoint(p[0], p[1]).id === 'publish'){ last = null; continue; }
      var px = p[0] - dz / l * .42 * side, pz = p[1] + dx / l * .42 * side, py = landY(px, pz);
      if (TOOLS.some(function(t){ return Math.abs(px - t.gx) < t.s + .15 && Math.abs(pz - t.gy) < t.s + .15; })){ last = null; continue; }
      var top = new T3.Vector3(px, py + .62, pz);
      var pg = new T3.CylinderGeometry(.012, .016, .64, 5); pg.translate(px, py + .32, pz); poleG.push(pg);
      if (last && last.distanceTo(top) < 2.2){
        var mid = last.clone().lerp(top, .5); mid.y -= .14;
        var curve = new T3.QuadraticBezierCurve3(last, mid, top);
        cableG.push(new T3.TubeGeometry(curve, 10, .004, 3, false));
        for (var b = 1; b < 6; b++) bulbs.push(curve.getPoint(b / 6));
      }
      last = top; side = -side;
    }
  }
  if (poleG.length){ var pm = new T3.Mesh(mergeGeo(poleG), std('#4a3f38')); pm.castShadow = true; scene.add(pm); inkMesh(pm, .008); }
  if (cableG.length){ var cm = new T3.Mesh(mergeGeo(cableG), new T3.MeshBasicMaterial({color:'#3b2f3a'})); cm.raycast = noPick; scene.add(cm); }
  var bm = new T3.InstancedMesh(new T3.SphereGeometry(.026, 8, 6), new T3.MeshBasicMaterial({color:'#ffffff'}), bulbs.length), m4 = new T3.Matrix4(), c = new T3.Color();
  var BC = ['#ffd27a', '#ff9f6b', '#fff1c9', '#ffb3c6', '#9fe0ff'];
  bulbs.forEach(function(v, i){ m4.makeTranslation(v.x, v.y, v.z); bm.setMatrixAt(i, m4); bm.setColorAt(i, c.set(BC[i % BC.length])); });
  bm.raycast = noPick; scene.add(bm); S.bulbs = bm;
  var hp = new Float32Array(bulbs.length * 3); bulbs.forEach(function(v, i){ hp[i * 3] = v.x; hp[i * 3 + 1] = v.y; hp[i * 3 + 2] = v.z; });
  var hg = new T3.BufferGeometry(); hg.setAttribute('position', new T3.BufferAttribute(hp, 3));
  S.bulbHalo = new T3.Points(hg, new T3.PointsMaterial({map:glowTex('rgba(255,214,140,.9)', 'rgba(255,180,90,0)'), size:.32, transparent:true, opacity:0, depthWrite:false, blending:T3.AdditiveBlending}));
  S.bulbHalo.raycast = noPick; scene.add(S.bulbHalo);
  // 倉庫煙囪＋炊煙
  var smokeTex = glowTex('rgba(236,230,222,.75)', 'rgba(236,230,222,0)'), stacks = [];
  TOOLS.filter(function(t){ return t.style === 'warehouse' || t.style === 'brick'; }).slice(0, 7).forEach(function(t, i){
    var b = O.blds[t.id]; if (!b) return;
    var x = t.gx + t.s * .45, z = t.gy - t.s * .35, h = b.top - b.base;
    var ch = mesh(new T3.CylinderGeometry(.06, .07, .5, 10), std('#9c4a35'), x, b.base + h * .75 + .25, z, scene);
    mesh(new T3.CylinderGeometry(.075, .075, .05, 10), std('#4a3f38'), x, b.base + h * .75 + .5, z, scene);
    inkMesh(ch, .008); ch.castShadow = true;
    var puffs = [];
    for (var j = 0; j < 6; j++){ var s = new T3.Sprite(new T3.SpriteMaterial({map:smokeTex, transparent:true, depthWrite:false})); s.raycast = noPick; scene.add(s); puffs.push(s); }
    stacks.push({x:x, y:b.base + h * .75 + .55, z:z, puffs:puffs, ph:i * .37});
  });
  // 夜晚的天燈：從小鎮緩緩升上天空
  var lantTex = canvasTex(64, 80, function(x){
    var g = x.createLinearGradient(0, 0, 0, 80); g.addColorStop(0, '#ffb35c'); g.addColorStop(1, '#ffe7a8');
    x.fillStyle = g; x.beginPath(); x.moveTo(14, 6); x.lineTo(50, 6); x.lineTo(58, 70); x.lineTo(6, 70); x.closePath(); x.fill();
    x.fillStyle = 'rgba(255,255,220,.95)'; x.beginPath(); x.ellipse(32, 66, 14, 6, 0, 0, Math.PI * 2); x.fill();
  });
  S.lanterns = [];
  for (var li = 0; li < 34; li++){
    var sp = new T3.Sprite(new T3.SpriteMaterial({map:lantTex, transparent:true, depthWrite:false, fog:false}));
    sp.scale.set(.22, .28, 1); sp.raycast = noPick; scene.add(sp);
    var la = r() * 6.28, ld = Math.sqrt(r()) * 12 * SPREAD;
    S.lanterns.push({s:sp, x:C[0] + Math.cos(la) * ld, z:C[1] + Math.sin(la) * ld, t:r() * 60, sp:.12 + r() * .1, w:r() * 6.28});
  }
  var lantHalo = glowTex('rgba(255,170,80,.7)', 'rgba(255,140,60,0)');
  S.lanterns.forEach(function(L2){ var h = new T3.Sprite(new T3.SpriteMaterial({map:lantHalo, transparent:true, depthWrite:false, fog:false, blending:T3.AdditiveBlending})); h.scale.set(.8, .8, 1); h.raycast = noPick; scene.add(h); L2.h = h; });
  // 夜晚的探照燈：從碼頭兩側往天空掃
  S.beams = [[C[0] + 10, C[1] - 6], [C[0] - 8, C[1] + 10]].map(function(p, i){
    var piv = new T3.Group(); piv.position.set(p[0], LAND, p[1]);
    var cone = new T3.Mesh(new T3.CylinderGeometry(.7, .05, 22, 20, 1, true), new T3.MeshBasicMaterial({color:'#fff2c8', transparent:true, opacity:0, depthWrite:false, side:T3.DoubleSide, blending:T3.AdditiveBlending, fog:false}));
    cone.position.y = 11; cone.raycast = noPick; piv.add(cone); scene.add(piv);
    return {piv:piv, mat:cone.material, ph:i * 2.1};
  });
  O.anim.push(function(tm){
    stacks.forEach(function(st){
      st.puffs.forEach(function(p, j){
        var u = (tm * .22 + j / st.puffs.length + st.ph) % 1;
        p.position.set(st.x + u * .6 + Math.sin(tm + j) * .05, st.y + u * 1.6, st.z - u * .3);
        var s = .18 + u * .7; p.scale.set(s, s, 1); p.material.opacity = (1 - u) * (u < .1 ? u * 10 : 1) * .8 * (1 - S.dk * .6);
      });
    });
    var night = S.dk;
    S.lanterns.forEach(function(L2){
      var u = ((tm * L2.sp + L2.t) % 14) / 14, y = LAND + .5 + u * 13;
      var x = L2.x + Math.sin(tm * .3 + L2.w) * .6 + u * 3, z = L2.z + Math.cos(tm * .25 + L2.w) * .6 - u * 2;
      L2.s.position.set(x, y, z); L2.h.position.set(x, y, z);
      var o = night > .35 ? Math.min(1, (night - .35) * 3) * (u < .06 ? u / .06 : u > .85 ? (1 - u) / .15 : 1) : 0;
      L2.s.material.opacity = o; L2.h.material.opacity = o * .8; L2.s.visible = L2.h.visible = o > .01;
    });
    S.beams.forEach(function(b){ b.piv.rotation.set(Math.sin(tm * .35 + b.ph) * .45, 0, Math.cos(tm * .27 + b.ph) * .45); b.mat.opacity = night > .4 ? (night - .4) * .25 : 0; });
  });
}
// 每次天色變化時呼叫：太陽／月亮位置、彩虹、波光、串燈亮度
function skyScenery(dk, dusk){
  var S = O.scene2; if (!S) return;
  S.dk = dk;
  var d = sun.position.clone().sub(sun.target.position).normalize();
  var day = dk < .55;
  S.sun.visible = S.halo.visible = day; S.moon.visible = !day;
  var sp = new T3.Vector3(C[0], 0, C[1]).addScaledVector(d, 130);
  S.sun.position.copy(sp); S.halo.position.copy(sp);
  S.halo.material.color.set(dusk > .2 ? '#ffb27a' : '#fff4d8'); S.sun.material.color.set(dusk > .2 ? '#ffcf94' : '#ffffff');
  S.moon.position.set(C[0] - 60, 70, C[1] - 90);
  S.glints.forEach(function(g){ g.material.color.set(dusk > .2 ? '#ffc477' : dk > .6 ? THEME.glintNight : THEME.glint); });
  if (S.rainbow) S.rainbow.visible = dk < .15 && dusk < .1;
  if (S.bulbs){ S.bulbs.material.color.setScalar(.75 + dk * .6); S.bulbHalo.material.opacity = .25 + dk * .75; }
}
function frameScenery(tm){
  var S = O.scene2; if (!S) return;
  S.glints[0].material.opacity = (.25 + .5 * Math.max(0, Math.sin(tm * 2.1))) * THEME.glintK;
  S.glints[1].material.opacity = (.25 + .5 * Math.max(0, Math.sin(tm * 2.1 + Math.PI))) * THEME.glintK;
}

/* ---------- 接力線 ---------- */
function buildLinks(){
  if (!built) return;
  if (O.links) { scene.remove(O.links); O.links.traverse(function(m){ if (m.geometry) m.geometry.dispose(); }); }
  O.links = new T3.Group(); O.flows = [];
  if (state.links){
    var rel = {}; LINKS.forEach(function(x){ rel[x.id] = x; });
    EDGES.forEach(function(e){
      if (!state.rels[e.rel]) return;
      var A = O.blds[e.a], B = O.blds[e.b], touches = state.sel && (e.a === state.sel || e.b === state.sel);
      var p = new T3.Vector3(A.t.gx, A.top + .1, A.t.gy), q = new T3.Vector3(B.t.gx, B.top + .1, B.t.gy), d = p.distanceTo(q);
      var mid = p.clone().add(q).multiplyScalar(.5); mid.y += .8 + d * .32;
      var curve = new T3.QuadraticBezierCurve3(p, mid, q), op = state.sel ? (touches ? 1 : .1) : .75;
      var tube = new T3.Mesh(new T3.TubeGeometry(curve, 30, touches ? .035 : .02, 5, false), new T3.MeshBasicMaterial({color:rel[e.rel].color, transparent:true, opacity:op}));
      O.links.add(tube);
      var dot = new T3.Mesh(new T3.SphereGeometry(touches ? .08 : .055, 10, 8), new T3.MeshBasicMaterial({color:'#ffffff', transparent:true, opacity:op}));
      O.links.add(dot); O.flows.push({c:curve, m:dot, o:Math.random()});
    });
  }
  scene.add(O.links);
}

/* ---------- 人物 ---------- */
// 人物：剪紙卡通風（扁平色塊＋紙張紋理＋粗描邊；大圓頭直接坐在矮胖身體上、兩顆相連的大白眼＋小黑點瞳孔、連指手套小手、定格動畫般一頓一頓地走）
var AV_GRAD = null, RIM_U = {value:.24}, PAPER_TEX = null;
function avGrad(){
  if (AV_GRAD) return AV_GRAD;
  AV_GRAD = new T3.DataTexture(new Uint8Array([214, 255]), 2, 1, T3.RedFormat);   // 只有兩段、差距很小：幾乎是平塗
  AV_GRAD.minFilter = AV_GRAD.magFilter = T3.NearestFilter; AV_GRAD.generateMipmaps = false; AV_GRAD.needsUpdate = true;
  return AV_GRAD;
}
function paperTex(){                                                     // 美術紙的纖維顆粒，乘在顏色上
  if (PAPER_TEX) return PAPER_TEX;
  var c = document.createElement('canvas'); c.width = c.height = 128;
  var x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 128);
  var r = 12345; function rnd(){ r = (r * 16807) % 2147483647; return r / 2147483647; }
  for (var i = 0; i < 2600; i++){ var v = 228 + Math.floor(rnd() * 27); x.fillStyle = 'rgb(' + v + ',' + v + ',' + (v - 4) + ')'; x.fillRect(rnd() * 128, rnd() * 128, 1 + rnd() * 2, 1); }
  for (var j = 0; j < 40; j++){ x.strokeStyle = 'rgba(160,150,130,.18)'; x.beginPath(); var sx = rnd() * 128, sy = rnd() * 128; x.moveTo(sx, sy); x.lineTo(sx + rnd() * 14 - 7, sy + rnd() * 6 - 3); x.stroke(); }
  PAPER_TEX = new T3.CanvasTexture(c); PAPER_TEX.wrapS = PAPER_TEX.wrapT = T3.RepeatWrapping; PAPER_TEX.repeat.set(3, 3);
  return PAPER_TEX;
}
function avStd(c){ return new T3.MeshToonMaterial({color:c, gradientMap:avGrad(), map:paperTex()}); }
function flatM(c){ return new T3.MeshBasicMaterial({color:c, map:paperTex()}); }   // 完全不受光：眼白、瞳孔、嘴
var SHADOW_TEX = null;
function blobTex(){
  if (SHADOW_TEX) return SHADOW_TEX;
  var c = document.createElement('canvas'); c.width = c.height = 64;
  var x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(30,20,40,.55)'); gr.addColorStop(.6, 'rgba(30,20,40,.22)'); gr.addColorStop(1, 'rgba(30,20,40,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  return (SHADOW_TEX = new T3.CanvasTexture(c));
}
var HEAD_Y = .33;
function makeAv(A, shirt, mine){
  shirt = shirt || '#ff6f59';
  var g = new T3.Group(), body = new T3.Group(); g.add(body);
  var furM = avStd(A.fur), lightM = avStd(A.light), innerM = avStd(A.inner), darkM = avStd(A.dark || '#2a2228'), noseM = avStd(A.nose);
  var shirtM = avStd(shirt), trimM = avStd(hexMix(shirt, '#2a2228', .35)), pantsM = avStd('#4a5a78'), shoeM = flatM('#1e1a1f');
  var black = flatM('#1e1a1f'), white = flatM('#ffffff');
  var noInk = [];
  function M(geo, mat, x, y, z, parent){ var m = new T3.Mesh(geo, mat); m.position.set(x, y, z); (parent || body).add(m); return m; }
  function S(r, a, b){ return new T3.SphereGeometry(r, a || 22, b || 16); }
  // 腳：幾乎看不見的短褲管＋扁扁的黑鞋
  function leg(x){
    var p = new T3.Group(); p.position.set(x, .06, 0); body.add(p);
    var pl = M(new T3.CylinderGeometry(.036, .04, .04, 16), pantsM, 0, -.02, 0, p); pl.scale.z = .85;
    var shoe = M(S(.045, 16, 10), shoeM, 0, -.045, .014, p); shoe.scale.set(1.05, .45, 1.3);
    return p;
  }
  var legL = leg(-.048), legR = leg(.048);
  // 身體：矮胖的外套（下寬上窄）＋拉鍊＋口袋＋下擺，頭直接坐在上面、沒有脖子
  var torso = M(new T3.CylinderGeometry(.092, .115, .155, 30), shirtM, 0, .14, 0); torso.scale.z = .86;
  var hem = M(new T3.CylinderGeometry(.117, .118, .022, 30), trimM, 0, .072, 0); hem.scale.z = .87;
  var zip = M(new T3.BoxGeometry(.008, .13, .006), trimM, 0, .145, .093); zip.rotation.x = -.15; noInk.push(zip);
  [-1, 1].forEach(function(s){ var pk = M(new T3.BoxGeometry(.035, .006, .01), trimM, s * .052, .11, .088); pk.rotation.set(-.15, s * -.45, 0); noInk.push(pk); });
  [.19, .15, .11].forEach(function(y){ noInk.push(M(S(.0075, 8, 6), black, .018, y, .094 - (y - .11) * .15)); });
  // 手：直接貼在身體兩側的連指手套（毛色），只有大拇指分開
  function arm(s){
    var p = new T3.Group(); p.position.set(s * .1, .19, 0); body.add(p);
    var sl = M(new T3.CapsuleGeometry(.03, .03, 6, 12), shirtM, s * .012, -.03, 0, p); sl.rotation.z = s * .5;
    var mit = M(S(.036, 16, 12), furM, s * .03, -.07, .012, p); mit.scale.set(.95, 1, .7);
    var th = M(S(.014, 10, 8), furM, s * .012, -.058, .034, p); th.scale.set(1, 1.3, .8);
    return p;
  }
  var armL = arm(-1), armR = arm(1);
  // 尾巴：剪紙一樣壓扁
  var tz = -.095;
  if (A.tail === 'long'){ var tl = M(new T3.CapsuleGeometry(.018, .14, 6, 10), furM, 0, .11, tz - .03); tl.rotation.x = -.9; tl.scale.x = .6; M(S(.022, 12, 10), A.mark === 'tiger' ? darkM : lightM, 0, .16, tz - .085).scale.x = .6; }
  else if (A.tail === 'fluffy'){ var tf = M(S(.06), furM, 0, .12, tz - .03); tf.scale.set(.55, 1.5, .8); tf.rotation.x = -.8; M(S(.032, 12, 10), lightM, 0, .2, tz - .09).scale.x = .55; }
  else if (A.tail === 'puff'){ M(S(.034, 14, 12), lightM, 0, .09, tz); }
  else if (A.tail === 'short'){ var ts = M(new T3.CapsuleGeometry(.016, .05, 4, 8), furM, 0, .11, tz); ts.rotation.x = -1.1; }
  else if (A.tail === 'curl'){ var tc = M(new T3.TorusGeometry(.022, .008, 8, 18, Math.PI * 1.6), noseM, 0, .1, tz); tc.rotation.y = Math.PI / 2; }
  // 頭：又大又寬的圓頭，前後略扁（像紙板做的）
  var head = new T3.Group(); head.position.y = HEAD_Y; body.add(head);
  var face = M(S(.17, 40, 30), furM, 0, 0, 0, head); face.scale.set(1.12, .92, .85);
  if (A.mark === 'face'){ var fc = M(S(.12, 30, 20), lightM, 0, -.05, .07, head); fc.scale.set(1.15, .7, .65); }
  // 耳朵：沿用動物造型，放大後壓扁成剪紙片
  var earG = new T3.Group(); earG.scale.set(1.25, 1.12, .55); earG.position.y = -.005; head.add(earG);
  var e = A.ear;
  if (e === 'cat' || e === 'fox' || e === 'pig'){
    var eh = e === 'fox' ? .12 : e === 'pig' ? .06 : .09;
    [-1, 1].forEach(function(s){
      var ear = M(new T3.ConeGeometry(.05, eh, 4), furM, s * .085, .12 + eh / 3, 0, earG); ear.rotation.set(e === 'pig' ? .5 : 0, Math.PI / 4, -s * .35);
      if (e !== 'pig'){ var inn = M(new T3.ConeGeometry(.028, eh * .62, 4), innerM, s * .083, .11 + eh / 3, .03, earG); inn.rotation.set(0, Math.PI / 4, -s * .35); noInk.push(inn); }
      if (e === 'fox'){ var tip = M(new T3.ConeGeometry(.022, eh * .32, 4), darkM, s * (.085 + .028), .12 + eh * .78, 0, earG); tip.rotation.set(0, Math.PI / 4, -s * .35); noInk.push(tip); }
    });
  } else if (e === 'long'){
    [-1, 1].forEach(function(s){
      var ear = M(new T3.CapsuleGeometry(.032, .17, 6, 14), furM, s * .05, .25, -.02, earG); ear.rotation.z = -s * .15;
      var inn = M(new T3.CapsuleGeometry(.016, .13, 6, 10), innerM, s * .05, .245, .012, earG); inn.rotation.z = -s * .15; inn.scale.z = .5; noInk.push(inn);
    });
  } else if (e === 'round' || e === 'koala'){
    var er = e === 'koala' ? .065 : .045, ex = e === 'koala' ? .13 : .1, ey = e === 'koala' ? .08 : .118;
    [-1, 1].forEach(function(s){
      M(S(er), A.mark === 'panda' ? darkM : furM, s * ex, ey, -.01, earG);
      var inn = M(S(er * .58, 14, 10), innerM, s * ex, ey, er * .55, earG); inn.scale.z = .4; noInk.push(inn);
    });
  } else if (e === 'floppy'){
    [-1, 1].forEach(function(s){ var ear = M(new T3.CapsuleGeometry(.038, .09, 6, 14), innerM, s * .135, -.01, -.01, earG); ear.rotation.z = s * .3; });
  } else if (e === 'tuft'){
    [-.025, 0, .025].forEach(function(x, i){ var f = M(S(.022, 10, 8), furM, x, .15 + (i === 1 ? .015 : 0), .01, earG); f.scale.y = 1.6; f.rotation.z = -x * 12; });
  } else if (e === 'frog'){
    [-1, 1].forEach(function(s){ M(S(.06), furM, s * .07, .11, .03, head); });
  }
  if (A.mark === 'tiger') [-.045, 0, .045].forEach(function(x){ var st = M(new T3.BoxGeometry(.012, .055, .02), darkM, x, .12, .085, head); st.rotation.x = -.75; noInk.push(st); });
  if (A.mark === 'tiger') [-1, 1].forEach(function(s){ [0, 1].forEach(function(k){ var st = M(new T3.BoxGeometry(.05, .011, .02), darkM, s * .165, -.01 - k * .035, .03, head); st.rotation.set(0, s * .9, -s * .2); noInk.push(st); }); });
  // 眼睛：兩顆緊緊相連的大白眼＋小小的黑點瞳孔（稍微往中間看），眨眼＝上下壓扁
  var eyes = [], frog = e === 'frog';
  if (A.mark === 'panda') [-1, 1].forEach(function(s){ var pt = M(S(.05), darkM, s * .068, .0, .108, head); pt.scale.set(.9, 1.15, .35); pt.rotation.z = s * .5; noInk.push(pt); });
  [-1, 1].forEach(function(s){
    var eye = M(S(.06, 24, 16), white, s * (frog ? .07 : .05), frog ? .12 : .03, frog ? .075 : .12, head);
    eye.scale.set(1, 1.15, .4); eye.rotation.z = s * -.12; eyes.push(eye);
    var pup = M(S(.012, 10, 8), black, -s * .014, -.004, .058, eye); pup.scale.z = .5; noInk.push(pup);
  });
  // 鼻子、嘴：扁平小色塊
  var mzl = A.snout === 'muzzle', my = -.085, mzz = .128;
  if (mzl){ var mz = M(S(.06, 22, 14), lightM, 0, -.07, .112, head); mz.scale.set(1.25, .7, .4); mzz = .138; }
  if (A.snout === 'beak'){ var bk = M(new T3.ConeGeometry(.032, .06, 3), noseM, 0, -.055, .14, head); bk.rotation.set(Math.PI / 2, 0, Math.PI); bk.scale.set(1.3, 1, .5); my = -.1; }
  else if (A.snout === 'pig'){ var sn = M(new T3.CylinderGeometry(.04, .042, .03, 24), noseM, 0, -.055, .13, head); sn.rotation.x = Math.PI / 2; [-1, 1].forEach(function(s){ noInk.push(M(S(.008, 8, 6), black, s * .015, -.055, .146, head)); }); my = -.105; mzz = .118; }
  else if (A.snout === 'bignose'){ var bn = M(S(.036), noseM, 0, -.052, .13, head); bn.scale.set(.9, 1, .55); my = -.1; mzz = .118; }
  else if (A.snout !== 'none'){ var ns = M(S(.016, 12, 10), noseM, 0, -.048, mzl ? .15 : .138, head); ns.scale.set(1.3, .85, .5); noInk.push(ns); }
  var mouth = M(new T3.CircleGeometry(.024, 20, Math.PI, Math.PI), black, 0, my + .01, mzz + .004, head);   // 半月形小嘴（像剪下來的一片紙）
  mouth.scale.set(1, .45, 1); noInk.push(mouth);
  if (A.mark === 'whisker') [-1, 1].forEach(function(s){ [0, 1].forEach(function(k){ var w = M(new T3.BoxGeometry(.065, .004, .004), black, s * .12, -.06 - k * .018, .1, head); w.rotation.z = s * (k ? -.12 : .12); noInk.push(w); }); });
  noInk.forEach(function(m){ m.userData.noInk = true; });
  // 腳下的柔和接觸陰影
  var blob = new T3.Mesh(new T3.PlaneGeometry(.36, .36), new T3.MeshBasicMaterial({map:blobTex(), transparent:true, depthWrite:false}));
  blob.rotation.x = -Math.PI / 2; blob.position.y = .012; blob.userData.noInk = true; blob.raycast = noPick; g.add(blob);
  g.scale.setScalar(1.1);
  shadowAll(g); noInk.forEach(function(m){ m.castShadow = false; }); blob.castShadow = blob.receiveShadow = false;
  inkAll(g, .011); scene.add(g);                                       // 描邊加粗：剪紙的黑邊
  var tag = document.createElement('div'); tag.className = 'av3' + (mine ? ' mine' : '');
  if (mine){ tag.title = '點一下換動物、改名字'; tag.addEventListener('click', function(ev){ ev.stopPropagation(); openNamePop(); }); tag.addEventListener('pointerdown', function(ev){ ev.stopPropagation(); }); }
  labRoot.appendChild(tag);
  var bub = document.createElement('div'); bub.className = 'bub3'; bub.style.display = 'none'; labRoot.appendChild(bub);   // 聊天對話泡泡（內容在 index.html 的 BUBBLES）
  return {g:g, body:body, torso:torso, head:head, eyes:eyes, legL:legL, legR:legR, armL:armL, armR:armR, shirt:shirtM, trim:trimM, tag:tag, bub:bub, bubText:'', animal:A.id, last:'', px:null, pz:null, yaw:0, blink:2 + Math.random() * 3, t:0};
}
function dropAv(a){ scene.remove(a.g); a.tag.remove(); a.bub.remove(); a.g.traverse(function(m){ if (m.geometry && !m.userData.ink) m.geometry.dispose(); }); }
function poseAv(a, o, name, shirt, dt){
  var x = o.gx, z = o.gy, moving = false;
  if (a.px !== null){ var dx = x - a.px, dz = z - a.pz; if (dx * dx + dz * dz > 1e-6){ moving = true; var want = Math.atan2(dx, dz), d = ((want - a.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; a.yaw += d * Math.min(1, dt * 14); } }
  if (!moving){ var ft = faceTarget(o); if (ft){ var fw = Math.atan2(ft.gx - x, ft.gy - z), fd = ((fw - a.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; if (Math.abs(fd) > .02) a.yaw += fd * Math.min(1, dt * 8); } }   // 說話時轉頭面向對方
  a.px = x; a.pz = z;
  a.g.position.set(x, standY(x, z), z); a.g.rotation.y = a.yaw;
  a.t += dt;
  // 定格動畫感：步伐只取四個固定姿勢，一格一格地換（不是平滑擺動）
  var ph = moving ? Math.floor(o.phase / (Math.PI / 2)) % 4 : 0, sw = moving ? [.55, 0, -.55, 0][(ph + 4) % 4] : 0;
  a.legL.rotation.x = sw; a.legR.rotation.x = -sw; a.armL.rotation.x = -sw * .5; a.armR.rotation.x = sw * .5;
  a.body.position.y = moving ? (ph % 2 ? .028 : 0) : 0;                               // 一頓一頓地小跳
  a.body.scale.set(1, 1, 1); a.body.rotation.x = 0;
  a.torso.rotation.y = 0;
  a.body.rotation.z = moving ? (ph % 2 ? 0 : (ph === 0 ? .05 : -.05)) : 0;            // 左右搖擺（整個人一起晃，頭跟身體不分開）
  a.head.rotation.z = moving ? 0 : (Math.floor(a.t * 1.2) % 2 ? .025 : -.025);          // 站著時偶爾歪一下頭
  a.head.position.y = HEAD_Y;
  a.blink -= dt;
  var lid = a.blink < 0 ? .12 : 1.15; if (a.blink < -.12) a.blink = 2 + Math.random() * 3.5;
  a.eyes.forEach(function(e){ e.scale.y = lid; });
  var label = (hasBadWord(name) ? '旅人' : name) + (a.tag.classList.contains('mine') ? '（你）✎' : '');
  if (label !== a.last){ a.tag.textContent = label; a.last = label; }
  if (shirt && a.shirtHex !== shirt){ a.shirt.color.set(shirt); a.trim.color.set(hexMix(shirt, '#2a2228', .35)); a.tag.style.background = shirt; a.shirtHex = shirt; }
}
function syncAvatars(dt){
  var A = animalOf(me);
  if (O.avs.me && O.avs.me.animal !== A.id){ var keep = O.avs.me; dropAv(keep); O.avs.me = null; }
  if (!O.avs.me){ O.avs.me = makeAv(A, me.shirt, true); if (keep){ O.avs.me.yaw = keep.yaw; } }
  poseAv(O.avs.me, walker, me.name, me.shirt, dt);
  Object.keys(PEERS).forEach(function(id){
    var p = PEERS[id], d = p.av.data || {}, PA = animalOf(d, id);
    if (O.avs[id] && O.avs[id].animal !== PA.id){ dropAv(O.avs[id]); delete O.avs[id]; }
    if (!O.avs[id]){
      O.avs[id] = makeAv(PA, d.shirt, false);
      var tg = O.avs[id].tag; tg.classList.add('peer'); tg.title = '點一下跟他說話';     // 點別人的名牌開始對話
      tg.addEventListener('click', function(ev){ ev.stopPropagation(); openTalk(id); }); tg.addEventListener('pointerdown', function(ev){ ev.stopPropagation(); });
    }
    poseAv(O.avs[id], p, p.name, d.shirt, dt);
  });
  Object.keys(O.avs).forEach(function(id){
    if (id !== 'me' && !PEERS[id]){ dropAv(O.avs[id]); delete O.avs[id]; }
  });
}

/* ---------- 標籤（HTML 疊在畫布上） ---------- */
function buildLabels(){
  TOOLS.forEach(function(t){
    var d = document.createElement('button'); d.type = 'button'; d.className = 'tag3';
    d.innerHTML = (t.lic ? '<i class="lic-dot sm"></i>' : '') + t.short;
    d.title = t.name + (t.lic ? '（需序號）' : '');
    d.addEventListener('click', function(e){ e.stopPropagation(); openTool(t.id); });
    d.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
    labRoot.appendChild(d); O.tags.push({el:d, b:O.blds[t.id]});
  });
  ZONES.forEach(function(z){
    var d = document.createElement('div'); d.className = 'zone3';
    d.innerHTML = '<b>' + z.name + '</b><small>' + z.en + '</small>'; d.style.setProperty('--zc', mix(z.color, '#14303d', .55));
    labRoot.appendChild(d); O.zoneTags.push({el:d, x:z.cx, z:z.cy, y:landY(z.cx, z.cy) + 1.6});
  });
  GREENS.concat(HILLS.filter(function(H){ return H.name; })).forEach(function(G){
    var d = document.createElement('div'); d.className = 'zone3 decor'; d.innerHTML = '<b>' + G.name + '</b>';
    labRoot.appendChild(d); O.zoneTags.push({el:d, x:G.label[0], z:G.label[1], y:landY(G.label[0], G.label[1]) + .9});
  });
  var bd = document.createElement('button'); bd.type = 'button'; bd.className = 'tag3 board3'; bd.textContent = '📋 創業看板';   // 看板的醒目標籤
  bd.addEventListener('click', function(e){ e.stopPropagation(); openBoard(); }); bd.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
  labRoot.appendChild(bd); O.zoneTags.push({el:bd, x:BOARD_AT[0], z:BOARD_AT[1], y:landY(BOARD_AT[0], BOARD_AT[1]) + 2.5});
  var mt = document.createElement('button'); mt.type = 'button'; mt.className = 'tag3 merlin3'; mt.textContent = '🧙 智者梅林';   // 梅林的醒目標籤；走近時改成「點我發問」
  mt.addEventListener('click', function(e){ e.stopPropagation(); openMerlin(); }); mt.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
  labRoot.appendChild(mt); O.merlinTagO = {el:mt, x:MERLIN_AT[0], z:MERLIN_AT[1], y:landY(MERLIN_AT[0], MERLIN_AT[1]) + 1.6}; O.zoneTags.push(O.merlinTagO); O.merlinTag = mt;
  var rv = document.createElement('div'); rv.className = 'zone3 decor'; rv.innerHTML = '<b>創業河</b>'; labRoot.appendChild(rv);
  O.zoneTags.push({el:rv, x:RIVER[4][0] + .2, z:RIVER[4][1] - .9, y:.9});
}
var V = null;
function project(x, y, z){
  V.set(x, y, z).project(camera);
  return {x:(V.x * .5 + .5) * world.clientWidth, y:(-V.y * .5 + .5) * world.clientHeight, ok:V.z < 1 && V.z > -1};
}
function placeLabels(){
  var cp = camera.position, wv = world.clientWidth, hv = world.clientHeight;
  function put(el, x, y, z, near, far, minS){
    var p = project(x, y, z), d = Math.hypot(cp.x - x, cp.y - y, cp.z - z);
    var op = 1 - smooth(near, far, d);
    if (!p.ok || op < .03 || p.x < -80 || p.x > wv + 80 || p.y < -40 || p.y > hv + 40){ el.style.display = 'none'; return; }
    var s = Math.max(minS, Math.min(1.1, 9 / d));
    el.style.display = ''; el.style.opacity = op.toFixed(2);
    el.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px) translate(-50%,-100%) scale(' + s.toFixed(3) + ')';
    el.style.zIndex = String(1000 - Math.round(d * 10));
  }
  O.tags.forEach(function(o){
    if (!state.tags){ o.el.style.display = 'none'; return; }
    var dim = state.sel && state.sel !== o.b.t.id;
    put(o.el, o.b.t.gx, o.b.top + .15, o.b.t.gy, 13, 30, .55);
    o.el.classList.toggle('sel', state.sel === o.b.t.id); o.el.classList.toggle('dim', !!dim);
  });
  if (O.merlinTagO){ var mo = O.merlinTagO; mo.x = merlin.gx; mo.z = merlin.gy; mo.y = standY(merlin.gx, merlin.gy) + 1.6; var mtx = merlinLabel(); if (O.merlinTag.textContent !== mtx) O.merlinTag.textContent = mtx; }   // 梅林會走動、會說話
  O.zoneTags.forEach(function(o){ put(o.el, o.x, o.y, o.z, 30, 60, .7); });
  var nowMs = Date.now();
  Object.keys(O.avs).forEach(function(id){
    var a = O.avs[id], x = a.g.position.x, y = a.g.position.y + .7, z = a.g.position.z;
    put(a.tag, x, y, z, 18, 40, .6);
    var b = window.BUBBLES && BUBBLES[id], txt = b && b.until > nowMs && a.tag.style.display !== 'none' ? b.text : '';
    if (txt !== a.bubText){ a.bub.textContent = txt; a.bubText = txt; }
    if (txt) put(a.bub, x, y, z, 18, 40, .6); else a.bub.style.display = 'none';
  });
}

/* ---------- 天色：跟本機時間同步，或手動切白天／黃昏／夜晚 ---------- */
var SKY_LABEL = {now:'現在', day:'白天', dusk:'黃昏', night:'夜晚'}, SKY_HOUR = {day:10.5, dusk:18.1, night:22};
function skyHour(){ return prefs.sky === 'now' ? nowHour() : SKY_HOUR[prefs.sky]; }
function updateSky(force){
  var h = skyHour(), dk = darkness(h);
  if (!force && Math.abs(dk - sky.dk) < .002 && sky.h === Math.floor(h * 4)) return;
  sky.dk = dk; sky.h = Math.floor(h * 4);
  var dusk = dk > 0 && dk < 1 ? 1 - Math.abs(dk - .5) * 2 : 0;
  var topC = col(THEME.top).lerp(col(THEME.topN), dk).lerp(col(THEME.topD), dusk * .7);
  var horC = col(THEME.hor).lerp(col(THEME.horN), dk).lerp(col(THEME.horD), dusk * .8);
  O.dome.material.uniforms.top.value.copy(topC); O.dome.material.uniforms.hor.value.copy(horC);
  scene.fog.color.copy(horC);
  var day = h >= 5 && h < 19.5, az = (h - 6) / 13.5 * Math.PI;
  var elev = day ? Math.max(.12, Math.sin(Math.max(.05, Math.min(Math.PI - .05, az)))) : .7;
  var dir = day ? Math.cos(Math.max(.05, Math.min(Math.PI - .05, az))) : -.4;
  sun.position.set(C[0] + dir * 18, 4 + elev * 20, C[1] - 10 + dir * 4);
  sun.target.position.set(C[0], 0, C[1]);
  sun.color.copy(col(THEME.sun).lerp(col(THEME.sunD), dusk).lerp(col(THEME.sunN), dk * (1 - dusk)));
  sun.intensity = 1.9 * (1 - dk) + .75 * dk;
  hemi.intensity = 1.25 * (1 - dk) + .7 * dk;
  hemi.color.copy(col(THEME.hemi).lerp(col(THEME.hemiN), dk)); hemi.groundColor.copy(col(THEME.ground).lerp(col(THEME.groundN), dk));
  RIM_U.value = .24 * (1 - dk) + .1 * dk;                                             // 人物邊緣光：夜裡收斂
  O.water.material.color.copy(col('#ffffff').lerp(col(THEME.waterNight), dk).lerp(col(THEME.waterDusk), dusk * .35));
  skyScenery(dk, dusk);
  O.stars.material.opacity = Math.max(0, dk - .25) * 1.2;
  O.flies.material.opacity = Math.max(0, dk - .4) * 1.4;
  O.bulbMat.emissiveIntensity = dk > .3 ? 2.2 * dk : 0;
  O.clouds.forEach(function(c){ c.children[0].material.color.copy(col('#ffffff').lerp(col('#5a6a8a'), dk).lerp(col('#ffd2b0'), dusk * .5)); });
  O.farMat.color.copy(col('#ffffff').lerp(col('#2a3766'), dk).lerp(col('#ffc0a0'), dusk * .7));
  TOOLS.forEach(function(t){
    var on = h >= t.hour[0] && h < t.hour[1];
    var v = dk > .15 && on ? 1.6 * Math.min(1, dk * 1.5) : dk > .5 ? .12 : 0;
    (t.emis || []).forEach(function(m){ m.emissiveIntensity = v; });
  });
  if (O.beam) O.beam.mat.opacity = dk > .3 ? .16 * dk : 0;
  (O.glows || []).forEach(function(g){ g.m.emissiveIntensity = g.day + (g.night - g.day) * dk; });
  $('tbSky').innerHTML = '<span class="dot"></span>天色：' + SKY_LABEL[prefs.sky];
}

/* ---------- 環境音（WebAudio 合成：浪聲、白天鳥叫、夜晚蟲鳴） ---------- */
var AU = null;
function startSound(){
  try {
    if (!AU){
      var ctx = new (window.AudioContext || window.webkitAudioContext)(), len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0), last = 0;
      for (var i = 0; i < len; i++){ var w = Math.random() * 2 - 1; last = (last + .02 * w) / 1.02; d[i] = last * 3.5; }
      var src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
      var gain = ctx.createGain(); gain.gain.value = .0;
      var master = ctx.createGain(); master.gain.value = .55;
      src.connect(lp); lp.connect(gain); gain.connect(master); master.connect(ctx.destination); src.start();
      AU = {ctx:ctx, wave:gain, master:master, next:0};
    }
    AU.ctx.resume(); AU.master.gain.setTargetAtTime(.55, AU.ctx.currentTime, .3);
  } catch(e){ AU = null; }
}
function stopSound(){ if (AU) AU.master.gain.setTargetAtTime(0, AU.ctx.currentTime, .2); }
function chirp(night){
  var ctx = AU.ctx, t0 = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  o.connect(g); g.connect(AU.master); o.type = 'sine';
  if (night){ o.frequency.value = 4200 + Math.random() * 600; for (var i = 0; i < 3; i++){ g.gain.setValueAtTime(.0, t0 + i * .07); g.gain.linearRampToValueAtTime(.025, t0 + i * .07 + .02); g.gain.linearRampToValueAtTime(0, t0 + i * .07 + .05); } o.start(t0); o.stop(t0 + .25); }
  else { var f = 2200 + Math.random() * 1400; o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f * 1.5, t0 + .08); o.frequency.exponentialRampToValueAtTime(f * .9, t0 + .16); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(.04, t0 + .02); g.gain.linearRampToValueAtTime(0, t0 + .18); o.start(t0); o.stop(t0 + .2); }
}
function soundTick(tm){
  if (!AU || !prefs.sound) return;
  var near = Math.max(0, 1 - Math.max(0, edgeD(walker.gx, walker.gy) + 4) / 8);   // 越靠海岸浪聲越大
  var swell = .5 + .5 * Math.sin(tm * .8) * Math.sin(tm * .31);
  AU.wave.gain.setTargetAtTime((.05 + near * .25) * (.5 + swell * .5) + (cam.overview ? .1 : 0), AU.ctx.currentTime, .4);
  if (tm > AU.next){ AU.next = tm + (sky.dk > .6 ? .7 + Math.random() * 1.2 : 1.5 + Math.random() * 4); chirp(sky.dk > .6); }
}

/* ---------- 鏡頭與操作 ---------- */
function camApply(dt){
  var tx, ty, tz, k = Math.min(1, dt * 4);
  if (cam.overview){
    if (!state.paused) cam.yaw += dt * .05;
    tx = C[0]; ty = 0; tz = C[1];
  } else { tx = walker.gx; ty = standY(walker.gx, walker.gy) + .35; tz = walker.gy; }
  cam.tx += (tx - cam.tx) * k; cam.ty += (ty - cam.ty) * k; cam.tz += (tz - cam.tz) * k;
  var cp = Math.cos(cam.pitch), x = cam.tx + Math.sin(cam.yaw) * cp * cam.dist, z = cam.tz + Math.cos(cam.yaw) * cp * cam.dist, y = cam.ty + Math.sin(cam.pitch) * cam.dist;
  y = Math.max(y, Math.max(SEA, landY(x, z)) + .25);
  camera.position.set(x, y, z); camera.lookAt(cam.tx, cam.ty, cam.tz);
}
function setOverview(on){
  cam.overview = on;
  if (on){ cam.dist = Math.max(cam.dist, 24 * SPREAD); cam.pitch = Math.max(cam.pitch, .78); }
  else if (cam.dist > 14){ cam.dist = 8.5; cam.pitch = .55; }
}
function keyMove(dt){
  var f = 0, r = 0;
  if (keys.w || keys.arrowup) f += 1; if (keys.s || keys.arrowdown) f -= 1;
  if (keys.d || keys.arrowright) r += 1; if (keys.a || keys.arrowleft) r -= 1;
  if (!f && !r) return false;
  if (cam.overview) setOverview(false);
  var fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  var dx = fx * f + rx * r, dz = fz * f + rz * r, l = Math.hypot(dx, dz); dx /= l; dz /= l;
  var here = [walker.gx, walker.gy], nx, nz, L3 = [.35, .22, .12, .06];
  function ok(x, z){ return fineOK(x, z) && los(here, [x, z]); }
  var k, st;
  for (k = 0; k < L3.length && nx === undefined; k++){         // 前面有牆就縮短步伐，貼近牆邊才停
    st = L3[k]; if (ok(walker.gx + dx * st, walker.gy + dz * st)){ nx = walker.gx + dx * st; nz = walker.gy + dz * st; }
  }
  for (k = 0; k < L3.length && nx === undefined; k++){         // 正前方完全走不了：沿著牆滑
    st = L3[k];
    if (Math.abs(dx) > .2 && ok(walker.gx + Math.sign(dx) * st, walker.gy)){ nx = walker.gx + Math.sign(dx) * st; nz = walker.gy; }
    else if (Math.abs(dz) > .2 && ok(walker.gx, walker.gy + Math.sign(dz) * st)){ nx = walker.gx; nz = walker.gy + Math.sign(dz) * st; }
  }
  if (nx === undefined){ walker.path = []; return true; }
  walker.goal = null; walker.pending = null; walker.path = [[nx, nz]];
  return true;
}
var ptr = {}, drag = null, hoverId = null, lastHover = 0;
function pickAt(cx, cy, list){
  var r = canvas.getBoundingClientRect();
  ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  var hit = raycaster.intersectObjects(list, false);
  return hit.length ? hit[0] : null;
}
function peerAt(cx, cy){
  var r = canvas.getBoundingClientRect(), hit = null, hd = 1e9;
  Object.keys(O.avs).forEach(function(id){
    if (id === 'me' || !PEERS[id]) return;
    var g = O.avs[id].g.position, p = project(g.x, g.y + .3, g.z); if (!p.ok) return;
    var d = Math.hypot(cx - r.left - p.x, cy - r.top - p.y), tol = Math.max(18, 40 / Math.max(1, camera.position.distanceTo(g) / 4));
    if (d < tol && d < hd){ hd = d; hit = id; }
  });
  return hit;
}
function bindInput(){
  canvas.addEventListener('pointerdown', function(e){
    ptr[e.pointerId] = {x:e.clientX, y:e.clientY};
    var ids = Object.keys(ptr);
    if (ids.length === 1) drag = {x:e.clientX, y:e.clientY, yaw:cam.yaw, pitch:cam.pitch, moved:false};
    if (ids.length === 2){ var a = ptr[ids[0]], b = ptr[ids[1]]; drag = {pinch:Math.hypot(a.x - b.x, a.y - b.y), dist:cam.dist, moved:true}; }
  });
  canvas.addEventListener('pointermove', function(e){
    if (!(e.pointerId in ptr)){
      var now = performance.now(); if (now - lastHover < 60) return; lastHover = now;
      var h = pickAt(e.clientX, e.clientY, O.pick), id = h ? h.object.userData.id : null;
      hoverId = id; canvas.style.cursor = id ? 'pointer' : 'grab';
      if (id === '__far') showFarTip(e.clientX, e.clientY - 12); else if (id === '__merlin') showMerlinTip(e.clientX, e.clientY - 12); else if (id === '__board') showBoardTip(e.clientX, e.clientY - 12); else if (id) showTip(toolById[id], e.clientX, e.clientY - 12); else $('tip').classList.remove('show');
      return;
    }
    ptr[e.pointerId] = {x:e.clientX, y:e.clientY};
    var ids = Object.keys(ptr);
    if (ids.length === 2 && drag && drag.pinch){
      var a = ptr[ids[0]], b = ptr[ids[1]];
      cam.dist = Math.max(1.6, Math.min(52, drag.dist * drag.pinch / Math.hypot(a.x - b.x, a.y - b.y))); return;
    }
    if (!drag || drag.pinch) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    if (!drag.moved){ drag.moved = true; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; }
    cam.yaw = drag.yaw - dx * .0065; cam.pitch = Math.max(.08, Math.min(1.42, drag.pitch + dy * .005));
  });
  function end(e){
    var d = drag; delete ptr[e.pointerId];
    if (Object.keys(ptr).length) return;
    drag = null; canvas.style.cursor = hoverId ? 'pointer' : 'grab';
    if (e.type !== 'pointerup' || !d || d.moved) return;
    var pid = peerAt(e.clientX, e.clientY); if (pid){ openTalk(pid); return; }   // 點到別人的動物
    var hb = pickAt(e.clientX, e.clientY, O.pick);
    if (hb){ if (hb.object.userData.id === '__far') farGoClick(); else if (hb.object.userData.id === '__merlin') openMerlin(); else if (hb.object.userData.id === '__board') openBoard(); else openTool(hb.object.userData.id); return; }
    var hg = pickAt(e.clientX, e.clientY, [O.terrain]);
    if (hg){ if (cam.overview) setOverview(false); walker.goal = null; walkTo(hg.point.x, hg.point.z); }
  }
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', function(){ $('tip').classList.remove('show'); });
  canvas.addEventListener('wheel', function(e){ e.preventDefault(); cam.dist = Math.max(1.6, Math.min(52, cam.dist * Math.pow(1.0012, e.deltaY))); }, {passive:false});
  window.addEventListener('keydown', function(e){
    if (!active || /INPUT|TEXTAREA|SELECT/.test((e.target.tagName || ''))) return;
    var k = e.key.toLowerCase();
    if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].indexOf(k) >= 0){ keys[k] = true; e.preventDefault(); }
  });
  window.addEventListener('keyup', function(e){ keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', function(){ keys = {}; });
  window.addEventListener('resize', resize);
}
function resize(){
  if (!renderer || !active) return;
  var w = world.clientWidth, h = world.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}

/* ---------- 每一格 ---------- */
var tm = 0;
function frame(ts){
  if (!active) return;
  rafId = requestAnimationFrame(frame);
  var dt = Math.min(.05, Math.max(0, (ts - lastT) / 1000) || 0); lastT = ts;
  if (!state.paused) tm += dt;
  keyMove(dt);
  // 水面波浪
  if (!state.paused){
    var pa = O.water.geometry.attributes.position, arr = pa.array, b0 = O.waterBase;
    for (var i = 1; i < arr.length; i += 3){ var x = b0[i - 1], z = b0[i + 1]; arr[i] = SEA + Math.sin(x * .9 + tm * 1.3) * .025 + Math.cos(z * 1.1 - tm * 1.1) * .02; }
    pa.needsUpdate = true;
    if ((Math.floor(tm * 30) & 1) === 0) O.water.geometry.computeVertexNormals();
    O.foam.material.opacity = .35 + .25 * Math.sin(tm * 1.6);
    O.clouds.forEach(function(c){ c.position.x += c.userData.sp * dt; if (c.position.x > 28) c.position.x = -12; });
    O.boats.forEach(function(b){ b.a += b.s * dt; });
    O.birds.forEach(function(bd){ var u = bd.userData; u.a += u.sp * dt; bd.position.set(C[0] + Math.cos(u.a) * u.r, u.y + Math.sin(u.a * 3) * .3, C[1] + Math.sin(u.a) * u.r); bd.rotation.y = -u.a; var fl = Math.sin(tm * 9 + u.r) * .5; u.pl.rotation.z = fl; u.pr.rotation.z = -fl; bd.visible = sky.dk < .6; });
    if (O.beam) O.beam.pivot.rotation.y += dt * .9;
    O.anim.forEach(function(f){ f(tm, dt); });
    frameScenery(tm);
  }
  O.boats.forEach(function(b){ b.g.position.set(C[0] + Math.cos(b.a) * b.r, SEA + Math.sin(tm * 2 + b.a * 5) * .03, C[1] + Math.sin(b.a) * b.r); b.g.rotation.y = -b.a + (b.s > 0 ? 0 : Math.PI); b.g.rotation.z = Math.sin(tm * 1.7 + b.a) * .05; });
  if (O.flows) O.flows.forEach(function(f){ f.m.position.copy(f.c.getPoint((tm * .32 + f.o) % 1)); });
  // 選取的建築：光圈；探索過的：小旗
  if (state.sel && O.blds[state.sel]){ var sb = O.blds[state.sel]; O.ring.visible = true; O.ring.position.set(sb.t.gx, sb.base + .04, sb.t.gy); var s = 1 + Math.sin(tm * 4) * .06; O.ring.scale.set(sb.t.s * 2.2 * s, sb.t.s * 2.2 * s, 1); }
  else O.ring.visible = false;
  TOOLS.forEach(function(t){ O.blds[t.id].flag.visible = !!state.seen[t.id]; });
  syncAvatars(dt);
  syncCreatures();
  camApply(dt);
  O.dome.position.copy(camera.position);
  fadeOccluders(dt);
  hideTrees();
  updateSky(false);
  soundTick(tm);
  renderer.render(scene, camera);
  placeLabels();
  zoneBanner(ts);
}
// 擋在鏡頭和自己之間的建築變半透明，走到高樓後面也看得到人
var ray3 = null, seg3 = null;
function fadeOccluders(dt){
  if (!ray3){ ray3 = new T3.Ray(); seg3 = new T3.Vector3(); }
  var me3 = O.avs.me.g.position, hit = new T3.Vector3();
  seg3.set(me3.x, me3.y + .3, me3.z);
  var len = camera.position.distanceTo(seg3);
  ray3.origin.copy(camera.position); ray3.direction.copy(seg3).sub(camera.position).normalize();
  TOOLS.forEach(function(t){
    var b = O.blds[t.id], block = !cam.overview && ray3.intersectBox(b.box, hit) && camera.position.distanceTo(hit) < len - .15;
    var want = block ? .22 : 1;
    if (Math.abs(b.fade - want) < .01) return;
    b.fade += (want - b.fade) * Math.min(1, dt * 8); if (Math.abs(b.fade - want) < .01) b.fade = want;
    b.mats.forEach(function(m){ var o = m.userData.op * b.fade; m.transparent = o < .999 || m.userData.op < 1; m.opacity = o; m.depthWrite = o > .9; m.needsUpdate = true; });
    b.g.traverse(function(m){ if (m.isMesh && !m.userData.ink) m.castShadow = b.fade > .9; });
    b.lines.forEach(function(l){ l.visible = b.fade > .6; });
  });
}
var ZERO_M = null;
function hideTrees(){
  if (!ZERO_M) ZERO_M = new T3.Matrix4().makeScale(0, 0, 0);
  var c = camera.position, me3 = O.avs.me.g.position, dx = me3.x - c.x, dz = me3.z - c.z, L2 = dx * dx + dz * dz, dirty = {};
  O.trees.forEach(function(t){
    var u = L2 ? ((t.gx - c.x) * dx + (t.gy - c.z) * dz) / L2 : 0, hide = false;
    if (!cam.overview && u > 0 && u < 1.02){
      var px = c.x + dx * u, pz = c.z + dz * u, py = c.y + (me3.y + .3 - c.y) * u;
      hide = Math.hypot(t.gx - px, t.gy - pz) < .42 && py < t.y + 1;
    }
    if (hide === t.hidden) return;
    t.hidden = hide;
    t.parts.forEach(function(pt){ pt[0].setMatrixAt(pt[1], hide ? ZERO_M : pt[2]); dirty[pt[0].uuid] = pt[0]; });
  });
  Object.keys(dirty).forEach(function(k){ dirty[k].instanceMatrix.needsUpdate = true; });
}
function zoneBanner(ts){
  var z = zoneAt(walker.gx, walker.gy), el2 = $('zoneBanner');
  if (z && z !== lastZone){
    el2.innerHTML = '<small>' + z.en + '</small><b style="color:' + z.color + '">' + z.name + '</b><span>' + z.desc + '</span>';
    el2.classList.add('show'); bannerT = ts;
  }
  lastZone = z;
  if (bannerT && ts - bannerT > 3600){ el2.classList.remove('show'); bannerT = 0; }
}

/* ---------- 載入與切換 ---------- */
function webglOK(){ try { var c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch(e){ return false; } }
function build(){
  var small = Math.min(window.innerWidth, window.innerHeight) < 600;
  renderer = new T3.WebGLRenderer({canvas:canvas, antialias:true, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.outputColorSpace = T3.SRGBColorSpace; renderer.toneMapping = T3.NoToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T3.PCFSoftShadowMap;
  scene = new T3.Scene(); scene.fog = new T3.Fog(THEME.hor, THEME.fog[0], THEME.fog[1]);
  O.dome = new T3.Mesh(new T3.SphereGeometry(160, 32, 16), new T3.ShaderMaterial({
    side:T3.BackSide, depthWrite:false, fog:false,
    uniforms:{top:{value:new T3.Color('#2f86e0')}, hor:{value:new T3.Color('#c6ecfa')}},
    vertexShader:'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader:'uniform vec3 top; uniform vec3 hor; varying vec3 vP; void main(){ float h = clamp(vP.y, 0.0, 1.0); gl_FragColor = vec4(mix(hor, top, pow(h, 0.55)), 1.0);\n#include <colorspace_fragment>\n}'
  }));
  O.dome.renderOrder = -1; O.dome.raycast = noPick;
  scene.add(O.dome);
  camera = new T3.PerspectiveCamera(48, 1, .05, 220);
  hemi = new T3.HemisphereLight('#dff3ff', '#8a9a6a', 1); scene.add(hemi);
  sun = new T3.DirectionalLight('#fff4e0', 2.6); sun.castShadow = true;
  sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  var sc = sun.shadow.camera; sc.left = sc.bottom = -16 * SPREAD; sc.right = sc.top = 16 * SPREAD; sc.near = 1; sc.far = 70; sun.shadow.bias = -.0004; sun.shadow.normalBias = .02;
  scene.add(sun); scene.add(sun.target);
  raycaster = new T3.Raycaster(); ndc = new T3.Vector2(); V = new T3.Vector3();
  buildTerrain(); buildWater(); buildRoads(); TOOLS.forEach(buildBuilding); buildDecor(); buildZoneMarks(); buildTrees(); buildFlowers(); buildSkyStuff(); buildScenery(); buildMerlin(); buildLabels(); buildFar();
  O.ring = new T3.Mesh(new T3.RingGeometry(.42, .5, 40), new T3.MeshBasicMaterial({color:'#ff6f59', transparent:true, opacity:.9, side:T3.DoubleSide, depthWrite:false}));
  O.ring.rotation.x = -Math.PI / 2; scene.add(O.ring);
  built = true;
  buildLinks();
  bindInput();
  cam.tx = walker.gx; cam.ty = LAND; cam.tz = walker.gy;
  if (world.clientWidth < world.clientHeight) cam.dist = 10.5;            // 手機直向畫面窄，鏡頭退後一點
  updateSky(true);
}
function load(){
  if (loading) return loading;
  loading = Promise.all([import(THREE_URL), document.fonts && document.fonts.ready]).then(function(r){ T3 = r[0]; build(); });   // 等字型好了，招牌字才不會用到備用字型
  return loading;
}
function enter(){
  active = true;
  world.classList.add('on');
  if (prefs.hint !== false) $('hint3d').hidden = false;
  if (!webglOK()){ fail('你的瀏覽器或裝置沒有開啟 WebGL，無法顯示立體島。'); return; }
  $('load3d').hidden = built;
  load().then(function(){
    $('load3d').hidden = true;
    if (!active) return;
    resize(); lastT = performance.now(); cancelAnimationFrame(rafId); rafId = requestAnimationFrame(frame);
    if (prefs.sound) startSound();
  }).catch(function(err){
    loading = null; fail('立體引擎載入失敗（需要網路連線）。');
    if (window.console) console.warn('[startup-island 3d]', err);
  });
}
function fail(msg){
  failed = true; $('load3d').hidden = false; $('load3d').querySelector('p').textContent = msg + '先帶你回到地圖。';
  setTimeout(function(){ $('load3d').hidden = true; $('load3d').querySelector('p').textContent = '島嶼正在立起來…'; if (state.view === '3d') setView('map'); }, 2600);
}
function leave(){
  active = false; cancelAnimationFrame(rafId); keys = {};
  world.classList.remove('on'); $('tip').classList.remove('show');
  stopSound();
}

$('tbSky').addEventListener('click', function(){
  var order = ['now', 'day', 'dusk', 'night'];
  prefs.sky = order[(order.indexOf(prefs.sky) + 1) % order.length]; lsSet(KEY_3D, prefs);
  if (built) updateSky(true); else this.innerHTML = '<span class="dot"></span>天色：' + SKY_LABEL[prefs.sky];
});
$('tbSound').addEventListener('click', function(){
  prefs.sound = !prefs.sound; lsSet(KEY_3D, prefs); this.setAttribute('aria-pressed', String(prefs.sound));
  if (prefs.sound) startSound(); else stopSound();
});
$('tbSound').setAttribute('aria-pressed', String(!!prefs.sound));
$('tbSky').innerHTML = '<span class="dot"></span>天色：' + SKY_LABEL[prefs.sky];
$('hint3dClose').addEventListener('click', function(){ $('hint3d').hidden = true; prefs.hint = false; lsSet(KEY_3D, prefs); });
document.addEventListener('visibilitychange', function(){ if (document.hidden) stopSound(); else if (active && prefs.sound) startSound(); });

/* ---------- 小地圖：立體裡隨時看全島、自己和其他訪客在哪；也能彈出成瀏覽器的子母畫面（PiP）視窗 ---------- */
var mini = {cv:$('miniCv'), on:prefs.mini !== false, pip:false, base:null, k:1, ox:0, oy:0};
function miniP(gx, gy){ var p = iso(gx, gy); return [mini.ox + p[0] * mini.k, mini.oy + p[1] * mini.k]; }
function miniSetup(){
  var W = mini.cv.width, H = mini.cv.height, xs = [], ys = [];
  for (var a = 0; a < Math.PI * 2; a += .1){ var p = iso(C[0] + Math.cos(a) * 13.3 * SPREAD, C[1] + Math.sin(a) * 13.3 * SPREAD); xs.push(p[0]); ys.push(p[1]); }
  var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
  mini.k = Math.min(W / (x1 - x0), H / (y1 - y0)) * .96;
  mini.ox = W / 2 - (x0 + x1) / 2 * mini.k; mini.oy = H / 2 - (y0 + y1) / 2 * mini.k;
  var c = document.createElement('canvas'); c.width = W; c.height = H; var x = c.getContext('2d');
  function path(list, close){ x.beginPath(); list.forEach(function(q, i){ var p = miniP(q[0], q[1]); if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); }); if (close) x.closePath(); }
  function circle(cx, cy, r){ var o = []; for (var i = 0; i < 40; i++){ var b = i / 40 * Math.PI * 2; o.push([cx + Math.cos(b) * r, cy + Math.sin(b) * r]); } return o; }
  var sea = x.createLinearGradient(0, 0, 0, H); sea.addColorStop(0, THEME.mid); sea.addColorStop(1, THEME.deep); x.fillStyle = sea; x.fillRect(0, 0, W, H);
  var ring = [], beach = [];
  for (var i = 0; i < 96; i++){ var b = i / 96 * Math.PI * 2, r = islandR(b); ring.push([C[0] + Math.cos(b) * r, C[1] + Math.sin(b) * r]); beach.push([C[0] + Math.cos(b) * (r + .6), C[1] + Math.sin(b) * (r + .6)]); }
  [THEME.lagoon * .8, THEME.lagoon * .4].forEach(function(o, j){ var lg = []; for (var i = 0; i < 96; i++){ var b = i / 96 * Math.PI * 2, r = islandR(b) + o; lg.push([C[0] + Math.cos(b) * r, C[1] + Math.sin(b) * r]); } path(lg, true); x.globalAlpha = j ? .5 : .3; x.fillStyle = THEME.shallow; x.fill(); }); x.globalAlpha = 1;   // 淺水環
  path(beach, true); x.fillStyle = PAL.sand; x.fill();
  path(ring, true); x.fillStyle = PAL.grass; x.fill();
  GREENS.forEach(function(G){ path(circle(G.at[0], G.at[1], G.r), true); x.fillStyle = PAL.park; x.fill(); });
  HILLS.forEach(function(H2){ H2.layers.forEach(function(Ly, j){ path(circle(H2.at[0], H2.at[1], Ly[0]), true); x.fillStyle = j ? PAL.hilltop : PAL.hillside; x.fill(); }); });
  ZONES.forEach(function(z){
    var b = z.box; path([[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]], true);
    if (z.id !== 'strategy'){ x.fillStyle = mix(z.color, '#ffffff', .5); x.fill(); }
    x.strokeStyle = z.color; x.lineWidth = 2; x.stroke();
  });
  x.lineCap = x.lineJoin = 'round';
  for (var s = 0; s + 48 < ROAD_S.length; s += 49){ path(ROAD_S.slice(s, s + 49)); x.strokeStyle = PAL.road; x.lineWidth = 9 * mini.k * 1.4; x.stroke(); }
  path(RIVER_S); x.strokeStyle = THEME.shallow; x.lineWidth = 27 * mini.k; x.stroke();
  WATERS.forEach(function(w){ path(circle(w.at[0], w.at[1], w.r), true); x.fillStyle = THEME.shallow; x.fill(); });
  TOOLS.forEach(function(t){
    var e = t.s; path([[t.gx - e, t.gy - e], [t.gx + e, t.gy - e], [t.gx + e, t.gy + e], [t.gx - e, t.gy + e]], true);
    x.fillStyle = zoneById[t.zone].color; x.fill(); x.strokeStyle = INK; x.lineWidth = 1; x.stroke();
  });
  x.textAlign = 'center'; x.font = '400 19px Huninn, "Noto Sans TC", sans-serif'; x.lineJoin = 'round';
  ZONES.forEach(function(z){
    var p = miniP(z.cx, z.cy); x.lineWidth = 4; x.strokeStyle = mix(z.color, '#14303d', .55); x.strokeText(z.name, p[0], p[1] + 6); x.fillStyle = '#ffffff'; x.fillText(z.name, p[0], p[1] + 6);
  });
  mini.base = c;
}
function drawMini(){
  if (!((active && mini.on) || mini.pip)) return;
  if (!mini.base) miniSetup();
  var x = mini.cv.getContext('2d'), now = performance.now() / 1000;   // 畫布 560×336，顯示成 280×168（2 倍解析度，彈出子母畫面也清楚）
  x.drawImage(mini.base, 0, 0);
  var bp = miniP(BOARD_AT[0], BOARD_AT[1]), bob = Math.sin(now * 3) * 2;            // 看板：黃色標籤
  x.beginPath(); x.arc(bp[0], bp[1], 9 + Math.sin(now * 4) * 2, 0, Math.PI * 2); x.fillStyle = 'rgba(255,210,63,.45)'; x.fill();
  x.fillStyle = '#ffd23f'; x.strokeStyle = INK; x.lineWidth = 2; roundRect(x, bp[0] - 30, bp[1] - 44 + bob, 60, 26, 12); x.fill(); x.stroke();
  x.beginPath(); x.moveTo(bp[0] - 5, bp[1] - 19 + bob); x.lineTo(bp[0], bp[1] - 11 + bob); x.lineTo(bp[0] + 5, bp[1] - 19 + bob); x.fill();
  x.fillStyle = INK; x.font = '700 15px "Noto Sans TC", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('📋 看板', bp[0], bp[1] - 31 + bob); x.textBaseline = 'alphabetic';
  var mp = miniP(merlin.gx, merlin.gy);                                       // 梅林：紫色標籤
  x.beginPath(); x.arc(mp[0], mp[1], 8 + Math.sin(now * 4 + 1) * 2, 0, Math.PI * 2); x.fillStyle = 'rgba(124,92,240,.5)'; x.fill();
  x.fillStyle = '#6c4bd8'; x.strokeStyle = INK; x.lineWidth = 2; roundRect(x, mp[0] - 34, mp[1] - 44 - bob, 68, 26, 12); x.fill(); x.stroke();
  x.beginPath(); x.moveTo(mp[0] - 5, mp[1] - 19 - bob); x.lineTo(mp[0], mp[1] - 11 - bob); x.lineTo(mp[0] + 5, mp[1] - 19 - bob); x.fill();
  x.fillStyle = '#ffffff'; x.font = '700 15px "Noto Sans TC", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('🧙 梅林', mp[0], mp[1] - 31 - bob); x.textBaseline = 'alphabetic';
  if (state.sel && toolById[state.sel]){ var t = toolById[state.sel], sp = miniP(t.gx, t.gy); x.beginPath(); x.arc(sp[0], sp[1], 11 + Math.sin(now * 5) * 2, 0, Math.PI * 2); x.strokeStyle = '#ff6f59'; x.lineWidth = 3; x.stroke(); }
  if (active && !cam.overview){                                   // 鏡頭看的方向（扇形）
    var me0 = miniP(walker.gx, walker.gy), fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    x.beginPath(); x.moveTo(me0[0], me0[1]);
    for (var a = -.55; a <= .56; a += .11){ var c = Math.cos(a), s = Math.sin(a), q = miniP(walker.gx + (fx * c - fz * s) * 4.5, walker.gy + (fx * s + fz * c) * 4.5); x.lineTo(q[0], q[1]); }
    x.closePath(); x.fillStyle = 'rgba(255,255,255,.35)'; x.fill();
  }
  x.textAlign = 'center'; x.textBaseline = 'middle';
  Object.keys(PEERS).forEach(function(id){
    var p = PEERS[id], d = p.av.data || {}, q = miniP(p.gx, p.gy);
    x.beginPath(); x.arc(q[0], q[1], 9, 0, Math.PI * 2); x.fillStyle = d.shirt || '#ffffff'; x.fill(); x.strokeStyle = '#ffffff'; x.lineWidth = 2; x.stroke();
    x.font = '13px sans-serif'; x.fillText(animalOf(d, id).emoji, q[0], q[1] + 1);
  });
  var m = miniP(walker.gx, walker.gy), pulse = 17 + Math.sin(now * 4) * 3;
  x.beginPath(); x.arc(m[0], m[1], pulse, 0, Math.PI * 2); x.fillStyle = 'rgba(255,111,89,.28)'; x.fill();
  x.beginPath(); x.arc(m[0], m[1], 13, 0, Math.PI * 2); x.fillStyle = me.shirt; x.fill(); x.strokeStyle = '#ffffff'; x.lineWidth = 3; x.stroke();
  x.font = '19px sans-serif'; x.fillText(animalOf(me).emoji, m[0], m[1] + 1);
  x.font = '700 13px "Noto Sans TC", sans-serif'; x.lineWidth = 3; x.strokeStyle = '#14303d'; x.strokeText('你', m[0], m[1] - 24); x.fillStyle = '#ffffff'; x.fillText('你', m[0], m[1] - 24);
  x.textBaseline = 'alphabetic';
}
setInterval(drawMini, 80);
function setMini(on){
  mini.on = on; prefs.mini = on; lsSet(KEY_3D, prefs);
  $('mini3d').hidden = !on; $('tbMini').setAttribute('aria-pressed', String(on));
  if (on) drawMini();
}
mini.cv.addEventListener('click', function(e){                    // 點小地圖：走過去
  var r = mini.cv.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * mini.cv.width, py = (e.clientY - r.top) / r.height * mini.cv.height;
  var ix = (px - mini.ox) / mini.k, iy = (py - mini.oy) / mini.k, gx = (ix / HW + iy / HH) / 2, gy = (iy / HH - ix / HW) / 2;
  if (cam.overview) setOverview(false);
  walker.goal = null; walkTo(gx, gy);
});
$('miniClose').addEventListener('click', function(){ setMini(false); });
$('tbMini').addEventListener('click', function(){ setMini(!mini.on); });
// 子母畫面：把小地圖畫布變成影片串流，交給瀏覽器的 Picture-in-Picture 浮動視窗
var pipOK = !!(document.pictureInPictureEnabled && mini.cv.captureStream);
if (!pipOK) $('miniPip').hidden = true;
$('miniPip').addEventListener('click', function(){
  if (document.pictureInPictureElement){ document.exitPictureInPicture(); return; }
  var v = mini.video;
  if (!v){
    v = mini.video = document.createElement('video'); v.muted = true; v.playsInline = true;
    v.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0;pointer-events:none';
    document.body.appendChild(v);
    v.srcObject = mini.cv.captureStream(15);
    v.addEventListener('enterpictureinpicture', function(){ mini.pip = true; $('miniPip').textContent = '⧉ 收回'; });
    v.addEventListener('leavepictureinpicture', function(){ mini.pip = false; $('miniPip').textContent = '⧉ 子母畫面'; });
  }
  mini.pip = true; drawMini();
  v.play().then(function(){ return v.requestPictureInPicture(); }).catch(function(err){ mini.pip = false; if (window.console) console.warn('[startup-island pip]', err); });
});
setMini(mini.on);

window.Island3D = {
  enter:enter, leave:leave, links:buildLinks,
  overview:function(){ setOverview(!cam.overview); },
  get active(){ return active; }, get built(){ return built; }, cam:cam, prefs:prefs, O:O, mini:mini, board:function(){ if (O.boardDraw) O.boardDraw(); }, get renderer(){ return renderer; }
};
})();
