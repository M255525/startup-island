# CLAUDE.md — startup-island（創業島）

單檔前端「工具導覽地圖」：把程式牆（`小工具/desktop-program-wall`）裡 42 個已上線、與創業相關的線上工具，放進一座可探索的等角（isometric）SVG 島嶼。島上有 9 個地點（場地），每棟建築是一個工具，點了開右側資訊抽屜→「前往工具」新分頁開啟。**本專案本身不含任何創業計算／生成邏輯**（性質同 `animal-ecommerce-adventure`）。無框架、無建置，`index.html`＋`manual.html`。

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
- **後端**：`presence-worker/`（Cloudflare Worker＋Durable Object `Island`，WebSocket Hibernation API；公開島 `idFromName('main')`，2026-10-25 起另有房間代碼，見下方「聊天＋房間代碼」）。只轉播 `{id, name, shirt, hair, gx, gy}`，**不寫任何儲存**，離線即消失。驗證：Origin 白名單（`m255525.github.io`、localhost／127.0.0.1、`null`＝file://）、名字去控制字元截 24 字、顏色 `#rrggbb`、座標夾在 -5..25、每連線每秒最多 15 則、單房最多 200 人；同 id 重連會踢掉舊連線。
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

## 聊天＋房間代碼（2026-10-25）
使用者問「上傳在 GitHub 的軟體可不可能進行聊天」，同意建議做法並要求加房間代碼。GitHub Pages 是靜態網站，聊天走既有的 presence Worker 同一條 WebSocket，不另架伺服器。
- **協定**：client→`{t:'chat', text}`；server→`{t:'chat', id, name, shirt, animal, text, at}`（**連發話者自己也收到**，看到的是過濾後版本）、`{t:'chatSlow', wait}`；`snapshot` 多了 `chat`（最近 20 則）。
- **轉播站過濾**（`cleanChat()`）：去控制字元與雙向文字控制字元、空白合併、截 60 字；網址／網域（`URLISH`，含 line.me、.tw 等）換成「〔網址〕」；`badwords.js` 新增 `maskBadWords()` 把命中範圍遮成 `*`（逐字正規化並記原文位置；「冒充管理者」那組 `CHAT_SKIP` 不遮）。每人兩則間隔 ≥2.5 秒（網頁端 3 秒）。歷史 `this.history` 只在 Durable Object 記憶體，房間休眠或沒人就清空，不寫 storage。已知副作用：`Essex` 會被遮成 `Es***`（同名字過濾的詞組取捨）。
- **房間**：`/ws?room=代碼`，`cleanRoom()` 收 3～12 個 `[A-Z0-9]`（轉大寫），其他一律公開島；代碼房間是 `idFromName('room:'+代碼)` 的獨立 DO。前端 `ROOM`：網址 `?room=` 優先（並記到 `startupIslandRoom`），否則用上次的。`switchRoom()` 換房間＝關舊連線（`onclose` 用 `net.ws !== ws` 忽略舊連線）、清人與訊息、`history.replaceState` 改網址、重連。「開一個新房間」用 `crypto.getRandomValues` 從去掉 0/O/1/I 的字元產 6 碼；「複製邀請連結」＝目前網址去掉其他參數只留 `room`。說明卡人數旁顯示 `#roomTag`。
- **網頁端**：工具列 `#tbChat`（未讀紅色 `#chatBadge`）、面板 `#chatBox`（房間列、`#roomPop`、`#chatList`、7 個快捷表情、輸入框、冷卻倒數、「顯示其他人頭上的對話泡泡」）；`startupIslandChat` 存 `{open, bubbles}`。顯示時再 `maskBadWords()`＋`escHtml()` 一次。🚫 封鎖只在這次瀏覽（id 每次載入都會變）。**手機（≤820px）聊天面板和下方抽屜互斥**（同時開會疊在一起，踩過）；面板本身 `overflow:auto`、`.chat>*{flex:none}`，否則內容會溢出卡片。
- **對話泡泡**：共用 `BUBBLES`（id→{text, until}，自己是 `'me'`，顯示 4.5 秒＋每字 0.12 秒，最多再加 4 秒）。平面：`showBubble()` 畫在 `av.tagWrap` 裡 `translate(0,-84)`（名牌上方、最上層），12 個全形字換行、最多 3 行。立體：`makeAv()` 多一個 `.bub3` div，`placeLabels()` 跟名牌同位置（CSS `margin-top:-30px` 往上推），名牌被隱藏時泡泡也藏。
- **本機測試**：`wrangler dev` 在沙箱跑不起來，改用 node 包真正的 `index.js`（把 `cloudflare:workers` 換成假的 `DurableObject` 類別、`badwords.js` 複製成 `.mjs`、`ws@8.18.0` 當伺服器，依 `room` 參數分不同 Island 實例），網頁加 `?presence=ws://127.0.0.1:8849/ws`。驗證：兩分頁互傳、遮罩（「幹你」→`**`）、網址移除、冷卻提示、進 CLASS1 後公開島人數各自變 1、邀請連結進同房間後互相看到訊息、重新整理看得到最近訊息、立體泡泡、375px 無橫向溢出、無 console 錯誤。
- **部署順序**：先 `cd presence-worker && npx -y wrangler@4 deploy`，再 push 網頁。反過來的話舊轉播站會忽略 `chat` 與 `room`——訊息送不出去，**而且大家其實都在公開島卻以為在房間裡**。
- **已上線**（2026-10-25）：使用者執行 `wrangler deploy`（Version 3633a54d）後，用 node 對正式轉播站的測試房間 `ZZTEST9Q` 驗證 snapshot 帶 chat、遮罩／去網址、chatSlow 皆正確，再 push 網頁（commit 6d6ccd7）。

