export function escHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const PLACEHOLDER_THUMB = `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 15l-5-5-9 9"/></svg>`;

function thumbHtml(imageUrl) {
  return `<span class="thumb-fallback">${PLACEHOLDER_THUMB}</span>${
    imageUrl ? `<img src="${escHtml(imageUrl)}" alt="" loading="lazy" onerror="this.remove()">` : ''
  }`;
}

// カテゴリをグループ(ジャンル/料理区分/メイン/自由入力)ごとに整列したチップ群のHTML。
// レシピ保存画面のタグピッカーと同じ見た目にするため、フィルタ・今日は何作るの両方で共用する。
const CAT_GROUP_DEFS = [
  { key: 'genre', label: 'ジャンル' },
  { key: 'role', label: '料理区分' },
  { key: 'main_ingredient', label: 'メイン' },
  { key: 'free', label: '自由入力' },
];

// includeFree=falseだと自由入力グループを描画しない(⑨: 編集画面では自由入力を専用のチップ+追加欄で扱うため)。
function groupedCatGroupsHtml(categories, activeIds, { includeFree = true } = {}) {
  const buckets = { genre: [], role: [], main_ingredient: [], free: [] };
  for (const c of categories) {
    const key = c.group_key && buckets[c.group_key] ? c.group_key : 'free';
    buckets[key].push(c);
  }
  const defs = includeFree ? CAT_GROUP_DEFS : CAT_GROUP_DEFS.filter((g) => g.key !== 'free');
  return defs.map(({ key, label }) => {
    const chips = buckets[key]
      .map((c) => `<button type="button" class="cat-chip ${activeIds.has(c.id) ? 'active' : ''}" data-id="${escHtml(c.id)}">${escHtml(c.name)}</button>`)
      .join('');
    if (!chips) return '';
    return `<div class="tag-group"><p class="tag-group-label">${label}</p><div class="tag-row">${chips}</div></div>`;
  }).join('');
}

// 評価フィルタ用の星ボタン行。minRating以下の星をfilled表示し、タップで「n以上」の閾値を設定する。
function ratingRowHtml(minRating) {
  let html = '';
  for (let n = 1; n <= 5; n++) {
    const filled = n <= (minRating || 0);
    html += `<button type="button" class="star-btn ${filled ? 'filled' : ''}" data-action="set-min-rating" data-value="${n}" aria-label="${n}つ星以上で絞り込む">★</button>`;
  }
  return html;
}

// 一覧の並び順(フィルタ画面専用)。値はapi.listRecipesのsortOrderにそのまま渡す。
const SORT_OPTIONS = [
  { value: 'created', label: '最近追加した順' },
  { value: 'rating', label: '評価順' },
  { value: 'title', label: '名称順' },
];

function sortRowHtml(activeValue) {
  return SORT_OPTIONS
    .map(({ value, label }) => `<button type="button" class="cat-chip ${value === activeValue ? 'active' : ''}" data-value="${value}">${label}</button>`)
    .join('');
}

// interactive=trueだと評価入力用のボタン(タップで☆1〜5を選択、同じ星を再タップで解除)、
// falseだと表示専用のspan(カード等での既評価の表示用)。
function starsHtml(rating, interactive) {
  const r = rating || 0;
  let html = '';
  for (let n = 1; n <= 5; n++) {
    const filled = n <= r;
    html += interactive
      ? `<button type="button" class="star-btn ${filled ? 'filled' : ''}" data-action="set-rating" data-value="${n}" aria-label="${n}つ星">★</button>`
      : `<span class="star-ico ${filled ? 'filled' : ''}">★</span>`;
  }
  return html;
}

let handlers = {};

