# CLAUDE.md — startup-island（創業島）

單檔前端「工具導覽地圖」：把程式牆（`小工具/desktop-program-wall`）裡 41 個已上線、與創業相關的線上工具，放進一座可探索的等角（isometric）SVG 島嶼。島上有 9 個地點（場地），每棟建築是一個工具，點了開右側資訊抽屜→「前往工具」新分頁開啟。**本專案本身不含任何創業計算／生成邏輯**（性質同 `animal-ecommerce-adventure`）。無框架、無建置，`index.html`＋`manual.html`。

2026-10-23 建立。使用者要求「參考 https://puma.taipei/heart-island，並參考程式牆中的線上軟體，製作一個關於創業的主題」，中途提醒**注意智財權**：只借概念層級（可探索地圖＋工具之間的關聯線＋時間軸＋分步導覽），**原站的標語句型、介面用語、章節名稱、載入文字、吉祥物符號一律不可沿用**。初稿曾照搬（「一座相連的城市」「正在組合…城市」「HELLO, …」「CITY LOG · LIVE」「•ᴗ•」、工具列「名牌／搬運／協作線／暫停／鳥瞰／日誌」），已全部改寫為：地圖／清單／時間軸、標籤／拖曳／接力線／靜止／看全島／足跡、「從一個點子出發，走完整座島」、「小船靠岸中，工具正在搬上島…」、Welcome Aboard、吉祥物「小創」改為自畫臉＋小帆。**日後改文案不要再往原站用語靠。**圖形全部程式自繪；字型 Huninn／Noto Sans TC／JetBrains Mono 皆 Google Fonts 開源授權。

## 資料（全部寫死在 `index.html` 常數，手動維護）
- `ZONES`：8 街區（點子灣、策略高地、試算港、資金廣場、品牌街、電商碼頭、營運區、指揮塔）＋顏色＋格子錨點 `at:[gx,gy]`。
- `TOOLS`：40 筆 `{id(=GitHub repo 名), zone, short(標籤用短名), name, lic, hour:[起,迄), month:[起,迄], role, input, output, url?, tall?}`。網址規則 `toolUrl()`：有 `url` 用之，否則 `https://m255525.github.io/<id>/`（2026-10-23 用 GitHub API 確認這些 repo 都沒有 homepage、都開 Pages；只有 `content-workflow-studio-cf` 是 Cloudflare 網址）。
- **需序號標示（2026-10-23 使用者要求）**：`lic:true` 的工具在名稱前加**紅點**（`--lic:#e11d2e`，刻意和強調色珊瑚橘區分）——地圖標籤（SVG circle，標籤寬度多留 12px）、hover 提示、清單卡片、抽屜標題、接力線序列都有；頂列與標題卡有「● 需序號」圖例與數量；manual 的街區表也逐一標上。
- `lic`：2026-10-23 掃各專案 `index.html` 有無 `LICENSE_CHECK_URL = 'https…'` 判定；`IPA_Kano` 的 index 是轉址頁，依 github-dashboard `LICENSED_REPOS` 標為需序號；`content-workflow-studio-cf` 需登入。工具日後加／拿掉序號要回來改。
- `LINKS`：24 條「接力線」，`chain`（依序相連）或 `star`（第一個連到其餘）。內容是課程整理的建議使用順序，**工具間沒有自動傳資料**（頁面與 manual 都有註明）。
- `DAY_SCRIPT`／`MONTH_SCRIPT`：時間軸旁白；`STORY`：10 步導覽（3 章：創業者的一天／兩年創業旅程／創業島地圖），每步 `act()` 會切檢視、設時間、移鏡頭。
- 新增工具：在 `TOOLS` 對應街區加一筆即可（每街區最多 8 個，受 `SLOTS` 限制；超過要加 slot 並確認不壓到相鄰街區）。