## 碰到人就聊天（2026-10-25）
使用者問「可以碰到創業島上的人，然後開始對話嗎」。
- **刻意不做私訊**：「對某人說」仍轉給同房間所有人，只多帶 `to`／`toName`（轉播站確認對象在同房間才加上，否則當一般訊息）。匿名課堂環境裡私訊無法被看見、容易出事；要改成私訊前先跟使用者確認。
- **觸發方式**：(1) 靠近：`checkNear()`（掛在 `netTick`，每 0.3 秒）找最近的人，<1.4 格顯示 `#talkCard`「某某 就在你旁邊［👋 打招呼］［💬 聊天］×」，>1.9 格收起；按 × 或已對話過的人記在 `talk.dismissed`，離開 2.6 格外才會再提示；手機聊天面板開著時不提示。(2) 點人：平面 `peerAtClient()`（螢幕座標命中動物身體）＋其他訪客名牌也可點（名牌後加「💬」）；立體 `peerAt()`（投影到螢幕 18px 以上的容許範圍）＋`.av3.peer` 名牌可點。(3) 聊天面板裡點別人的名字。都走 `openTalk(id)`：設定對象 `setTalkTo()`、開聊天面板、距離 >1.6 格就走到對方旁邊 0.8 格處。
- **被搭話**：`c.tome` → `showIncoming()` 顯示「某某 對你說：…［回覆］」9 秒（黃色光暈）；列表該列 `li.tome` 黃底、「→ 你」。泡泡文字加「@對象」（對自己顯示「@你」）。
- **轉頭面對面**：`o.faceId`／`o.faceUntil`（'me' 代表自己），說話的人 12 秒內停著時轉向對象；平面改 `face`（stepWalker/stepPeers），立體在 `poseAv()` 慢慢轉 `yaw`。
- 已上線（2026-10-25，轉播站 Version 0cf6e2a5，正式站測試房間確認 to／toName 正確後才 push）。
- 驗證（本機 node 模擬轉播站、房間 TALK1）：遠離時不提示、走近出現提示、打招呼後對方收到「對你說：👋」與「@你」泡泡、回覆後雙方列表顯示「→ 你」、雙方面向正確；平面點動物身體、立體點動物與名牌都能開啟對話並走過去；無 console 錯誤。

## 🤖 測試小幫手（2026-10-25）
使用者要求「增加一個虛擬的角色，可以用來測試聊天的功能」。
- **做法**：網頁自己另開一條 WebSocket（`bot.ws`），以另一位訪客身份（id `bot…`、名字「🤖＋你的名字前 6 字＋的小幫手」、灰色衣服、跟你不同的動物）進同一個房間，**走真正的轉播站**，所以靠近提示、打招呼、對你說、泡泡、轉頭、遮罩全都被端對端測到。轉播站不用改。
- **限制**：只能在房間裡叫（公開島按了只顯示提示）；只回應「對它說的話」或「叫它出來的人的公開訊息」；換房間（`switchRoom` 先 `dismissBot(true)`）、按「請小幫手離開」、關網頁就離開。同房間其他人也看得到它。
- **行為**（`botTick` 掛在 `netTick`）：出現在你 2.6～3.4 格外 → 走到你旁邊 0.9 格（觸發 `#talkCard`）→ 主動對你說一句招呼；聊天後 15 秒內站著不動，之後每 5～10 秒在附近閒晃，離你 >4 格就跟過來；走路用 `findPath`＋`straighten`，每 180ms 送 `move`，25 秒 `ping`。回覆 `botAnswer()` 是規則式：純表情回表情、看到 `*` 說過濾正常、看到〔網址〕說連結被拿掉、問候、道別、提到 `TOOLS.short` 回答在哪個場地、問句說答不出來、其他就回「收到：…」。`botSay()` 排隊保證兩則間隔 ≥2.8 秒（轉播站限 2.5 秒）。
- **版面**：聊天列表 `li` 改 `flex-wrap`、`.to` 加省略號、`.chat-list` 禁止橫向捲動（長名字＋「→ 對象」曾撐出橫向捲軸）。
- 驗證（本機模擬轉播站）：公開島被擋、房間 BOT1 叫出後走到旁邊並跳「對你說」、你好／「商業模式圖在哪裡？」（回策略山丘）／「幹你 測試」（回過濾正常）三種回覆正確、按鈕離開後人數歸 0、375px 無溢出、無 console 錯誤。

## 2026-10-26 新增商業模式組合工作室
使用者要求「合乎創業島定義就放上去」。`business-model-pattern-studio` 放策略山丘西側台地 `POS [1.9,3.8]`（山頂第 5 棟，elev 26、不重疊）；山頂擠，名牌由標籤避讓往上疊並拉虛線，屬正常行為。新增接力線 `l26` 點子 → 商業模式組合 → 商業策略；manual 的街區表與創業路線圖第 2 階段已補連結；工具數 41→42。

