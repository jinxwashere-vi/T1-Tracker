# 讓排程真的跑起來

## 先確認一件事：App 現在應該已經是綠點了

排程還沒跑不影響 App。我在 zip 裡放的 `data.json` 已經在你的 repo 裡，App 讀的就是它，同網域一定讀得到。

先打開 App 看狀態列——如果是 **綠點 `Synced · 22 Aug`**，那就一切正常，排程只是負責「每天自動換掉那個檔案」而已，不是必要條件。

---

## 為什麼 0 runs

你點的是上方那排的 **Workflow 篩選器**，那只是幫清單過濾，不是工作流程本身的頁面，所以不會出現 Run workflow 按鈕。

而且排程 (`cron`) 要等到台灣時間早上 9 點才會第一次觸發，手動不推它就會一直是 0。

---

## 最省事的解法：讓它自己跑

我在工作流程裡加了 **push 觸發**——只要 `update-data.js` 有變動就自動執行。所以你只要把新檔案傳上去，它就會自己跑，完全不用找按鈕。

**做法：** 到 repo → **Add file → Upload files** → 上傳這兩個檔案（覆蓋舊的）：

```
update-data.js
```

然後 **Add file → Create new file**，檔名打：

```
.github/workflows/update.yml
```

把 `update.yml` 的內容貼上去（zip 裡有，也可以直接從下面複製），**Commit changes**。

commit 完成的當下，Actions 就會自己開始跑。回到 **Actions** 分頁重新整理，就會看到一筆執行紀錄。

---

## 如果還是想手動按

網址列直接輸入（把 `你的帳號` 換成你的 GitHub 帳號）：

```
github.com/你的帳號/T1-Tracker/actions/workflows/update.yml
```

這是工作流程「自己的頁面」，右邊會有 **Run workflow ▾** 按鈕。

---

## 執行前務必確認：寫入權限

**Settings → Actions → General →** 滑到最底 **Workflow permissions**
→ 必須是 **Read and write permissions** → Save

沒開的話，腳本抓得到資料，但最後 `git push` 會失敗（紅色叉叉，錯誤訊息會有 `403`）。

---

## 跑完之後怎麼看

點進那筆執行紀錄 → **update** → 展開 **Fetch latest schedule**，正常會看到：

```
ok matches: 40 rows
ok roster: 5 rows
ok trophies: 12 rows
Wrote data.json — 40 matches, 5 players.
```

**如果紅色叉叉**，展開失敗的那一步，把錯誤訊息截圖給我。最可能的兩種：

- `403` 或 `permission denied` → 上面那個寫入權限沒開
- `API error on MatchSchedule=MS: ...` → Leaguepedia 欄位名稱跟我寫的不一樣，我改查詢就好

---

## 這次改了什麼

- 工作流程加了 **push 觸發**，之後任何對 `update-data.js` 的修改都會自動重跑一次
- 拿掉了 `continue-on-error`，失敗現在會明確顯示紅叉，不會被吞掉
- `update-data.js` 在「資料沒變」時改成正常結束（之前會被當成失敗）
- commit 步驟會印出到底有沒有推上去