## 實作重點
- 等角投影 `iso(gx,gy)=[(gx-gy)*36,(gx+gy)*18]`；建築／樹依 `gx+gy` 由後往前排序繪製。建築位置 = 街區錨點 + `SLOTS[i]*1.6`。
- 標籤避讓：由前往後放，撞到已放好的就往上疊 11px 並畫虛線引線。
- 街區名稱放在地塊**朝外**（遠離島中心）那側；放左角或前角都會跑進鄰區（踩過）。
- 鏡頭＝SVG `viewBox` 動畫（`animateTo`）。`padBox()` 依畫面保留頂列、工具列／時間軸、手機導覽卡高度。2026-10-23 使用者要「島再大一點」：取景改成不留邊（不再保留左側標題卡空間、`islandBox` 上下邊距縮小、拿掉 0.96 係數），標題卡縮小並加「收合／展開」（`startupIslandTitleMini`）；雲層移到接力線與標籤之下避免擋字。手機直向受寬度限制，整島仍偏小，靠雙指縮放。**rAF 第一格的 timestamp 可能早於 `performance.now()`，進度要 clamp ≥0**，否則 viewBox 變負值報錯（踩過）。
- 「招牌」：地圖檢視的天色跟使用者本機時間同步（`darkness()`），夜裡亮窗（`L.lights` 疊在夜色之上）的是該時段常用的工具；時間軸檢視未亮的建築與標籤淡化。
- 吉祥物、小船、雲、接力線流動在「靜止」或 `prefers-reduced-motion` 時停止。
- localStorage：`startupIslandSeen`（造訪過的建築，插小旗）、`startupIslandLog`（足跡，最多 60 筆）、`startupIslandStoryDone`、`startupIslandPrefs`（接力線勾選、標籤開關）、`startupIslandMarquee`。
- 測試 hook：`window.__startupIsland`（`state/TOOLS/LINKS/ZONES/setView/setT/setTimeMode/openTool/toolUrl`）。

## 配套
- ✅ 頂部跑馬燈（共用 Apps Script 端點，滑鼠移入暫停）
- ✅ PWA（manifest＋service-worker＋icons，圖示用 PIL 自畫等角小島）
- ✅ `manual.html`、使用警語、創作者資訊
- ❌ 序號授權（導覽入口，不需要）
- ✅ 訪客計數器（visitor-badge，`page_id=m255525.startupisland`）、GitHub Pages（Actions workflow）

## Port／測試
- port **8834**（`.claude/launch.json` 的 `startup-island`）；程式牆 `LOCAL_APPS` 也有一筆 static。
- 驗證：Playwright 開 `http://127.0.0.1:8834/`，用 `__startupIsland` 切檢視、`openTool()`、`setT()`；375px 寬 `scrollWidth===clientWidth`；用 Python 逐一請求 40 個 `toolUrl` 應全為 200。

## 2026-10-23 改版：場地化島嶼＋訪客角色
使用者要求「島上多一點綠地、公園、學校、河川、小山，相關軟體放到對應場地」、「每位訪客一個隨機名字的人物，跟著滑鼠移動但必須用走的」、「加入線上版內容工作流工作室與節點補充包設計工具並放到合適地點」。
- **9 個場地**（`ZONES`，`ground` 地面色、`extra` 額外地塊、`label` 名稱位置覆寫）：點子公園（湖＋涼亭 pavilion）、策略山丘（兩層台地，建築 `elev` 26px，AI 顧問團是觀景台 observatory）、創業學校（校舍 school＋操場跑道；收 SWOT 卡牌、跨境物流遊戲、動物大冒險、人才投資開課）、試算商辦區（tower，含電商健檢）、資金廣場（civic 柱廊＋噴水池）、品牌商店街（shop 遮陽棚＋中間街道）、河口碼頭（warehouse＋木棧橋；流量排名是 `FREE` 獨立的燈塔 lighthouse）、營運社區（house 斜屋頂）、指揮塔（spire 內容工作流＋warehouse 節點補充包工作坊）。
- **位置全部寫在 `POS`（格子座標）**，外型 `STYLE`（依場地）／`SPECIAL`（個別工具）→ `SHAPE`（足跡半寬 s、牆高 h、屋頂 roof）；`t.top = elev + h + roof` 給標籤、接力線、旗子用。新增工具要在 `POS` 給座標並確認不壓到河（`riverDist`）與其他場地。
- **地形**：`C=[9,9]` 島中心、`islandR(a)` 約 12.4 格；`RIVER` 控制點→ `catmull` 取樣 `RIVER_S`；道路＝各場地中心到指揮塔的二次曲線，過河段（`riverDist<.7`）自動畫木橋並記到 `BRIDGE_S`；`HILLS`（策略山丘、觀景小山）一層層畫台地，`groundAt()` 給高度；`GREENS` 河畔綠地；`WATERS` 池塘與噴水池；樹 150 棵以內，避開河、路、建築、場地（公園內允許）。
- **訪客角色**：`startupIslandAvatar` 存 `{name, shirt, hair}`，名字預設＝形容詞＋角色＋暱稱隨機組合；**可自己取名**：點地圖上自己的名牌（「（你）✎」，`L.ptags` 裡只有自己的名牌開 pointer-events）或說明卡／足跡的「改名字」→ `#namePop` 對話框（輸入框＋「隨機一個」，`cleanName()` 去控制字元與 `<>`、最多 12 字，空白會擋），存 `startupIslandAvatar` 並送 `look` 同步給其他訪客。走路：0.5 格一格的可走網格（海、河（橋除外）、建築足跡、水景不可走）→ A*（8 方向、不切牆角）→ 視線拉直 → 每秒 2.1 格移動，腿手擺動、上下晃、左右翻面，高度跟地形；每幀依 `gx+gy` 把角色插到建築／樹之間做前後遮擋。滑鼠移動（非觸控）每 140ms 重新規劃一次；點空地走過去；點建築走到門口；工具列「人物跟隨」可關。走進新場地會寫進足跡。
- 吉祥物「小創」已於同日依使用者要求移除。