## 海的另一端：姊妹地圖互連（2026-10-30）
使用者要求「把創業島放到這個畫面，在海的另一端新增，點擊就切到創業島的網域；創業島也一樣新增一個創作者小鎮」。兩邊各有 `FAR = {sign, at, r, url, name, host, emoji}`：
- 平面：`drawFar()` 畫在 `L.far`（在 `L.boats` 之後、陸地之前，海上不會被蓋到），招牌 `farSign()` 畫在最上層 `L.farTop`（**放在陸地層會被蓋住**；外層 g 負責定位、內層 `.board-flag` 負責浮動，**CSS 動畫的 transform 會蓋掉 SVG transform 屬性**，踩過）。`farRoute()` 是從岸邊到小島的虛線航線；`islandBox()` 取景有把小島算進去。點擊／Enter → `goFar()`（寫足跡後同一分頁 `location.href` 切過去），滑過 `showFarTip()`。
- 立體：`buildFar()`（在 `buildLabels()` 之後）把小島網格標 `userData.id='__far'` 加進 `O.pick`，`farLabel()` 加一顆 `.tag3.board3` 名牌；pointermove／點擊判斷 `'__far'`。
- 兩邊的 `FAR.url` 寫死對方的 GitHub Pages 網址；改網址要兩個 repo 一起改。
- 創業島這邊：`FAR.at=[26.2,4.2]` 迷你創作者小鎮（岸壁平台、兩棟紅磚倉庫、疊貨櫃、起重機、棕櫚樹），放在小船繞島航線（r≤15.2）外側；航線從 `[21.4,7.6]` 出發。取景因此往右擴大，島會稍微變小。

## 跨海大橋：走過去才換島（2026-10-30）
使用者要求「兩個島中間用橋連接，要到另一座島要透過橋走過去」「橋要有 3D」「走過去的角色與名字一樣」。
- `FAR` 多了 `self`（creator／startup）、`shape`（circle／square）、`bridge`（兩端格子座標）。虛線航線改成 `drawFarBridge()`（畫在 `L.far`，陸地端被岸邊蓋住）；立體 `buildFarBridge()`（橋面、欄杆、橋墩；小鎮版加兩道拱）。
- 走路：`walkableAt()` 開頭讓 `farBridgeDist()<.24` 的橋面與 `onFarIsland()` 的小島可以走；尋路格子 `WG.n` 120→136、碰撞格子 `FG.n` 376→426（涵蓋到 x、y≈30）。樹避開橋（`treeOK`）。立體 `standY()` 在橋面與小島回傳 `LAND+.1` 左右。
- 點小島／招牌／立體名牌 → `farGoClick()`：角色沿橋走過去（顯示「正在走過橋去…［直接前往］×」），走不過去才直接切換；鍵盤 Enter 仍直接 `goFar()`。`farTick()`（掛在 tick）偵測走進小島中心 → 顯示「到了…，切換中…」並立刻 `goFar()`（使用者要求「走到另外一個島時畫面就自動切換」，不倒數、不提供留下）。人物跟隨開著時，滑鼠停在小島上角色也會自己走過去。
- **角色延續**：`goFar()` 把 `{n, a, s}`（名字、動物、衣服色）放進網址 `?from=<self>&me=<JSON>`，同時寫進對面的角色存檔（兩站同網域 `m255525.github.io`）；對面載入時 `me=` 經 `cleanName`／`hasBadWord`／動物白名單／色碼檢查後套用，`from=` 讓角色出現在自己這邊橋頭（橋的陸地端往內 0.7 格），兩個參數用 `history.replaceState` 從網址拿掉。
- 驗證（Playwright，目標暫改本機）：小鎮起點規劃路線經過橋面直達小島、沿途每 0.05 格都可走；抵達後自動切到創業島，名字／熊貓／衣服色相同、角色在創業島橋頭、網址已清乾淨；創業島橋頭到迷你小鎮路線也全程可走。
- 已知：轉播站把座標夾在 -5..25，創業島那座迷你小鎮 x 最大約 27.9，站在小鎮島上時別人看到的位置會被夾在 25（反正幾秒內就會切站）。

## 一個瀏覽器只有一個角色在線上（2026-10-30）
使用者要求「系統之中不會同時出現兩個角色與名稱都一樣的角色，不會因為跨島產生同一個角色」。
- 同一分頁走橋換島：舊頁面 `pagehide` 立刻 `net.open=false`＋關連線，舊地圖上的角色馬上消失；從上一頁回來（bfcache `pageshow.persisted`）重新接手。
- 多分頁（同一島或兩座島各開一個）：兩站同網域，共用 localStorage `m255525IslandClaim`；每個分頁載入時寫入 `{tab, site, t}` 宣告「角色在我這」，其他分頁收到 `storage` 事件 → `pauseAvatar()`：`net.paused=true`、`net.open=false`、清掉其他人、關連線（`onclose` 見 `net.paused` 不重連）、請小幫手離開，畫面下方 `#dupCard`「你的角色正在另一個分頁（某島）上，這裡先暫停…［在這裡繼續］」；按下 `claimAvatar()` 搶回來，換對方暫停。`renderOnline()` 顯示「（已暫停：角色在另一個分頁）」。
- 驗證：本機兩分頁（小鎮＋創業島）互相暫停／接手；正式轉播站兩個小鎮分頁進房間 ZZDUP7，後開的分頁連上且人數 1、先開的自動斷線，無 console 錯誤（先前暫停時還在送位置，報「WebSocket is already in CLOSING」，已改成暫停當下先 `net.open=false`）。
- 範圍：只管同一個瀏覽器。不同裝置／瀏覽器的人剛好抽到同名同動物不在此限（轉播站各房間是獨立 Durable Object，跨島做不到全域唯一）。

