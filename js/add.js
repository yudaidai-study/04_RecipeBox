import { initAuth } from './auth.js';
import * as api from './api.js';

const form = document.getElementById('add-form');
const urlInput = document.getElementById('url-input');
const categorySelect = document.getElementById('category-select');
const memoInput = document.getElementById('memo-input');
const errorBox = document.getElementById('add-error');
const saveBtn = document.getElementById('save-btn');
const prefillNote = document.getElementById('prefill-note');
const saveDone = document.getElementById('save-done');
const saveDoneNote = document.getElementById('save-done-note');

const newCatToggle = document.getElementById('new-cat-toggle');
const newCatToggleWrap = document.getElementById('new-cat-toggle-wrap');
const newCatRow = document.getElementById('new-cat-row');
const newCatInput = document.getElementById('new-cat-input');
const newCatAdd = document.getElementById('new-cat-add');

const saveAgainBtn = document.getElementById('save-again-btn');

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

async function loadCategoriesIntoSelect() {
  try {
    const categories = await api.listCategories();
    for (const c of categories) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      categorySelect.appendChild(opt);
    }
  } catch (err) {
    console.error(err);
  }
}

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
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    categorySelect.appendChild(opt);
    categorySelect.value = cat.id;
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
      categoryId: categorySelect.value || null,
      memo: memoInput.value.trim(),
    });
    form.classList.add('hidden');
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
  prefillNote.classList.add('hidden');
  saveDone.classList.add('hidden');
  form.classList.remove('hidden');
  urlInput.focus();
});

function init() {
  prefillFromQuery();
  initAuth(() => {
    loadCategoriesIntoSelect();
  });
}

init();
