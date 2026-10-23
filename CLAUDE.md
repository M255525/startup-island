# CLAUDE.md — startup-island（創業島）

單檔前端「工具導覽地圖」：把程式牆（`小工具/desktop-program-wall`）裡 40 個已上線、與創業相關的線上工具，放進一座可探索的等角（isometric）SVG 島嶼。島分 8 個創業街區，每棟建築是一個工具，點了開右側資訊抽屜→「前往工具」新分頁開啟。**本專案本身不含任何創業計算／生成邏輯**（性質同 `animal-ecommerce-adventure`）。無框架、無建置，`index.html`＋`manual.html`。

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
- ⏳ 訪客計數器、GitHub Pages workflow：**尚未上線**，等使用者同意部署時再加（memory：實驗性新工具部署前先確認）。

## Port／測試
- port **8834**（`.claude/launch.json` 的 `startup-island`）；程式牆 `LOCAL_APPS` 也有一筆 static。
- 驗證：Playwright 開 `http://127.0.0.1:8834/`，用 `__startupIsland` 切檢視、`openTool()`、`setT()`；375px 寬 `scrollWidth===clientWidth`；用 Python 逐一請求 40 個 `toolUrl` 應全為 200。
