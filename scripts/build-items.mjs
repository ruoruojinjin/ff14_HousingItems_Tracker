/**
 * build-items.mjs
 *
 * FF14 資料產線腳本
 *
 * 資料來源：
 *   1. beherw obtainable-methods  → 所有市場物品 ID（主軸，不漏）+ 取得方式
 *   2. beherw tw-items            → 繁中名稱
 *   3. XIVAPI v2（批量查）         → name_en, name_ja, icon, patch, ItemUICategory
 *
 * 產出：
 *   src/item-master.json  → 所有物品（含所有欄位）
 *   src/furniture.json    → 家具 + 染劑（前端用）
 *
 * 使用方式：node scripts/build-items.mjs
 * 前置條件：npm install @msgpack/msgpack
 */

import { writeFileSync } from "fs";
import { decode } from "@msgpack/msgpack";

// ─── 設定 ─────────────────────────────────────────────────────────────────────
const XIVAPI_BASE   = "https://v2.xivapi.com";
const XIVAPI_V1     = "https://xivapi.com";
const TW_ITEMS_URL  = "https://raw.githubusercontent.com/beherw/FFXIV_Market/main/public/data/tw-items.msgpack";
const OBTAIN_URL    = "https://raw.githubusercontent.com/beherw/FFXIV_Market/main/public/data/obtainable-methods.msgpack";

const ITEM_MASTER_PATH = "./src/item-master.json";
const FURNITURE_PATH   = "./src/furniture.json";

// XIVAPI 批量查詢每批筆數（太大會超過 URL 長度限制）
const BATCH_SIZE = 100;

// ─── 家具分類對照（ItemUICategory.Name → 我們的 category/subcategory）─────────
const FURNITURE_CATEGORY_MAP = {
  "Furnishing":               { category: "室內", subcategory: "其他"  },
  "Ceiling Light":            { category: "室內", subcategory: "照明"  },
  "Interior Wall":            { category: "室內", subcategory: "其他"  },
  "Flooring":                 { category: "室內", subcategory: "其他"  },
  "Window":                   { category: "室內", subcategory: "窗簾"  },
  "Door":                     { category: "室內", subcategory: "其他"  },
  "Chair/Bed":                { category: "室內", subcategory: "床"    },
  "Table":                    { category: "室內", subcategory: "桌子"  },
  "Outdoor Furnishing":       { category: "庭具", subcategory: "其他"  },
  "Exterior Wall":            { category: "庭具", subcategory: "其他"  },
  "Exterior Wall Decoration": { category: "庭具", subcategory: "其他"  },
  "Fence":                    { category: "庭具", subcategory: "其他"  },
  "Roof":                     { category: "庭具", subcategory: "其他"  },
  "Roof Decoration":          { category: "庭具", subcategory: "其他"  },
  "Wall-mounted":             { category: "壁掛", subcategory: "裝飾"  },
  "Paintings":                { category: "壁掛", subcategory: "裝飾"  },
  "Placard":                  { category: "壁掛", subcategory: "裝飾"  },
  "Tabletop":                 { category: "桌上", subcategory: "裝飾"  },
  "Rug":                      { category: "地板", subcategory: "地毯"  },
};

// 染劑的 ItemUICategory.Name
const DYE_CATEGORY = "Dye";  // XIVAPI 用單數

