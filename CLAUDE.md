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
- **訪客角色**：`startupIslandAvatar` 存 `{name, shirt, hair}`，名字＝形容詞＋角色＋暱稱隨機組合，可「換名字」。走路：0.5 格一格的可走網格（海、河（橋除外）、建築足跡、水景不可走）→ A*（8 方向、不切牆角）→ 視線拉直 → 每秒 2.1 格移動，腿手擺動、上下晃、左右翻面，高度跟地形；每幀依 `gx+gy` 把角色插到建築／樹之間做前後遮擋。滑鼠移動（非觸控）每 140ms 重新規劃一次；點空地走過去；點建築走到門口；工具列「人物跟隨」可關。走進新場地會寫進足跡。
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
