/**
 * build-dye-map.mjs
 * 從 furniture.json 的染劑資料 + hex 對照表，產生 dye-color-map.json
 * 格式：{ "658241": 5779, "E4DFD0": 5729, ... }  (hex大寫 → item id)
 *
 * 使用方式：node scripts/build-dye-map.mjs
 */

import { readFileSync, writeFileSync } from "fs";

const FURNITURE_PATH  = "./src/furniture.json";
const OUTPUT_PATH     = "./src/dye-color-map.json";

// hex（不含#，大寫）→ 英文名稱
// 資料來源：ff14.huijiwiki.com/wiki/染劑
const HEX_TO_EN = {
  // 白/灰/黑
  "E4DFD0": "Snow White Dye",
  "ACA8A2": "Ash Grey Dye",
  "898784": "Goobbue Grey Dye",
  "656565": "Slate Grey Dye",
  "484742": "Charcoal Grey Dye",
  "2B2923": "Soot Black Dye",
  // 特殊
  "F9F8F4": "Pure White Dye",
  "1E1E1E": "Jet Black Dye",
  "FDC8C6": "Pastel Pink Dye",
  "321919": "Dark Red Dye",
  "28211C": "Dark Brown Dye",
  "BACFAA": "Pastel Green Dye",
  "152C2C": "Dark Green Dye",
  "96A4D9": "Pastel Blue Dye",
  "121F2D": "Dark Blue Dye",
  "BBB5DA": "Pastel Purple Dye",
  "232026": "Dark Purple Dye",
  // 紅/粉
  "E69F96": "Rose Pink Dye",
  "836969": "Lilac Purple Dye",
  "5B1729": "Rolanberry Red Dye",
  "781A1A": "Dalamud Red Dye",
  "622207": "Rust Red Dye",
  "451511": "Wine Red Dye",
  "CC6C5E": "Coral Pink Dye",
  "913B27": "Blood Red Dye",
  "E4AA8A": "Salmon Pink Dye",
  "E40011": "Ruby Red Dye",
  "F5379B": "Cherry Pink Dye",
  "DE0B16": "Carmine Red Dye",
  "ED118E": "Neon Pink Dye",
  // 橙/棕
  "B75C2D": "Sunset Orange Dye",
  "7D3906": "Mesa Red Dye",
  "6A4B37": "Bark Brown Dye",
  "6E3D24": "Chocolate Brown Dye",
  "4F2D1F": "Russet Brown Dye",
  "30211B": "Giantsgall Brown Dye",
  "C99156": "Cork Brown Dye",
  "996E3F": "Opo-opo Brown Dye",
  "7B5C2D": "Aldgoat Brown Dye",
  "A2875C": "Othard Brown Dye",
  "C57424": "Pumpkin Orange Dye",
  "8E581B": "Acorn Brown Dye",
  "644216": "Orchard Brown Dye",
  "3D290D": "Chestnut Brown Dye",
  "B9A489": "Gobbiebag Brown Dye",
  "92816C": "Shale Brown Dye",
  "615245": "Mole Brown Dye",
  "3F3329": "Loam Brown Dye",
  "F45011": "Neon Orange Dye",
  // 黃
  "EBD3A0": "Bone White Dye",
  "B7A370": "Dun Yellow Dye",
  "DBB457": "Desert Yellow Dye",
  "FAC62B": "Honey Yellow Dye",
  "E49E34": "Maize Yellow Dye",
  "BC8804": "Millioncorn Yellow Dye",
  "F2D770": "Cream Yellow Dye",
  "A58430": "Halatali Yellow Dye",
  "403311": "Raisin Brown Dye",
  "FEF864": "Canary Yellow Dye",
  "FBF1B4": "Vanilla Yellow Dye",
  "DFEA08": "Neon Yellow Dye",
  // 綠
  "585230": "Marsh Green Dye",
  "BBBB8A": "Moss Green Dye",
  "ABB054": "Lime Green Dye",
  "707326": "Meadow Green Dye",
  "8B9C63": "Olive Green Dye",
  "4B5232": "Celeste Green Dye",
  "323621": "Swamp Green Dye",
  "9BB363": "Apple Green Dye",
  "658241": "Cactuar Green Dye",
  "284B2C": "Hunter Green Dye",
  "406339": "Ochu Green Dye",
  "5F7558": "Adamantoise Green Dye",
  "3B4D3C": "Nophica Green Dye",
  "1E2A21": "Deep Forest Green Dye",
  "96BDB9": "Turquoise Green Dye",
  "437272": "Morbol Green Dye",
  "1F4646": "Wivre Green Dye",
  "B5F710": "Neon Green Dye",
  // 藍
  "B2C4CE": "Iceberg Blue Dye",
  "83B0D2": "Sky Blue Dye",
  "6481A0": "Seafog Blue Dye",
  "3B6886": "Peacock Blue Dye",
  "1C3D54": "Rhotano Blue Dye",
  "8E9BAC": "Corpse Blue Dye",
  "4F5766": "Cerulean Blue Dye",
  "2F3851": "Woad Blue Dye",
  "1A1F27": "Ink Blue Dye",
  "5B7FC0": "Raptor Blue Dye",
  "2F5889": "Othard Blue Dye",
  "234172": "Storm Blue Dye",
  "112944": "Void Blue Dye",
  "273067": "Royal Blue Dye",
  "181937": "Midnight Blue Dye",
  "373747": "Shadow Blue Dye",
  "312D57": "Abyss Blue Dye",
  "000EA2": "Dragon Navy Dye",
  "04AFCD": "Turquoise Blue Dye",
  "3A4C90": "Ceruleum Blue Dye",
  // 紫
  "877FAE": "Lavender Purple Dye",
  "514560": "Gloom Purple Dye",
  "322C3B": "Currant Purple Dye",
  "B79EBC": "Lotus Pink Dye",
  "3B2A3D": "Grape Purple Dye",
  "FECEF5": "Colibri Pink Dye",
  "DC9BCA": "Hummingbird Blue Dye",
  "79526C": "Plum Purple Dye",
  "66304E": "Regal Purple Dye",
  "62508F": "Rolanberry Purple Dye",
};

// 讀取 furniture.json
const furniture = JSON.parse(readFileSync(FURNITURE_PATH, "utf-8"));
const dyes = furniture.filter(it => it.type === "dye");

// 建立 name_en → id 對照
const enToId = {};
for (const dye of dyes) {
  if (dye.name_en) enToId[dye.name_en] = dye.id;
}

// 建立 hex → id
const colorMap = {};
let matched = 0, unmatched = [];
for (const [hex, en] of Object.entries(HEX_TO_EN)) {
  const id = enToId[en];
  if (id) {
    colorMap[hex.toUpperCase()] = id;
    matched++;
  } else {
    unmatched.push(`${hex} → "${en}"`);
  }
}

writeFileSync(OUTPUT_PATH, JSON.stringify(colorMap, null, 2), "utf-8");
console.log(`✅ dye-color-map.json → ${matched} 種染劑對應完成`);
if (unmatched.length) {
  console.warn(`⚠️ ${unmatched.length} 種未找到對應：`);
  unmatched.forEach(u => console.warn("  ", u));
}