// ─── 手動 override（家具分類補正）────────────────────────────────────────────
// 格式：{ [itemId]: { category?, subcategory? } }
const FURNITURE_OVERRIDE = {
  // 範例：
  // 12345: { subcategory: "照明" },
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
  if (icon?.path_hr1) return `${XIVAPI_BASE}${icon.path_hr1}`;
  if (icon?.path)     return `${XIVAPI_BASE}${icon.path}`;
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Step 1a：beherw 繁中名稱 ─────────────────────────────────────────────────
async function fetchTwNames() {
  console.log("📦 下載 tw-items.msgpack...");
  const data = decode(new Uint8Array(await fetchBuffer(TW_ITEMS_URL)));
  const map = {};
  for (const [k, v] of Object.entries(data)) {
    const id = parseInt(k, 10);
    if (!isNaN(id) && v?.tw) map[id] = v.tw;
  }
  console.log(`   ✓ ${Object.keys(map).length} 筆繁中名稱`);
  return map;
}

// ─── Step 1b：beherw 取得方式 + 所有市場物品 ID ───────────────────────────────
async function fetchObtainMethods() {
  console.log("📦 下載 obtainable-methods.msgpack...");
  const data = decode(new Uint8Array(await fetchBuffer(OBTAIN_URL)));
  const map = {};
  for (const [k, sources] of Object.entries(data)) {
    const id = parseInt(k, 10);
    if (isNaN(id) || !Array.isArray(sources)) continue;
    const names = [...new Set(sources.map(s => s?.typeName).filter(Boolean))];
    map[id] = names.length ? names : null;
  }
  console.log(`   ✓ ${Object.keys(map).length} 筆物品（含取得方式）`);
  return map; // { [id]: string[] | null }
}

// ─── Step 1c：XIVAPI v1 批量查版本 ───────────────────────────────────────────────
// v2 沒有 GamePatch 欄位，改用 v1 的 /Item?ids=...&columns=ID,GamePatch.Version
async function fetchPatchVersions(ids) {
  console.log(`🌐 從 XIVAPI v1 取得版本（${ids.length} 筆）...`);
  const results = {};
  const CONCURRENCY = 5;
  let done = 0;
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const chunk = ids.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(async (id) => {
      try {
        const res = await fetch(`${XIVAPI_V1}/item/${id}?columns=ID,GamePatch.Version`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.GamePatch?.Version) results[id] = String(data.GamePatch.Version);
      } catch (e) {}
    }));
    done += chunk.length;
    if (done % 500 === 0) console.log(`   … ${done}/${ids.length} 筆完成`);
    await sleep(150);
  }
  console.log(`   ✓ 取得 ${Object.keys(results).length} 筆版本資料`);
  return results;
}

// ─── Step 2：XIVAPI 批量查詢 ──────────────────────────────────────────────────
// 用 /api/sheet/Item?rows=id1,id2,...&fields=... 一次查多筆
async function fetchXIVAPIBatch(ids) {
  const results = {};
  const batches = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE)
    batches.push(ids.slice(i, i + BATCH_SIZE));

  console.log(`🌐 XIVAPI 批量查詢（${ids.length} 筆，共 ${batches.length} 批）...`);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const params = new URLSearchParams({
      rows:   batch.join(","),
      fields: "Name,Name@ja,Icon,ItemUICategory.Name,GamePatch.Version,Patch",
    });
    const url = `${XIVAPI_BASE}/api/sheet/Item?${params}`;

    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`   ⚠ 批次 ${i+1} 失敗: HTTP ${res.status}`);
      await sleep(1000);
      continue;
    }

    const data = await res.json();
    for (const row of (data.rows ?? [])) {
      results[row.row_id] = row.fields ?? {};
    }

    if ((i + 1) % 10 === 0)
      console.log(`   … ${i+1}/${batches.length} 批完成`);

    await sleep(150); // rate limit 友善
  }

  console.log(`   ✓ 取得 ${Object.keys(results).length} 筆 XIVAPI 資料`);
  return results; // { [id]: fields }
}

// ─── Step 3：合併成 item-master ───────────────────────────────────────────────
function buildItemMaster(obtainMap, twNames, xivapiMap, patchMap = {}) {
  console.log("🔧 合併 item-master...");
  const items = [];
  const unknownCats = new Set();

  for (const [idStr, sources] of Object.entries(obtainMap)) {
    const id = Number(idStr);
    const xiv = xivapiMap[id] ?? {};

    const name_en = xiv["Name"]    ?? null;
    const name_ja = xiv["Name@ja"] ?? null;
    const name_zh = twNames[id]    ?? null;

    // 所有名稱都沒有的略過（通常是已下架/測試物品）
    if (!name_en && !name_ja && !name_zh) continue;

    const catName = xiv["ItemUICategory"]?.fields?.Name ?? null;
    if (catName && !FURNITURE_CATEGORY_MAP[catName] && catName !== DYE_CATEGORY)
      unknownCats.add(catName);

    const icon  = resolveIcon(xiv["Icon"]);
    const patch = patchMap[id] ?? null;

    items.push({
      id,
      name_zh,
      name_ja,
      name_en,
      icon,
      patch:    patch ? String(patch) : null,
      category_name: catName,   // 原始 XIVAPI 分類名稱，保留供 debug
      sources,
    });
  }

  items.sort((a, b) => a.id - b.id);
  console.log(`   ✓ item-master: ${items.length} 筆`);

  if (unknownCats.size) {
    console.log(`\n   ℹ️ 未分類的 ItemUICategory（不影響輸出，僅供參考）：`);
    [...unknownCats].sort().forEach(c => console.log(`      "${c}"`));
  }

  return items;
}