export function initUI(h) {
  handlers = h;

  document.getElementById('filter-btn').addEventListener('click', () => handlers.onFilterBtn?.());
  document.getElementById('filter-close').addEventListener('click', () => handlers.onFilterClose?.());
  document.getElementById('filter-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'filter-overlay') handlers.onFilterClose?.();
  });
  document.getElementById('filter-cat-groups').addEventListener('click', (e) => {
    const chip = e.target.closest('.cat-chip');
    if (!chip) return;
    handlers.onFilterChipToggle?.(chip.dataset.id);
  });
  // 自由入力タグ・キーワード(①⑪): 表示されているのは選択中のものだけなので、クリック=選択解除。
  // キーワードチップ(data-keyword)とタグチップ(data-id)を区別して扱う。
  document.getElementById('filter-free-tag-row').addEventListener('click', (e) => {
    const chip = e.target.closest('.cat-chip');
    if (!chip) return;
    if (chip.dataset.keyword != null) {
      handlers.onFilterKeywordRemove?.(chip.dataset.keyword);
      return;
    }
    handlers.onFilterChipToggle?.(chip.dataset.id);
  });
  const filterFreeTagInput = document.getElementById('filter-free-tag-input');
  filterFreeTagInput.addEventListener('change', () => handlers.onFilterFreeTagPick?.(filterFreeTagInput.value));
  filterFreeTagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handlers.onFilterFreeTagPick?.(filterFreeTagInput.value);
    }
  });
  document.getElementById('filter-rating-row').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="set-min-rating"]');
    if (!btn) return;
    handlers.onFilterRatingSelect?.(Number(btn.dataset.value));
  });
  // 並び順は複数選択ではなく常にどれか1つが選ばれている状態にする(トグルではなく選択)。
  document.getElementById('filter-sort-row').addEventListener('click', (e) => {
    const chip = e.target.closest('.cat-chip');
    if (!chip) return;
    handlers.onFilterSortSelect?.(chip.dataset.value);
  });
  document.getElementById('filter-clear').addEventListener('click', () => handlers.onFilterClear?.());
  document.getElementById('filter-apply').addEventListener('click', () => handlers.onFilterApply?.());

  document.getElementById('recipe-grid').addEventListener('click', (e) => {
    const card = e.target.closest('.recipe-card');
    if (!card) return;
    handlers.onCardClick?.(card.dataset.id);
  });

  document.getElementById('retry-btn').addEventListener('click', () => handlers.onRetry?.());
  document.getElementById('today-btn')?.addEventListener('click', () => handlers.onTodayCta?.());

  // 左下メニュー(統計・DB使用容量確認・ログアウト)
  document.getElementById('menu-fab')?.addEventListener('click', () => handlers.onMenuOpen?.());
  document.getElementById('menu-close')?.addEventListener('click', () => handlers.onMenuClose?.());
  document.getElementById('menu-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'menu-overlay') handlers.onMenuClose?.();
  });
  document.getElementById('menu-stats-btn')?.addEventListener('click', () => handlers.onMenuStatsOpen?.());
  document.getElementById('menu-stats-back')?.addEventListener('click', () => handlers.onMenuStatsBack?.());
  document.getElementById('menu-usage-btn')?.addEventListener('click', () => handlers.onMenuUsageOpen?.());
  document.getElementById('menu-usage-back')?.addEventListener('click', () => handlers.onMenuUsageBack?.());
  document.getElementById('menu-logout-btn')?.addEventListener('click', () => handlers.onLogout?.());
  // 今日の献立(④): レシピに紐付く項目だけクリックで元のページへ直接飛べる。
  document.getElementById('today-plan-list')?.addEventListener('click', (e) => {
    const item = e.target.closest('.today-plan-item[data-url]');
    if (!item) return;
    handlers.onTodayPlanItemClick?.(item.dataset.url);
  });

  document.getElementById('detail-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'detail-overlay') closeDetail();
  });
  document.getElementById('detail-close').addEventListener('click', closeDetail);
  document.getElementById('detail-content').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'open-original') handlers.onDetailOpenOriginal?.();
    if (action === 'edit') handlers.onDetailEdit?.();
    if (action === 'add-to-plan') handlers.onDetailAddToPlan?.();
    if (action === 'toggle-archive') handlers.onDetailToggleArchive?.();
  });

  document.getElementById('mealplan-add-close').addEventListener('click', () => handlers.onMealPlanAddClose?.());
  document.getElementById('mealplan-add-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'mealplan-add-overlay') handlers.onMealPlanAddClose?.();
  });
  document.getElementById('mealplan-add-confirm').addEventListener('click', () => {
    const dateValue = document.getElementById('mealplan-date-input').value;
    handlers.onMealPlanAddConfirm?.(dateValue);
  });
  // 日付欄の下に曜日を添える。ネイティブの日付ピッカーで値を変えたときも追従させる。
  const mealplanDateInput = document.getElementById('mealplan-date-input');
  mealplanDateInput.addEventListener('input', updateMealPlanDateWeekday);
  mealplanDateInput.addEventListener('change', updateMealPlanDateWeekday);

  document.getElementById('edit-close').addEventListener('click', () => handlers.onEditClose?.());
  document.getElementById('edit-cancel').addEventListener('click', () => handlers.onEditClose?.());
  document.getElementById('edit-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'edit-overlay') handlers.onEditClose?.();
  });
  document.getElementById('edit-cat-groups').addEventListener('click', (e) => {
    const chip = e.target.closest('.cat-chip');
    if (!chip) return;
    handlers.onEditChipToggle?.(chip.dataset.id);
  });
  // 自由入力タグ(⑨): 既に付与されているタグだけがチップとして並ぶ。クリックでON/OFFはfixedグループと同じ扱い。
  document.getElementById('edit-free-tag-row').addEventListener('click', (e) => {
    const chip = e.target.closest('.cat-chip');
    if (!chip) return;
    handlers.onEditChipToggle?.(chip.dataset.id);
  });
  document.getElementById('edit-rating-row').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="set-rating"]');
    if (!btn) return;
    handlers.onEditRatingSelect?.(Number(btn.dataset.value));
  });
  document.getElementById('edit-new-cat-toggle').addEventListener('click', () => {
    document.getElementById('edit-new-cat-toggle-wrap').classList.add('hidden');
    document.getElementById('edit-new-cat-row').classList.remove('hidden');
    document.getElementById('edit-new-cat-input').focus();
  });
  const editNewCatInput = document.getElementById('edit-new-cat-input');
  editNewCatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('edit-new-cat-add').click();
    }
  });
  document.getElementById('edit-new-cat-add').addEventListener('click', () => {
    const name = editNewCatInput.value.trim();
    if (!name) return;
    handlers.onEditNewTagAdd?.(name);
  });
  document.getElementById('edit-save').addEventListener('click', () => handlers.onEditSave?.());
  document.getElementById('edit-delete').addEventListener('click', () => handlers.onEditDelete?.());

  document.getElementById('random-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'random-overlay') closeRandomOverlay();
  });
  document.getElementById('random-close').addEventListener('click', closeRandomOverlay);
  document.getElementById('random-cats').addEventListener('click', (e) => {
    const chip = e.target.closest('.cat-chip');
    if (!chip) return;
    handlers.onRandomCatSelect?.(chip.dataset.id || null);
  });
  // 自由入力タグ(⑪): 表示されているのは選択中のものだけなので、クリック=選択解除。
  document.getElementById('random-free-tag-row').addEventListener('click', (e) => {
    const chip = e.target.closest('.cat-chip');
    if (!chip) return;
    handlers.onRandomCatSelect?.(chip.dataset.id || null);
  });
  const randomFreeTagInput = document.getElementById('random-free-tag-input');
  randomFreeTagInput.addEventListener('change', () => handlers.onRandomFreeTagPick?.(randomFreeTagInput.value));
  randomFreeTagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handlers.onRandomFreeTagPick?.(randomFreeTagInput.value);
    }
  });
  document.getElementById('random-rating-row').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="set-min-rating"]');
    if (!btn) return;
    handlers.onRandomRatingSelect?.(Number(btn.dataset.value));
  });
  document.getElementById('random-clear').addEventListener('click', () => handlers.onRandomClear?.());
  document.getElementById('random-confirm').addEventListener('click', () => handlers.onRandomConfirm?.());
  // ランダム表示の結果(レシピ詳細画面と同じレイアウト、編集ボタンを含む)はrenderRandomResultで
  // 動的に生成されるため、固定idではなくdata-actionで委譲する。
  document.getElementById('random-result-content')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'open-original') handlers.onRandomOpen?.();
    if (action === 'edit') handlers.onRandomEdit?.();
    if (action === 'add-to-plan') handlers.onRandomAddToPlan?.();
    if (action === 'again') handlers.onRandomAgain?.();
  });

  setupFreeTagDropdown('filter', (name) => handlers.onFilterFreeTagPick?.(name));
  setupFreeTagDropdown('random', (name) => handlers.onRandomFreeTagPick?.(name));
}