## 角色更立體、更細緻（2026-11-02）
使用者問新裝的 skill（`vector-art`／`pixel-art`）能否美化創業島，希望「人物更立體化、更細緻」。結論：`vector-art` 只會抓 DiceBear 等平面人像 SVG、`pixel-art` 是像素風，都會讓角色變平，而且島上角色是動物，所以**沒有用這兩個 skill**，直接改程式自繪的角色。
- **立體（`island3d.js` `makeAv`）**：人物專用材質 `avStd()`＝四段色階 `avGrad()`（105/168/222/255）＋邊緣光（`onBeforeCompile` 在 `opaque_fragment` 前加 fresnel，共用 uniform `RIM_U`，`updateSky()` 依夜色調 .24→.1）。細節：虹膜（顏色取毛色混深紫，白色動物用藍紫）＋瞳孔＋大小兩顆高光、眉毛、瀏海毛（有毛的 8 種）、貓／狐／虎臉頰毛、狐狸黑耳尖、虎臉側條紋、鼻子高光、小舌頭；T 恤＋白領口＋下擺滾邊＋口袋＋鈕扣、短褲、球鞋（白鞋底＋鞋帶）、袖口＋小手含大拇指、背包＋肩帶；腳下 CanvasTexture 接觸陰影。模型分 `g`（定位、影子）與 `body`（動畫），走路時 `body` 彈跳、落地微壓扁、前傾、`torso` 扭腰；換衣服色時領口滾邊（`a.trim`）與鞋（`a.shoe`）一起換。舊版眼睛高光位置算錯（座標乘上眼睛縮放後飄到臉外），已一併修正。
- **平面（`index.html`）**：`shadeFill(hex)` 在 `L.defs` 建放射漸層（左上亮、右下暗，同色共用 id `avs<hex>`），用在頭、手、衣服；頭頂亮邊、虹膜＋兩顆高光；腳改成褲管＋球鞋、手臂改成袖子＋小手（`av.legL/legR/armB/armF` 變成 `<g>`，旋轉動畫照舊）、短褲、下擺、白領口、口袋、背後小背包、雙層接觸陰影。
- SW 快取 v7→v8。驗證：Playwright 1366×800 平面放大截圖、立體白天近拍正背面＋熊貓／企鵝／兔子／青蛙／小豬／無尾熊、走路動畫數值，無 console 錯誤（只有測試刻意連不上轉播站的那則）。
- 同日依使用者要求同步到姊妹站 `creator-town`（2026-11-02 起創業島改剪紙風、小鎮未同步，兩邊角色程式已不同）。

## 景色主題＋鄰島照真實比例（2026-11-02）
使用者要求「景緻改得更吸引人」「兩個島的差異要大一點」「兩個島的比例要合乎邏輯（在對方地圖上不能變很小）」。**兩站這兩塊程式逐字相同，改動要兩邊一起改。**
- **景色主題（`island3d.js`）**：檔案開頭 `THEME` 是兩站唯一不同的地方（天空頂／地平線／黃昏／夜晚色、霧距、日光與半球光色、水色淺／中／深、潟湖寬度、波光色與數量）。共用段落「景色主題」：`buildScenery()`（太陽＋光暈、月亮、水面波光）→ `THEME.id` 分流 `buildTropicScene()`／`buildHarborScene()`（**別取名 buildHarbor，小鎮原本就有這個函式（碼頭），撞名會讓立體整個掛掉，踩過**）；`skyScenery(dk, dusk)` 由 `updateSky()` 呼叫，`frameScenery(tm)` 每格閃波光。水面改成頂點色：依 `min(edgeD, farEdge)` 由淺到深。
  - tropic（創業島）：飽和晴空、翠綠潟湖、沙灘改白、海底珊瑚（InstancedMesh 260 個）、沙灘陽傘＋浴巾（`blockWalk` 擋路）、遠方彩虹（白天才有）、5 顆熱氣球繞島、18 隻蝴蝶。
  - harbor（創作者小鎮）：暖色黃金時刻天空與較近的霧、橄欖色草地（`PAL.grass/grass2/park/lawn` 已改）、深青港灣＋金色波光、沿路之字形串燈（夜裡發光暈）、7 支倉庫煙囪冒煙、夜晚 34 盞天燈升空、兩道探照燈。
