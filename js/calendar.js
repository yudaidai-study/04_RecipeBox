import { initAuth } from './auth.js';
import * as api from './api.js';
import { dateKey, todayDate, addDays, startOfWeek, startOfMonth, addMonths } from './dateutils.js';

const calGrid = document.getElementById('cal-grid');
const calRangeLabel = document.getElementById('cal-range-label');
const calPrev = document.getElementById('cal-prev');
const calNext = document.getElementById('cal-next');
const rangeToggleBtn = document.getElementById('range-toggle-btn');
const autofillBtn = document.getElementById('cal-autofill-btn');

const dayOverlay = document.getElementById('day-overlay');
const dayClose = document.getElementById('day-close');
const dayTitle = document.getElementById('day-title');
const dayEntries = document.getElementById('day-entries');
const dayRecipeSearch = document.getElementById('day-recipe-search');
const dayRecipeResults = document.getElementById('day-recipe-results');

const toastEl = document.getElementById('toast');

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

const state = {
  rangeMode: 'twoWeek', // 'twoWeek' | 'month'
  anchorDate: todayDate(),
  entriesByDate: new Map(), // dateKey -> [{id, recipe_id, title, image_url, url}]
  allRecipes: [], // 検索ピッカー用に一度だけ読み込む
  activeDayKey: null,
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

// 2週間モード: 直近の日曜始まりで14日。1か月モード: その月を含む週単位の全日程(前後月の余白日込み)。
function getGridDays() {
  if (state.rangeMode === 'twoWeek') {
    const start = startOfWeek(state.anchorDate);
    return Array.from({ length: 14 }, (_, i) => addDays(start, i));
  }
  const first = startOfMonth(state.anchorDate);
  const gridStart = startOfWeek(first);
  const lastOfMonth = new Date(state.anchorDate.getFullYear(), state.anchorDate.getMonth() + 1, 0);
  const gridEndWeekStart = startOfWeek(lastOfMonth);
  const totalDays = Math.round((addDays(gridEndWeekStart, 6) - gridStart) / 86400000) + 1;
  return Array.from({ length: totalDays }, (_, i) => addDays(gridStart, i));
}

function updateRangeLabel(days) {
  if (state.rangeMode === 'twoWeek') {
    const first = days[0];
    const last = days[days.length - 1];
    calRangeLabel.textContent = `${first.getFullYear()}/${first.getMonth() + 1}/${first.getDate()} 〜 ${last.getMonth() + 1}/${last.getDate()}`;
  } else {
    calRangeLabel.textContent = `${state.anchorDate.getFullYear()}年${state.anchorDate.getMonth() + 1}月`;
  }
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

function renderGrid() {
  const days = getGridDays();
  updateRangeLabel(days);
  const todayKey = dateKey(todayDate());
  const currentMonth = state.anchorDate.getMonth();

  calGrid.innerHTML = days.map((d) => {
    const key = dateKey(d);
    const entries = state.entriesByDate.get(key) || [];
    const isOtherMonth = state.rangeMode === 'month' && d.getMonth() !== currentMonth;
    const isToday = key === todayKey;
    const chips = entries.slice(0, 2).map((e) => `<div class="cal-entry-chip">${escHtml(e.title)}</div>`).join('');
    const more = entries.length > 2 ? `<div class="cal-entry-more">+${entries.length - 2}</div>` : '';
    return `
      <button type="button" class="cal-cell ${isOtherMonth ? 'dim' : ''} ${isToday ? 'today' : ''}" data-date="${key}">
        <span class="cal-daynum">${d.getDate()}</span>
        <span class="cal-entries">${chips}${more}</span>
      </button>`;
  }).join('');
}

async function refresh() {
  const days = getGridDays();
  updateRangeLabel(days);
  try {
    await loadEntries(days);
  } catch (err) {
    console.error(err);
    toast('献立の読み込みに失敗しました');
  }
  renderGrid();
}

function thumbHtml(imageUrl) {
  const fallback = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 15l-5-5-9 9"/></svg>`;
  return `<span class="thumb-fallback">${fallback}</span>${
    imageUrl ? `<img src="${escHtml(imageUrl)}" alt="" loading="lazy" onerror="this.remove()">` : ''
  }`;
}

function renderDayEntries() {
  const entries = state.entriesByDate.get(state.activeDayKey) || [];
  dayEntries.innerHTML = entries.length
    ? entries.map((e) => `
        <div class="day-entry">
          <div class="thumb">${thumbHtml(e.image_url)}</div>
          <p class="title">${escHtml(e.title)}</p>
          <button type="button" class="icon-btn small" data-action="remove-entry" data-id="${escHtml(e.id)}" aria-label="この献立から外す">✕</button>
        </div>`).join('')
    : '<p class="cal-empty-note">まだ登録されていません</p>';
}

function formatDayTitle(key) {
  const [y, m, d] = key.split('-').map(Number);
  const wd = WEEKDAY_JA[new Date(y, m - 1, d).getDay()];
  return `${y}/${m}/${d}(${wd})の献立`;
}

function openDay(key) {
  state.activeDayKey = key;
  dayTitle.textContent = formatDayTitle(key);
  renderDayEntries();
  dayRecipeSearch.value = '';
  dayRecipeResults.innerHTML = '';
  dayOverlay.classList.add('open');
}

function closeDay() {
  dayOverlay.classList.remove('open');
}

async function ensureAllRecipesLoaded() {
  if (state.allRecipes.length > 0) return;
  try {
    state.allRecipes = await api.listRecipes({});
  } catch (err) {
    console.error(err);
  }
}

function renderRecipeResults(query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    dayRecipeResults.innerHTML = '';
    return;
  }
  const matches = state.allRecipes
    .filter((r) => (r.title || r.url || '').toLowerCase().includes(q))
    .slice(0, 8);
  dayRecipeResults.innerHTML = matches.length
    ? matches.map((r) => `
        <button type="button" class="day-recipe-result" data-id="${escHtml(r.id)}">
          <span class="title">${escHtml(r.title || r.url)}</span>
        </button>`).join('')
    : '<p class="cal-empty-note">見つかりませんでした</p>';
}

async function addRecipeToDay(recipeId) {
  try {
    const added = await api.addMealPlanEntry(state.activeDayKey, recipeId);
    if (!added) {
      toast('この日にはすでに追加済みです');
      return;
    }
    const recipe = state.allRecipes.find((r) => r.id === recipeId);
    const list = state.entriesByDate.get(state.activeDayKey) || [];
    list.push({
      id: added.id, recipe_id: recipeId,
      title: recipe?.title || recipe?.url || '', image_url: recipe?.image_url, url: recipe?.url,
    });
    state.entriesByDate.set(state.activeDayKey, list);
    renderDayEntries();
    renderGrid();
    dayRecipeSearch.value = '';
    dayRecipeResults.innerHTML = '';
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

// 表示中の範囲のうち、まだ何も登録されていない日にランダムでレシピを割り当てる。
async function autoFillEmptyDays() {
  const days = getGridDays();
  const emptyKeys = days.map(dateKey).filter((k) => !(state.entriesByDate.get(k)?.length));
  if (emptyKeys.length === 0) {
    toast('空いている日はありません');
    return;
  }
  autofillBtn.disabled = true;
  autofillBtn.textContent = '埋めています…';
  try {
    let filled = 0;
    for (const key of emptyKeys) {
      const recipe = await api.getRandomRecipe([], null);
      if (!recipe) break; // 保存済みレシピが1件もない
      const added = await api.addMealPlanEntry(key, recipe.id);
      if (added) {
        const list = state.entriesByDate.get(key) || [];
        list.push({ id: added.id, recipe_id: recipe.id, title: recipe.title || recipe.url, image_url: recipe.image_url, url: recipe.url });
        state.entriesByDate.set(key, list);
        filled++;
      }
    }
    renderGrid();
    toast(filled > 0 ? `${filled}日分をランダムで埋めました` : 'レシピが保存されていません');
  } catch (err) {
    console.error(err);
    toast('自動割り当てに失敗しました');
  } finally {
    autofillBtn.disabled = false;
    autofillBtn.textContent = '空いてる日をランダムで埋める';
  }
}

calPrev.addEventListener('click', () => {
  state.anchorDate = state.rangeMode === 'twoWeek' ? addDays(state.anchorDate, -14) : addMonths(state.anchorDate, -1);
  refresh();
});
calNext.addEventListener('click', () => {
  state.anchorDate = state.rangeMode === 'twoWeek' ? addDays(state.anchorDate, 14) : addMonths(state.anchorDate, 1);
  refresh();
});
rangeToggleBtn.addEventListener('click', () => {
  state.rangeMode = state.rangeMode === 'twoWeek' ? 'month' : 'twoWeek';
  rangeToggleBtn.title = state.rangeMode === 'twoWeek' ? '1か月表示に切替' : '2週間表示に切替';
  refresh();
});
autofillBtn.addEventListener('click', autoFillEmptyDays);

calGrid.addEventListener('click', (e) => {
  const cell = e.target.closest('.cal-cell');
  if (!cell) return;
  openDay(cell.dataset.date);
});

dayClose.addEventListener('click', closeDay);
dayOverlay.addEventListener('click', (e) => {
  if (e.target.id === 'day-overlay') closeDay();
});

dayEntries.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="remove-entry"]');
  if (!btn) return;
  removeRecipeFromDay(btn.dataset.id);
});

let searchDebounce = null;
dayRecipeSearch.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(async () => {
    await ensureAllRecipesLoaded();
    renderRecipeResults(dayRecipeSearch.value);
  }, 150);
});

dayRecipeResults.addEventListener('click', (e) => {
  const btn = e.target.closest('.day-recipe-result');
  if (!btn) return;
  addRecipeToDay(btn.dataset.id);
});

function init() {
  initAuth(() => {
    refresh();
  });
}

init();
