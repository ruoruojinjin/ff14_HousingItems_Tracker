import { useState, useMemo, useEffect, useCallback } from "react";
import ITEMS_DATA from "./items.json";
import { Search, Sun, Moon, Trash2, Download, Package, ListFilter } from "lucide-react";

// ─── safe localStorage helpers ───────────────────────────────────────────────
const ls = {
  get: (key, fallback = null) => {
    try { const v = window.localStorage.getItem(key); return v !== null ? v : fallback; }
    catch { return fallback; }
  },
  set: (key, value) => { try { window.localStorage.setItem(key, value); } catch {} },
  getJSON: (key, fallback) => {
    try { return JSON.parse(window.localStorage.getItem(key) || "null") ?? fallback; }
    catch { return fallback; }
  },
  setJSON: (key, value) => { try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {} },
};

// ─── 分類常數 ─────────────────────────────────────────────────────────────────
const CATEGORIES = ["全部", "室內", "庭具", "壁掛", "桌上", "地板"];
// ─── 繁簡轉換 helper ──────────────────────────────────────────────────────────
// 常見繁→簡、簡→繁對照，讓搜尋時輸入任一種都能命中
const ZH_MAP = {
  // 簡→繁
  "层":"層","结":"結","动":"動","间":"間","览":"覽","书":"書","蜡":"蠟","灯":"燈",
  "钟":"鐘","树":"樹","柜":"櫃","烛":"燭","镜":"鏡","画":"畫","长":"長","丝":"絲",
  "织":"織","经":"經","纱":"紗","帘":"簾","绒":"絨","铁":"鐵","铜":"銅","银":"銀",
  "铃":"鈴","锅":"鍋","园":"園","枫":"楓","浅":"淺","储":"儲","华":"華","礼":"禮",
  "厅":"廳","餐":"餐","装":"裝","饰":"飾","纹":"紋","兰":"蘭","竹":"竹","莲":"蓮",
  "乐":"樂","器":"器","琴":"琴","筝":"箏","鼓":"鼓","草":"草","花":"花","盆":"盆",
  "栽":"栽","仙":"仙","椅":"椅","桌":"桌","床":"床","柱":"柱","帐":"帳","幔":"幔",
  // 繁→簡（反向）
  "層":"层","結":"结","動":"动","間":"间","覽":"览","書":"书","蠟":"蜡","燈":"灯",
  "鐘":"钟","樹":"树","櫃":"柜","燭":"烛","鏡":"镜","畫":"画","長":"长","絲":"丝",
  "織":"织","經":"经","紗":"纱","簾":"帘","絨":"绒","鐵":"铁","銅":"铜","銀":"银",
  "鈴":"铃","鍋":"锅","園":"园","楓":"枫","淺":"浅","儲":"储","華":"华","禮":"礼",
  "廳":"厅","裝":"装","飾":"饰","紋":"纹","蘭":"兰","蓮":"莲","樂":"乐","箏":"筝",
};

function toVariants(str) {
  // 把字串轉換成「繁簡混合版本都能命中」的比對函式
  // 做法：把 str 每個字都同時轉成繁體版和簡體版，產生候選字元集
  let result = str;
  let alt = str;
  for (const [from, to] of Object.entries(ZH_MAP)) {
    alt = alt.replaceAll(from, to);
  }
  return [result, alt];
}

// ─── 名稱 fallback helper ────────────────────────────────────────────────────
// 優先順序：name_zh → name_en → name_ja → "(unnamed)"
function displayName(it) {
  return it.name_zh || it.name_en || it.name_ja || "(unnamed)";
}

