import { initAuth } from './auth.js';
import * as api from './api.js';
import * as ui from './ui.js';
import { dateKey, todayDate, addDays, startOfWeek } from './dateutils.js';

const calGrid = document.getElementById('cal-week-list');
const calRangeLabel = document.getElementById('cal-range-label');
const calPrev = document.getElementById('cal-prev');
const calNext = document.getElementById('cal-next');

const dayOverlay = document.getElementById('day-overlay');
const dayClose = document.getElementById('day-close');
const dayMainView = document.getElementById('day-main-view');
const dayTitle = document.getElementById('day-title');
const dayEntries = document.getElementById('day-entries');

const daySearchBtn = document.getElementById('day-search-btn');
const dayRandomBtn = document.getElementById('day-random-btn');
const dayFilterPanel = document.getElementById('day-filter-panel');
const dayFilterBack = document.getElementById('day-filter-back');
const dayFilterModeLabel = document.getElementById('day-filter-mode-label');
const dayFilterCats = document.getElementById('day-filter-cats');
const dayFilterFreeTagRow = document.getElementById('day-filter-free-tag-row');
const dayFilterFreeTagInput = document.getElementById('day-filter-free-tag-input');
const dayFilterRatingRow = document.getElementById('day-filter-rating-row');
const daySearchResults = document.getElementById('day-search-results');
const dayRandomBox = document.getElementById('day-random-box');
const dayRandomContent = document.getElementById('day-random-content');
const dayRandomAgainBtn = document.getElementById('day-random-again');
const dayRandomViewBtn = document.getElementById('day-random-view');
const dayRandomAddBtn = document.getElementById('day-random-add');
const dayFilterEmpty = document.getElementById('day-filter-empty');

const toastEl = document.getElementById('toast');

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

const state = {
  anchorDate: todayDate(), // 表示中の週を含む基準日
  entriesByDate: new Map(), // dateKey -> [{id, recipe_id, title, image_url, url}]
  categories: [], // 日別フィルタのカテゴリチップ用(開いたときに一度だけ読み込む)
  activeDayKey: null,
  filterMode: null, // 'search' | 'random' | null
  filterCategoryIds: new Set(),
  filterMinRating: null,
  lastSearchResults: [], // 検索結果クリック時にidから全情報を引くための一時キャッシュ
  searchSelectedRecipe: null, // 検索結果から選択中の1件(⑯: レシピを見る/献立に追加の対象)
  randomCandidate: null,
};

function escHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

let toastTimer = null;
function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

