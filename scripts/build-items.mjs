/**
 * build-items.mjs
 *
 * FF14 家具資料產線腳本
 *
 * 功能：
 *   1. 從 XIVAPI v2 拉取所有家具類物品（name_en, name_ja, icon, patch）
 *   2. 從 beherw 的 tw-items.msgpack 取得繁中名稱
 *   3. 合併後輸出 src/items.json
 *
 * 使用方式：
 *   node build-items.mjs
 *
 * 前置條件（Node 18+）：
 *   npm install @msgpack/msgpack
 */

import { writeFileSync } from "fs";
import { decode } from "@msgpack/msgpack";

// ─── 設定 ─────────────────────────────────────────────────────────────────────

const OUTPUT_PATH = "./src/items.json";

// beherw tw-items.msgpack 的直連 URL
// 如果日後路徑改變，只需更新這裡
const TW_ITEMS_URL =
  "https://raw.githubusercontent.com/beherw/FFXIV_Market/main/public/data/tw-items.msgpack";

// XIVAPI v2 base
const XIVAPI_BASE = "https://v2.xivapi.com";

// ─── 手動 override 表 ─────────────────────────────────────────────────────────
//
// 用途：針對特定 itemId 覆蓋 CATEGORY_MAP 給的預設 category / subcategory
// 格式：{ [itemId]: { category?, subcategory? } }
//
// 何時填：跑完腳本、用 items.json 確認資料後，
//         發現某物品分類不對，就在這裡加一行，重跑腳本即可修正。
//
// 範例：
//   12345: { subcategory: "照明" },                    // 只改 subcategory
//   67890: { category: "室內", subcategory: "床" },    // category + subcategory 都改
//
const ITEM_OVERRIDE = {
  // ↓ 在這裡新增，格式：[itemId]: { category?, subcategory? }
};

// ─── XIVAPI ItemUICategory ID → 我們的分類對照 ────────────────────────────────
//
// 對照方式：
//   XIVAPI 的 ItemUICategory.Name (英文) → { category, subcategory }
//
// 注意：subcategory 是預設值，部分物品可能需要手動調整
// 如果 XIVAPI 的名稱不在這裡，該物品會被略過（不加入 items.json）
//
const CATEGORY_MAP = {
  // ── 室內 ──
  Furnishing:      { category: "室內",  subcategory: "其他" },
  "Ceiling Light": { category: "室內",  subcategory: "照明" },
  "Interior Wall": { category: "室內",  subcategory: "其他" },
  Flooring:        { category: "室內",  subcategory: "其他" },
  Window:          { category: "室內",  subcategory: "窗簾" },
  Door:            { category: "室內",  subcategory: "其他" },

  // ── 庭具 ──
  "Outdoor Furnishing": { category: "庭具", subcategory: "其他" },
  "Exterior Wall":      { category: "庭具", subcategory: "其他" },
  "Exterior Wall Decoration": { category: "庭具", subcategory: "其他" },
  Fence:                { category: "庭具", subcategory: "其他" },
  Roof:                 { category: "庭具", subcategory: "其他" },
  "Roof Decoration":    { category: "庭具", subcategory: "其他" },

  // ── 壁掛 ──
  "Wall-mounted": { category: "壁掛", subcategory: "裝飾" },

  // ── 桌上 ──
  Tabletop: { category: "桌上", subcategory: "裝飾" },

  // ── 室內桌子（Table 是可放置物品的桌類家具）──
  Table: { category: "室內", subcategory: "桌子" },

  // ── 地板 ──
  Rug: { category: "地板", subcategory: "地毯" },
};

// ─── 工具函式 ─────────────────────────────────────────────────────────────────

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.arrayBuffer();
}

// 把 XIVAPI icon 路徑轉成完整 URL
// XIVAPI v2 回傳的 icon 是 { id: 123456 } 或路徑字串，依版本不同
function resolveIcon(icon) {
  if (!icon) return null;
  if (typeof icon === "string") {
    return icon.startsWith("http") ? icon : `https://v2.xivapi.com${icon}`;
  }
  // v2 有時回傳 { id, path_hr1 }
  if (icon.path_hr1) return `https://v2.xivapi.com${icon.path_hr1}`;
  if (icon.path) return `https://v2.xivapi.com${icon.path}`;
  return null;
}

// ─── Step 1：從 beherw 取得繁中對照表 ─────────────────────────────────────────