// ─── CSV EXPORT ───────────────────────────────────────────────────────────────
function exportCSV(quantities) {
  const selected = ITEMS_DATA.filter((it) => (quantities[it.id] || 0) > 0);
  if (!selected.length) { alert("尚未選取任何家具"); return; }
  const BOM = "\uFEFF";
  const total = selected.reduce((s, it) => s + quantities[it.id], 0);
  const header = "名稱,分類,數量,總數\n";
  const rows = [
    ...selected.map((it) =>
      `${displayName(it)},${it.category},${quantities[it.id]},`
    ),
    `,,共計,${total}`,
  ].join("\n");
  const blob = new Blob([BOM + header + rows], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "ff14_furniture.csv"; a.click();
  URL.revokeObjectURL(url);
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Noto+Sans+TC:wght@300;400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .ff14-app {
    --bg: #0d1117; --bg2: #161b22; --bgc: #1c2128; --bgch: #22272e;
    --bgh: #162016; --br: #30363d; --bra: #c9a84c;
    --tp: #e6edf3; --ts: #8b949e; --tm: #6e7681;
    --acc: #c9a84c; --accd: #9a7830;
    --accg: rgba(201,168,76,0.13); --accgh: rgba(201,168,76,0.24);
    --btb: #21262d; --bth: #2d333b; --stb: #30363d;
    font-family: 'Noto Sans TC', sans-serif;
    background: var(--bg); color: var(--tp);
    min-height: 100vh; display: flex; flex-direction: column;
    transition: background .25s, color .25s;
  }
  .ff14-app.lm {
    --bg: #f0ece3; --bg2: #e8e2d8; --bgc: #faf8f5; --bgch: #ede8e0;
    --bgh: #eef7ee; --br: #c8bfad; --bra: #9a7230;
    --tp: #1a1a1a; --ts: #5a4f3e; --tm: #8a7a65;
    --acc: #9a7230; --accd: #c4943a;
    --accg: rgba(154,114,48,0.1); --accgh: rgba(154,114,48,0.22);
    --btb: #e0d8cc; --bth: #cfc5b5; --stb: #c0b8a8;
  }

  .ff14-app ::-webkit-scrollbar { width: 5px; }
  .ff14-app ::-webkit-scrollbar-track { background: transparent; }
  .ff14-app ::-webkit-scrollbar-thumb { background: var(--stb); border-radius: 3px; }

  /* HEADER */
  .f-hd {
    background: var(--bg2); border-bottom: 1px solid var(--br);
    padding: 13px 22px; display: flex; align-items: center;
    justify-content: space-between; gap: 12px;
    position: sticky; top: 0; z-index: 100; flex-wrap: wrap;
  }
  .f-hd-l { display: flex; flex-direction: column; gap: 2px; }
  .f-title { font-family: 'Cinzel', serif; font-size: 17px; font-weight: 600; color: var(--acc); letter-spacing: .09em; }
  .f-sub { font-size: 10px; color: var(--tm); letter-spacing: .05em; }
  .f-hd-r { display: flex; gap: 7px; align-items: center; flex-wrap: wrap; }

  /* BUTTONS */
  .f-btn {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 6px 13px; border-radius: 6px; border: 1px solid var(--br);
    background: var(--btb); color: var(--ts);
    font-size: 12px; font-family: inherit; cursor: pointer;
    transition: all .14s; white-space: nowrap; font-weight: 500;
  }
  .f-btn:hover { background: var(--bth); color: var(--tp); border-color: var(--bra); }
  .f-btn-acc { border-color: var(--accd); color: var(--acc); background: var(--accg); }
  .f-btn-acc:hover { background: var(--accgh); border-color: var(--acc); }
  .f-btn-del:hover { border-color: #f85149; color: #f85149; background: rgba(248,81,73,.09); }
  .f-btn-ic { padding: 6px 9px; }

  /* LAYOUT */
  .f-main { display: flex; flex: 1; min-height: 0; }
  .f-lp { flex: 1; min-width: 0; display: flex; flex-direction: column; }

  /* FILTERS */
  .f-fa {
    background: var(--bg2); border-bottom: 1px solid var(--br);
    padding: 13px 20px; display: flex; flex-direction: column; gap: 9px;
  }
  .f-sr { position: relative; }
  .f-si { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--tm); pointer-events: none; }
  .f-sinp {
    width: 100%; padding: 8px 10px 8px 33px;
    background: var(--bgc); border: 1px solid var(--br);
    border-radius: 6px; color: var(--tp); font-size: 13px;
    font-family: inherit; outline: none; transition: border-color .14s;
  }
  .f-sinp:focus { border-color: var(--accd); }
  .f-sinp::placeholder { color: var(--tm); }
  .f-fr { display: flex; gap: 5px; flex-wrap: wrap; align-items: center; }
  .f-fl { font-size: 10px; color: var(--tm); margin-right: 3px; white-space: nowrap; display: flex; align-items: center; gap: 3px; }
  .f-fb {
    padding: 4px 11px; border-radius: 5px; border: 1px solid var(--br);
    background: transparent; color: var(--ts); font-size: 12px;
    font-family: inherit; cursor: pointer; transition: all .14s; font-weight: 500;
  }
  .f-fb:hover { background: var(--bth); color: var(--tp); }
  .f-fb.on { background: var(--accg); border-color: var(--acc); color: var(--acc); font-weight: 600; }

  /* ITEM LIST */
  .f-ilw { flex: 1; overflow-y: auto; padding: 14px 20px; }
  .f-icb { font-size: 11px; color: var(--tm); margin-bottom: 10px; }
  .f-ig { display: flex; flex-direction: column; gap: 5px; }

  .f-ic {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 9px 13px; border-radius: 7px;
    background: var(--bgc); border: 1px solid var(--br);
    transition: all .14s;
  }
  .f-ic:hover { background: var(--bgch); border-color: var(--bra); box-shadow: 0 0 10px var(--accg); }
  .f-ic.sel { background: var(--bgh); border-color: var(--accd); box-shadow: 0 0 9px var(--accg); }
  .f-ic.sel:hover { box-shadow: 0 0 15px var(--accgh); }

  .f-ii { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; }
  .f-in { font-size: 13px; font-weight: 500; color: var(--tp); }
  .f-ic.sel .f-in { color: var(--acc); }
  .f-tags { display: flex; gap: 4px; flex-wrap: wrap; }
  .f-tg {
    font-size: 10px; padding: 2px 6px; border-radius: 4px;
    border: 1px solid var(--br); color: var(--tm); background: var(--bg2); white-space: nowrap;
  }

  .f-qc { display: flex; align-items: center; gap: 5px; }
  .f-qb {
    width: 25px; height: 25px; border-radius: 5px; border: 1px solid var(--br);
    background: var(--btb); color: var(--ts); font-size: 15px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all .11s; font-family: monospace; line-height: 1; user-select: none;
  }
  .f-qb:hover:not(:disabled) { background: var(--bth); color: var(--tp); border-color: var(--accd); }
  .f-qb:disabled { opacity: .35; cursor: default; }
  .f-qd { min-width: 26px; text-align: center; font-size: 13px; font-weight: 600; color: var(--ts); font-variant-numeric: tabular-nums; }
  .f-ic.sel .f-qd { color: var(--acc); }

  .f-es { text-align: center; padding: 56px 20px; color: var(--tm); font-size: 13px; }

  /* SIDEBAR */
  .f-sb {
    width: 50%; flex-shrink: 0;
    background: var(--bg2); border-left: 1px solid var(--br);
    display: flex; flex-direction: column;
    overflow-y: auto;
  }
  .f-sbh {
    padding: 13px 15px 10px; border-bottom: 1px solid var(--br);
    font-family: 'Cinzel', serif; font-size: 11px; font-weight: 600;
    color: var(--acc); letter-spacing: .08em; text-transform: uppercase;
    display: flex; align-items: center; gap: 6px;
    position: sticky; top: 0; background: var(--bg2); z-index: 1;
  }
  .f-sbs { padding: 13px 15px; border-bottom: 1px solid var(--br); display: flex; flex-direction: column; gap: 7px; }
  .f-ssr { display: flex; align-items: center; justify-content: space-between; }
  .f-ssl { font-size: 11px; color: var(--tm); }
  .f-ssv { font-size: 22px; font-weight: 700; color: var(--acc); font-variant-numeric: tabular-nums; font-family: 'Cinzel', serif; }
  .f-sss { font-size: 13px; color: var(--ts); font-variant-numeric: tabular-nums; }
  .f-sbl { flex: 1; padding: 10px 15px 16px; display: flex; flex-direction: column; gap: 4px; }
  .f-sblt { font-size: 10px; color: var(--tm); letter-spacing: .06em; text-transform: uppercase; margin-bottom: 7px; }
  .f-sbi {
    display: flex; justify-content: space-between; align-items: center;
    padding: 5px 8px; border-radius: 5px; border-left: 2px solid var(--accd);
    background: var(--bgc); gap: 8px;
  }
  .f-sbin { font-size: 12px; color: var(--tp); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .f-sbiq {
    font-size: 11px; font-weight: 600; color: var(--acc);
    background: var(--accg); border: 1px solid var(--accd);
    padding: 1px 6px; border-radius: 4px; white-space: nowrap; font-variant-numeric: tabular-nums;
  }
  .f-sbe { font-size: 12px; color: var(--tm); text-align: center; padding: 22px 0; line-height: 1.8; }

  @media (max-width: 768px) { .f-sb { display: none; } .f-title { font-size: 14px; } }
`;

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [isDark, setIsDark] = useState(() => ls.get("ff14_theme", "dark") === "dark");
  const [quantities, setQuantities] = useState(() => ls.getJSON("ff14_qty", {}));
  const [activeCat, setActiveCat] = useState("全部");
  const [search, setSearch] = useState("");

  useEffect(() => { ls.set("ff14_theme", isDark ? "dark" : "light"); }, [isDark]);
  useEffect(() => { ls.setJSON("ff14_qty", quantities); }, [quantities]);

  const adjustQty = useCallback((id, delta) => {
    setQuantities((prev) => {
      const next = Math.max(0, (prev[id] || 0) + delta);
      if (next === 0) { const { [id]: _, ...rest } = prev; return rest; }
      return { ...prev, [id]: next };
    });
  }, []);

  const clearAll = () => { setQuantities({}); };

  const filteredItems = useMemo(() =>
    ITEMS_DATA.filter((it) => {
      if (activeCat !== "全部" && it.category !== activeCat) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const [q1, q2] = toVariants(q);
        const matchStr = (s) => s && (s.toLowerCase().includes(q1) || s.toLowerCase().includes(q2));
        return matchStr(it.name_zh) || matchStr(it.name_en) || matchStr(it.name_ja) || matchStr(it.category) || matchStr(it.subcategory);
      }
      return true;
    }), [activeCat, search]);

  const { totalQty, selectedCount, selectedItems } = useMemo(() => {
    const si = ITEMS_DATA
      .filter((it) => (quantities[it.id] || 0) > 0)
      .sort((a, b) => (quantities[b.id] || 0) - (quantities[a.id] || 0));
    return {
      selectedItems: si,
      selectedCount: si.length,
      totalQty: si.reduce((s, it) => s + (quantities[it.id] || 0), 0),
    };
  }, [quantities]);

  return (
    <>
      <style>{STYLES}</style>
      <div className={`ff14-app${isDark ? "" : " lm"}`}>
        {/* HEADER */}
        <header className="f-hd">
          <div className="f-hd-l">
            <span className="f-title">✦ FF14 家具規劃工具</span>
            <span className="f-sub">FINAL FANTASY XIV — Housing Planner</span>
          </div>
          <div className="f-hd-r">
            <button className="f-btn f-btn-del" onClick={clearAll}>
              <Trash2 size={12} />清空數量
            </button>
            <button className="f-btn f-btn-acc" onClick={() => exportCSV(quantities)}>
              <Download size={12} />匯出 CSV
            </button>
            <button className="f-btn f-btn-ic" onClick={() => setIsDark(d => !d)} title="切換主題">
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        </header>

        <div className="f-main">
          {/* LEFT PANEL */}
          <div className="f-lp">
            {/* FILTERS */}
            <div className="f-fa">
              <div className="f-sr">
                <Search className="f-si" size={14} />
                <input className="f-sinp" placeholder="搜尋家具名稱、分類…"
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="f-fr">
                <span className="f-fl"><ListFilter size={11} />分類</span>
                {CATEGORIES.map(cat => (
                  <button key={cat} className={`f-fb${activeCat === cat ? " on" : ""}`}
                    onClick={() => setActiveCat(cat)}>{cat}</button>
                ))}
              </div>

            </div>

            {/* ITEM LIST */}
            <div className="f-ilw">
              <div className="f-icb">顯示 {filteredItems.length} 件家具</div>
              <div className="f-ig">
                {filteredItems.length === 0 ? (
                  <div className="f-es">
                    <Package size={30} style={{ marginBottom: 10, opacity: .3, display: "block", margin: "0 auto 10px" }} />
                    找不到符合條件的家具
                  </div>
                ) : filteredItems.map(it => {
                  const qty = quantities[it.id] || 0;
                  return (
                    <div key={it.id} className={`f-ic${qty > 0 ? " sel" : ""}`}>
                      <div className="f-ii">
                        <span className="f-in">{displayName(it)}</span>
                        <div className="f-tags">
                          <span className="f-tg">{it.category}</span>
                          <span className="f-tg">{it.subcategory}</span>
                        </div>
                      </div>
                      <div className="f-qc">
                        <button className="f-qb" onClick={() => adjustQty(it.id, -1)} disabled={qty === 0}>−</button>
                        <span className="f-qd">{qty}</span>
                        <button className="f-qb" onClick={() => adjustQty(it.id, 1)}>＋</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* SIDEBAR */}
          <aside className="f-sb">
            <div className="f-sbh"><Package size={12} />選取清單</div>
            <div className="f-sbs">
              <div className="f-ssr">
                <span className="f-ssl">選取總數</span>
                <span className="f-ssv">{totalQty}</span>
              </div>
              <div className="f-ssr">
                <span className="f-ssl">已選項目</span>
                <span className="f-sss">{selectedCount} 種家具</span>
              </div>
            </div>
            <div className="f-sbl">
              <div className="f-sblt">明細</div>
              {selectedItems.length === 0 ? (
                <div className="f-sbe">尚未選取任何家具<br />點擊 + 開始規劃</div>
              ) : selectedItems.map(it => (
                <div key={it.id} className="f-sbi">
                  <span className="f-sbin" title={displayName(it)}>{displayName(it)}</span>
                  <span className="f-sbiq">×{quantities[it.id]}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