- **鄰島照真實比例（`index.html`）**：原本對岸是半徑 1.6～1.7 的迷你島。現在 `FARB` 依橋的方向把整座鄰島（創作者小鎮＝圓角方形 11.6、創業島＝起伏圓 12.4，跟對方真正的輪廓一樣）擺在橋的另一端，近岸剛好接橋頭；`FAR.at` 由程式改成「上岸後 1.3 格」（招牌、走路目的地）。`farEdge()` 給距離，`onFarIsland()` 改成整座鄰島；`farTick`／`farGoClick` 的門檻改為踏上岸 0.6 格。島上建築、樹、吊車、燈塔、中央地標塔由 `FAR_THINGS`（固定亂數，平面與立體共用）產生，尺寸跟自己島上的建築同比例。平面 `drawFar()`、立體 `buildFar()`（`ExtrudeGeometry` 擠出輪廓）都讀它。取景 `islandBox()` 不變（只框近岸），其餘延伸到畫面外。小鎮的貨輪與魚群航線縮短（u≤21、魚 24→19.5），避免開進對岸創業島。
- SW 快取：創業島 v8→v9、小鎮 v6→v7。驗證：Playwright 兩站平面／立體白天／近拍／黃昏／夜晚截圖、從橋頭朝對岸看三種天色、走路規劃到對岸（終點在鄰島上），無 console 錯誤。

## 平面地圖／小地圖配色對齊立體（2026-11-02）
使用者反映「地圖與 3D 色系不吻合，覺得突兀」。原因：景色主題只改了 `island3d.js` 的 `PAL`／`THEME`，平面地圖的 CSS 色票、2D 樹色、2D 鄰島、小地圖仍是舊的淡色。
- `index.html` `:root` 的地形色票（`--sea/--sea-deep/--sand/--grass/--park/--lawn/--yard/--wood/--road/--river/--river-rim/--hillside/--hilltop`）改成跟 `PAL`／`THEME` 同值，新增 `--lagoon`（＝`THEME.shallow`）；`buildMap()` 在沙灘外畫兩圈淺水環（r+2.6／r+1.4），對應立體的潟湖漸層。2D 松樹色改用立體 `LEAF`。
- 小地圖 `miniSetup()` 不再寫死色碼，直接讀 `PAL`／`THEME`（海＝mid→deep 漸層、淺水環、沙、草、公園、山丘、道路、河與池塘＝`THEME.shallow`）。
- 2D 鄰島 `drawFar()` 的沙／草／岸色改成對方島的立體色票（兩站同一段程式）。
- **日後改 `PAL`／`THEME` 要同步改 `index.html` 的 CSS 色票**（`:root` 開頭有註解提醒）；小地圖會自動跟上。姊妹站 `creator-town` 同日同步處理。SW 快取 v9→v10。

- 2026-11-02 創作者小鎮改成手繪動畫風（紅瓦灰泥、蔚藍海、鮮綠草原），本站 2D `drawFar()` 與 3D `buildFar()` 的 harbor 分支顏色同步更新；SW v10→v11。細節見 `creator-town/CLAUDE.md`「手繪動畫風」。

## 立體角色改剪紙卡通風（2026-11-02）
使用者要求「3D 角色調整成南方四賤客的卡通風格」。**只借畫風（剪紙定格動畫感），不做任何該作品的角色、服裝或名稱**；角色仍是 12 種動物。
- `island3d.js` `makeAv`：材質 `avStd()` 改成兩段色階（214/255，近乎平塗）＋ `paperTex()` 美術紙纖維紋理，`flatM()` 給眼白／瞳孔／嘴；描邊加粗 `.011`。大寬圓頭（r .17，scale 1.12/.92/.85）直接坐在矮胖外套身體上（沒有脖子，`HEAD_Y=.33`），外套有拉鍊、口袋、鈕扣、下擺；兩顆相連的大白眼＋小黑點瞳孔（略往中間看）、半月形小嘴；連指手套小手、扁黑鞋；耳朵放進 `earG` 壓扁成剪紙片（尖耳改四角錐）；背包、眉毛、虹膜、腮紅、瀏海、臉頰毛都拿掉。
- `poseAv`：定格動畫感——步伐只取四個固定姿勢一格一格換、一頓一頓地小跳、整個人左右晃，站著偶爾歪頭；換衣服色只改外套與滾邊（鞋子固定黑色）。`RIM_U` 仍保留（`updateSky` 會設），但人物材質已不用邊緣光。
- 平面地圖的 SVG 小人**沒有改**（使用者只要求立體）。**姊妹站 `creator-town` 這次沒有同步**：同日小鎮正改成手繪動畫風，兩邊角色程式從此不再逐字相同。SW 快取 v10→v11。
- 驗證：Python Playwright（MCP 瀏覽器被其他工作階段占用）近拍 12 種動物正／背面與走路畫面，無 console／page 錯誤。

