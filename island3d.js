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

var PAL = {grass:'#9edb6f', grass2:'#8ad062', sand:'#f7e4ab', wet:'#d9c08a', deep:'#2a86a8', shallow:'#6fd0d8',
  park:'#7fd35e', lawn:'#b8e58f', yard:'#f0dca8', paving:'#e4ded0', wood:'#e0bd8c', road:'#f5eedb',
  hilltop:'#aee07f', hillside:'#76b850', rim:'#e2c98e'};
var INK = '#3b2f3a';                                              // 描邊色：深褐紫，比純黑柔和
var CREAM = {house:1, pavilion:1, school:1, civic:1, lighthouse:1};

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
function standY(gx, gy){ var y = landY(gx, gy); return onBridge(gx, gy) ? Math.max(y, DECK + .04) : Math.max(y, SEA - .05); }

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
  var m = new T3.Mesh(g, new T3.MeshToonMaterial({color:'#47c6e6', transparent:true, opacity:.82, gradientMap:toonGrad()}));
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
  var tc = [11.0, 1.3], ty = landY(tc[0], tc[1]);
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
  var pier = new T3.Group(); pier.position.set(14.07, DECK - .05, 16.52);
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
function blockWalk(gx, gy, r){                   // 地標擋路：角色會繞過去（平面地圖也一樣）
  if (!walkCells) return;
  for (var j = 0; j < WG.n; j++) for (var i = 0; i < WG.n; i++){ var p = cellPos(i, j); if (Math.hypot(p[0] - gx, p[1] - gy) < r) walkCells[j * WG.n + i] = 0; }
}
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
  calc:function(g, z){                                            // 大看板：損益兩平圖
    var tex = canvasTex(320, 200, function(x, w, h){
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
      x.strokeStyle = '#e3eef0'; x.lineWidth = 2; for (var i = 1; i < 5; i++){ x.beginPath(); x.moveTo(0, i * 40); x.lineTo(w, i * 40); x.stroke(); }
      [40, 62, 88, 118, 150].forEach(function(v, i){ x.fillStyle = i < 2 ? '#ff8f8f' : z.color; x.fillRect(30 + i * 54, 180 - v, 36, v); });
      x.setLineDash([10, 8]); x.strokeStyle = '#3b2f3a'; x.lineWidth = 3; x.beginPath(); x.moveTo(10, 105); x.lineTo(310, 105); x.stroke(); x.setLineDash([]);
      x.strokeStyle = '#ff6f59'; x.lineWidth = 7; x.lineCap = 'round'; x.beginPath(); x.moveTo(40, 150); x.lineTo(130, 115); x.lineTo(200, 90); x.lineTo(285, 32); x.stroke();
      x.fillStyle = '#ff6f59'; x.beginPath(); x.moveTo(300, 20); x.lineTo(268, 28); x.lineTo(290, 50); x.fill();
      x.fillStyle = '#3b2f3a'; x.font = '700 22px "Noto Sans TC", sans-serif'; x.fillText('損益兩平', 14, 98);
    });
    [-1, 1].forEach(function(s){ mesh(new T3.CylinderGeometry(.025, .025, .9, 8), std('#5b6770'), s * .45, .45, 0, g); });
    mesh(new T3.BoxGeometry(1.06, .68, .05), std(hexMix(z.color, '#14303d', .3)), 0, .95, 0, g);
    var face = mesh(new T3.PlaneGeometry(.98, .6), std('#ffffff', {map:tex, emissive:'#ffffff', emissiveMap:tex, emissiveIntensity:.05}), 0, .95, .027, g); face.userData.noInk = true;
    O.glows.push({m:face.material, day:.05, night:.9});
    var back = face.clone(); back.rotation.y = Math.PI; back.position.z = -.027; g.add(back);
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
function buildZoneMarks(){
  O.glows = O.glows || []; O.markSpots = [];
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
    var spot = freeSpot(z, gates); if (!spot.at || spot.room < .05) return;
    var g = new T3.Group(); scene.add(g);
    var r = mk(g, z), k = Math.max(1.1, Math.min(2.1, (spot.room + .2) / r));
    g.scale.setScalar(k); g.position.set(spot.at[0], landY(spot.at[0], spot.at[1]) - .01, spot.at[1]);
    g.rotation.y = Math.atan2(C[0] - spot.at[0], C[1] - spot.at[1]) - Math.PI / 2 + (z.id === 'calc' || z.id === 'ops' ? Math.PI / 2 : 0);
    if (z.id === 'idea') g.rotation.y = 0;
    inkAll(shadowAll(g), .012);
    O.markSpots.push([spot.at[0], spot.at[1], r * k + .25]);
    blockWalk(spot.at[0], spot.at[1], r * k * .85);
  });
  // 品牌商店街：街道上方掛三角旗
  var bz = zoneById.brand, FLG = ['#ff6f91', '#ffd23f', '#4f9dff', '#6fcf5a', '#ffffff', '#c7a6ff'];
  var tri = new T3.Shape(); tri.moveTo(-.05, 0); tri.lineTo(.05, 0); tri.lineTo(0, -.1); tri.lineTo(-.05, 0);
  var tg = new T3.ShapeGeometry(tri);
  for (var gy = bz.box[1] + .6; gy < bz.box[3] - .3; gy += 1.1){
    var y0 = landY(7.3, gy) + .95;
    [6.75, 7.85].forEach(function(x){ var pole = mesh(new T3.CylinderGeometry(.015, .015, 1, 6), std('#3c4a52'), x, y0 - .45, gy); pole.castShadow = true; scene.add(pole); });
    for (var i = 0; i <= 10; i++){
      var u = i / 10, x = 6.75 + u * 1.1, sag = Math.sin(u * Math.PI) * .12;
      var f = mesh(tg, std(FLG[i % FLG.length], {side:T3.DoubleSide}), x, y0 - sag, gy); scene.add(f);
    }
    var line = mesh(new T3.CylinderGeometry(.004, .004, 1.12, 4), std('#3b2f3a'), 7.3, y0 - .06, gy); line.rotation.z = Math.PI / 2; scene.add(line);
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
    var a = r() * Math.PI * 2, d = Math.sqrt(r()) * 12, gx = C[0] + Math.cos(a) * d, gy = C[1] + Math.sin(a) * d;
    if (edgeD(gx, gy) > -.8 || landY(gx, gy) < LAND - .05 || riverDist(gx, gy) < 1.0 || minDist(ROAD_S, gx, gy) < .35) continue;
    var z = zoneOfPoint(gx, gy); if (z && z.id !== 'idea') continue;
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
  for (var f = 0; f < NF; f++){ var G = f % 2 ? {at:[1.0, 9.6], r:2.6} : GREENS[0]; var a2 = Math.random() * 6.28, r2 = Math.sqrt(Math.random()) * G.r; seeds.push([G.at[0] + Math.cos(a2) * r2, G.at[1] + Math.sin(a2) * r2, Math.random() * 6.28]); }
  var fg = new T3.BufferGeometry(); fg.setAttribute('position', new T3.BufferAttribute(fp, 3));
  O.flies = new T3.Points(fg, new T3.PointsMaterial({color:'#e8ff8a', size:.09, transparent:true, opacity:0, depthWrite:false, blending:T3.AdditiveBlending}));
  scene.add(O.flies);
  O.anim.push(function(tm){
    if (O.flies.material.opacity < .02) return;
    for (var f = 0; f < NF; f++){ var s = seeds[f]; fp[f * 3] = s[0] + Math.sin(tm * .6 + s[2]) * .3; fp[f * 3 + 1] = landY(s[0], s[1]) + .35 + Math.sin(tm * 1.3 + s[2] * 2) * .15; fp[f * 3 + 2] = s[1] + Math.cos(tm * .5 + s[2]) * .3; }
    fg.attributes.position.needsUpdate = true;
  });
  // 小船
  O.boats = [{a:0, r:14.4, s:.03}, {a:2.3, r:15.2, s:-.022}, {a:4.4, r:14.8, s:.026}].map(function(b){
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
    bg.userData = {pl:pl, pr:pr, a:bi * 1.05, r:4 + (bi % 3) * 1.6, y:4 + (bi % 2) * .9, sp:.25 + (bi % 3) * .05};
    scene.add(bg); O.birds.push(bg);
  }
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
function makeAv(A, shirt, mine){
  var g = new T3.Group(), furM = std(A.fur), lightM = std(A.light), innerM = std(A.inner), darkM = std(A.dark || INK), noseM = std(A.nose);
  var shirtM = std(shirt || '#ff6f59'), footM = std(hexMix(A.fur, '#3b2f3a', .3));
  function M(geo, mat, x, y, z, parent){ var m = new T3.Mesh(geo, mat); m.position.set(x, y, z); (parent || g).add(m); return m; }
  function limb(len, r, mat, x, y, end){
    var p = new T3.Group(); p.position.set(x, y, 0);
    M(new T3.CapsuleGeometry(r, len, 4, 10), mat, 0, -len / 2 - r * .3, 0, p);
    if (end){ var e = M(new T3.SphereGeometry(end[0], 12, 10), end[1], 0, -len - r * .6, end[2] || 0, p); e.scale.set(1, .8, end[2] ? 1.35 : 1); }
    return p;
  }
  var legL = limb(.05, .033, furM, -.045, .12, [.04, footM, .015]), legR = limb(.05, .033, furM, .045, .12, [.04, footM, .015]);
  g.add(legL); g.add(legR);
  var torso = M(new T3.CapsuleGeometry(.075, .05, 6, 14), shirtM, 0, .19, 0); torso.scale.set(1, 1, .9);
  var armL = limb(.06, .022, shirtM, -.095, .245, [.03, furM]), armR = limb(.06, .022, shirtM, .095, .245, [.03, furM]);
  armL.rotation.z = -.25; armR.rotation.z = .25; g.add(armL); g.add(armR);
  // 尾巴
  if (A.tail === 'long'){ var tl = M(new T3.CapsuleGeometry(.018, .16, 4, 8), furM, 0, .2, -.1); tl.rotation.x = -.9; }
  else if (A.tail === 'fluffy'){ var tf = M(new T3.SphereGeometry(.06, 14, 10), furM, 0, .2, -.13); tf.scale.set(.8, 1.5, .8); tf.rotation.x = -.8; M(new T3.SphereGeometry(.03, 10, 8), lightM, 0, .29, -.19); }
  else if (A.tail === 'puff') M(new T3.SphereGeometry(.035, 12, 10), lightM, 0, .14, -.08);
  else if (A.tail === 'short'){ var ts = M(new T3.CapsuleGeometry(.016, .06, 4, 8), furM, 0, .2, -.09); ts.rotation.x = -1.1; }
  else if (A.tail === 'curl'){ var tc = M(new T3.TorusGeometry(.022, .008, 6, 14, Math.PI * 1.6), noseM, 0, .17, -.085); tc.rotation.y = Math.PI / 2; }
  // 頭
  var head = new T3.Group(); head.position.y = .39; g.add(head);
  var face = M(new T3.SphereGeometry(.14, 24, 18), furM, 0, 0, 0, head); face.scale.set(1, .94, .96);
  var e = A.ear;
  if (e === 'cat' || e === 'fox' || e === 'pig'){
    var eh = e === 'fox' ? .12 : e === 'pig' ? .06 : .09;
    [-1, 1].forEach(function(s){
      var ear = M(new T3.ConeGeometry(.05, eh, 4), furM, s * .085, .12 + eh / 3, 0, head); ear.rotation.set(e === 'pig' ? .5 : 0, Math.PI / 4, -s * .35);
      if (e !== 'pig'){ var inn = M(new T3.ConeGeometry(.028, eh * .65, 4), innerM, s * .085, .115 + eh / 3, .022, head); inn.rotation.set(0, Math.PI / 4, -s * .35); }
    });
  } else if (e === 'long'){
    [-1, 1].forEach(function(s){
      var ear = M(new T3.CapsuleGeometry(.03, .17, 4, 10), furM, s * .05, .24, -.02, head); ear.rotation.z = -s * .15; ear.scale.z = .6;
      var inn = M(new T3.CapsuleGeometry(.014, .13, 4, 8), innerM, s * .05, .24, .002, head); inn.rotation.z = -s * .15; inn.scale.z = .4;
    });
  } else if (e === 'round' || e === 'koala'){
    var er = e === 'koala' ? .065 : .045, ex = e === 'koala' ? .13 : .1, ey = e === 'koala' ? .08 : .115;
    [-1, 1].forEach(function(s){
      var ear = M(new T3.SphereGeometry(er, 14, 10), A.mark === 'panda' ? darkM : furM, s * ex, ey, -.01, head); ear.scale.z = .6;
      var inn = M(new T3.SphereGeometry(er * .55, 10, 8), innerM, s * ex, ey, er * .32, head); inn.scale.z = .3;
    });
  } else if (e === 'floppy'){
    [-1, 1].forEach(function(s){ var ear = M(new T3.CapsuleGeometry(.035, .09, 4, 10), innerM, s * .135, .0, -.01, head); ear.rotation.z = s * .3; ear.scale.z = .55; });
  } else if (e === 'tuft'){
    [-.025, 0, .025].forEach(function(x, i){ var f = M(new T3.SphereGeometry(.022, 8, 8), furM, x, .15 + (i === 1 ? .015 : 0), .01, head); f.scale.y = 1.6; f.rotation.z = -x * 12; });
  } else if (e === 'frog'){
    [-1, 1].forEach(function(s){ M(new T3.SphereGeometry(.055, 14, 10), furM, s * .062, .105, .05, head); });
  }
  var noInk = [], eyes = [];
  if (A.mark === 'face'){ var fc = M(new T3.SphereGeometry(.11, 20, 14), lightM, 0, -.015, .045, head); fc.scale.set(1.05, .95, .9); }
  if (A.mark === 'panda') [-1, 1].forEach(function(s){ var pt = M(new T3.SphereGeometry(.038, 12, 10), darkM, s * .055, -.008, .112, head); pt.scale.set(.85, 1.15, .4); pt.rotation.z = s * .4; noInk.push(pt); });
  if (A.mark === 'tiger') [-.05, 0, .05].forEach(function(x){ var st = M(new T3.BoxGeometry(.012, .05, .02), darkM, x, .1, .085, head); st.rotation.x = -.6; noInk.push(st); });
  if (A.snout === 'muzzle'){ var mz = M(new T3.SphereGeometry(.06, 16, 12), lightM, 0, -.05, .1, head); mz.scale.set(1.15, .75, .7); }
  // 眼睛
  [-.052, .052].forEach(function(x){
    var y = e === 'frog' ? .115 : -.012, z = e === 'frog' ? .1 : .124;
    var eye = M(new T3.SphereGeometry(.028, 14, 12), new T3.MeshBasicMaterial({color:'#2b2140'}), x * (e === 'frog' ? 1.2 : 1), y, z, head);
    eye.scale.set(.82, 1.25, .5); eyes.push(eye); noInk.push(eye);
    var hl = M(new T3.SphereGeometry(.011, 8, 6), new T3.MeshBasicMaterial({color:'#ffffff'}), .3, .4, 1.15, eye); hl.scale.set(1.2, .8, 2); noInk.push(hl);
    var blush = M(new T3.SphereGeometry(.024, 12, 8), new T3.MeshBasicMaterial({color:'#ff8fa8', transparent:true, opacity:.55, depthWrite:false}), x * 1.5, -.055, .11, head);
    blush.scale.set(1.1, .5, .35); noInk.push(blush);
  });
  // 鼻子、嘴
  if (A.snout === 'beak'){ var bk = M(new T3.ConeGeometry(.03, .07, 8), noseM, 0, -.045, .15, head); bk.rotation.x = Math.PI / 2; }
  else if (A.snout === 'pig'){ var sn = M(new T3.CylinderGeometry(.04, .042, .035, 16), noseM, 0, -.045, .135, head); sn.rotation.x = Math.PI / 2; [-1, 1].forEach(function(s){ noInk.push(M(new T3.SphereGeometry(.007, 6, 6), new T3.MeshBasicMaterial({color:INK}), s * .014, -.045, .153, head)); }); }
  else if (A.snout === 'bignose'){ var bn = M(new T3.SphereGeometry(.038, 14, 10), noseM, 0, -.035, .13, head); bn.scale.set(.8, 1.05, .6); }
  else if (A.snout !== 'none'){ var ns = M(new T3.SphereGeometry(.016, 10, 8), noseM, 0, A.snout === 'muzzle' ? -.035 : -.04, A.snout === 'muzzle' ? .158 : .136, head); ns.scale.set(1.3, .9, .9); noInk.push(ns); }
  if (A.snout !== 'beak' && A.snout !== 'pig' && A.snout !== 'bignose'){
    var mouth = M(new T3.TorusGeometry(.014, .004, 6, 12, Math.PI), new T3.MeshBasicMaterial({color:'#a24a52'}), 0, A.snout === 'muzzle' ? -.068 : -.062, A.snout === 'muzzle' ? .152 : .132, head);
    mouth.rotation.z = Math.PI; noInk.push(mouth);
  }
  if (A.mark === 'whisker') [-1, 1].forEach(function(s){ [0, 1].forEach(function(k){ var w = M(new T3.BoxGeometry(.06, .003, .003), new T3.MeshBasicMaterial({color:INK}), s * .1, -.05 - k * .015, .1, head); w.rotation.z = s * (k ? -.12 : .12); noInk.push(w); }); });
  noInk.forEach(function(m){ m.userData.noInk = true; });
  g.scale.setScalar(1.05);
  shadowAll(g); noInk.forEach(function(m){ m.castShadow = false; });
  inkAll(g, .009); scene.add(g);
  var tag = document.createElement('div'); tag.className = 'av3' + (mine ? ' mine' : '');
  if (mine){ tag.title = '點一下換動物、改名字'; tag.addEventListener('click', function(ev){ ev.stopPropagation(); openNamePop(); }); tag.addEventListener('pointerdown', function(ev){ ev.stopPropagation(); }); }
  labRoot.appendChild(tag);
  return {g:g, head:head, eyes:eyes, legL:legL, legR:legR, armL:armL, armR:armR, shirt:shirtM, tag:tag, animal:A.id, last:'', px:null, pz:null, yaw:0, blink:2 + Math.random() * 3, t:0};
}
function dropAv(a){ scene.remove(a.g); a.tag.remove(); a.g.traverse(function(m){ if (m.geometry && !m.userData.ink) m.geometry.dispose(); }); }
function poseAv(a, o, name, shirt, dt){
  var x = o.gx, z = o.gy, moving = false;
  if (a.px !== null){ var dx = x - a.px, dz = z - a.pz; if (dx * dx + dz * dz > 1e-6){ moving = true; var want = Math.atan2(dx, dz), d = ((want - a.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; a.yaw += d * Math.min(1, dt * 12); } }
  a.px = x; a.pz = z;
  a.g.position.set(x, standY(x, z), z); a.g.rotation.y = a.yaw;
  var sw = moving ? Math.sin(o.phase) * .7 : 0;
  a.legL.rotation.x = sw; a.legR.rotation.x = -sw; a.armL.rotation.x = -sw * 1.1; a.armR.rotation.x = sw * 1.1;
  a.t += dt;
  a.g.position.y += moving ? Math.abs(Math.sin(o.phase)) * .04 : 0;                     // 走路一蹦一蹦
  a.head.rotation.z = moving ? Math.sin(o.phase) * .07 : Math.sin(a.t * 1.6) * .04;   // 走路晃頭、站著輕輕搖
  a.head.position.y = .39 + (moving ? 0 : Math.sin(a.t * 2.4) * .006);                // 站著時的呼吸
  a.blink -= dt;
  var lid = a.blink < 0 ? .12 : 1.25; if (a.blink < -.12) a.blink = 2 + Math.random() * 3.5;
  a.eyes.forEach(function(e){ e.scale.y = lid; });
  var label = (hasBadWord(name) ? '旅人' : name) + (a.tag.classList.contains('mine') ? '（你）✎' : '');
  if (label !== a.last){ a.tag.textContent = label; a.last = label; }
  if (shirt && a.shirtHex !== shirt){ a.shirt.color.set(shirt); a.tag.style.background = shirt; a.shirtHex = shirt; }
}
function syncAvatars(dt){
  var A = animalOf(me);
  if (O.avs.me && O.avs.me.animal !== A.id){ var keep = O.avs.me; dropAv(keep); O.avs.me = null; }
  if (!O.avs.me){ O.avs.me = makeAv(A, me.shirt, true); if (keep){ O.avs.me.yaw = keep.yaw; } }
  poseAv(O.avs.me, walker, me.name, me.shirt, dt);
  Object.keys(PEERS).forEach(function(id){
    var p = PEERS[id], d = p.av.data || {}, PA = animalOf(d, id);
    if (O.avs[id] && O.avs[id].animal !== PA.id){ dropAv(O.avs[id]); delete O.avs[id]; }
    if (!O.avs[id]) O.avs[id] = makeAv(PA, d.shirt, false);
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
  O.zoneTags.forEach(function(o){ put(o.el, o.x, o.y, o.z, 30, 60, .7); });
  Object.keys(O.avs).forEach(function(id){ var a = O.avs[id]; put(a.tag, a.g.position.x, a.g.position.y + .7, a.g.position.z, 18, 40, .6); });
}

/* ---------- 天色：跟本機時間同步，或手動切白天／黃昏／夜晚 ---------- */
var SKY_LABEL = {now:'現在', day:'白天', dusk:'黃昏', night:'夜晚'}, SKY_HOUR = {day:10.5, dusk:18.1, night:22};
function skyHour(){ return prefs.sky === 'now' ? nowHour() : SKY_HOUR[prefs.sky]; }
function updateSky(force){
  var h = skyHour(), dk = darkness(h);
  if (!force && Math.abs(dk - sky.dk) < .002 && sky.h === Math.floor(h * 4)) return;
  sky.dk = dk; sky.h = Math.floor(h * 4);
  var dusk = dk > 0 && dk < 1 ? 1 - Math.abs(dk - .5) * 2 : 0;
  var topC = col('#2f86e0').lerp(col('#060c26'), dk).lerp(col('#5b5fb0'), dusk * .7);
  var horC = col('#c6ecfa').lerp(col('#1b2c58'), dk).lerp(col('#ffb48a'), dusk * .8);
  O.dome.material.uniforms.top.value.copy(topC); O.dome.material.uniforms.hor.value.copy(horC);
  scene.fog.color.copy(horC);
  var day = h >= 5 && h < 19.5, az = (h - 6) / 13.5 * Math.PI;
  var elev = day ? Math.max(.12, Math.sin(Math.max(.05, Math.min(Math.PI - .05, az)))) : .7;
  var dir = day ? Math.cos(Math.max(.05, Math.min(Math.PI - .05, az))) : -.4;
  sun.position.set(C[0] + dir * 18, 4 + elev * 20, C[1] - 10 + dir * 4);
  sun.target.position.set(C[0], 0, C[1]);
  sun.color.copy(col('#fff4e0').lerp(col('#ffb06b'), dusk).lerp(col('#9db8ff'), dk * (1 - dusk)));
  sun.intensity = 1.9 * (1 - dk) + .75 * dk;
  hemi.intensity = 1.25 * (1 - dk) + .7 * dk;
  hemi.color.copy(col('#dff3ff').lerp(col('#3a4f88'), dk)); hemi.groundColor.copy(col('#8a9a6a').lerp(col('#1a2238'), dk));
  O.water.material.color.copy(col('#47c6e6').lerp(col('#1d4f86'), dk).lerp(col('#f0a58f'), dusk * .35));
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
  if (on){ cam.dist = Math.max(cam.dist, 24); cam.pitch = Math.max(cam.pitch, .78); }
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
  var nx = walker.gx + dx * .35, nz = walker.gy + dz * .35;
  if (!walkableAt(nx, nz)){                                    // 撞牆就沿著牆滑
    if (walkableAt(walker.gx + dx * .35, walker.gy)) nz = walker.gy;
    else if (walkableAt(walker.gx, walker.gy + dz * .35)) nx = walker.gx;
    else return true;
  }
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
      if (id) showTip(toolById[id], e.clientX, e.clientY - 12); else $('tip').classList.remove('show');
      return;
    }
    ptr[e.pointerId] = {x:e.clientX, y:e.clientY};
    var ids = Object.keys(ptr);
    if (ids.length === 2 && drag && drag.pinch){
      var a = ptr[ids[0]], b = ptr[ids[1]];
      cam.dist = Math.max(1.6, Math.min(40, drag.dist * drag.pinch / Math.hypot(a.x - b.x, a.y - b.y))); return;
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
    var hb = pickAt(e.clientX, e.clientY, O.pick);
    if (hb){ openTool(hb.object.userData.id); return; }
    var hg = pickAt(e.clientX, e.clientY, [O.terrain]);
    if (hg){ if (cam.overview) setOverview(false); walker.goal = null; walkTo(hg.point.x, hg.point.z); }
  }
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', function(){ $('tip').classList.remove('show'); });
  canvas.addEventListener('wheel', function(e){ e.preventDefault(); cam.dist = Math.max(1.6, Math.min(40, cam.dist * Math.pow(1.0012, e.deltaY))); }, {passive:false});
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
  }
  O.boats.forEach(function(b){ b.g.position.set(C[0] + Math.cos(b.a) * b.r, SEA + Math.sin(tm * 2 + b.a * 5) * .03, C[1] + Math.sin(b.a) * b.r); b.g.rotation.y = -b.a + (b.s > 0 ? 0 : Math.PI); b.g.rotation.z = Math.sin(tm * 1.7 + b.a) * .05; });
  if (O.flows) O.flows.forEach(function(f){ f.m.position.copy(f.c.getPoint((tm * .32 + f.o) % 1)); });
  // 選取的建築：光圈；探索過的：小旗
  if (state.sel && O.blds[state.sel]){ var sb = O.blds[state.sel]; O.ring.visible = true; O.ring.position.set(sb.t.gx, sb.base + .04, sb.t.gy); var s = 1 + Math.sin(tm * 4) * .06; O.ring.scale.set(sb.t.s * 2.2 * s, sb.t.s * 2.2 * s, 1); }
  else O.ring.visible = false;
  TOOLS.forEach(function(t){ O.blds[t.id].flag.visible = !!state.seen[t.id]; });
  syncAvatars(dt);
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
  scene = new T3.Scene(); scene.fog = new T3.Fog('#c6ecfa', 34, 95);
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
  var sc = sun.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 70; sun.shadow.bias = -.0004; sun.shadow.normalBias = .02;
  scene.add(sun); scene.add(sun.target);
  raycaster = new T3.Raycaster(); ndc = new T3.Vector2(); V = new T3.Vector3();
  buildTerrain(); buildWater(); buildRoads(); TOOLS.forEach(buildBuilding); buildDecor(); buildZoneMarks(); buildTrees(); buildFlowers(); buildSkyStuff(); buildLabels();
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

window.Island3D = {
  enter:enter, leave:leave, links:buildLinks,
  overview:function(){ setOverview(!cam.overview); },
  get active(){ return active; }, get built(){ return built; }, cam:cam, prefs:prefs, O:O
};
})();