## 多人同島（presence）
使用者要求「有其他人也在這個島，都可以看到」。
- **後端**：`presence-worker/`（Cloudflare Worker＋Durable Object `Island`，WebSocket Hibernation API，單一房間 `idFromName('main')`）。只轉播 `{id, name, shirt, hair, gx, gy}`，**不寫任何儲存**，離線即消失。驗證：Origin 白名單（`m255525.github.io`、localhost／127.0.0.1、`null`＝file://）、名字去控制字元截 24 字、顏色 `#rrggbb`、座標夾在 -5..25、每連線每秒最多 15 則、單房最多 200 人；同 id 重連會踢掉舊連線。
- **協定**：client→`hello`/`move`（移動中每 180ms，位移 >0.03 格才送）/`look`（換名字）/`ping`（25s）；server→`snapshot`/`join`/`move`/`look`/`leave`。
- **前端**：`PRESENCE_URL` 預設 `wss://startup-island-presence.content-workflow.workers.dev/ws`；網址加 `?presence=ws://127.0.0.1:8787/ws` 可改連本機。id 每次載入頁面隨機產生（不用 sessionStorage，複製分頁會撞號互踢）。其他訪客用同一個 `makeAvatar()` 畫，收到位置後以走路速度（落後 >1.5 格時加倍、>8 格直接就位）走過去，`placeDepth()` 處理前後遮擋；自己的名牌加「（你）」。斷線指數退避重連（1.5s→30s），連不上就只剩自己，其他功能不受影響。
- **本機測試**：這台 `wrangler dev` 在沙箱內會 `spawn UNKNOWN`（workerd 被擋），改用 Python 模擬轉播站（同協定，`websockets` 套件裝在暫存目錄）開兩個分頁驗證：互相看見、即時走動、換名字同步、關分頁另一邊顯示「離開了島」。Worker 本身需部署後再驗證。
- **部署**：`cd presence-worker && npx -y wrangler@4 deploy`（`wrangler deploy` 在沙箱內可正常執行，只有 `wrangler dev` 會被擋）。`.gitignore` 已排除 `.wrangler/`、`node_modules/`，Pages 上 `presence-worker/.wrangler/` 確認 404。
- **人物名牌**放在獨立最上層 `L.ptags`（`av.tagWrap`），身體留在 `L.blds` 做前後遮擋——走到建築後面身體會被擋住，但名字一定看得到。

## 部署（2026-10-23 使用者同意上線）
- 網頁：公開 repo <https://github.com/M255525/startup-island>，GitHub Pages <https://m255525.github.io/startup-island/>（`master` 分支、`.github/workflows/deploy-pages.yml`；先 push 再 `gh api .../pages -X POST -f build_type=workflow`，第一次 push 觸發的 run 也成功）。
- 轉播：Cloudflare Worker <https://startup-island-presence.content-workflow.workers.dev>（`/` 回 ok；`/ws` 對非白名單 Origin 回 403、`m255525.github.io` 回 101）。
- 已用兩個瀏覽器分頁對正式網址驗證：互相看見、換名字同步、走動同步、人數 2。
- 程式牆：從 `LOCAL_APPS` 移除、改加 `REPO_META`（github-dashboard 同步補一行）。