## 兩座島共用同一個角色（2026-11-02）
使用者要求「從創業島到創作者小鎮或相反路徑，人物名稱與角色都要一樣，不能擅自改動」。原因：兩站原本各存一份角色（`startupIslandAvatar`／`creatorTownAvatar`），只有走橋（`goFar()` 帶 `?me=`）才會帶過去；直接開另一站、書籤、加入主畫面的 App、或在一邊改名後，另一邊仍是舊的或隨機角色。
- **`KEY_AVATAR = 'm255525IslandAvatar'`，兩站共用**（同網域 `m255525.github.io` 的 localStorage 本來就共用）。第一次載入時沒有共用存檔，就依序接手本站舊存檔→對面舊存檔（`OLD_AVATAR_KEYS`）。
- 所有存檔改走 `saveMe()`：寫共用存檔，同時寫回兩個舊 key（還沒更新的舊快取版本讀到的也是同一個角色）。`goFar()` 也改成 `saveMe()`，`?me=` 仍保留當備援。
- `syncMe()`：以共用存檔為準更新 `me`、重畫名牌與動物、送 `look` 給其他訪客。觸發時機：`storage` 事件（另一個分頁在任一座島改名／換動物）、`claimAvatar()`（從上一頁 bfcache 回來、或按「在這裡繼續」）。
- **兩站這段程式要一致**（`OLD_AVATAR_KEYS` 只差在本站 key 排第一），日後改角色存檔邏輯兩邊一起改。
- 驗證（Playwright，兩站放同一個本機來源 `127.0.0.1:8850/startup-island/`、`/creator-town/`）：舊訪客兩邊各存不同角色→統一成本站的；直接開另一站→同一角色；在小鎮改名換動物後「上一頁」回創業島→已同步；帶 `?me=` 抵達→寫入共用存檔，再直接開另一站也一樣；實際呼叫 `goFar()`（目的地暫改本機、presence 指向不存在的埠）→名字、動物、衣服色都一樣，三份存檔一致。SW：創業島 v11→v12、小鎮 v10→v11。

## 飛龍＋史萊姆（2026-11-03）
使用者要求「天上加幾條歐洲中古時代的飛龍、地面加不同顏色可愛的史萊姆在移動，兩個地方史萊姆顏色不一樣」。
- **模擬只在 index.html 跑一次**（`stepCreatures(dt)`，tick 每格呼叫），全域 `SLIMES`／`DRAGONS` 存位置與姿勢；立體 `island3d.js` 的 `syncCreatures()`（frame 內 `syncAvatars` 之後）只讀來畫，兩種檢視位置一致。平面圖形在 `buildCreatures2D()`（buildMap 結尾呼叫，重建地圖時會重畫）。
- **本站配色**：史萊姆 鮮豔原色系（草綠、天藍、檸檬黃、番茄紅）×10 隻；飛龍紅／綠／金（`SLIME_COLORS`／`DRAGON_LOOKS` 在這段程式開頭）。**和創作者小鎮刻意不同**，日後改色兩邊要保持可區分。這段程式兩站其餘部分完全相同，改邏輯兩邊一起改。
- 史萊姆：在 `fineCells` 準備好後隨機出生（彼此相距 ≥1.7 格），只在本島可走處跳（`slimeOK`：`fineOK`、離跨海大橋 ≥.8、不到對岸、離岸 ≥.9），以出生點為家 2.4 格內找目標、直線檢查可走；跳一下＝蹲→騰空→落地壓扁，到點休息、會眨眼，人走近會轉頭看。平面插進 `L.blds` 用 `placeDepth` 做前後遮擋；立體是 Lathe 軟糖形半透明身體＋眼睛腮紅高光。
- 飛龍（西方翼龍：蝙蝠翼＋翼骨、角、背刺、黑桃尾）：3 隻繞島飛橢圓（順逆時針不同）、上下起伏、拍翅，每 9–21 秒噴一口火；平面在雲之上、接力線／標籤之下（`L.dragons`），地面有淡影子（`L.dShadow` 在建築下）；立體尾巴分 6 節擺動、轉彎往內傾。高度單位與立體一致（平面 1 單位＝30px）。
- 「靜止」／reduced-motion 時都停住。SW v12→v13。驗證（Playwright 1366×800）：兩站平面、立體近景與鳥瞰截圖都看得到，除刻意連不上的 presence 外無 console 錯誤。
- **飛龍改卡通立體造型（同日追加）**：使用者給了一張 pngtree 卡通飛龍圖要「更立體」。圖是付費素材站的圖、自動下載也被擋，**沒有照描，只借「卡通飛龍」的一般特徵**：大頭大眼（白眼珠＋黑瞳＋反光）、圓鼻頭＋鼻孔、兩節彎角＋耳鰭、腮紅、圓胖身體＋一圈圈條紋肚皮、縮在胸前的前爪與往後伸的後腳、背刺、9 顆漸小球串成的 S 形捲尾＋立體黑桃尾尖（Extrude 加倒角）。翅膀改成**兩段式**（`dragonWing()`：肩→肘的內段＋肘→腕的外段，三根指骨撐開扇貝形翼膜、拇指爪），拍翅時外段晚一點跟上往下捲（`userData.outer`）；頭會輕點、噴火時抬頭。整隻放大到 `lk.size*1.55`。平面版同步改成放射漸層打光（每隻龍自己的 `<defs>`，id `dg<i>_b/y/w/f`）、大頭大眼、條紋肚皮、彎角耳鰭、有翼骨的翅膀。SW v13→v14。驗證：把一隻龍暫時降到角色旁邊，平面放大與立體近景截圖都確認造型與噴火正常，無 console 錯誤。

