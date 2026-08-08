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

// activeIds: 選択中カテゴリIDのSet(複数選択可)。空集合のときは「すべて」がアクティブ。
function catChipsHtml(categories, activeIds) {
  const all = `<button class="cat-chip ${activeIds.size === 0 ? 'active' : ''}" data-id="">すべて</button>`;
  const rest = categories
    .map((c) => `<button class="cat-chip ${activeIds.has(c.id) ? 'active' : ''}" data-id="${escHtml(c.id)}">${escHtml(c.name)}</button>`)
    .join('');
  return all + rest;
}

let handlers = {};

export function initUI(h) {
  handlers = h;

  document.getElementById('category-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.cat-chip');
    if (!btn) return;
    handlers.onSelectCategory?.(btn.dataset.id || null);
  });

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
    if (action === 'toggle-archive') handlers.onDetailToggleArchive?.();
    if (action === 'delete') handlers.onDetailDelete?.();
  });

  document.getElementById('random-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'random-overlay') closeRandomOverlay();
  });
  document.getElementById('random-close').addEventListener('click', closeRandomOverlay);
  document.getElementById('random-cats').addEventListener('click', (e) => {
    const chip = e.target.closest('.cat-chip');
    if (!chip) return;
    handlers.onRandomCatSelect?.(chip.dataset.id || null);
  });
  document.getElementById('random-confirm').addEventListener('click', () => handlers.onRandomConfirm?.());
  document.getElementById('random-again').addEventListener('click', () => handlers.onRandomAgain?.());
  document.getElementById('random-open').addEventListener('click', () => handlers.onRandomOpen?.());
}

/* ===== 一覧画面 ===== */

export function renderCategoryTabs(categories, activeId) {
  document.getElementById('category-tabs').innerHTML = catChipsHtml(categories, activeId);
}

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
          <div class="cat-tag-row">${tagsHtml}</div>${r.fetch_status === 'failed' ? '<span class="fetch-failed-badge">アーカイブ未取得</span>' : ''}
        </div>
      </button>`;
  }).join('');
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
  const archiveButton = recipe.raw_html
    ? '<button class="btn btn-secondary" data-action="toggle-archive" type="button">アーカイブを見る</button>'
    : `<p style="font-size:12px; color:var(--text-3); text-align:center; margin:4px 0 0;">${
        recipe.fetch_status === 'failed' ? 'アーカイブの取得に失敗しています(URLは保存済みです)' : 'アーカイブは保存されていません'
      }</p>`;
  const tagsHtml = (categoryNames || []).map((n) => `<span class="cat-tag">${escHtml(n)}</span>`).join('');

  document.getElementById('detail-content').innerHTML = `
    <div class="detail-thumb">${thumbHtml(recipe.image_url)}</div>
    <h2 class="detail-title">${escHtml(recipe.title || recipe.url)}</h2>
    <div class="detail-meta">
      ${tagsHtml}
      ${dateStr ? `<span style="font-size:12px; color:var(--text-2);">${escHtml(dateStr)} 保存</span>` : ''}
    </div>
    <p class="detail-url">${escHtml(recipe.url)}</p>
    ${recipe.memo ? `<div class="detail-memo">${escHtml(recipe.memo)}</div>` : ''}
    <div class="detail-actions">
      <button class="btn btn-primary" data-action="open-original" type="button">元のレシピを見る</button>
      ${archiveButton}
      <button class="btn btn-danger" data-action="delete" type="button">削除</button>
    </div>
    <div id="archive-frame-wrap" class="archive-frame-wrap hidden"></div>
  `;
}

export function toggleArchiveView(rawHtml) {
  const wrap = document.getElementById('archive-frame-wrap');
  if (!wrap) return;
  if (!wrap.classList.contains('hidden')) {
    wrap.classList.add('hidden');
    wrap.innerHTML = '';
    return;
  }
  wrap.innerHTML = '<div class="archive-note">保存時点のページを表示しています(レイアウトや画像が元サイトと異なる場合があります)</div>';
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

export function renderRandomCats(categories, activeId) {
  document.getElementById('random-cats').innerHTML = catChipsHtml(categories, activeId);
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