// 表示中の週(日曜始まり7日間)。
function getWeekDays() {
  const start = startOfWeek(state.anchorDate);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function updateRangeLabel(days) {
  const first = days[0];
  const last = days[days.length - 1];
  calRangeLabel.textContent = `${first.getFullYear()}/${first.getMonth() + 1}/${first.getDate()} 〜 ${last.getMonth() + 1}/${last.getDate()}`;
}

async function loadEntries(days) {
  const fromKey = dateKey(days[0]);
  const toKey = dateKey(days[days.length - 1]);
  const rows = await api.listMealPlan(fromKey, toKey);
  state.entriesByDate = new Map();
  for (const row of rows) {
    const list = state.entriesByDate.get(row.date) || [];
    list.push({
      id: row.id,
      recipe_id: row.recipe_id,
      title: row.recipes?.title || row.recipes?.url || '(削除済みのレシピ)',
      image_url: row.recipes?.image_url,
      url: row.recipes?.url,
    });
    state.entriesByDate.set(row.date, list);
  }
}

function thumbHtml(imageUrl) {
  const fallback = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 15l-5-5-9 9"/></svg>`;
  return `<span class="thumb-fallback">${fallback}</span>${
    imageUrl ? `<img src="${escHtml(imageUrl)}" alt="" loading="lazy" onerror="this.remove()">` : ''
  }`;
}

// 1週間を縦7段(曜日+日付 / 画像とメニュー名)で表示する(⑦)。
function renderGrid() {
  const days = getWeekDays();
  updateRangeLabel(days);
  const todayKey = dateKey(todayDate());

  calGrid.innerHTML = days.map((d) => {
    const key = dateKey(d);
    const entries = state.entriesByDate.get(key) || [];
    const isToday = key === todayKey;
    const entriesHtml = entries.length
      ? entries.map((e) => `
          <div class="cal-day-entry">
            <div class="thumb">${thumbHtml(e.image_url)}</div>
            <span class="title">${escHtml(e.title)}</span>
          </div>`).join('')
      : '<p class="cal-day-empty">まだ未定</p>';
    return `
      <button type="button" class="cal-day-row ${isToday ? 'today' : ''}" data-date="${key}">
        <div class="cal-day-label"><span class="wd">${WEEKDAY_JA[d.getDay()]}</span><span class="daynum">${d.getDate()}</span></div>
        <div class="cal-day-content">${entriesHtml}</div>
      </button>`;
  }).join('');
}

async function refresh() {
  const days = getWeekDays();
  updateRangeLabel(days);
  try {
    await loadEntries(days);
  } catch (err) {
    console.error(err);
    toast('献立の読み込みに失敗しました');
  }
  renderGrid();
}

const TRASH_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;

// クリックでレシピを見られるようにし(id="day-entry")、✕は「削除」であることが分かるゴミ箱アイコンに変える。
function renderDayEntries() {
  const entries = state.entriesByDate.get(state.activeDayKey) || [];
  dayEntries.innerHTML = entries.length
    ? entries.map((e) => `
        <div class="day-entry" data-url="${escHtml(e.url || '')}">
          <div class="thumb">${thumbHtml(e.image_url)}</div>
          <p class="title">${escHtml(e.title)}</p>
          <button type="button" class="icon-btn small" data-action="remove-entry" data-id="${escHtml(e.id)}" aria-label="削除" title="削除">${TRASH_ICON}</button>
        </div>`).join('')
    : '<p class="cal-empty-note">まだ登録されていません</p>';
}

function formatDayTitle(key) {
  const [y, m, d] = key.split('-').map(Number);
  const wd = WEEKDAY_JA[new Date(y, m - 1, d).getDay()];
  return `${y}/${m}/${d}(${wd})の献立`;
}

function closeDayFilterPanel() {
  state.filterMode = null;
  state.filterCategoryIds = new Set();
  state.filterMinRating = null;
  state.randomCandidate = null;
  state.searchSelectedRecipe = null;
  dayFilterPanel.classList.add('hidden');
  daySearchResults.classList.add('hidden');
  dayRandomBox.classList.add('hidden');
  dayFilterEmpty.classList.add('hidden');
  dayMainView.classList.remove('hidden'); // ステップ1(献立一覧)に戻す(⑫)
}

function openDay(key) {
  state.activeDayKey = key;
  dayTitle.textContent = formatDayTitle(key);
  renderDayEntries();
  closeDayFilterPanel();
  dayOverlay.classList.add('open');
}

function closeDay() {
  dayOverlay.classList.remove('open');
  closeDayFilterPanel();
}

async function ensureCategoriesLoaded() {
  if (state.categories.length > 0) return;
  try {
    state.categories = await api.listCategories();
  } catch (err) {
    console.error(err);
  }
}

// カテゴリ・評価の条件が変わるたびに、検索モードなら一覧を、ランダムモードなら候補を引き直す。
function applyDayFilterChange() {
  if (state.filterMode === 'search') refreshDaySearchResults();
  else if (state.filterMode === 'random') drawDayRandomCandidate();
}

async function openDayFilterPanel(mode) {
  await ensureCategoriesLoaded();
  state.filterMode = mode;
  state.randomCandidate = null;
  dayFilterModeLabel.textContent = mode === 'search' ? '🔍 検索して追加' : '🎲 ランダムで追加';
  ui.renderCatGroups('day-filter-cats', state.categories, state.filterCategoryIds, { includeFree: false });
  ui.renderFreeTagPicker('day-filter', state.categories, state.filterCategoryIds);
  dayFilterFreeTagInput.value = '';
  ui.renderRatingRow('day-filter-rating-row', state.filterMinRating);
  dayMainView.classList.add('hidden'); // フィルタより上の領域(献立一覧・追加ボタン)は隠す(⑫)
  dayFilterPanel.classList.remove('hidden');
  dayFilterEmpty.classList.add('hidden');
  if (mode === 'search') {
    dayRandomBox.classList.add('hidden');
    daySearchResults.classList.remove('hidden');
    await refreshDaySearchResults();
  } else {
    daySearchResults.classList.add('hidden');
    dayRandomBox.classList.remove('hidden');
    await drawDayRandomCandidate();
  }
}

async function refreshDaySearchResults() {
  try {
    const recipes = await api.listRecipes({
      categoryIds: [...state.filterCategoryIds],
      minRating: state.filterMinRating,
    });
    state.lastSearchResults = recipes;
    state.searchSelectedRecipe = null;
    dayFilterEmpty.classList.toggle('hidden', recipes.length > 0);
    renderSearchResultsList();
  } catch (err) {
    console.error(err);
    toast('検索に失敗しました');
  }
}

// ホーム画面の一覧カードと同じく画像付きで表示する(⑮)。選択中の1件だけは、その行の直下に
// 「レシピを見る」「献立に追加」ボタンを展開表示する(日付選択を挟まずこの日に直接追加できる)。
function renderSearchResultsList() {
  daySearchResults.innerHTML = state.lastSearchResults.map((r) => {
    const isSelected = state.searchSelectedRecipe?.id === r.id;
    return `
      <div class="day-recipe-result-wrap">
        <button type="button" class="day-recipe-result ${isSelected ? 'selected' : ''}" data-id="${escHtml(r.id)}">
          <div class="thumb">${thumbHtml(r.image_url)}</div>
          <span class="title">${escHtml(r.title || r.url)}</span>
        </button>
        ${isSelected ? `
          <div class="day-recipe-result-actions">
            <button type="button" class="btn btn-secondary" data-action="view-selected">レシピを見る</button>
            <button type="button" class="btn btn-primary" data-action="add-selected">献立に追加</button>
          </div>` : ''}
      </div>`;
  }).join('');
}

async function drawDayRandomCandidate() {
  dayRandomContent.innerHTML = '<div class="loading-state"><span class="spin-emoji">🍳</span></div>';
  try {
    const recipe = await api.getRandomRecipe([...state.filterCategoryIds], state.filterMinRating);
    state.randomCandidate = recipe;
    dayFilterEmpty.classList.toggle('hidden', !!recipe);
    dayRandomContent.innerHTML = recipe
      ? `<div class="reveal-card"><div class="thumb">${thumbHtml(recipe.image_url)}</div><div class="body"><p class="title">${escHtml(recipe.title || recipe.url)}</p></div></div>`
      : '';
  } catch (err) {
    console.error(err);
    dayRandomContent.innerHTML = '';
    toast('提案の取得に失敗しました');
  }
}

async function addRecipeToDay(recipe) {
  try {
    const added = await api.addMealPlanEntry(state.activeDayKey, recipe.id);
    if (!added) {
      toast('この日にはすでに追加済みです');
      return;
    }
    const list = state.entriesByDate.get(state.activeDayKey) || [];
    list.push({ id: added.id, recipe_id: recipe.id, title: recipe.title || recipe.url, image_url: recipe.image_url, url: recipe.url });
    state.entriesByDate.set(state.activeDayKey, list);
    renderDayEntries();
    renderGrid();
    closeDayFilterPanel();
    toast(`「${recipe.title || recipe.url}」を追加しました`);
  } catch (err) {
    console.error(err);
    toast('追加に失敗しました');
  }
}

async function removeRecipeFromDay(entryId) {
  try {
    await api.removeMealPlanEntry(entryId);
    const list = (state.entriesByDate.get(state.activeDayKey) || []).filter((e) => e.id !== entryId);
    state.entriesByDate.set(state.activeDayKey, list);
    renderDayEntries();
    renderGrid();
  } catch (err) {
    console.error(err);
    toast('削除に失敗しました');
  }
}

calPrev.addEventListener('click', () => {
  state.anchorDate = addDays(state.anchorDate, -7);
  refresh();
});
calNext.addEventListener('click', () => {
  state.anchorDate = addDays(state.anchorDate, 7);
  refresh();
});

calGrid.addEventListener('click', (e) => {
  const row = e.target.closest('.cal-day-row');
  if (!row) return;
  openDay(row.dataset.date);
});

dayClose.addEventListener('click', closeDay);
dayOverlay.addEventListener('click', (e) => {
  if (e.target.id === 'day-overlay') closeDay();
});

dayEntries.addEventListener('click', (e) => {
  const removeBtn = e.target.closest('[data-action="remove-entry"]');
  if (removeBtn) {
    removeRecipeFromDay(removeBtn.dataset.id);
    return;
  }
  const entry = e.target.closest('.day-entry');
  if (entry?.dataset.url) {
    window.open(entry.dataset.url, '_blank', 'noopener');
  }
});

daySearchBtn.addEventListener('click', () => openDayFilterPanel('search'));
dayRandomBtn.addEventListener('click', () => openDayFilterPanel('random'));
dayFilterBack.addEventListener('click', () => closeDayFilterPanel());

dayFilterCats.addEventListener('click', (e) => {
  const chip = e.target.closest('.cat-chip');
  if (!chip) return;
  const id = chip.dataset.id;
  if (state.filterCategoryIds.has(id)) state.filterCategoryIds.delete(id);
  else state.filterCategoryIds.add(id);
  ui.renderCatGroups('day-filter-cats', state.categories, state.filterCategoryIds, { includeFree: false });
  ui.renderFreeTagPicker('day-filter', state.categories, state.filterCategoryIds);
  applyDayFilterChange();
});

// 自由入力タグ(⑪): 表示されているのは選択中のものだけなので、クリック=選択解除。
dayFilterFreeTagRow.addEventListener('click', (e) => {
  const chip = e.target.closest('.cat-chip');
  if (!chip) return;
  state.filterCategoryIds.delete(chip.dataset.id);
  ui.renderCatGroups('day-filter-cats', state.categories, state.filterCategoryIds, { includeFree: false });
  ui.renderFreeTagPicker('day-filter', state.categories, state.filterCategoryIds);
  applyDayFilterChange();
});

// 既存タグ名と完全一致した場合だけ選択に加える(候補にない名前を打っても何も起きない)。
function pickDayFreeTag(name) {
  const trimmed = name.trim();
  const cat = state.categories.find((c) => !c.group_key && c.name === trimmed);
  if (!cat) {
    if (trimmed) toast('そのタグは見つかりませんでした');
    return;
  }
  state.filterCategoryIds.add(cat.id);
  ui.renderCatGroups('day-filter-cats', state.categories, state.filterCategoryIds, { includeFree: false });
  ui.renderFreeTagPicker('day-filter', state.categories, state.filterCategoryIds);
  dayFilterFreeTagInput.value = '';
  applyDayFilterChange();
}
dayFilterFreeTagInput.addEventListener('change', () => pickDayFreeTag(dayFilterFreeTagInput.value));
dayFilterFreeTagInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    pickDayFreeTag(dayFilterFreeTagInput.value);
  }
});