/* ===== 一覧画面 ===== */

export function showState(state) {
  document.getElementById('state-loading').classList.toggle('hidden', state !== 'loading');
  document.getElementById('state-empty').classList.toggle('hidden', state !== 'empty');
  document.getElementById('state-error').classList.toggle('hidden', state !== 'error');
  document.getElementById('recipe-grid').classList.toggle('hidden', state !== 'content');
}

export function setErrorMessage(msg) {
  document.getElementById('state-error-message').textContent = msg;
}

export function renderRecipeGrid(recipes, categoriesById) {
  document.getElementById('recipe-grid').innerHTML = recipes.map((r) => {
    const names = (r.recipe_categories || [])
      .map((rc) => categoriesById.get(rc.category_id)?.name)
      .filter(Boolean);
    const tagsHtml = names.map((n) => `<span class="cat-tag">${escHtml(n)}</span>`).join('');
    return `
      <button class="recipe-card" data-id="${escHtml(r.id)}" type="button">
        <div class="thumb">${thumbHtml(r.image_url)}</div>
        <div class="body">
          <p class="title">${escHtml(r.title || r.url)}</p>
          ${r.rating ? `<div class="rating-stars small">${starsHtml(r.rating, false)}</div>` : ''}
          <div class="cat-tag-row">${tagsHtml}</div>${r.fetch_status === 'failed' ? '<span class="fetch-failed-badge">アーカイブ未取得</span>' : ''}
        </div>
      </button>`;
  }).join('');
}

