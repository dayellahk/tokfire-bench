# 模型推薦與測試流程 — v0.3.0

## 已實作的使用流程

1. 啟動時在本機偵測 Apple 晶片、CPU 核心、RAM、Metal 裝置及 macOS 版本。
2. 網上目錄啟用時，向 Hugging Face 的公開 API 讀取最新 GGUF 熱門候選。硬件資料不會隨請求上傳。
3. 從 trendingScore 排序的前 100 個候選，篩選文字模型及容量範圍、合併同源量化版本，再選最多 10 個。排序優先本機容量、≤8B 輕量模型，其次 trendingScore。此列表不是全站熱門前十，也不是「最多討論」排名。
4. 主要範圍為 0.5–30B；另包含總參數 ≤40B 且名稱標示啟用參數 ≤4B 的 MoE，例如 35B/36B-A3B。容量用完整權重計算，不能用 A3B 當成只需 3B 權重。
5. 模型卡顯示發布者、參數估算、下載量及 likes。打開版本頁後，用固定 repository commit 查詢檔案大小及 LFS SHA-256，優先 Q4_K_M。
6. 只支援可校驗的單檔 GGUF；排除 split GGUF、mmproj、imatrix、MTP 輔助檔。需要登入／授權的模型交回 Hugging Face 網站處理，沒有自動取得帳戶權限。
7. 用戶按「下載並加入測試」後，app 顯示真實下載進度、可取消，確認磁碟容量、檔案大小及 SHA-256。驗證成功才加入最多三個模型的測試佇列。
8. GUI 啟動自己的 Python runner，接收結構化階段及每次測量事件；顯示載入、暖機、測量數、即時數值、停止／失敗／完成，並自動捲到完整結果。報告留在本機。
9. 歷史頁每四秒刷新 Reports 資料夾；因此 GUI 及寫入共用資料夾的 CLI 完成報告都能查看。外部 CLI 的即時進度不會冒充 GUI 目前的執行。

## 三層建議，清楚分開來源

| 層次 | 資料來源 | 可作的判斷 | 畫面標示 |
|---|---|---|---|
| 模型熱門度 | Hugging Face API 即時目錄 | 發現可選模型、量化版本、大小及授權 | 熱門候選，並非品質／速度排名 |
| 容量估算 | 本機 RAM + GGUF 實際檔案大小 | 初步判斷是否有足夠空間 | 容量較充裕／偏緊／建議更小 |
| 實測證據 | 本機標準報告或既有社群 leaderboard API | 展示相同模型與 runtime 的過往速度 | 本機歷史實測／社群回報（未獨立核實） |

模型列表每次啟動／按更新重新取得，沒有把「今日十個模型」硬編碼成靜態資料庫。API metadata 不一致時，取模型名稱與 GGUF metadata 較大的參數估計，以免把大型權重誤當小型模型；最後容量判斷以實際檔案大小為準。

### 容量估算

目前 benchmark 固定 4,096 context。初篩需求 = 權重大小 × 1.25 + 2 GiB。超過 60% RAM 標為偏緊；超過 80% RAM，或純權重超過 65% RAM，就不提供下載建議。目錄尚未選定檔案時，只用參數量 × 約 0.65 byte 作 Q4 候選粗排。

這是啟發式預算，不是模型架構專屬 KV-cache 計算，不保證能載入、不換頁或有理想速度。實測不能由熱門度或參數量推算，也不提供虛構 benchmark 分數。

## 與現有 benchmark 資料庫的連接

已接入現有 `/api/v1/leaderboard` 讀取路徑；不另建資料庫、不修改網站存取範圍，也不傳送本機規格或模型路徑。使用者按「讀取社群實測」才讀取公開同意的聚合結果，再在本機依晶片、RAM、512 input 工作負載、模型 SHA-256 及 runtime executable SHA-256 配對。

現有網站是 owner-private，native app 沒有網站 OAuth／cookie 登入。因此服務若回傳登入頁或不可用，會顯示「社群實測暫不可用」，繼續提供本機容量估算；沒有假裝成功取得私人資料。這個連接已可處理合法 JSON 回應，但本次不能宣稱私人網站的 native 身分驗證已完成。

下一個後端里程碑：

- 為 native 加入正式登入／授權，或另提供只包含明確同意公開聚合資料的讀取 API；由產品擁有人決定存取範圍。
- 沿用現有 comparison cohort（模型、runtime 設定、spec、輸入／輸出 tokens），並加入推薦所需的樣本日期與有效期、最低 contributor 門檻、分位數、成功／失敗樣本與可信度。
- 建立 GGUF SHA-256 → Hugging Face repo/revision/file 的 catalog mapping，不把私人使用者或本機路徑加入公開排行。
- 維持收藏／公開分開同意；撤回公開或刪除報告時，推薦查詢不再使用該筆資料。
- 對失敗案例及新 runtime 重新驗證相容性，不只依賴 successful-run averages；不要把平均排行榜速度稱為保證值。

## 離線及故障行為

網上目錄開關會保存。關閉後取消目錄請求及下載、清除網上建議，顯示無法提供最新網上推薦。仍可匯入／測試本機 GGUF、查看及匯出已有報告。無連線不能實際瀏覽 Hugging Face，所以按鈕保留作恢復連線後選模型之用，而不是把網站當成離線方案。實際 API 故障也會清楚提示並提供重試。

## 裝置支援範圍

目前可執行 app 仍為 Apple Silicon macOS。通用 PC 版本日後可沿用 catalog／report contract，但 Windows/Linux 需另外偵測 GPU 廠牌、VRAM、RAM、推理 backend 與 CPU-only 模式；獨顯 VRAM 不能直接套用 Mac 的統一記憶體估算。沒有聲稱本次已新增 Windows 支援。

## 來源

- Hugging Face Hub API：https://huggingface.co/docs/hub/api
- HfApi 模型查詢、排序、metadata：https://huggingface.co/docs/huggingface_hub/package_reference/hf_api
- 本次直接驗證：`/api/models?filter=gguf&sort=trendingScore` 及固定 commit 的 repository tree endpoint。
