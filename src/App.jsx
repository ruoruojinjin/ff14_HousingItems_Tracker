import { useState, useMemo, useEffect, useCallback } from "react";
import ITEMS_DATA from "./items.json";
import { Search, Sun, Moon, Trash2, Download, Package, ListFilter } from "lucide-react";

// ─── localStorage helpers ─────────────────────────────────────────────────────
const ls = {
  get:     (k, fb = null) => { try { const v = window.localStorage.getItem(k); return v !== null ? v : fb; } catch { return fb; } },
  set:     (k, v)         => { try { window.localStorage.setItem(k, v); } catch {} },
  getJSON: (k, fb)        => { try { return JSON.parse(window.localStorage.getItem(k) || "null") ?? fb; } catch { return fb; } },
  setJSON: (k, v)         => { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ─── 分類常數 ──────────────────────────────────────────────────────────────────
const CATEGORIES = ["全部", "室內", "庭具", "壁掛", "桌上", "地板"];

// ─── 繁簡互轉 ─────────────────────────────────────────────────────────────────
// 繁簡互轉對照表
const T2S = {
  "層":"层","結":"结","動":"动","間":"间","覽":"览","書":"书","蠟":"蜡","燈":"灯",
  "鐘":"钟","樹":"树","櫃":"柜","燭":"烛","鏡":"镜","畫":"画","長":"长","絲":"丝",
  "織":"织","經":"经","紗":"纱","簾":"帘","絨":"绒","鐵":"铁","銅":"铜","銀":"银",
  "鈴":"铃","鍋":"锅","園":"园","楓":"枫","淺":"浅","儲":"储","華":"华","禮":"礼",
  "廳":"厅","裝":"装","飾":"饰","紋":"纹","蘭":"兰","蓮":"莲","樂":"乐","箏":"筝",
  "傢":"家","俱":"具","龍":"龙","鳳":"凤","魚":"鱼","鳥":"鸟","馬":"马","雞":"鸡",
  "豬":"猪","鴨":"鸭","鶴":"鹤","藍":"蓝","綠":"绿","紅":"红","黃":"黄","貓":"猫",
  "惡":"恶","靈":"灵","麗":"丽","風":"风","東":"东","來":"来","開":"开","關":"关",
  "歡":"欢","節":"节","濱":"滨","橢":"椭","圓":"圆","鐮":"镰","劍":"剑","盾":"盾",
  "鷹":"鹰","獅":"狮","獸":"兽","點":"点","燃":"燃","爐":"炉","鍋":"锅","碗":"碗",
  "箱":"箱","籃":"篮","籠":"笼","氣":"气","電":"电","話":"话","視":"视","窗":"窗",
  "當":"当","時":"时","際":"际","實":"实","術":"术","產":"产","業":"业","義":"义",
  "輕":"轻","歷":"历","聖":"圣","靜":"静","響":"响","號":"号","類":"类","隱":"隐",
  "際":"际","總":"总","質":"质","線":"线","陽":"阳","陰":"阴","讓":"让","過":"过",
  "還":"还","說":"说","個":"个","對":"对","這":"这","們":"们","會":"会","與":"与",
  "從":"从","為":"为","後":"后","邊":"边","裡":"里","兒":"儿","幾":"几","無":"无",
  "鬥":"斗","韓":"韩","漢":"汉","語":"语","讀":"读","買":"买","賣":"卖","導":"导",
  "員":"员","場":"场","樓":"楼","棟":"栋","廊":"廊","閣":"阁","台":"台","亭":"亭",
};
const S2T = Object.fromEntries(Object.entries(T2S).map(([t,s])=>[s,t]));
// 把任意繁簡字串統一轉成簡體，作為比對基準
function toSimplified(s) {
  return s.split("").map(c => T2S[c] || c).join("");
}
// 相容舊呼叫
function normalizeZH(s) { return [s, toSimplified(s)]; }
function toVariants(s) { return normalizeZH(s); }

// ─── 名稱 fallback ────────────────────────────────────────────────────────────
function displayName(it) { return it.name_zh || it.name_en || it.name_ja || "(unnamed)"; }

// ─── 分享 ─────────────────────────────────────────────────────────────────────
const SITE_URL   = "https://ruoruojinjin.github.io/ff14_HousingItems_Tracker/";
const SITE_TITLE = "FF14 傢俱規劃工具";
function shareToX()       { window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(SITE_TITLE + " — FF14 房屋裝潢好幫手！\n" + SITE_URL)}`, "_blank"); }
function shareToDiscord() { try { navigator.clipboard.writeText(SITE_TITLE + "\n" + SITE_URL); alert("已複製到剪貼簿，貼到 Discord 分享吧！"); } catch { alert(SITE_URL); } }
function copyLink()       { try { navigator.clipboard.writeText(SITE_URL); alert("連結已複製！"); } catch { alert(SITE_URL); } }

// ─── CSV 匯出 ─────────────────────────────────────────────────────────────────
function exportCSV(quantities) {
  const sel = ITEMS_DATA.filter(it => (quantities[it.id] || 0) > 0);
  if (!sel.length) { alert("尚未選取任何傢俱"); return; }
  const total = sel.reduce((s, it) => s + quantities[it.id], 0);
  const rows  = [
    "\uFEFF名稱,分類,數量,總數",
    ...sel.map(it => `${displayName(it)},${it.category},${quantities[it.id]},`),
    `,,共計,${total}`,
  ].join("\n");
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([rows], { type: "text/csv;charset=utf-8;" })),
    download: "ff14_furniture.csv",
  });
  a.click(); URL.revokeObjectURL(a.href);
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Noto+Sans+TC:wght@300;400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .app {
    --bg:#0d1117; --bg2:#161b22; --bgc:#1c2128; --bgch:#22272e; --bgh:#162016;
    --br:#30363d; --bra:#c9a84c; --tp:#e6edf3; --ts:#8b949e; --tm:#6e7681;
    --acc:#c9a84c; --accd:#9a7830; --accg:rgba(201,168,76,.13); --accgh:rgba(201,168,76,.24);
    --btb:#21262d; --bth:#2d333b; --stb:#30363d;
    font-family:'Noto Sans TC',sans-serif; background:var(--bg); color:var(--tp);
    min-height:100vh; display:flex; flex-direction:column; transition:background .25s,color .25s;
  }
  .app.lm {
    --bg:#f0ece3; --bg2:#e8e2d8; --bgc:#faf8f5; --bgch:#ede8e0; --bgh:#eef7ee;
    --br:#c8bfad; --bra:#9a7230; --tp:#1a1a1a; --ts:#5a4f3e; --tm:#8a7a65;
    --acc:#9a7230; --accd:#c4943a; --accg:rgba(154,114,48,.1); --accgh:rgba(154,114,48,.22);
    --btb:#e0d8cc; --bth:#cfc5b5; --stb:#c0b8a8;
  }
  .app ::-webkit-scrollbar{width:5px} .app ::-webkit-scrollbar-track{background:transparent} .app ::-webkit-scrollbar-thumb{background:var(--stb);border-radius:3px}

  /* ── PROFILE BANNER ── */
  .p-banner {
    background:var(--bg2); border-bottom:1px solid var(--br);
    padding:16px 28px; display:flex; align-items:center;
    justify-content:space-between; gap:12px; flex-wrap:wrap;
  }
  .p-left  { display:flex; align-items:center; gap:12px; }
  .p-avatar {
    width:50px; height:50px; border-radius:50%; flex-shrink:0;
    background:var(--accg); border:2px solid var(--accd);
    display:flex; align-items:center; justify-content:center;
    font-family:'Cinzel',serif; font-size:18px; font-weight:600; color:var(--acc);
  }
  .p-name   { font-size:16px; font-weight:600; color:var(--tp); }
  .p-server { font-size:12px; color:var(--tm); margin-top:2px; }
  .p-right  { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }

  /* ── BUTTONS ── */
  .btn {
    display:inline-flex; align-items:center; gap:5px;
    padding:6px 12px; border-radius:6px; border:1px solid var(--br);
    background:var(--btb); color:var(--ts);
    font-size:12px; font-family:inherit; cursor:pointer;
    transition:all .14s; white-space:nowrap; font-weight:500; text-decoration:none;
  }
  .btn:hover { background:var(--bth); color:var(--tp); border-color:var(--bra); }
  .btn-acc  { border-color:var(--accd); color:var(--acc); background:var(--accg); }
  .btn-acc:hover  { background:var(--accgh); border-color:var(--acc); }
  .btn-del:hover  { border-color:#f85149; color:#f85149; background:rgba(248,81,73,.09); }
  .btn-dc   { border-color:rgba(88,101,242,.5); color:#8891f5; background:rgba(88,101,242,.08); }
  .btn-dc:hover { background:rgba(88,101,242,.18); color:#aab2ff; }
  .btn-ic   { padding:6px 9px; }

  /* ── HEADER ── */
  .hd {
    background:var(--bg2); border-bottom:1px solid var(--br);
    padding:12px 22px; display:flex; align-items:center;
    justify-content:space-between; gap:12px;
    position:sticky; top:0; z-index:100; flex-wrap:wrap;
  }
  .hd-l { display:flex; flex-direction:column; gap:2px; }
  .hd-title { font-family:'Cinzel',serif; font-size:17px; font-weight:600; color:var(--acc); letter-spacing:.09em; }
  .hd-sub   { font-size:10px; color:var(--tm); letter-spacing:.05em; }
  .hd-r { display:flex; gap:7px; align-items:center; flex-wrap:wrap; }

  /* ── MAIN LAYOUT ── */
  .main { display:flex; flex:1; min-height:0; }
  .lp   { flex:1; min-width:0; display:flex; flex-direction:column; }

  /* ── FILTERS ── */
  .fa { background:var(--bg2); border-bottom:1px solid var(--br); padding:12px 20px; display:flex; flex-direction:column; gap:8px; }
  .sr { position:relative; }
  .si { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:var(--tm); pointer-events:none; }
  .sinp {
    width:100%; padding:8px 10px 8px 32px;
    background:var(--bgc); border:1px solid var(--br);
    border-radius:6px; color:var(--tp); font-size:13px;
    font-family:inherit; outline:none; transition:border-color .14s;
  }
  .sinp:focus { border-color:var(--accd); }
  .sinp::placeholder { color:var(--tm); }
  .fr { display:flex; gap:5px; flex-wrap:wrap; align-items:center; }
  .fl { font-size:10px; color:var(--tm); margin-right:3px; white-space:nowrap; display:flex; align-items:center; gap:3px; }
  .fb {
    padding:4px 11px; border-radius:5px; border:1px solid var(--br);
    background:transparent; color:var(--ts); font-size:12px;
    font-family:inherit; cursor:pointer; transition:all .14s; font-weight:500;
  }
  .fb:hover { background:var(--bth); color:var(--tp); }
  .fb.on { background:var(--accg); border-color:var(--acc); color:var(--acc); font-weight:600; }

  /* ── ITEM LIST ── */
  .ilw { flex:1; overflow-y:auto; padding:14px 20px; }
  .icb { font-size:11px; color:var(--tm); margin-bottom:10px; }
  .ig  { display:flex; flex-direction:column; gap:5px; }
  .ic  {
    display:flex; align-items:center; justify-content:space-between; gap:12px;
    padding:9px 13px; border-radius:7px; background:var(--bgc); border:1px solid var(--br); transition:all .14s;
  }
  .ic:hover { background:var(--bgch); border-color:var(--bra); box-shadow:0 0 10px var(--accg); }
  .ic.sel   { background:var(--bgh); border-color:var(--accd); box-shadow:0 0 9px var(--accg); }
  .ic.sel:hover { box-shadow:0 0 15px var(--accgh); }
  .ii  { flex:1; min-width:0; display:flex; align-items:baseline; gap:9px; flex-wrap:wrap; }
  .in  { font-size:13px; font-weight:500; color:var(--tp); }
  .ic.sel .in { color:var(--acc); }
  .tgs { display:flex; gap:4px; flex-wrap:wrap; }
  .tg  { font-size:10px; padding:2px 6px; border-radius:4px; border:1px solid var(--br); color:var(--tm); background:var(--bg2); white-space:nowrap; }
  .qc  { display:flex; align-items:center; gap:5px; }
  .qb  {
    width:25px; height:25px; border-radius:5px; border:1px solid var(--br);
    background:var(--btb); color:var(--ts); font-size:15px; cursor:pointer;
    display:flex; align-items:center; justify-content:center;
    transition:all .11s; font-family:monospace; line-height:1; user-select:none;
  }
  .qb:hover:not(:disabled) { background:var(--bth); color:var(--tp); border-color:var(--accd); }
  .qb:disabled { opacity:.35; cursor:default; }
  .qd { min-width:26px; text-align:center; font-size:13px; font-weight:600; color:var(--ts); font-variant-numeric:tabular-nums; }
  .ic.sel .qd { color:var(--acc); }
  .es { text-align:center; padding:56px 20px; color:var(--tm); font-size:13px; }

  /* ── SIDEBAR ── */
  .sb {
    width:50%; flex-shrink:0; background:var(--bg2); border-left:1px solid var(--br);
    display:flex; flex-direction:column; overflow-y:auto;
  }
  .sbh {
    padding:12px 15px 10px; border-bottom:1px solid var(--br);
    font-family:'Cinzel',serif; font-size:11px; font-weight:600;
    color:var(--acc); letter-spacing:.08em; text-transform:uppercase;
    display:flex; align-items:center; gap:6px;
    position:sticky; top:0; background:var(--bg2); z-index:1;
  }
  .sbs { padding:12px 15px; border-bottom:1px solid var(--br); display:flex; flex-direction:column; gap:7px; }
  .ssr { display:flex; align-items:center; justify-content:space-between; }
  .ssl { font-size:13px; color:var(--tm); }
  .ssv { font-size:28px; font-weight:700; color:var(--acc); font-variant-numeric:tabular-nums; font-family:'Cinzel',serif; }
  .sss { font-size:15px; color:var(--ts); font-variant-numeric:tabular-nums; }
  .sbl { flex:1; padding:10px 15px 16px; display:flex; flex-direction:column; gap:4px; }
  .sblt { font-size:12px; color:var(--tm); letter-spacing:.06em; text-transform:uppercase; margin-bottom:7px; }
  .sbi { display:flex; align-items:center; padding:6px 10px; border-radius:5px; border-left:2px solid var(--accd); background:var(--bgc); gap:6px; }
  .sbin { font-size:15px; color:var(--tp); flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .sbi-ctrl { display:flex; align-items:center; gap:5px; margin-left:auto; flex-shrink:0; }
  .sbi-btn {
    width:26px; height:26px; border-radius:5px; border:1px solid var(--br);
    background:var(--btb); color:var(--ts); font-size:16px; cursor:pointer;
    display:flex; align-items:center; justify-content:center;
    transition:all .11s; font-family:monospace; line-height:1; user-select:none; padding:0;
  }
  .sbi-btn:hover:not(:disabled) { background:var(--bth); color:var(--tp); border-color:var(--accd); }
  .sbi-btn:disabled { opacity:.35; cursor:default; }
  .sbiq { min-width:28px; text-align:center; font-size:14px; font-weight:600; color:var(--acc); font-variant-numeric:tabular-nums; }
  .sbe { font-size:14px; color:var(--tm); text-align:center; padding:22px 0; line-height:1.8; }

  /* ── FOOTER ── */
  .ft {
    background:var(--bg2); border-top:1px solid var(--br);
    padding:16px 24px; display:flex; flex-direction:column; gap:12px;
  }
  .ft-top { display:flex; gap:32px; flex-wrap:wrap; }
  .ft-block { display:flex; flex-direction:column; gap:4px; }
  .ft-label { font-size:10px; color:var(--acc); font-weight:600; letter-spacing:.06em; text-transform:uppercase; margin-bottom:3px; }
  .ft-text { font-size:11px; color:var(--ts); line-height:1.7; }
  .ft-text a { color:var(--accd); text-decoration:none; }
  .ft-text a:hover { color:var(--acc); text-decoration:underline; }
  .ft-bottom { font-size:10px; color:var(--tm); border-top:1px solid var(--br); padding-top:10px; display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
  .ft-hi { color:#E7B800; font-weight:600; }

  /* ── PAGINATION ── */
  .pg { display:flex; align-items:center; justify-content:center; gap:8px; padding:14px 20px 4px; }
  .pg-btn {
    padding:5px 14px; border-radius:5px; border:1px solid var(--br);
    background:var(--btb); color:var(--ts); font-size:12px;
    font-family:inherit; cursor:pointer; transition:all .14s;
  }
  .pg-btn:hover:not(:disabled) { background:var(--bth); color:var(--tp); border-color:var(--bra); }
  .pg-btn:disabled { opacity:.35; cursor:default; }
  .pg-info { font-size:12px; color:var(--tm); }

  @media(max-width:768px){ .sb{display:none} .hd-title{font-size:14px} .p-banner{padding:10px 16px} }
`;

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [isDark,     setIsDark]     = useState(() => ls.get("ff14_theme", "dark") === "dark");
  const [quantities, setQuantities] = useState(() => ls.getJSON("ff14_qty", {}));
  const [activeCat,  setActiveCat]  = useState("全部");
  const [search,     setSearch]     = useState("");

  useEffect(() => { ls.set("ff14_theme", isDark ? "dark" : "light"); }, [isDark]);
  useEffect(() => { ls.setJSON("ff14_qty", quantities); }, [quantities]);

  const adjustQty = useCallback((id, delta) => {
    setQuantities(prev => {
      const next = Math.max(0, (prev[id] || 0) + delta);
      if (next === 0) { const { [id]: _, ...rest } = prev; return rest; }
      return { ...prev, [id]: next };
    });
  }, []);

  const filteredItems = useMemo(() =>
    ITEMS_DATA.filter(it => {
      if (activeCat !== "全部" && it.category !== activeCat) return false;
      if (search.trim()) {
        const q = toSimplified(search.trim().toLowerCase());
        // 把物品名稱也轉成簡體再比對，繁簡都能搜到
        const m = s => s && toSimplified(s.toLowerCase()).includes(q);
        return m(it.name_zh) || m(it.name_en) || m(it.name_ja) || m(it.category) || m(it.subcategory);
      }
      return true;
    }), [activeCat, search]);

  // 分頁
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  // 重設分頁
  useEffect(() => { setPage(1); }, [activeCat, search]);
  const totalPages   = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const pagedItems   = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const { totalQty, selectedCount, selectedItems } = useMemo(() => {
    const si = ITEMS_DATA
      .filter(it => (quantities[it.id] || 0) > 0)
      .sort((a, b) => (quantities[b.id] || 0) - (quantities[a.id] || 0));
    return { selectedItems: si, selectedCount: si.length, totalQty: si.reduce((s, it) => s + (quantities[it.id] || 0), 0) };
  }, [quantities]);

  return (
    <>
      <style>{STYLES}</style>
      <div className={`app${isDark ? "" : " lm"}`}>

        {/* ── 作者自介 ── */}
        <div className="p-banner">
          <div className="p-left">
            <div className="p-avatar">若真</div>
            <div>
              <div className="p-name">若真</div>
              <div className="p-server">奧汀</div>
            </div>
          </div>
          <div className="p-right">
            <a href="https://discord.com/invite/qnbpYnYV65" target="_blank" rel="noreferrer" className="btn btn-dc">💬 Discord</a>
            <a href="donate.html" target="_blank" rel="noreferrer" className="btn btn-acc">☕ 請我喝咖啡</a>
            <button className="btn" onClick={shareToX}>𝕏 分享</button>
            <button className="btn" onClick={shareToDiscord}>分享到 Discord</button>
            <button className="btn" onClick={copyLink}>🔗 複製連結</button>
            <a href="https://discord.com/invite/qnbpYnYV65" target="_blank" rel="noreferrer" className="btn">🐛 回報錯誤</a>
          </div>
        </div>

        {/* ── 工具標題列 ── */}
        <header className="hd">
          <div className="hd-l">
            <span className="hd-title">✦ FF14 傢俱規劃工具</span>
            <span className="hd-sub">FINAL FANTASY XIV — Housing Planner</span>
          </div>
          <div className="hd-r">
            <button className="btn btn-del" onClick={() => setQuantities({})}>
              <Trash2 size={12} />清空數量
            </button>
            <button className="btn btn-acc" onClick={() => exportCSV(quantities)}>
              <Download size={12} />匯出 CSV
            </button>
            <button className="btn btn-ic" onClick={() => setIsDark(d => !d)}>
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        </header>

        {/* ── 主體 ── */}
        <div className="main">

          {/* 左側：篩選 + 清單 */}
          <div className="lp">
            <div className="fa">
              <div className="sr">
                <Search className="si" size={14} />
                <input className="sinp" placeholder="搜尋傢俱名稱、分類…"
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="fr">
                <span className="fl"><ListFilter size={11} />分類</span>
                {CATEGORIES.map(cat => (
                  <button key={cat} className={`fb${activeCat === cat ? " on" : ""}`}
                    onClick={() => setActiveCat(cat)}>{cat}</button>
                ))}
              </div>
            </div>

            <div className="ilw">
              <div className="icb">顯示 {filteredItems.length} 件傢俱</div>
              <div className="ig">
                {filteredItems.length === 0 ? (
                  <div className="es">
                    <Package size={30} style={{ display:"block", margin:"0 auto 10px", opacity:.3 }} />
                    找不到符合條件的傢俱
                  </div>
                ) : pagedItems.map(it => {
                  const qty = quantities[it.id] || 0;
                  return (
                    <div key={it.id} className={`ic${qty > 0 ? " sel" : ""}`}>
                      <div className="ii">
                        <span className="in">{displayName(it)}</span>
                        <div className="tgs">
                          <span className="tg">{it.category}</span>
                          <span className="tg">{it.subcategory}</span>
                        </div>
                      </div>
                      <div className="qc">
                        <button className="qb" onClick={() => adjustQty(it.id, -1)} disabled={qty === 0}>−</button>
                        <span className="qd">{qty}</span>
                        <button className="qb" onClick={() => adjustQty(it.id, 1)}>＋</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* 分頁 */}
              {totalPages > 1 && (
                <div className="pg">
                  <button className="pg-btn" onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}>← 上一頁</button>
                  <span className="pg-info">第 {page} / {totalPages} 頁（共 {filteredItems.length} 件）</span>
                  <button className="pg-btn" onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}>下一頁 →</button>
                </div>
              )}
            </div>
          </div>

          {/* 右側：統計側欄 */}
          <aside className="sb">
            <div className="sbh"><Package size={12} />選取清單</div>
            <div className="sbs">
              <div className="ssr">
                <span className="ssl">選取總數</span>
                <span className="ssv">{totalQty}</span>
              </div>
              <div className="ssr">
                <span className="ssl">已選項目</span>
                <span className="sss">{selectedCount} 種傢俱</span>
              </div>
            </div>
            <div className="sbl">
              <div className="sblt">明細</div>
              {selectedItems.length === 0 ? (
                <div className="sbe">尚未選取任何傢俱<br />點擊 + 開始規劃</div>
              ) : selectedItems.map(it => (
                <div key={it.id} className="sbi">
                  <span className="sbin" title={displayName(it)}>{displayName(it)}</span>
                  <div className="sbi-ctrl">
                    <button className="sbi-btn" onClick={() => adjustQty(it.id, -1)} disabled={(quantities[it.id]||0)===0}>−</button>
                    <span className="sbiq">{quantities[it.id]}</span>
                    <button className="sbi-btn" onClick={() => adjustQty(it.id, 1)}>＋</button>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>

        {/* ── Footer 致謝 ── */}
        <footer className="ft">
          <div className="ft-top">
            <div className="ft-block">
              <div className="ft-label">資料來源</div>
              <div className="ft-text">
                <a href="https://v2.xivapi.com" target="_blank" rel="noreferrer">XIVAPI v2</a> — 傢俱英日名稱與圖示<br />
                <a href="https://beherw.github.io/FFXIV_Market/" target="_blank" rel="noreferrer">貝爾的市場小屋（FFXIV_Market）</a> — 繁中名稱對照
              </div>
            </div>
            <div className="ft-block">
              <div className="ft-label">致謝</div>
              <div className="ft-text">
                感謝 beherw（貝肝煎熬．迦樓羅）維護繁中 FF14 資料庫<br />
                感謝所有提供回饋的玩家們 ♡
              </div>
            </div>
            <div className="ft-block">
              <div className="ft-label">聯絡 / 回報</div>
              <div className="ft-text">
                <a href="https://discord.com/invite/qnbpYnYV65" target="_blank" rel="noreferrer">Discord 伺服器</a>
              </div>
            </div>
          </div>
          <div className="ft-bottom">
            <span>版本 <span className="ft-hi">1.0</span></span>
            <span>•</span>
            <span>作者：<span className="ft-hi">若真</span></span>
            <span>•</span>
            <span>非官方工具，與 SQUARE ENIX 無關</span>
          </div>
        </footer>

      </div>
    </>
  );
}
