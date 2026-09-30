const CSV_FILE = 'cardlist.csv';
const LS = {
  favorites: 'aikatsuBinder:favorites:v1',
  selected: 'aikatsuBinder:selected:v1',
  outfits: 'aikatsuBinder:outfits:v1',
  filters: 'aikatsuBinder:filters:v1',
  search: 'aikatsuBinder:search:v1',
  initialView: 'aikatsuBinder:initialView:v2'
};

const SLOT_ORDER = ['tops','bottoms','shoes','accessory'];
const SLOT_LABEL = {tops:'トップス',bottoms:'ボトムス',shoes:'シューズ',accessory:'アクセサリー'};
const CATEGORY_SLOT = {'トップス':'tops','ボトムス':'bottoms','シューズ':'shoes','アクセサリー':'accessory','トップス&ボトムス':'tops','トップス＆ボトムス':'tops'};
function isCombinedCategory(category){return category==='トップス&ボトムス'||category==='トップス＆ボトムス';}
const TYPE_CLASS = {'キュート':'cute','クール':'cool','セクシー':'sexy','ポップ':'pop'};

function brandTypeMap(){
  const counts = {};
  for(const card of state.cards){
    const brand=(card.brand||'').trim(), type=(card.type||'').trim();
    if(!brand || !TYPE_CLASS[type]) continue;
    counts[brand] ||= {};
    counts[brand][type] = (counts[brand][type]||0) + 1;
  }
  const result = {};
  for(const [brand, byType] of Object.entries(counts)){
    result[brand] = Object.entries(byType).sort((a,b)=>b[1]-a[1])[0]?.[0] || '';
  }
  return result;
}

function filterOptionClass(key, value){
  if(key==='type') return TYPE_CLASS[value] ? `tone-${TYPE_CLASS[value]}` : '';
  if(key==='brand'){
    const type=brandTypeMap()[value];
    return TYPE_CLASS[type] ? `tone-${TYPE_CLASS[type]}` : '';
  }
  return '';
}
const state = {
  cards: [],
  favorites: new Set(loadJSON(LS.favorites, [])),
  selected: loadJSON(LS.selected, {}),
  outfits: loadJSON(LS.outfits, []),
  filters: loadJSON(LS.filters, {type:[],brand:[],category:[],rarity:[],series:[],volume:[],promo:[]}),
  draftFilters: null,
  search: localStorage.getItem(LS.search) || '',
  currentPage: 'binder',
  wakeLock: null,
  loadedAt: null
};