## manual.html 的創業者實用資訊（2026-10-23 使用者要求「操作手冊放更多創業者的資訊」）
頂部目錄（錨點）＋ PART 1 島上怎麼玩／PART 2 創業者實用資訊／PART 3 其他。PART 2：創業路線圖七階段（每階段紅字問題＋待辦＋島上工具連結，需序號的加紅點）、開業手續清單、政府資源（鳳凰貸款／就業保險失業者創業貸款／SBIR／產業人才投資方案）、一定要懂的數字（公式＋早午餐店算例）、新手常見的坑、一週練習、官方網站。
- **貸款內容來源是 `政府補助認證產生器/loan-eligibility-checker` 的 `RULES` 對照表**（115.8.1 起適用的修正版要點／辦法），SBIR 階段長度取自 `sbir-skill`；法規異動時兩邊一起改。不寫未查證的數字（利息補貼、補助比例、電話都刻意沒寫，請讀者看官方網站）。
- 官方網站連結 2026-10-23 用 curl 驗證可開；`findbiz.nat.gov.tw` 對程式請求回 403，所以改連 `gcis.nat.gov.tw`。
- 手機版（≤560px）表格改成上下堆疊、公式可換行，避免橫向溢出。

## 名字禁用字詞過濾＋創作者資訊（2026-10-23）
- **禁用字詞清單只有一份：`presence-worker/badwords.js`**（`BAD_WORDS`＋`normName()`＋`hasBadWord()`）。Worker 的 `cleanName()` 用它把不雅名字改成「旅人」（伺服器端才是真正的防線，繞過網頁直接連線也擋得住）；`index.html` 裡「名字禁用字詞」區塊是用 `scratchpad` 的轉換腳本從 badwords.js 產生的 ES5 版本——**改清單時改 badwords.js，再把同樣內容貼回 index.html 的那個區塊（`// ---- 名字禁用字詞 ... end ----` 之間），然後重新 `wrangler deploy`**。
- 比對前正規化：小寫、全形轉半形、leet 字（0→o、1→i、3→e、4→a、5→s、7→t、@→a、$→s）、去掉空白與標點；用詞組（「幹你」）不用單字（「幹」），避免誤擋「能幹」「幹勁」。英文刻意不放 `fuc`、`sht`、`kill`、`ass` 這類太短的片段（會擋到 fuchsia、Ashton、skill、class）。
- 網頁端：自訂名字含禁用字詞會提示「這個名字含有不適合的字詞，請換一個。」；載入時舊名字若含禁用字詞自動換隨機名；其他訪客名字也再檢查一次，命中就顯示「旅人」；`randomName()` 保證不會抽到。已用 node 測 24 個案例（含變體與誤擋測試）與全部 1,920 種隨機名字組合，皆通過。
- 創作者資訊：`manual.html#creator`「關於創作者」（介紹、專長、證照與培訓、經歷），內容逐字取自 `影音工具/ai-video-studio/manual.html` 的「關於創作者」，只把最後一句換成創業島；`index.html` 頁尾放摘要＋連到完整經歷。日後創作者資料更新，各工具手冊要一起同步。