dayFilterRatingRow.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="set-min-rating"]');
  if (!btn) return;
  const value = Number(btn.dataset.value);
  state.filterMinRating = state.filterMinRating === value ? null : value;
  ui.renderRatingRow('day-filter-rating-row', state.filterMinRating);
  applyDayFilterChange();
});

daySearchResults.addEventListener('click', (e) => {
  const viewBtn = e.target.closest('[data-action="view-selected"]');
  if (viewBtn) {
    if (state.searchSelectedRecipe) window.open(state.searchSelectedRecipe.url, '_blank', 'noopener');
    return;
  }
  const addBtn = e.target.closest('[data-action="add-selected"]');
  if (addBtn) {
    if (state.searchSelectedRecipe) addRecipeToDay(state.searchSelectedRecipe);
    return;
  }
  const resultBtn = e.target.closest('.day-recipe-result');
  if (!resultBtn) return;
  const recipe = state.lastSearchResults.find((r) => r.id === resultBtn.dataset.id);
  if (!recipe) return;
  // 同じ項目をもう一度タップしたら閉じる(選択解除)。それ以外は選び直して直下に展開する。
  state.searchSelectedRecipe = state.searchSelectedRecipe?.id === recipe.id ? null : recipe;
  renderSearchResultsList();
});

dayRandomAgainBtn.addEventListener('click', () => drawDayRandomCandidate());
dayRandomViewBtn.addEventListener('click', () => {
  if (state.randomCandidate) window.open(state.randomCandidate.url, '_blank', 'noopener');
});
dayRandomAddBtn.addEventListener('click', () => {
  if (state.randomCandidate) addRecipeToDay(state.randomCandidate);
});

function init() {
  initAuth(() => {
    refresh();
  });
}

init();
