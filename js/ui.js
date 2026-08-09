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

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
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
  // 自由入力タグ(⑪): 表示されているのは選択中のものだけなので、クリック=選択解除。
  document.getElementById('filter-free-tag-row').addEventListener('click', (e) => {
    const chip = e.target.closest('.cat-chip');
    if (!chip) return;
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
  document.getElementById('filter-clear').addEventListener('click', () => handlers.onFilterClear?.());
  document.getElementById('filter-apply').addEventListener('click', () => handlers.onFilterApply?.());

  document.getElementById('recipe-grid').addEventListener('click', (e) => {
    const card = e.target.closest('.recipe-card');
    if (!card) return;
    handlers.onCardClick?.(card.dataset.id);
  });

  document.getElementById('retry-btn').addEventListener('click', () => handlers.onRetry?.());
  document.getElementById('today-cta').addEventListener('click', () => handlers.onTodayCta?.());
  document.getElementById('logout-btn')?.addEventListener('click', () => handlers.onLogout?.());

  document.getElementById('detail-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'detail-overlay') closeDetail();
  });
  document.getElementById('detail-close').addEventListener('click', closeDetail);
  document.getElementById('detail-content').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'open-original') handlers.onDetailOpenOriginal?.();
    if (action === 'delete') handlers.onDetailDelete?.();
    if (action === 'edit') handlers.onDetailEdit?.();
    if (action === 'add-to-plan') handlers.onDetailAddToPlan?.();
  });

  document.getElementById('mealplan-add-close').addEventListener('click', () => handlers.onMealPlanAddClose?.());
  document.getElementById('mealplan-add-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'mealplan-add-overlay') handlers.onMealPlanAddClose?.();
  });
  document.getElementById('mealplan-add-confirm').addEventListener('click', () => {
    const dateValue = document.getElementById('mealplan-date-input').value;
    handlers.onMealPlanAddConfirm?.(dateValue);
  });

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
  document.getElementById('random-again').addEventListener('click', () => handlers.onRandomAgain?.());
  document.getElementById('random-open').addEventListener('click', () => handlers.onRandomOpen?.());
  document.getElementById('random-add-to-plan').addEventListener('click', () => handlers.onRandomAddToPlan?.());
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
// 「選択中のタグだけをチップ表示」+「既存タグ名のみを候補にしたdatalist入力」の組み合わせ。
// prefixは各画面のDOM id接頭辞("filter" / "random" / "day-filter")。
export function renderFreeTagPicker(prefix, categories, activeIds) {
  const freeCats = categories.filter((c) => !c.group_key);
  const activeChips = freeCats.filter((c) => activeIds.has(c.id));
  const row = document.getElementById(`${prefix}-free-tag-row`);
  if (row) {
    row.innerHTML = activeChips
      .map((c) => `<button type="button" class="cat-chip active" data-id="${escHtml(c.id)}">${escHtml(c.name)}</button>`)
      .join('');
  }
  const suggestions = document.getElementById(`${prefix}-free-tag-suggestions`);
  if (suggestions) {
    suggestions.innerHTML = freeCats.map((c) => `<option value="${escHtml(c.name)}"></option>`).join('');
  }
}

export function renderRatingRow(containerId, minRating) {
  document.getElementById(containerId).innerHTML = ratingRowHtml(minRating);
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

export function renderDetail(recipe, categoryNames) {
  const dateStr = recipe.created_at ? new Date(recipe.created_at).toLocaleDateString('ja-JP') : '';
  const tagsHtml = (categoryNames || []).map((n) => `<span class="cat-tag">${escHtml(n)}</span>`).join('');
  const sizeStr = recipe.raw_html ? formatBytes(new TextEncoder().encode(recipe.raw_html).length) : '';

  document.getElementById('detail-content').innerHTML = `
    <div class="detail-thumb">${thumbHtml(recipe.image_url)}</div>
    <h2 class="detail-title">${escHtml(recipe.title || recipe.url)}</h2>
    <div class="rating-stars lg">${starsHtml(recipe.rating, false)}</div>
    <div class="detail-meta">
      ${tagsHtml}
      ${dateStr ? `<span style="font-size:12px; color:var(--text-2);">${escHtml(dateStr)} 保存${sizeStr ? ` ・ ${escHtml(sizeStr)}` : ''}</span>` : ''}
    </div>
    <p class="detail-url">${escHtml(recipe.url)}</p>
    ${recipe.memo ? `<div class="detail-memo">${escHtml(recipe.memo)}</div>` : ''}
    <div class="detail-actions">
      <button class="btn btn-primary" data-action="open-original" type="button">レシピを見る</button>
      <button class="btn btn-secondary" data-action="edit" type="button">編集</button>
      <button class="btn btn-secondary" data-action="add-to-plan" type="button">献立に追加</button>
      <button class="btn btn-danger" data-action="delete" type="button">削除</button>
    </div>
    <div id="archive-frame-wrap" class="archive-frame-wrap hidden"></div>
  `;
}

/* ===== 献立に追加(日付選択) ===== */

export function openMealPlanAddOverlay(defaultDateKey) {
  const input = document.getElementById('mealplan-date-input');
  if (defaultDateKey) input.value = defaultDateKey;
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

export function renderRandomResult(recipe) {
  document.getElementById('random-result-content').innerHTML = `
    <div class="reveal-card">
      <div class="thumb">${thumbHtml(recipe.image_url)}</div>
      <div class="body"><p class="title">${escHtml(recipe.title || recipe.url)}</p></div>
    </div>`;
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