## 立體漫遊（2026-10-25）
使用者要求「創業島更立體化、更有沉浸式的感覺」。新增第四個檢視 **「立體」**（`data-view="3d"`），程式在獨立檔 **`island3d.js`**（`window.Island3D`），切到立體時才 `import()` Three.js `0.160.0`（jsdelivr ES module），不影響平面地圖載入速度；SW 快取已加 `island3d.js`（cache v2）。
- **不另外維護一份島**：地形、建築、河、路、橋、樹、人物全部讀 `index.html` 的全域資料（`TOOLS`/`ZONES`/`RIVER_S`/`ROAD_S`/`BRIDGE_S`/`HILLS`/`WATERS`/`GREENS`/`L.trees`/`walker`/`PEERS`/`me`）。改 `POS`、加工具、改地形，兩種檢視自動一致。`buildMap()` 多了一行 `L.trees = trees` 給立體用。
- 座標 x=gx、z=gy；SVG 像素高度 × `HK=1/30`。`landY()` 是解析式地形高度（草地 .5、海平面 `SEA=.2`、河道與池塘往下挖、山丘用 smoothstep 圓台）；**海、河、池塘共用同一張水面**（land 高於水面就蓋住），河床低於水面就自然出現河。橋面 `DECK=.58`，`standY()` 在橋上取橋面高度。道路用 ribbon 貼地，`ROAD_S` 每 49 點一條路（對應 `buildMap` 的 `k<=48`）。
- 建築依 `t.style` 各有 3D 造型（涼亭／斜屋頂住家／倉庫／學校旗桿操場／柱廊／遮陽棚商店／高樓／燈塔光束／觀景台圓頂／指揮塔天線）；窗戶是 CanvasTexture 重複貼圖，`emissiveMap` 控制夜裡亮窗（該時段常用的工具才亮）。
- 操作：拖曳轉視角、滾輪／雙指縮放、點地面 `walkTo()`、點建築或 HTML 名牌 `openTool()`、WASD／方向鍵直接推 `walker.path`（撞牆沿牆滑，用 `walkableAt()`）。走路動畫、多人同步仍由主程式 `stepWalker`/`netTick` 負責，立體只讀位置來畫。**擋在鏡頭與自己之間的建築自動半透明**（Ray×Box3）。走進地點顯示 `#zoneBanner`。
- 工具列在立體時：「看全島」切環島旋轉鳥瞰、「拖曳」隱藏、多出 `#tbSky`（現在／白天／黃昏／夜晚）與 `#tbSound`（WebAudio 合成浪聲／鳥叫／蟲鳴，預設關）；「接力線」畫成 3D 弧線＋流動光點（`drawLinks()` 末尾呼叫 `Island3D.links()`）。
- localStorage：`startupIslandView`（記住上次是地圖或立體，導覽看完才套用）、`startupIsland3d`（`{sky, sound, hint}`）。導覽多一步「走進立體島」（共 11 步）。
- 沒有 WebGL 或 CDN 載入失敗 → 顯示訊息後自動回到地圖。
- 驗證（2026-10-25，Playwright 1366×800 與 375×740）：載入無 console 錯誤、夜景／鳥瞰／接力線截圖正常、WASD 可走、切換地圖↔時間軸↔立體正常、375px `scrollWidth===clientWidth`。

## 日本動畫風（2026-10-25）
使用者要求「人物與景物更卡通化、更可愛、像日本動畫的畫面」。
- **卡通著色**：`std()` 改回傳 `MeshToonMaterial`＋三段色階 `toonGrad()`（120/200/255，NearestFilter），自動丟掉 roughness／metalness／flatShading 參數；地形、水面也用 toon。`renderer.toneMapping = NoToneMapping`（ACES 會讓卡通色變灰）。
- **描邊**：背面外推法 `inkAll(group, 粗細)`／`inkMesh()`，外推方向用 `ensureOnrm()` 算的「同位置平均法線」（存成 `onrm` attribute），方塊轉角才不會裂。描邊網格 `userData.ink`、不參與點選與陰影；InstancedMesh 的描邊共用 `instanceMatrix`。眼睛、腮紅、旗子、燈塔光束等設 `userData.noInk`。建築變透明時描邊直接隱藏（`b.lines`）。
- **天空**：漸層天球 `O.dome`（ShaderMaterial，天頂深藍→地平線淡藍，跟著鏡頭），霧色＝地平線色；地平線一圈 11 朵積雨雲（`fog:false`）。黃昏偏粉橘，夜晚深藍。
- **人物 Q 版**：大頭（r .14）、瀏海＋後髮、大眼（含白色高光）、腮紅、微笑、手腳短；走路一蹦一蹦、晃頭，站著會呼吸、隨機眨眼。平面地圖的 SVG 小人也同步改成大頭、雙眼高光、腮紅、笑嘴，名牌上移到 `translate(0,-50)`。
- **樹與花**：圓樹＝4 顆球合併（`mergeGeo`），松樹＝兩層圓錐，約 1/11 是櫻花粉；草地撒 520 朵小花（避開路、河、場地、建築）。擋在鏡頭與自己之間的樹 `hideTrees()` 暫時縮成 0。
- 測試時加 `?presence=ws://127.0.0.1:1/ws` 讓多人連線刻意失敗（`?presence=` 空值不會生效，仍會連正式轉播站，測試角色會被其他訪客看到）。