// 今日の献立(④)。省スペースのため1件だけを右端まで大きく表示し、複数ある場合は
// 「他の献立も見る」リンクを右端に添えて、その日のカレンダー詳細シートへ誘導する。
// urlが付いている項目(レシピ紐付き)だけクリック可能にし、元のページへ直接飛ぶ。
// テキストのみの献立(②)はurlが無いため表示専用にする。
export function renderTodayPlan(entries, todayKey) {
  const list = document.getElementById('today-plan-list');
  if (!list) return;
  if (!entries.length) {
    list.innerHTML = '<p class="today-plan-empty">まだ決まっていません。🎲で決めましょう</p>';
    return;
  }
  const [first, ...rest] = entries;
  const clickable = !!first.url;
  const itemHtml = `
    <button type="button" class="today-plan-item ${clickable ? '' : 'not-clickable'}" ${clickable ? `data-url="${escHtml(first.url)}"` : 'disabled'}>
      <span class="thumb">${thumbHtml(first.image_url)}</span>
      <span class="title">${escHtml(first.title)}</span>
    </button>`;
  const moreHtml = rest.length > 0
    ? `<a class="today-plan-more" href="./calendar.html?date=${escHtml(todayKey)}">他の献立も見る ›</a>`
    : '';
  list.innerHTML = itemHtml + moreHtml;
}

/* ===== 左下メニュー(ログアウト・DB使用容量確認) ===== */

