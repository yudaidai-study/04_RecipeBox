import { initAuth } from './auth.js';
import * as api from './api.js';

const form = document.getElementById('add-form');
const urlInput = document.getElementById('url-input');
const memoInput = document.getElementById('memo-input');
const errorBox = document.getElementById('add-error');
const saveBtn = document.getElementById('save-btn');
const prefillNote = document.getElementById('prefill-note');
const saveDone = document.getElementById('save-done');
const saveDoneNote = document.getElementById('save-done-note');

const tagPicker = document.getElementById('tag-picker');
const freeTagRow = document.getElementById('free-tag-row');

const newCatToggle = document.getElementById('new-cat-toggle');
const newCatToggleWrap = document.getElementById('new-cat-toggle-wrap');
const newCatRow = document.getElementById('new-cat-row');
const newCatInput = document.getElementById('new-cat-input');
const newCatAdd = document.getElementById('new-cat-add');

const saveAgainBtn = document.getElementById('save-again-btn');
const ratingPicker = document.getElementById('rating-picker');

const selectedCategoryIds = new Set();
let selectedRating = null;

function prefillFromQuery() {
  const params = new URLSearchParams(location.search);
  const url = params.get('url');
  if (url) {
    urlInput.value = url;
    prefillNote.classList.remove('hidden');
  }
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.add('show');
}

function clearError() {
  errorBox.textContent = '';
  errorBox.classList.remove('show');
}

function tagChip(cat) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cat-chip';
  btn.dataset.id = cat.id;
  btn.textContent = cat.name;
  return btn;
}

// 自由入力タグの一覧は読み込まない: この画面で新しく追加したタグだけをfreeTagRowに表示する(④)。
async function loadCategoriesIntoPicker() {
  try {
    const categories = await api.listCategories();
    for (const cat of categories) {
      if (!cat.group_key) continue;
      const row = tagPicker.querySelector(`.tag-row[data-group="${cat.group_key}"]`);
      row?.appendChild(tagChip(cat));
    }
  } catch (err) {
    console.error(err);
    showError('カテゴリの読み込みに失敗しました');
  }
}

function renderRatingPicker() {
  let html = '';
  for (let n = 1; n <= 5; n++) {
    html += `<button type="button" class="star-btn ${n <= (selectedRating || 0) ? 'filled' : ''}" data-value="${n}" aria-label="${n}つ星">★</button>`;
  }
  ratingPicker.innerHTML = html;
}

ratingPicker.addEventListener('click', (e) => {
  const btn = e.target.closest('.star-btn');
  if (!btn) return;
  const value = Number(btn.dataset.value);
  selectedRating = selectedRating === value ? null : value; // 同じ星を再タップで評価解除
  renderRatingPicker();
});

tagPicker.addEventListener('click', (e) => {
  const chip = e.target.closest('.cat-chip');
  if (!chip) return;
  const id = chip.dataset.id;
  if (selectedCategoryIds.has(id)) {
    selectedCategoryIds.delete(id);
    chip.classList.remove('active');
  } else {
    selectedCategoryIds.add(id);
    chip.classList.add('active');
  }
});

newCatToggle.addEventListener('click', () => {
  newCatToggleWrap.classList.add('hidden');
  newCatRow.classList.remove('hidden');
  newCatInput.focus();
});

newCatAdd.addEventListener('click', async () => {
  const name = newCatInput.value.trim();
  if (!name) return;
  newCatAdd.disabled = true;
  try {
    const cat = await api.createCategory(name);
    // 既存の同名タグが既にどこかのグループに表示されている場合は重複追加しない
    if (!tagPicker.querySelector(`.cat-chip[data-id="${cat.id}"]`)) {
      freeTagRow.appendChild(tagChip(cat));
    }
    const chip = tagPicker.querySelector(`.cat-chip[data-id="${cat.id}"]`);
    if (chip && !selectedCategoryIds.has(cat.id)) {
      selectedCategoryIds.add(cat.id);
      chip.classList.add('active');
    }
    newCatInput.value = '';
    newCatRow.classList.add('hidden');
    newCatToggleWrap.classList.remove('hidden');
  } catch (err) {
    console.error(err);
    showError('カテゴリの追加に失敗しました');
  } finally {
    newCatAdd.disabled = false;
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();

  const url = urlInput.value.trim();
  if (!url) return;

  saveBtn.disabled = true;
  saveBtn.textContent = '保存中…';

  try {
    const recipe = await api.saveRecipe({
      url,
      categoryIds: [...selectedCategoryIds],
      memo: memoInput.value.trim(),
      rating: selectedRating,
    });
    form.classList.add('hidden');
    prefillNote.classList.add('hidden');
    saveDoneNote.textContent =
      recipe.fetch_status === 'failed'
        ? '保存しました(ページの取得には失敗しましたが、URLは保存されています)。このタブは閉じて大丈夫です。'
        : 'このタブは閉じて大丈夫です。';
    saveDone.classList.remove('hidden');
  } catch (err) {
    console.error(err);
    showError(err.message || '保存に失敗しました。');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '保存する';
  }
});

saveAgainBtn.addEventListener('click', () => {
  form.reset();
  clearError();
  selectedCategoryIds.clear();
  tagPicker.querySelectorAll('.cat-chip.active').forEach((c) => c.classList.remove('active'));
  selectedRating = null;
  renderRatingPicker();
  prefillNote.classList.add('hidden');
  saveDone.classList.add('hidden');
  form.classList.remove('hidden');
  urlInput.focus();
});

function init() {
  renderRatingPicker();
  prefillFromQuery();
  initAuth(() => {
    loadCategoriesIntoPicker();
  });
}

init();