## 動物角色＋場地特色（2026-10-25）
使用者要求「把人物換成動物，有更多動物可以選擇」、「每一個區塊的特色要夠明顯一點」。
- **動物**：`index.html` 的 `ANIMALS`（12 種：cat/dog/rabbit/bear/fox/panda/penguin/chick/frog/koala/tiger/pig，欄位 fur/light/inner/nose/dark＋ear/snout/tail/mark 型別），平面與立體共用；`animalOf(data, id)` 找不到（舊版網頁或舊轉播站沒傳）就依 id 雜湊配一隻，所以大家看到的一致。`startupIslandAvatar` 多了 `animal`，舊訪客載入時自動配一隻。`#namePop` 多了 `#animalGrid`（radio 按鈕，emoji＋名稱），存檔走 `setMyLook(name, animal)`，`hello`/`look` 都帶 `animal`。
- 平面：`drawAnimalHead()`／`drawAnimalTail()` 依型別畫（臉朝 +x），`setAvatarLook()` 動物變了才重畫；名牌上移到 `translate(0,-58)` 避開兔耳。`av.hair` 已移除，`av.data` 存最新資料（立體讀它）。
- 立體：`makeAv(A, shirt, mine)` 依同一份型別組 3D 頭（耳朵、口鼻、喙、花紋、尾巴），動物變了 `dropAv()` 重建。
- **轉播站** `presence-worker/index.js` 加 `ANIMALS` 白名單與 `cleanAnimal()`，`hello`/`look` 會轉播 `animal`。**清單要跟 index.html 一致**。改完要 `npx -y wrangler@4 deploy`（2026-10-25 由使用者執行部署完成，Version bb7240dc；若轉播站沒更新，別人看到的是依 id 配的動物，功能不會壞）。
- **場地特色**（立體 `buildZoneMarks()`）：每區入口拱門（場地中心往指揮塔方向和地塊邊界的交點＝道路出口，招牌是 CanvasTexture 寫場地名，等 `document.fonts.ready` 才畫）＋主題地標 `MARKS[z.id]`（燈泡、西洋棋、鉛筆＋鞦韆、損益兩平看板、金撲滿＋金幣、愛心氣球、貨櫃＋吊車、齒輪＋菜園），品牌街街道上方三角旗，指揮塔三圈旋轉光環。地標位置 `freeSpot()` 自動找空地（可以超出地塊 1.4 格但不能進別的場地），放大 1.1–2.1 倍；`blockWalk()` 讓角色繞開（直接改 `walkCells`，平面地圖也繞）；附近的樹會讓開。夜晚會亮的材質放 `O.glows`。地面主色混合比例 .08→.22，平面地圖場地底色 fill-opacity .1→.2、虛線框加粗。

## 角色不能穿越房屋（2026-10-25）
使用者回報「角色不能穿越房屋」。原因：尋路格子 0.5 格太粗，`los()` 只看取樣點所在格子的「中心」能不能走，拉直後的路線會切過房子邊角最深 0.25 格；鍵盤走路只檢查終點；離牆距離只留 0.12。
- 尋路格子 `WG` 改 0.25 格（120×120），另建碰撞格子 `FG`（0.08 格，376×376，`buildWalk()` 一次算好約 25ms）；`los()` 每 0.06 格查 `fineOK()`；`BODY=.2` 是建築外擴距離（身體半徑＋屋簷、遮陽棚）。
- 擋路一律用 `blockArea(gx, gy, r)`（兩種格子一起改，並重新規劃正在走的路線）；立體的地標、拱門柱子走 `blockWalk()` → `blockArea()`。
- 立體鍵盤：先試正前方 .35/.22/.12/.06 步長（`fineOK`＋`los`），都不行才沿牆滑，所以能貼到牆邊才停。
- 驗證：400 趟隨機 `walkTo()` 沿路每 0.03 格檢查都沒進到任何建築（`s+.08` 內），41 棟門口都走得到，規劃平均 1ms、最慢 19ms；立體按住 W 朝 41 棟建築走都沒穿進去。其他訪客的位置是對方傳來的、這邊只做直線補間，理論上轉角處仍可能被看到擦過一點點。