async function fetchTwNames() {
  console.log("📦 下載 beherw tw-items.msgpack...");
  const buf = await fetchBuffer(TW_ITEMS_URL);
  const data = decode(new Uint8Array(buf));
  // 格式：{ "itemId": { "tw": "名稱" }, ... }
  // key 可能是字串，統一轉 number
  const map = {};
  for (const [key, val] of Object.entries(data)) {
    const id = parseInt(key, 10);
    if (!isNaN(id) && val?.tw) {
      map[id] = val.tw;
    }
  }
  console.log(`   ✓ 取得 ${Object.keys(map).length} 筆繁中名稱`);
  return map;
}

// ─── Step 2：從 XIVAPI 取得家具清單 ───────────────────────────────────────────
//
// XIVAPI v2 搜尋端點：GET /api/search?sheets=Item&query=...&fields=...&limit=...
// 參數全部放 query string，不接受 POST body

async function fetchFurnitureFromXIVAPI() {
  console.log("🌐 從 XIVAPI v2 抓取家具資料...");

  const categoryNames = Object.keys(CATEGORY_MAP);
  const allItems = [];

  for (const catName of categoryNames) {
    let cursor = null;
    let pageCount = 0;

    while (true) {
      let url;

      if (cursor) {
        // 翻頁時只需要 cursor，其他參數由 cursor 記住
        url = `${XIVAPI_BASE}/api/search?cursor=${encodeURIComponent(cursor)}`;
      } else {
        const params = new URLSearchParams({
          sheets: "Item",
          // Name@ja 取日文名；Icon 取圖示；+前綴 = must match
          fields: "Name,Name@ja,Icon,ItemUICategory.Name",
          query: `+ItemUICategory.Name="${catName}"`,
          limit: "500",
        });
        url = `${XIVAPI_BASE}/api/search?${params.toString()}`;
      }

      const res = await fetch(url);

      if (!res.ok) {
        console.warn(`   ⚠ XIVAPI 查詢 "${catName}" 失敗: HTTP ${res.status}`);
        break;
      }

      const data = await res.json();
      const results = data.results ?? [];
      allItems.push(...results);
      pageCount++;

      if (!data.next || results.length < 500) break;
      cursor = data.next;

      // rate limit 友善
      await new Promise((r) => setTimeout(r, 300));
    }

    console.log(`   ✓ ${catName}: 已抓取（${pageCount} 頁）`);
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`   ✓ 共取得 ${allItems.length} 筆原始資料`);
  return allItems;
}

// ─── Step 3：合併 & 輸出 ───────────────────────────────────────────────────────

function mergeAndBuild(xivapiItems, twNames) {
  console.log("🔧 合併資料...");

  const items = [];
  const seen = new Set();

  for (const raw of xivapiItems) {
    const id = raw.row_id ?? raw.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const fields = raw.fields ?? raw;
    const catName = fields["ItemUICategory"]?.fields?.Name ?? fields["ItemUICategory.Name"];
    if (!catName || !CATEGORY_MAP[catName]) continue;

    const base = CATEGORY_MAP[catName];
    const override = ITEM_OVERRIDE[id] ?? {};
    const category   = override.category   ?? base.category;
    const subcategory = override.subcategory ?? base.subcategory;

    const name_en = fields["Name"] ?? null;
    const name_ja = fields["Name@ja"] ?? null;
    const name_zh = twNames[id] ?? null;

    // 沒有任何名稱的略過
    if (!name_en && !name_ja && !name_zh) continue;

    const iconRaw = fields["Icon"];
    const icon = resolveIcon(iconRaw);


    items.push({
      id,
      name_zh,       // 繁中（beherw），可能為 null
      name_ja,       // 日文
      name_en,       // 英文
      category,
      subcategory,
      icon,
    });
  }

  // 依 id 排序
  items.sort((a, b) => a.id - b.id);

  console.log(`   ✓ 合併後共 ${items.length} 筆家具`);

  const noZh = items.filter((i) => !i.name_zh).length;
  if (noZh > 0) {
    console.warn(`   ⚠ ${noZh} 筆物品缺少繁中名稱（name_zh = null）`);
  }

  return items;
}

// ─── 主流程 ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== FF14 家具資料產線 ===\n");

  try {
    const [twNames, xivapiItems] = await Promise.all([
      fetchTwNames(),
      fetchFurnitureFromXIVAPI(),
    ]);

    const items = mergeAndBuild(xivapiItems, twNames);

    writeFileSync(OUTPUT_PATH, JSON.stringify(items, null, 2), "utf-8");
    console.log(`\n✅ 完成！已輸出至 ${OUTPUT_PATH}`);
    console.log(`   共 ${items.length} 筆家具資料`);
  } catch (err) {
    console.error("\n❌ 發生錯誤：", err.message);
    process.exit(1);
  }
}

main();
