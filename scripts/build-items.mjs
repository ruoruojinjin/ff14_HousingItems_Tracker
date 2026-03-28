/**
 * build-items.mjs
 *
 * FF14 家具資料產線腳本
 *
 * 資料來源：
 *   1. XIVAPI v2        — item ID、英文名、日文名、icon、patch 版本
 *   2. beherw tw-items  — 繁中名稱（以 item ID 為 key）
 *   3. beherw obtainable-methods — 取得方式（以 item ID 為 key）
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
const XIVAPI_BASE = "https://v2.xivapi.com";

const TW_ITEMS_URL =
  "https://raw.githubusercontent.com/beherw/FFXIV_Market/main/public/data/tw-items.msgpack";
const OBTAINABLE_URL =
  "https://raw.githubusercontent.com/beherw/FFXIV_Market/main/public/data/obtainable-methods.msgpack";

// ─── 手動 override ────────────────────────────────────────────────────────────
// 格式：{ [itemId]: { category?, subcategory? } }
// 跑完後若發現分類不對，在這裡加一行再重跑即可
const ITEM_OVERRIDE = {
  // 範例：
  // 12345: { subcategory: "照明" },
  // 67890: { category: "室內", subcategory: "床" },
};

// ─── ItemUICategory ID 對照 ───────────────────────────────────────────────────
// 來源：XIVAPI ItemUICategory row ID
// 比 name 字串穩定，不怕改名
const CATEGORY_ID_MAP = {
  // ── 室內 ──
  56: { category: "室內", subcategory: "其他"  }, // Furnishings
  66: { category: "室內", subcategory: "其他"  }, // Interior Fixtures
  68: { category: "室內", subcategory: "床"    }, // Chairs and Beds
  69: { category: "室內", subcategory: "桌子"  }, // Tables

  // ── 庭具 ──
  65: { category: "庭具", subcategory: "其他"  }, // Exterior Fixtures
  67: { category: "庭具", subcategory: "其他"  }, // Outdoor Furnishings

  // ── 壁掛 ──
  71: { category: "壁掛", subcategory: "裝飾"  }, // Wall-mounted
  82: { category: "壁掛", subcategory: "裝飾"  }, // Paintings

  // ── 桌上 ──
  70: { category: "桌上", subcategory: "裝飾"  }, // Tabletop

  // ── 地板 ──
  72: { category: "地板", subcategory: "地毯"  }, // Rugs
};

// ─── 工具函式 ─────────────────────────────────────────────────────────────────
async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.arrayBuffer();
}

function resolveIcon(icon) {
  if (!icon) return null;
  if (typeof icon === "string")
    return icon.startsWith("http") ? icon : `${XIVAPI_BASE}${icon}`;
  if (icon.path_hr1) return `${XIVAPI_BASE}${icon.path_hr1}`;
  if (icon.path)     return `${XIVAPI_BASE}${icon.path}`;
  return null;
}

// ─── Step 1a：beherw 繁中名稱 ─────────────────────────────────────────────────
async function fetchTwNames() {
  console.log("📦 下載 beherw tw-items.msgpack...");
  const buf = await fetchBuffer(TW_ITEMS_URL);
  const data = decode(new Uint8Array(buf));
  const map = {};
  for (const [key, val] of Object.entries(data)) {
    const id = parseInt(key, 10);
    if (!isNaN(id) && val?.tw) map[id] = val.tw;
  }
  console.log(`   ✓ 取得 ${Object.keys(map).length} 筆繁中名稱`);
  return map;
}

// ─── Step 1b：beherw 取得方式 ─────────────────────────────────────────────────
// obtainable-methods 格式：
//   { "itemId": [ { type, typeName, data: [...] }, ... ] }
// 我們只取 typeName 組成陣列，例如 ["製作", "掉落"]
async function fetchObtainMethods() {
  console.log("📦 下載 beherw obtainable-methods.msgpack...");
  const buf = await fetchBuffer(OBTAINABLE_URL);
  const data = decode(new Uint8Array(buf));
  const map = {};
  for (const [key, sources] of Object.entries(data)) {
    const id = parseInt(key, 10);
    if (isNaN(id) || !Array.isArray(sources)) continue;
    // 去重、過濾空值
    const names = [...new Set(
      sources.map(s => s?.typeName).filter(Boolean)
    )];
    if (names.length) map[id] = names;
  }
  console.log(`   ✓ 取得 ${Object.keys(map).length} 筆取得方式`);
  return map;
}

// ─── Step 2：XIVAPI 家具清單（含 patch 版本）────────────────────────────────
async function fetchFurnitureFromXIVAPI() {
  console.log("🌐 從 XIVAPI v2 抓取家具資料...");
  const categoryIds = Object.keys(CATEGORY_ID_MAP).map(Number);
  const allItems = [];

  for (const catId of categoryIds) {
    let cursor = null;
    let pageCount = 0;

    while (true) {
      let url;
      if (cursor) {
        url = `${XIVAPI_BASE}/api/search?cursor=${encodeURIComponent(cursor)}`;
      } else {
        const params = new URLSearchParams({
          sheets: "Item",
          // Patch 欄位：XIVAPI v2 Item sheet 有 GamePatch 關聯
          fields: "Name,Name@ja,Icon,ItemUICategory@as(raw),GamePatch.Version",
          query: `+ItemUICategory=${catId}`,
          limit: "500",
        });
        url = `${XIVAPI_BASE}/api/search?${params.toString()}`;
      }

      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`   ⚠ CategoryID ${catId} 失敗: HTTP ${res.status}`);
        break;
      }

      const data = await res.json();
      const results = data.results ?? [];
      allItems.push(...results);
      pageCount++;

      if (!data.next || results.length < 500) break;
      cursor = data.next;
      await new Promise(r => setTimeout(r, 300));
    }

    console.log(`   ✓ CategoryID ${catId}（${pageCount} 頁）`);
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`   ✓ 共取得 ${allItems.length} 筆原始資料`);
  return allItems;
}

// ─── Step 3：合併 ─────────────────────────────────────────────────────────────
function mergeAndBuild(xivapiItems, twNames, obtainMethods) {
  console.log("🔧 合併資料...");

  const items = [];
  const seen = new Set();
  const unknownCats = new Set();

  for (const raw of xivapiItems) {
    const id = raw.row_id ?? raw.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const fields = raw.fields ?? raw;

    // CategoryID
    const catId = fields["ItemUICategory@as(raw)"]
      ?? fields["ItemUICategory"]?.row_id
      ?? fields["ItemUICategory"];
    if (!catId || !CATEGORY_ID_MAP[catId]) {
      if (catId) unknownCats.add(`${catId}`);
      continue;
    }

    const base     = CATEGORY_ID_MAP[catId];
    const override = ITEM_OVERRIDE[id] ?? {};
    const category    = override.category    ?? base.category;
    const subcategory = override.subcategory ?? base.subcategory;

    const name_en = fields["Name"]      ?? null;
    const name_ja = fields["Name@ja"]   ?? null;
    const name_zh = twNames[id]         ?? null;

    if (!name_en && !name_ja && !name_zh) continue;

    const icon  = resolveIcon(fields["Icon"]);

    // Patch 版本：GamePatch.Version 格式通常是 "6.4" 或 "2.1"
    const patch = fields["GamePatch"]?.fields?.Version
      ?? fields["GamePatch.Version"]
      ?? null;

    // 取得方式（來自 beherw）
    const sources = obtainMethods[id] ?? null;

    items.push({
      id,
      name_zh,
      name_ja,
      name_en,
      category,
      subcategory,
      icon,
      patch: patch ? String(patch) : null,
      sources,   // string[] | null，例如 ["製作", "掉落"]
    });
  }

  items.sort((a, b) => a.id - b.id);
  console.log(`   ✓ 合併後共 ${items.length} 筆`);

  const noZh = items.filter(i => !i.name_zh).length;
  if (noZh) console.warn(`   ⚠ ${noZh} 筆缺繁中名稱`);

  if (unknownCats.size) {
    console.warn(`\n   ⚠ 以下 ItemUICategory ID 不在對照表（物品略過）：`);
    [...unknownCats].sort((a, b) => Number(a) - Number(b))
      .forEach(c => console.warn(`      ID: ${c}`));
    console.warn(`   → 如需加入，請補充至 CATEGORY_ID_MAP`);
  }

  return items;
}

// ─── 主流程 ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== FF14 家具資料產線 ===\n");
  try {
    const [twNames, obtainMethods, xivapiItems] = await Promise.all([
      fetchTwNames(),
      fetchObtainMethods(),
      fetchFurnitureFromXIVAPI(),
    ]);

    const items = mergeAndBuild(xivapiItems, twNames, obtainMethods);

    writeFileSync(OUTPUT_PATH, JSON.stringify(items, null, 2), "utf-8");
    console.log(`\n✅ 完成！→ ${OUTPUT_PATH}（共 ${items.length} 筆）`);
  } catch (err) {
    console.error("\n❌ 錯誤：", err.message);
    process.exit(1);
  }
}

main();