## 小地圖＋子母畫面（2026-10-25）
使用者要求「要用 pip 可以顯示地圖」。立體檢視左下 `#mini3d`：2D canvas（560×336，CSS 顯示 280×168，手機 150×90），等角投影和平面地圖同方向。`miniSetup()` 把海、沙灘、草地、山丘、場地、道路、河、建築、場地名稱先畫進離屏底圖，`drawMini()` 每 80ms 疊上選取光圈、鏡頭方向扇形、其他訪客（衣服色圓點＋動物 emoji）、自己（脈動光圈＋動物＋「你」）。點小地圖 → 反算格子座標 `walkTo()`。
- **子母畫面**：`#miniPip` 把小地圖畫布 `captureStream(15)` 接到隱藏的 `<video>`，再 `requestPictureInPicture()`（瀏覽器原生 PiP 浮動視窗）。PiP 開著時就算離開立體檢視也繼續畫（`mini.pip`）。不支援 `pictureInPictureEnabled` 或 `captureStream` 就隱藏按鈕。
- 工具列 `#tbMini`、面板 × 可收起，存在 `startupIsland3d.mini`。`.lab3d` 加 `z-index:5` 自成圖層，名牌才不會蓋到小地圖。
- 驗證：Playwright 點小地圖規劃出正確終點；點 PiP 後 `document.pictureInPictureElement` 就是那支 video（560×382 當時尺寸），切回平面地圖畫面仍在更新，「收回」可關閉。這次量 fps 時發現 Playwright 視窗被系統降到約 1 fps（平面地圖也一樣），不是程式問題；單次 `renderer.render` 約 35ms（Intel UHD）。

## 創業看板（2026-10-25）
使用者要求「損益看板要特別標註在地圖中，文字內容可以編輯，後台在 Google 試算表」。
- 試算表 **「board-template」`1reL32KcSUL-YNh4ICVxm-fROcjBzRiKVLjy05t7q_bs`**（使用者把範本 CSV 上傳成這份、設成知道連結的人可檢視；原本空白的「創業島的看板」`1h7s_0…` 已不使用）。Excel 會把「＝」開頭的格子當公式變成 `#NAME?`，上傳後又可能包上引號，`cleanBoard()` 會去掉頭尾成對引號。**格式：A 欄＝欄位名稱、B 欄＝內容**，第 1 列標題列「欄位｜內容｜字數上限｜說明」（C、D 欄只是給編輯者看的說明，程式不讀）。欄位與字數上限在 `BOARD_FIELDS`：標題 8、副標 16、內容1～3 各 14、底部 20、詳細說明 300、連結（只收 https）、連結文字 10、主色 #RRGGBB。範本 `docs/board-template.csv`。
- 讀法：gviz JSONP（`gviz/tq?tqx=out:json;responseHandler:cb&headers=1`），不用 Apps Script、不受 CORS 限制；試算表沒公開時 Google 回 HTML，script 會載入失敗（console 有一則錯誤），就用上次快取 `startupIslandBoard` 或 `BOARD_DEFAULT`。載入時讀一次、之後每 10 分鐘一次。`cleanBoard()` 去控制字元、超過字數截斷、擋非 https 連結與錯誤色碼；抽屜內容一律 `escHtml()`。
- 位置固定 `BOARD_AT=[18.55,5.6]`（試算商辦區東南邊空地），平面、立體、小地圖共用；`blockArea()` 讓角色繞開。
- 平面：`drawBoard2D()` 畫柱子＋看板（主色標題列＋小長條圖）＋上下浮動的黃色「📋 看板」標籤＋脈動黃圈，點了 `openBoard()`（右側抽屜顯示全部內容與連結按鈕，並走到看板前）。
- 立體：`MARKS.calc` 改成 `drawBoardCanvas()`（640×392，標題列／副標／三行條列／底部，背景淡淡的損益圖，`fitText()` 太長自動縮字），內容更新時 `Island3D.board()` 重畫貼圖；頂上轉動的黃色星星；HTML 標籤 `.tag3.board3`「📋 創業看板」；點看板或標籤都開抽屜。小地圖畫黃色「📋 看板」標籤。