## 🧙 智者梅林（2026-11-07）
使用者要求「設計一位智者梅林，可以回答島上工具的功用，要很容易被找到」。梅林是傳說人物的通用巫師形象（紫色星星長袍、尖帽、白鬍子、水晶手杖），不仿任何作品的角色造型。
- **位置** `MERLIN_AT=[12.3,9.7]`（出生點 `[11.7,9.1]` 旁、指揮塔南方空地，離路、河、建築都 ≥0.9 格），`blockArea(.32)` 讓角色繞開；2D 樹 `treeOK`、3D 花與地標（`O.markSpots` 一開始就放梅林）都會讓開。
- **好找**：工具列第一顆紫色「🧙 問梅林」（`#tbMerlin`，手機也是最左邊）＋說明卡「🧙 問島中央的智者梅林」（`#tcMerlin`）；平面 `drawMerlin2D()`（身體在 `L.blds` 做遮擋，名牌放 `L.boardTag` 最上層，**放在建築層會被後面的高樓擋住，踩過**；外層定位、內層 `.merlin-flag` 浮動）；立體 `buildMerlin()`（`O.pick` id `'__merlin'`、`.tag3.merlin3` 名牌、腳下脈動光圈、會轉身面向你）；小地圖紫色「🧙 梅林」標籤。走近 1.7 格內名牌改成「👋 點我發問！」（`merlinTick`，平面也會轉頭看你）。
- **問答**（`merlinAnswer()`，`#merlinDrawer` 抽屜，與 `detail`／`logDrawer` 互斥）：純規則式，只讀 `TOOLS`／`ZONES`／`LINKS`，**不連 AI、問題不送出**。順序：打招呼→自我介紹→島上怎麼玩→免序號／需序號清單→工具總覽→點名工具（`M_ALIAS` 別名；功能／「在哪」／「下一步」`mNext`／「之前」`mPrev`；「它」指上一個工具）→場地（`M_ZONE_ALIAS`）→從哪開始→隨機→主題關鍵字打分（`M_TOPICS`＋中文雙字詞；沒提電商就扣亞馬遜工具分數）→答不出來給建議。答案卡片有「帶我去」（`openTool`）與「前往工具 ↗」；下方建議問題 `mSuggest()` 會帶上一個工具的「下一步／在哪裡」。第一次提問寫進足跡。
- **新增工具時**：`M_ALIAS` 可順手補別名（不補也能用名稱／短名找到）。
- SW v14→v15。驗證（Playwright 1366×800、375×740）：23 種問法答案合理、按鈕從遠處自動走到梅林身邊、名牌近距離切換、平面／立體／小地圖截圖、「帶我去」關梅林開建築抽屜、再開梅林對話保留、375px 無橫向溢出，除刻意連不上的 presence 外無 console 錯誤。
- **四處走＋主動打招呼（同日追加）**：使用者要求「梅林也會在島上四處走，看到陌生人會主動打招呼，問有什麼可以幫助，不需要就離開、不會再打擾」。`MERLIN_AT` 改成「家」，位置在全域 `merlin.gx/gy`，由 `merlinMove(dt)`（tick 每格呼叫）模擬，平面 `drawMerlin2D()`／立體 `buildMerlin()` 的 anim／小地圖都讀它；梅林不再 `blockArea`。**每個瀏覽器各自模擬一位梅林、不經轉播站**，所以每位訪客看到的梅林位置不同、都在照顧自己。
  - 散步：`merlinSpots()`（家、看板前、各場地中心、路上取樣點，須 `slimeOK`）挑 1.5～9 格內的點，`findPath`＋`straighten`，路線碰到跨海大橋／對岸就換一個；每秒 1.15 格，到點休息 4～9 秒。
  - 狀態 `merlin.mode`：idle／wander／approach（每秒 1.9 格追你，每 0.9 秒重新規劃；你在橋上或對岸就原地等）／greet／leave／talk（問答抽屜開著時停下面向你，關掉 3 秒後再走）。
  - 「陌生人」＝ localStorage `startupIslandMerlin` 沒有 `met` 也沒有 `declined`。導覽（`#story`）結束、載入 6 秒後、不在清單檢視、角色沒被別的分頁暫停，就走過來；距離 <1.4 格或追了 20 秒就打招呼：名牌「👋 歡迎來到創業島！」＋卡片 `#merlinCard`（`.talk-card.merlin-card`，**要用兩個 class 提高權重，否則被後面的 `.talk-card` 規則蓋掉，踩過**）。
  - 「好啊，請教你」→ `met=true`、開問答；「不用了，謝謝」或 × → `declined=true` **永久不再主動靠近**，說「好的，祝你一路順風！」後往離你最遠的停靠點走，之後挑散步點都避開你 4 格內；25 秒沒回應 → 「我先去散步…」，這次來訪不再打擾、下次來訪再問一次。自己按「問梅林」也算 `met`。「靜止」／減少動態時梅林不走路，改成原地出聲打招呼。
  - 驗證：清記憶後梅林從家散步→改追人→打招呼；按「不用了」後 30 秒內離你最近 4.3 格、重新整理後只有 idle／wander；「好啊」開問答且記為 met；不理 25 秒→leave 且不寫記憶；關問答後恢復散步；立體近拍他走到面前轉身面對你；375px 無橫向溢出。SW v15→v16。