function loadJSON(key, fallback){ try { const v=JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } }
function saveJSON(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
function esc(s=''){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function csvParse(text){
  const rows=[]; let row=[], field='', q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i], n=text[i+1];
    if(q){ if(c==='"' && n==='"'){field+='"';i++;} else if(c==='"'){q=false;} else field+=c; }
    else { if(c==='"') q=true; else if(c===','){row.push(field);field='';} else if(c==='\n'){row.push(field);rows.push(row);row=[];field='';} else if(c!=='\r') field+=c; }
  }
  if(field.length||row.length){row.push(field);rows.push(row)}
  const headers=(rows.shift()||[]).map(h=>h.trim());
  return rows.filter(r=>r.some(x=>x.trim()!=='')).map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]||'').trim()])));
}
async function loadCards(){
  try{
    const res=await fetch(`${CSV_FILE}?v=${Date.now()}`,{cache:'no-store'}); if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const text=await res.text(); state.cards=csvParse(text.replace(/^\uFEFF/,'')); state.loadedAt=new Date();
    applyInitialView(); sanitizeLocalState(); renderAll(); toast(`${state.cards.length}枚のカードを読み込みました`);
  }catch(e){
    console.error(e); document.getElementById('cardGrid').innerHTML=''; document.getElementById('emptyCards').classList.remove('hidden'); document.getElementById('emptyCards').textContent='カードデータを読み込めませんでした。GitHub Pages上で開いているか確認してください。';
  }
}
function sanitizeLocalState(){
  const ids=new Set(state.cards.map(c=>c.card_no));
  state.favorites=new Set([...state.favorites].filter(x=>ids.has(x))); saveJSON(LS.favorites,[...state.favorites]);
  Object.keys(state.selected).forEach(k=>{ if(!state.selected[k]||!ids.has(state.selected[k].card_no)) delete state.selected[k]; }); saveJSON(LS.selected,state.selected);
}
function normalize(s){return (s||'').toLowerCase().normalize('NFKC')}
function applyInitialView(){
  if(localStorage.getItem(LS.initialView)) return;
  const series=[...new Set(state.cards.map(c=>c.series).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'ja',{numeric:true}));
  const preferred=series.find(v=>/2013/.test(v)) || series[0];
  if(preferred){
    state.filters={type:[],brand:[],category:[],rarity:[],series:[preferred],volume:[],promo:[]};
    saveJSON(LS.filters,state.filters);
  }
  localStorage.setItem(LS.initialView,'1');
}
function sortCards(cards){
  return [...cards].sort((a,b)=>{
    const sa=parseInt(a.series)||9999,sb=parseInt(b.series)||9999;if(sa!==sb)return sa-sb;
    const va=parseInt(a.volume)||999,vb=parseInt(b.volume)||999;if(va!==vb)return va-vb;
    return (a.card_no||'').localeCompare(b.card_no||'', 'ja', {numeric:true});
  });
}
function filteredCards(){
  const q=normalize(state.search);
  return sortCards(state.cards.filter(c=>{
    if(q && !normalize(`${c.card_no} ${c.card_name}`).includes(q)) return false;
    for(const key of ['type','brand','category','rarity','series','volume']){
      const vals=state.filters[key]||[]; if(vals.length && !vals.includes(c[key]||'')) return false;
    }
    const pv=state.filters.promo||[];
    if(pv.length){ const isPromo=['true','1','yes','promo','プロモ'].includes(normalize(c.promo)); const label=isPromo?'プロモ':'通常'; if(!pv.includes(label)) return false; }
    return true;
  }));
}
function selectedIds(){return new Set(Object.values(state.selected).filter(Boolean).map(c=>c.card_no))}
function cardImageHTML(card, cls='card-image'){
  return `<img class="${cls}" src="${esc(card.image_url)}" referrerpolicy="no-referrer" alt="${esc(card.card_name||card.card_no)}" loading="lazy" onerror="this.outerHTML='<div class=&quot;card-fallback&quot;>${esc(card.card_no)}<br>画像なし</div>'">`;
}
function renderCards(){
  const cards=filteredCards(), grid=document.getElementById('cardGrid'), selected=selectedIds();
  document.getElementById('resultCount').textContent=`${cards.length}枚`;
  document.getElementById('emptyCards').classList.toggle('hidden',cards.length>0);
  grid.innerHTML=cards.map(c=>`<article class="card-item" data-card="${esc(c.card_no)}">
    <div class="card-image-wrap ${selected.has(c.card_no)?'selected':''}" data-select="${esc(c.card_no)}">
      ${cardImageHTML(c)}
    </div>
    <div class="card-no">${esc(c.card_no)}</div>
  </article>`).join('');
  bindLongPress();
}
function bindLongPress(){
  document.querySelectorAll('[data-select]').forEach(el=>{
    let timer=null, long=false;
    const start=()=>{long=false;timer=setTimeout(()=>{long=true;showDetail(el.dataset.select)},550)};
    const cancel=()=>{clearTimeout(timer)};
    el.addEventListener('touchstart',start,{passive:true});el.addEventListener('touchend',cancel);el.addEventListener('touchmove',cancel);
    el.addEventListener('mousedown',start);el.addEventListener('mouseup',cancel);el.addEventListener('mouseleave',cancel);
    el.addEventListener('click',()=>{if(long){long=false;return;}toggleSelect(el.dataset.select)});
  });
}
function getCard(id){return state.cards.find(c=>c.card_no===id)}
function toggleSelect(id){
  const card=getCard(id); if(!card)return;
  const already=Object.entries(state.selected).find(([,c])=>c?.card_no===id);
  if(already){ delete state.selected[already[0]]; }
  else if(isCombinedCategory(card.category)){
    delete state.selected.tops; delete state.selected.bottoms; state.selected.tops={...card,combined:true};
  } else {
    const slot=CATEGORY_SLOT[card.category]; if(!slot)return;
    if(slot==='tops' || slot==='bottoms'){
      if(state.selected.tops?.combined){delete state.selected.tops;}
    }
    state.selected[slot]={...card,combined:false};
  }
  saveJSON(LS.selected,state.selected); renderAll();
}
function removeSlot(slot){delete state.selected[slot];saveJSON(LS.selected,state.selected);renderAll()}
function toggleFavorite(id){state.favorites.has(id)?state.favorites.delete(id):state.favorites.add(id);saveJSON(LS.favorites,[...state.favorites]);renderCards()}
function renderSelected(){
  const el=document.getElementById('selectedSlots'); let html='';
  for(const slot of SLOT_ORDER){
    const c=state.selected[slot]; const label=(slot==='tops'&&c?.combined)?'トップス&ボトムス':SLOT_LABEL[slot];
    if(c) html+=`<div class="selected-slot">${cardImageHTML(c,'slot-thumb')}<div class="slot-main"><div class="slot-kind">${label}</div><div class="slot-name">${esc(c.card_name)}</div><div class="slot-brand">${esc(c.brand||'ブランドなし')}</div></div><button class="remove-button" data-remove="${slot}">削除</button></div>`;
    else if(!(slot==='bottoms'&&state.selected.tops?.combined)) html+=`<div class="selected-slot empty">${label}：未選択</div>`;
  }
  el.innerHTML=html;
  const count=Object.values(state.selected).filter(Boolean).length;
  const btn=document.getElementById('saveOutfitButton');btn.disabled=count===0||state.outfits.length>=30;
  document.getElementById('outfitLimitText').textContent=`お気に入りコーデ ${state.outfits.length}/30件`;
}
function renderMini(){
  const cards=SLOT_ORDER.map(k=>state.selected[k]).filter(Boolean), bar=document.getElementById('selectedMiniBar');
  bar.classList.toggle('hidden',cards.length===0 || state.currentPage==='qr');
  document.getElementById('miniCount').textContent=`${cards.length}枚`;
  document.getElementById('miniCards').innerHTML=cards.map(c=>`<img src="${esc(c.image_url)}" alt="" referrerpolicy="no-referrer" onerror="this.className='mini-placeholder';this.removeAttribute('src')">`).join('');
}
function renderActiveFilters(){
  const el=document.getElementById('activeFilters'), chips=[];
  for(const [k,vals] of Object.entries(state.filters)) for(const v of vals||[]) chips.push(`<button class="chip" data-clearfilter="${k}|${esc(v)}">${esc(v)} ×</button>`);
  el.innerHTML=chips.join('');
}
function filterOptions(key){
  if(key==='promo') return ['通常','プロモ'];
  let pool=state.cards;

  // 弾は選択中のシリーズに合わせて候補を絞る
  if(key==='volume' && state.draftFilters?.series?.length){
    pool=pool.filter(c=>state.draftFilters.series.includes(c.series));
  }

  // ブランドは選択中のタイプに合わせて候補を絞る
  if(key==='brand' && state.draftFilters?.type?.length){
    pool=pool.filter(c=>state.draftFilters.type.includes(c.type));
  }

  return [...new Set(pool.map(c=>c[key]).filter(Boolean))]
    .sort((a,b)=>String(a).localeCompare(String(b),'ja',{numeric:true}));
}
function renderFilterSheet(){
  const groups=[
    ['series','シリーズ'],
    ['volume','弾'],
    ['type','タイプ'],
    ['category','カード種類'],
    ['rarity','レアリティ'],
    ['promo','カード区分'],
    ['brand','ブランド']
  ];
  const root=document.getElementById('filterGroups');
  root.innerHTML=groups.map(([key,label])=>`<div class="filter-group"><h3>${label}</h3><div class="option-grid">${filterOptions(key).map(v=>`<button class="option-button ${filterOptionClass(key,v)} ${(state.draftFilters[key]||[]).includes(v)?'on':''}" data-filteropt="${key}|${esc(v)}">${esc(v)}</button>`).join('')||'<span class="sub-note">データなし</span>'}</div></div>`).join('');
}
function openFilter(){state.draftFilters=JSON.parse(JSON.stringify(state.filters));renderFilterSheet();document.getElementById('filterSheet').classList.remove('hidden')}
function closeFilter(){document.getElementById('filterSheet').classList.add('hidden')}
function applyFilters(){state.filters=state.draftFilters;saveJSON(LS.filters,state.filters);closeFilter();renderCards();renderActiveFilters()}
function resetFilters(){state.draftFilters={type:[],brand:[],category:[],rarity:[],series:[],volume:[],promo:[]};renderFilterSheet()}
function setPage(page){
  state.currentPage=page;
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  const map={binder:'binderPage',selected:'selectedPage',qr:'qrPage',settings:'settingsPage',outfits:'outfitsPage'};
  document.getElementById(map[page]).classList.add('active');
  document.querySelectorAll('.nav-button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  const title={binder:'',selected:'選択中',qr:'',settings:'設定',outfits:'お気に入りコーデ'}[page];
  document.getElementById('pageTitle').textContent=title;
  document.querySelector('.topbar').classList.toggle('page-title-hidden',page==='binder'||page==='qr');
  if(page==='qr'){renderQR();requestWakeLock()} else releaseWakeLock();
  if(page==='outfits') renderOutfits(); if(page==='settings')renderSettings(); renderMini(); const scroller=document.querySelector('main'); if(scroller) scroller.scrollTop=0;
}
function renderQR(){
  const combined=state.selected.tops?.combined;
  document.querySelector('[data-qrslot="tops"] .qr-label').textContent=combined?'トップス&ボトムス':'トップス';
  for(const slot of SLOT_ORDER){
    const box=document.querySelector(`[data-qrslot="${slot}"] .qr-box`), no=document.querySelector(`[data-qrslot="${slot}"] .qr-cardno`); box.innerHTML='';no.textContent='';
    if(slot==='bottoms'&&combined){box.innerHTML='<div class="qr-empty">空欄</div>';continue}
    const c=state.selected[slot]; if(!c){box.innerHTML='<div class="qr-empty">未選択</div>';continue}
    no.textContent=c.card_no;
    if(!c.qr_url){box.innerHTML='<div class="qr-error">QRを表示できません</div>';continue}
    try{
      if(typeof QRCode==='undefined') throw new Error('QR library not loaded');
      new QRCode(box,{text:c.qr_url,width:140,height:140,correctLevel:QRCode.CorrectLevel.M});
    }catch(e){console.error(e);box.innerHTML='<div class="qr-error">QRを表示できません</div>'}
  }
}
async function requestWakeLock(){
  try{if('wakeLock' in navigator){state.wakeLock=await navigator.wakeLock.request('screen');state.wakeLock.addEventListener('release',()=>{state.wakeLock=null})}}catch(e){console.warn('Wake Lock unavailable',e)}
}
async function releaseWakeLock(){try{if(state.wakeLock)await state.wakeLock.release()}catch{}state.wakeLock=null}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state.currentPage==='qr')requestWakeLock()});
function saveOutfit(){
  if(state.outfits.length>=30){toast('お気に入りコーデは30件までです');return}
  const cards={};for(const s of SLOT_ORDER)if(state.selected[s])cards[s]={...state.selected[s]};
  if(!Object.keys(cards).length)return;
  const nums=state.outfits.map(o=>parseInt((o.name.match(/(\d+)$/)||[])[1])||0);const n=Math.max(0,...nums)+1;
  state.outfits.unshift({id:Date.now(),name:`お気に入りコーデ${n}`,cards,createdAt:new Date().toISOString()});saveJSON(LS.outfits,state.outfits);renderAll();toast('お気に入りコーデに登録しました')
}
function renderOutfits(){
  const el=document.getElementById('outfitList');document.getElementById('emptyOutfits').classList.toggle('hidden',state.outfits.length>0);
  el.innerHTML=state.outfits.map(o=>`<div class="outfit-card"><div class="outfit-top"><div class="outfit-name">${esc(o.name)}</div><div class="outfit-actions"><button class="use-outfit" data-useoutfit="${o.id}">使う</button><button class="delete-outfit" data-deleteoutfit="${o.id}">削除</button></div></div><div class="outfit-thumbs">${SLOT_ORDER.map(s=>o.cards[s]).filter(Boolean).map(c=>`<img src="${esc(c.image_url)}" alt="" referrerpolicy="no-referrer">`).join('')}</div></div>`).join('');
}
function useOutfit(id){const o=state.outfits.find(x=>x.id===id);if(!o)return;state.selected=JSON.parse(JSON.stringify(o.cards));saveJSON(LS.selected,state.selected);renderAll();setPage('selected');toast(`${o.name}をセットしました`)}
function deleteOutfit(id){const o=state.outfits.find(x=>x.id===id);if(!o)return;if(!confirm(`${o.name}を削除しますか？`))return;state.outfits=state.outfits.filter(x=>x.id!==id);saveJSON(LS.outfits,state.outfits);renderOutfits();renderSelected();}
function renderSettings(){document.getElementById('dataInfo').innerHTML=`<b>カードデータ</b><br>${state.cards.length}枚読み込み済み${state.loadedAt?`（${state.loadedAt.toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}）`:''}`}
function showDetail(id){const c=getCard(id);if(!c)return;const img=document.getElementById('detailImage');img.src=c.image_url;document.getElementById('detailName').textContent=c.card_name||c.card_no;document.getElementById('detailBrand').textContent=c.brand||'ブランドなし';document.getElementById('detailModal').classList.remove('hidden')}
function exportBackup(){const data={version:1,exportedAt:new Date().toISOString(),favorites:[...state.favorites],selected:state.selected,outfits:state.outfits};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`aikatsu-binder-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)}
async function importBackup(file){try{const data=JSON.parse(await file.text());if(!data||typeof data!=='object')throw 0;state.favorites=new Set(data.favorites||[]);state.selected=data.selected||{};state.outfits=Array.isArray(data.outfits)?data.outfits.slice(0,30):[];saveJSON(LS.favorites,[...state.favorites]);saveJSON(LS.selected,state.selected);saveJSON(LS.outfits,state.outfits);sanitizeLocalState();renderAll();toast('バックアップを読み込みました')}catch{alert('バックアップファイルを読み込めませんでした。')}}
function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.add('hidden'),1700)}
function renderAll(){renderCards();renderSelected();renderMini();renderActiveFilters();renderSettings();if(state.currentPage==='qr')renderQR();if(state.currentPage==='outfits')renderOutfits()}

// events
document.addEventListener('click',e=>{
  const rem=e.target.closest('[data-remove]');if(rem){removeSlot(rem.dataset.remove);return}
  const opt=e.target.closest('[data-filteropt]');if(opt){const [k,v]=opt.dataset.filteropt.split('|');const arr=state.draftFilters[k]||[];state.draftFilters[k]=arr.includes(v)?arr.filter(x=>x!==v):[...arr,v];renderFilterSheet();return}
  const clear=e.target.closest('[data-clearfilter]');if(clear){const [k,v]=clear.dataset.clearfilter.split('|');state.filters[k]=(state.filters[k]||[]).filter(x=>x!==v);saveJSON(LS.filters,state.filters);renderCards();renderActiveFilters();return}
  const use=e.target.closest('[data-useoutfit]');if(use){useOutfit(Number(use.dataset.useoutfit));return}
  const del=e.target.closest('[data-deleteoutfit]');if(del){deleteOutfit(Number(del.dataset.deleteoutfit));return}
});
document.querySelectorAll('.nav-button').forEach(b=>b.addEventListener('click',()=>setPage(b.dataset.page)));
document.getElementById('searchInput').value=state.search;
document.getElementById('searchInput').addEventListener('input',e=>{state.search=e.target.value;localStorage.setItem(LS.search,state.search);renderCards()});
document.getElementById('filterButton').addEventListener('click',openFilter);document.getElementById('closeFilter').addEventListener('click',closeFilter);document.getElementById('applyFilters').addEventListener('click',applyFilters);document.getElementById('resetFilters').addEventListener('click',resetFilters);
document.getElementById('filterSheet').addEventListener('click',e=>{if(e.target.id==='filterSheet')closeFilter()});
document.getElementById('saveOutfitButton').addEventListener('click',saveOutfit);document.getElementById('miniGoSelected').addEventListener('click',()=>setPage('selected'));
document.getElementById('openOutfitsButton').addEventListener('click',()=>setPage('outfits'));document.getElementById('backSettingsButton').addEventListener('click',()=>setPage('settings'));
document.getElementById('reloadDataButton').addEventListener('click',loadCards);document.getElementById('exportButton').addEventListener('click',exportBackup);document.getElementById('importInput').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)importBackup(f);e.target.value=''});
document.getElementById('closeDetail').addEventListener('click',()=>document.getElementById('detailModal').classList.add('hidden'));document.getElementById('detailModal').addEventListener('click',e=>{if(e.target.id==='detailModal')e.currentTarget.classList.add('hidden')});
loadCards();