// ─── Step 4：從 item-master 過濾出 furniture.json ─────────────────────────────
// furniture.json 包含：
//   - 家具（FURNITURE_CATEGORY_MAP 裡的 category）
//   - 染劑（ItemUICategory.Name === "Dyes"）
function buildFurnitureJSON(itemMaster) {
  console.log("🔧 過濾 furniture.json...");
  const items = [];
  const unknownFurnitureCats = new Set();

  for (const item of itemMaster) {
    const catName = item.category_name;
    const isFurniture = catName && FURNITURE_CATEGORY_MAP[catName];
    const isDye       = catName === DYE_CATEGORY;

    if (!isFurniture && !isDye) continue;

    const base     = isFurniture ? FURNITURE_CATEGORY_MAP[catName] : null;
    const override = FURNITURE_OVERRIDE[item.id] ?? {};

    const entry = {
      id:       item.id,
      name_zh:  item.name_zh,
      name_ja:  item.name_ja,
      name_en:  item.name_en,
      icon:     item.icon,
      patch:    item.patch,
      sources:  item.sources,
      type:     isDye ? "dye" : "furniture",
    };

    if (isFurniture) {
      entry.category    = override.category    ?? base.category;
      entry.subcategory = override.subcategory ?? base.subcategory;
    }

    items.push(entry);
  }

  const furniture = items.filter(i => i.type === "furniture");
  const dyes      = items.filter(i => i.type === "dye");
  console.log(`   ✓ furniture.json: ${furniture.length} 件家具 + ${dyes.length} 種染劑`);

  return items;
}

// ─── 主流程 ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== FF14 資料產線 ===\n");
  try {
    // Step 1：beherw 兩份資料
    const [twNames, obtainMap] = await Promise.all([
      fetchTwNames(),
      fetchObtainMethods(),
    ]);

    // Step 2：用 obtainMap 的所有 ID 去 XIVAPI 批量查
    // 過濾無效 ID（0 或負數會導致 XIVAPI 400）
    const allIds = Object.keys(obtainMap).map(Number).filter(id => id > 0);
    const xivapiMap = await fetchXIVAPIBatch(allIds);

    // Step 2b：只查家具/染劑 ID 的版本（v1）
    const furnitureIds = Object.keys(xivapiMap).map(Number).filter(id => {
      const catName = xivapiMap[id]?.["ItemUICategory"]?.fields?.Name;
      return catName && (FURNITURE_CATEGORY_MAP[catName] || catName === DYE_CATEGORY);
    });
    const patchMap = await fetchPatchVersions(furnitureIds);

    // Step 3：合併 item-master
    const itemMaster = buildItemMaster(obtainMap, twNames, xivapiMap, patchMap);
    writeFileSync(ITEM_MASTER_PATH, JSON.stringify(itemMaster, null, 2), "utf-8");
    console.log(`\n✅ item-master.json → ${ITEM_MASTER_PATH}（${itemMaster.length} 筆）`);

    // Step 4：過濾出 furniture.json
    const furnitureData = buildFurnitureJSON(itemMaster);
    writeFileSync(FURNITURE_PATH, JSON.stringify(furnitureData, null, 2), "utf-8");
    console.log(`✅ furniture.json  → ${FURNITURE_PATH}（${furnitureData.length} 筆）`);

  } catch (err) {
    console.error("\n❌ 錯誤：", err.message);
    process.exit(1);
  }
}

main();