## 🎡 歡樂遊樂園（2026-11-08）
使用者要求「在創業島新增一個娛樂區域，把目前線上的遊戲放上去」，並補充「創意島（創作者小鎮）上有的就不要放」。
- **收錄 7 個**（2026-11-08 curl 確認 Pages 皆 200，皆無序號）：fruit-ninja-cam、ball-throw-cam、jetski-cam、Rummikub、nostalgia-memory-game、taiwan-fish-atlas、taiwan-bird-atlas。**刻意不放**：swot-game／amazon-logistics-game／animal-ecommerce-adventure（本島創業學校已有）、crispe-game／costar-game（創作者小鎮已有）、boxing-cam／bowling-game（沒上線，404）、startup-island／creator-town（自己與姊妹島）。日後新遊戲上線，照同樣規則判斷要不要加。
- 場地 `play`（歡樂遊樂園／FUN PARK，`#e84fc7`，地面 `--lawn`）在島**東岸**：資金廣場與觀景小山的東邊、創業看板南邊。兩欄（x 18.6／20.1～20.15）錯開排，**欄距不能再縮**：第一版 18.7／20.0 時兩欄間碰撞外擴（`BODY`）重疊，體感切水果門口整個被包住走不到。現在 7 棟四面都走得到（地圖與立體載入後都測過）。
- 造型 `tent`（`SHAPE` s .36、h 14、roof 20）：平面＝直條紋牆＋布簾門＋紅白尖頂＋小旗，不畫窗（`drawWindows` 跳過）；立體＝16 邊形條紋布牆（CanvasTexture）＋條紋圓錐頂＋金邊＋飄動小旗，門口小燈晚上亮（`t.emis`）。
- 地標摩天輪 `PLAY_WHEEL=[20.3,6.95]`（場地東角）：平面 `drawWheel2D()` 當作 things 一起依 `gx+gy` 排序畫進 `L.blds`（放地面層會被帳篷蓋住），CSS `.fw-rot` 30 秒一圈（靜止／減少動態時停）；立體 `MARKS.play`（位置固定、不走 `freeSpot`，旋轉跟 calc／ops 一樣加 π/2 讓輪面朝島心），車廂保持水平，輪框與燈泡夜裡發光；`blockArea(.4)` 讓角色繞開。
- **2026-11-12 加第 8 個：`japan-sakura-season`（日本櫻花季地圖）**，位置 `[18.7,13.95]`＝西欄最南端。北端 `[18.55,5.6]` 是創業看板 `BOARD_AT`（不在 `POS` 裡，搜位置時要排除，第一次就放到看板上）；`[20.15,13.2]` 太靠岸、南東兩面走不到。用 `walkableAt`＋`findPath` 掃過，東岸只剩這一格符合「離其他建築 ≥2、離岸 ≥1.7、四面可走」。工具數 49→50，SW v18→v19。
- 資金廣場名稱原本放在「朝外」那側，剛好壓在遊樂園上，改用 `label:[15.3,12.9,0]` 移到廣場南邊。
- 梅林：`M_ALIAS` 補 7 個別名、`M_ZONE_ALIAS.play`（遊樂園／娛樂區／娛樂）、`M_TOPICS` 新增「放鬆／體感／桌遊／好玩／長輩／圖鑑」→ 遊樂園（原「練習／遊戲」那組拿掉「好玩」）。`DAY_SCRIPT` 加 20:00 一句。工具數 42→49、地點 9→10（meta、導覽第一步、manual）。SW v16→v17。

## 空間放大 1.3 倍（2026-11-08）
使用者要求「空間要大一點，不要過於壅塞」。做法是**所有地理座標以島中心 `C` 等比例拉開 `SPREAD=1.3` 倍，建築／樹／人物／名牌大小不變**，所以彼此多出空地。
- `POS`、`RIVER`、`HILLS`、`GREENS`、`WATERS` 等常數**仍寫放大前的數字**，緊接在 `FREE` 後面的轉換區塊 `spr()` 統一換算（`HILLS`／`GREENS` 半徑 ×SPREAD、水池半徑 ×1.15、`ZONES.label`／`extra`、`BOARD_AT`、`PLAY_WHEEL`、`MERLIN_AT`、`FAR.bridge`）。**新增工具照舊用舊座標系寫進 `POS` 即可**；程式碼裡若要再寫死世界座標，記得用 `spr()` 或乘 `SPREAD`。
- 其他跟著改的地方：`islandR()`×SPREAD、樹上限 230、`SCHOOL_TRACK`／`DOCK_PIER`（平面立體共用）、商店街中線改用 `zone.cx`、船／史萊姆／龍／氣球／燈籠／鳥半徑、尋路格子 `WG`／`FG` 擴到 -10..40、取景 `islandBox`、立體陰影範圍與鳥瞰距離（滾輪上限 52）。
- 創作者小鎮 `FARB.R()` 的創業島輪廓同步 ×1.3（兩站共用段落仍逐字相同）；轉播站座標夾值改為 -15..45（需重新 deploy）。
- 手機直向整島會更小，仍靠雙指縮放。