function formatBytes(bytes) {
  if (bytes == null) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = Number(bytes);
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function openMenuOverlay() {
  document.getElementById('menu-overlay').classList.add('open');
}

export function closeMenuOverlay() {
  document.getElementById('menu-overlay').classList.remove('open');
}

export function showMenuStep(step) {
  document.getElementById('menu-step-main').classList.toggle('hidden', step !== 'main');
  document.getElementById('menu-step-usage').classList.toggle('hidden', step !== 'usage');
  document.getElementById('menu-step-stats').classList.toggle('hidden', step !== 'stats');
}

// ヘッダーの「全n品」表示・メニューのバージョン表示。
export function setAppItemCount(count) {
  const el = document.getElementById('app-item-count');
  if (el) el.textContent = `全${count}品`;
}

export function setMenuVersion(version) {
  const el = document.getElementById('menu-version');
  if (el) el.textContent = `バージョン ${version}`;
}

export function showMenuUsageLoading() {
  const el = document.getElementById('menu-usage-content');
  if (el) el.innerHTML = '<div class="loading-state"><span class="spin-emoji">🍳</span></div>';
}

export function showMenuUsageError(message) {
  const el = document.getElementById('menu-usage-content');
  if (el) el.innerHTML = `<p class="cal-empty-note">${escHtml(message)}</p>`;
}

// db_usage_summary()(0011)の結果をそのまま受け取り、テーブル別・Storageバケット別の内訳を表示する。
export function renderUsageSummary(data) {
  const el = document.getElementById('menu-usage-content');
  if (!el) return;
  const tablesHtml = (data.tables || []).map((t) => `
    <div class="usage-row">
      <span class="usage-name">${escHtml(t.name)}</span>
      <span class="usage-sub">${t.row_estimate >= 0 ? `${t.row_estimate}件` : ''}</span>
      <span class="usage-bytes">${formatBytes(t.bytes)}</span>
    </div>`).join('');
  const bucketsHtml = (data.storage_buckets || []).length
    ? data.storage_buckets.map((b) => `
        <div class="usage-row">
          <span class="usage-name">${escHtml(b.bucket_id)}</span>
          <span class="usage-sub">${b.file_count}件</span>
          <span class="usage-bytes">${formatBytes(b.bytes)}</span>
        </div>`).join('')
    : '<p class="cal-empty-note">まだ画像は保存されていません</p>';

  el.innerHTML = `
    <div class="usage-total">
      <span class="usage-total-label">データベース合計</span>
      <span class="usage-total-value">${formatBytes(data.database_bytes)}</span>
    </div>
    <p class="tag-group-label" style="margin-top:18px;">テーブル別内訳</p>
    <div class="usage-list">${tablesHtml}</div>
    <p class="tag-group-label" style="margin-top:18px;">Storageバケット別内訳(アーカイブ画像)</p>
    <div class="usage-list">${bucketsHtml}</div>
    <p class="archive-note" style="margin-top:14px; border-radius:var(--radius-sm);">Supabase無料プランの目安: データベース500MB・Storage 1GB</p>
  `;
}

export function showMenuStatsLoading() {
  const el = document.getElementById('menu-stats-content');
  if (el) el.innerHTML = '<div class="loading-state"><span class="spin-emoji">🍳</span></div>';
}

export function showMenuStatsError(message) {
  const el = document.getElementById('menu-stats-content');
  if (el) el.innerHTML = `<p class="cal-empty-note">${escHtml(message)}</p>`;
}

// api.getStats()の結果(品目総数・献立登録回数ランキング)を表示する。
export function renderMenuStats(stats) {
  const el = document.getElementById('menu-stats-content');
  if (!el) return;
  const rankingHtml = (stats.ranking || []).length
    ? stats.ranking.map((r, i) => `
        <div class="stats-rank-row">
          <span class="stats-rank-no">${i + 1}</span>
          <span class="thumb">${thumbHtml(r.image_url)}</span>
          <span class="title">${escHtml(r.title)}</span>
          <span class="stats-rank-count">${r.count}回</span>
        </div>`).join('')
    : '<p class="cal-empty-note">まだ献立に登録された記録がありません</p>';

  el.innerHTML = `
    <div class="usage-total">
      <span class="usage-total-label">保存レシピ 品目総数</span>
      <span class="usage-total-value">${stats.recipeCount}品</span>
    </div>
    <p class="tag-group-label" style="margin-top:18px;">人気のレシピランキング(献立登録回数順)</p>
    <div class="stats-rank-list">${rankingHtml}</div>
  `;
}

/* ===== フィルタ ===== */

export function openFilterOverlay() {
  document.getElementById('filter-overlay').classList.add('open');
}

export function closeFilterOverlay() {
  document.getElementById('filter-overlay').classList.remove('open');
}

// 自由入力は下のrenderFreeTagPickerで別途扱うため、ここでは固定3グループのみ描画する(⑪)。
export function renderFilterGroups(categories, activeIds) {
  document.getElementById('filter-cat-groups').innerHTML = groupedCatGroupsHtml(categories, activeIds, { includeFree: false });
}

// containerIdを指定できる汎用版。献立カレンダーの日別フィルタ(⑦)など、
// フィルタ画面以外の場所でも同じグループ分けチップUIを再利用するために切り出したもの。
export function renderCatGroups(containerId, categories, activeIds, opts) {
  document.getElementById(containerId).innerHTML = groupedCatGroupsHtml(categories, activeIds, opts);
}

// フィルタ系画面(フィルタ・今日は何作る・カレンダー日別フィルタ)共通の自由入力タグ選択欄(⑪)。
// テキスト入力+datalist(候補一覧)を一体化した1つのコンボボックスとして扱う(①: 従来のselectは廃止)。
// 「選択中のタグだけをチップ表示」+「既存タグ名を候補にしたdatalist入力」の組み合わせ。
// prefixは各画面のDOM id接頭辞("filter" / "random" / "day-filter")。
// keywords(①: フィルタ画面のみ使用)は、既存タグ名と一致しなかった自由入力語を料理名の部分一致検索として
// チップ表示するためのオプション配列。
export function renderFreeTagPicker(prefix, categories, activeIds, keywords) {
  const freeCats = categories.filter((c) => !c.group_key);
  const activeChips = freeCats.filter((c) => activeIds.has(c.id));
  const row = document.getElementById(`${prefix}-free-tag-row`);
  if (row) {
    const tagChipsHtml = activeChips
      .map((c) => `<button type="button" class="cat-chip active" data-id="${escHtml(c.id)}">${escHtml(c.name)}</button>`)
      .join('');
    const keywordChipsHtml = (keywords || [])
      .map((k) => `<button type="button" class="cat-chip active keyword-chip" data-keyword="${escHtml(k)}">🔍 ${escHtml(k)}</button>`)
      .join('');
    row.innerHTML = tagChipsHtml + keywordChipsHtml;
  }
  const suggestions = document.getElementById(`${prefix}-free-tag-suggestions`);
  if (suggestions) {
    suggestions.innerHTML = freeCats.map((c) => `<option value="${escHtml(c.name)}"></option>`).join('');
  }
}

// 自由入力欄のドロップダウン(datalistはiOS Safari等で見た目のプルダウンが出ないことがあるため、
// 同じ欄でクリック/入力するとタグ候補が開く自前のドロップダウンを併設する)。
// prefixは各画面のDOM id接頭辞("filter" / "random" / "day-filter")。onPickはEnter確定時と同じ処理。
// 画面(index.html/calendar.html)側に `${prefix}-free-tag-dropdown` の空divを用意しておく必要がある。
const freeTagDropdownWired = new Set();
export function setupFreeTagDropdown(prefix, onPick) {
  if (freeTagDropdownWired.has(prefix)) return; // 二重初期化ガード(day-filterは検索/ランダムどちらでも同じ欄を使う)
  const input = document.getElementById(`${prefix}-free-tag-input`);
  const suggestions = document.getElementById(`${prefix}-free-tag-suggestions`);
  const dropdown = document.getElementById(`${prefix}-free-tag-dropdown`);
  if (!input || !suggestions || !dropdown) return;
  freeTagDropdownWired.add(prefix);

  function renderOptions() {
    const q = input.value.trim().toLowerCase();
    const names = [...suggestions.options]
      .map((o) => o.value)
      .filter((n) => !q || n.toLowerCase().includes(q))
      .slice(0, 8);
    if (names.length === 0) {
      dropdown.classList.add('hidden');
      dropdown.innerHTML = '';
      return;
    }
    dropdown.innerHTML = names.map((n) => `<button type="button" class="combo-option">${escHtml(n)}</button>`).join('');
    dropdown.classList.remove('hidden');
  }

  input.addEventListener('focus', renderOptions);
  input.addEventListener('input', renderOptions);
  // クリック確定はmousedownで行う(clickだと先にinputのblurが発火してドロップダウンが閉じてしまうため)。
  dropdown.addEventListener('mousedown', (e) => {
    const opt = e.target.closest('.combo-option');
    if (!opt) return;
    e.preventDefault();
    const value = opt.textContent;
    input.value = value;
    dropdown.classList.add('hidden');
    onPick(value);
  });
  input.addEventListener('blur', () => {
    setTimeout(() => dropdown.classList.add('hidden'), 120);
  });
}

export function renderRatingRow(containerId, minRating) {
  document.getElementById(containerId).innerHTML = ratingRowHtml(minRating);
}

export function renderSortRow(containerId, activeValue) {
  document.getElementById(containerId).innerHTML = sortRowHtml(activeValue);
}

export function updateFilterBadge(count) {
  const el = document.getElementById('filter-badge');
  el.textContent = String(count);
  el.classList.toggle('hidden', count <= 0);
}

/* ===== レシピ詳細 ===== */

export function openDetail() {
  document.getElementById('detail-overlay').classList.add('open');
}

export function closeDetail() {
  document.getElementById('detail-overlay').classList.remove('open');
  const wrap = document.getElementById('archive-frame-wrap');
  if (wrap) wrap.innerHTML = '';
}

export function showDetailLoading() {
  document.getElementById('detail-content').innerHTML = '<div class="loading-state"><span class="spin-emoji">🍳</span></div>';
}

// アーカイブトグル(③)の見た目。activeなら「保持する」設定であることが分かるスイッチ風の表示にする。
const ARCHIVE_ICON = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9"/><line x1="10" y1="13" x2="14" y2="13"/></svg>`;
function archiveToggleHtml(enabled) {
  return `
    <button type="button" class="archive-toggle-btn ${enabled ? 'active' : ''}" data-action="toggle-archive" aria-pressed="${!!enabled}" title="リンク切れに備えてページのアーカイブを保存する">
      ${ARCHIVE_ICON}<span>アーカイブ${enabled ? 'あり' : 'なし'}</span>
    </button>`;
}

// レシピ詳細・ランダム表示結果で共通の情報表示(サムネイル・タイトル・評価・タグ・URL・メモ)。
// アーカイブトグルは詳細画面専用(showArchiveToggle=trueの時のみ)。
function recipeBodyHtml(recipe, categoryNames, { showArchiveToggle = false, dateStr } = {}) {
  const tagsHtml = (categoryNames || []).map((n) => `<span class="cat-tag">${escHtml(n)}</span>`).join('');
  return `
    <div class="detail-thumb" data-action="open-original" role="button" aria-label="レシピを見る">${thumbHtml(recipe.image_url)}</div>
    <h2 class="detail-title">${escHtml(recipe.title || recipe.url)}</h2>
    <div class="detail-rating-row">
      <div class="rating-stars lg">${starsHtml(recipe.rating, false)}</div>
      ${showArchiveToggle ? archiveToggleHtml(recipe.archive_enabled) : ''}
    </div>
    <div class="detail-meta">
      ${tagsHtml}
      ${dateStr ? `<span style="font-size:12px; color:var(--text-2);">${escHtml(dateStr)} 保存</span>` : ''}
    </div>
    <p class="detail-url">${escHtml(recipe.url)}</p>
    ${recipe.memo ? `<div class="detail-memo">${escHtml(recipe.memo)}</div>` : ''}
  `;
}

// 編集/レシピを見る/献立に追加の3ボタン行(詳細画面・ランダム結果で共通)。
function recipeActionsHtml() {
  return `
    <div class="btn-row">
      <button class="btn btn-secondary" data-action="edit" type="button">編集</button>
      <button class="btn btn-secondary" data-action="open-original" type="button">レシピを見る</button>
      <button class="btn btn-primary" data-action="add-to-plan" type="button">献立に追加</button>
    </div>`;
}

export function renderDetail(recipe, categoryNames) {
  const dateStr = recipe.created_at ? new Date(recipe.created_at).toLocaleDateString('ja-JP') : '';
  document.getElementById('detail-content').innerHTML = `
    ${recipeBodyHtml(recipe, categoryNames, { showArchiveToggle: true, dateStr })}
    <div class="detail-actions">${recipeActionsHtml()}</div>
    <div id="archive-frame-wrap" class="archive-frame-wrap hidden"></div>
  `;
}

// アーカイブ取得中(トグルON時、Edge Functionでの再取得を待っている間)はボタンを無効化する(③)。
export function setArchiveToggleBusy(isBusy) {
  const btn = document.querySelector('#detail-content .archive-toggle-btn');
  if (!btn) return;
  btn.disabled = isBusy;
  btn.classList.toggle('busy', isBusy);
}

/* ===== 献立に追加(日付選択) ===== */

const MEALPLAN_WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

// 日付欄はネイティブUIなので曜日を表示できない。入力欄の下に「(月)」等を別途添える。
function updateMealPlanDateWeekday() {
  const input = document.getElementById('mealplan-date-input');
  const label = document.getElementById('mealplan-date-weekday');
  if (!input || !label) return;
  if (!input.value) {
    label.textContent = '';
    return;
  }
  const [y, m, d] = input.value.split('-').map(Number);
  const wd = MEALPLAN_WEEKDAY_JA[new Date(y, m - 1, d).getDay()];
  label.textContent = `${y}/${m}/${d}(${wd})`;
}

export function openMealPlanAddOverlay(defaultDateKey) {
  const input = document.getElementById('mealplan-date-input');
  if (defaultDateKey) input.value = defaultDateKey;
  updateMealPlanDateWeekday();
  document.getElementById('mealplan-add-overlay').classList.add('open');
}

export function closeMealPlanAddOverlay() {
  document.getElementById('mealplan-add-overlay').classList.remove('open');
}

/* ===== レシピ編集(タグ・評価) ===== */

export function openEditOverlay() {
  document.getElementById('edit-overlay').classList.add('open');
}

export function closeEditOverlay() {
  document.getElementById('edit-overlay').classList.remove('open');
}

// 固定3グループ(ジャンル/料理区分/メイン)は従来通り全候補をチップ表示。
// 自由入力は「もともと付与されているタグだけ」をチップ表示する(⑨)。新規追加はedit-new-cat-*で行う。
export function renderEditGroups(categories, activeIds) {
  document.getElementById('edit-cat-groups').innerHTML = groupedCatGroupsHtml(categories, activeIds, { includeFree: false });
  const freeChips = categories.filter((c) => !c.group_key && activeIds.has(c.id));
  document.getElementById('edit-free-tag-row').innerHTML = freeChips
    .map((c) => `<button type="button" class="cat-chip active" data-id="${escHtml(c.id)}">${escHtml(c.name)}</button>`)
    .join('');
}

// 自由入力タグの新規追加欄(datalist)の候補を、既存の自由入力タグ名で埋める。
export function renderEditFreeTagSuggestions(categories) {
  const list = document.getElementById('edit-free-tag-suggestions');
  if (!list) return;
  list.innerHTML = categories.filter((c) => !c.group_key).map((c) => `<option value="${escHtml(c.name)}"></option>`).join('');
}

// 編集シートを開くたびに、前回開いたときの入力状態(タグ追加欄が開いたまま等)を初期状態に戻す。
export function resetEditNewTagRow() {
  document.getElementById('edit-new-cat-input').value = '';
  document.getElementById('edit-new-cat-row').classList.add('hidden');
  document.getElementById('edit-new-cat-toggle-wrap').classList.remove('hidden');
}

export function renderEditRating(rating) {
  document.getElementById('edit-rating-row').innerHTML = starsHtml(rating, true);
}

export function setEditSaving(isSaving) {
  const btn = document.getElementById('edit-save');
  btn.disabled = isSaving;
  btn.textContent = isSaving ? '保存中…' : '保存する';
}

// 「元のレシピを見る」の遷移先が生きていない場合(③)に、非同期の判定結果を受けて自動で表示する。
// 手動での開閉トグルは持たず、リンク切れと判定された時だけ呼ばれる想定。
export function showArchiveFallback(rawHtml) {
  const wrap = document.getElementById('archive-frame-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="archive-note">元のサイトにアクセスできないようです。保存時点のアーカイブを表示しています(レイアウトや画像が元サイトと異なる場合があります)</div>';
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', '');
  iframe.srcdoc = rawHtml;
  wrap.appendChild(iframe);
  wrap.classList.remove('hidden');
}

/* ===== 今日は何作る ===== */

export function openRandomOverlay() {
  document.getElementById('random-overlay').classList.add('open');
}

export function closeRandomOverlay() {
  document.getElementById('random-overlay').classList.remove('open');
}

export function renderRandomCats(categories, activeIds) {
  document.getElementById('random-cats').innerHTML = groupedCatGroupsHtml(categories, activeIds, { includeFree: false });
}

export function showRandomStep(step) {
  ['pick', 'loading', 'empty', 'result'].forEach((s) => {
    document.getElementById(`random-step-${s}`).classList.toggle('hidden', s !== step);
  });
}

// ランダム表示の結果(レシピ詳細画面と同じレイアウト)。編集/レシピを見る/献立に追加の下に
// 「もう一回」を配置する。ホーム(random-result-content)・カレンダーの日別ランダム追加
// (day-random-content)のどちらからも同じ関数を使う。
export function renderRandomResult(containerId, recipe, categoryNames) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    ${recipeBodyHtml(recipe, categoryNames)}
    ${recipeActionsHtml()}
    <button class="btn btn-secondary" data-action="again" type="button" style="margin-top:10px;">もう一回</button>
  `;
}

/* ===== トースト ===== */

let toastTimer = null;
export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}
