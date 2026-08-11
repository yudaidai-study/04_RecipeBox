import { initAuth } from './auth.js';
import * as api from './api.js';
import * as ui from './ui.js';

const form = document.getElementById('add-form');
const urlInput = document.getElementById('url-input');
const memoInput = document.getElementById('memo-input');
const errorBox = document.getElementById('add-error');
const saveBtn = document.getElementById('save-btn');
const prefillNote = document.getElementById('prefill-note');
const prefillCheckLoading = document.getElementById('prefill-check-loading');
const saveDone = document.getElementById('save-done');
const saveDoneEmoji = document.getElementById('save-done-emoji');
const saveDoneTitle = document.getElementById('save-done-title');
const saveDoneNote = document.getElementById('save-done-note');

const tagPicker = document.getElementById('tag-picker');
const freeTagRow = document.getElementById('free-tag-row');
const freeTagSuggestions = document.getElementById('add-free-tag-suggestions');

const newCatRow = document.getElementById('new-cat-row');
const newCatInput = document.getElementById('add-free-tag-input');
const newCatAdd = document.getElementById('new-cat-add');

const saveAgainBtn = document.getElementById('save-again-btn');
const ratingPicker = document.getElementById('rating-picker');

const selectedCategoryIds = new Set();
let selectedRating = null;
// 自由入力タグの予測変換(datalist)用に、画面には出さず全件だけ保持しておく。
let allFreeCategories = [];

function prefillFromQuery() {
  const params = new URLSearchParams(location.search);
  const url = params.get('url');
  if (url) {
    urlInput.value = url;
  }
  return url;
}

// 共有メニューから既に登録済みのURLが渡された場合(①)、フォームを見せずに
// そのまま「すでに登録されています」画面へ遷移する。それ以外(URL未入力/新規URL)は
// 通常どおりフォームを表示し、重複判定は保存ボタン押下時(saveRecipe内)に任せる。
async function checkPrefillDuplicate(url) {
  try {
    const existing = await api.findRecipeByUrl(url);
    if (existing) {
      prefillCheckLoading.classList.add('hidden');
      showCompletionScreen({
        emoji: '📌',
        title: 'すでに登録されています',
        note: `「${existing.title || existing.url}」はすでに保存済みです。このタブは閉じて大丈夫です。`,
      });
      return;
    }
  } catch (err) {
    console.error(err);
    // 判定に失敗した場合は通常どおりフォームを表示し、保存時のサーバー側チェックに任せる
  }
  prefillCheckLoading.classList.add('hidden');
  prefillNote.classList.remove('hidden');
  form.classList.remove('hidden');
  loadCategoriesIntoPicker();
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

// 自由入力タグはチップとして一覧表示しない(④): この画面で新しく追加したタグだけをfreeTagRowに表示する。
// 既存の自由入力タグ名は、新規タグ入力欄の予測変換(datalist)候補としてのみ使う(⑨)。
async function loadCategoriesIntoPicker() {
  try {
    const categories = await api.listCategories();
    for (const cat of categories) {
      if (cat.group_key) {
        const row = tagPicker.querySelector(`.tag-row[data-group="${cat.group_key}"]`);
        row?.appendChild(tagChip(cat));
      } else {
        allFreeCategories.push(cat);
      }
    }
    renderFreeTagSuggestions();
    ui.setFreeTagCategories('add', allFreeCategories);
    ui.renderGojuonRow('add');
  } catch (err) {
    console.error(err);
    showError('カテゴリの読み込みに失敗しました');
  }
}

function renderFreeTagSuggestions() {
  freeTagSuggestions.innerHTML = '';
  for (const cat of allFreeCategories) {
    const opt = document.createElement('option');
    opt.value = cat.name;
    freeTagSuggestions.appendChild(opt);
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

// プルダウン(datalist)候補を選んだ後や既存タグ名を入力した後、Enterでそのまま追加できるように。
newCatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    newCatAdd.click();
  }
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
    // 新規作成した自由入力タグは、以降の予測変換候補にも加える
    if (!allFreeCategories.some((c) => c.id === cat.id)) {
      allFreeCategories.push(cat);
      renderFreeTagSuggestions();
    }
    const chip = tagPicker.querySelector(`.cat-chip[data-id="${cat.id}"]`);
    if (chip && !selectedCategoryIds.has(cat.id)) {
      selectedCategoryIds.add(cat.id);
      chip.classList.add('active');
    }
    newCatInput.value = '';
  } catch (err) {
    console.error(err);
    showError('カテゴリの追加に失敗しました');
  } finally {
    newCatAdd.disabled = false;
  }
});

// 保存成功/重複いずれの場合も同じ完了画面(絵文字・見出し・説明文とボタン行)を使い回す(⑩)。
function showCompletionScreen({ emoji, title, note }) {
  form.classList.add('hidden');
  prefillNote.classList.add('hidden');
  saveDoneEmoji.textContent = emoji;
  saveDoneTitle.textContent = title;
  saveDoneNote.textContent = note;
  saveDone.classList.remove('hidden');
}

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
    showCompletionScreen({
      emoji: '✅',
      title: '保存しました',
      note: recipe.fetch_status === 'failed'
        ? '保存しました(ページの取得には失敗しましたが、URLは保存されています)。このタブは閉じて大丈夫です。'
        : 'このタブは閉じて大丈夫です。',
    });
  } catch (err) {
    console.error(err);
    if (err.code === 'duplicate') {
      showCompletionScreen({
        emoji: '📌',
        title: 'すでに登録されています',
        note: `「${err.recipe?.title || url}」はすでに保存済みです。このタブは閉じて大丈夫です。`,
      });
    } else {
      showError(err.message || '保存に失敗しました。');
    }
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

// 五十音インデックス(⑭)込みのタグ候補ドロップダウンは、検索・ランダム画面と同じ共通コンポーネントを使う。
ui.setupFreeTagDropdown('add', (name) => {
  newCatInput.value = name;
  newCatAdd.click();
});

function init() {
  renderRatingPicker();
  const prefillUrl = prefillFromQuery();
  if (prefillUrl) {
    // 判定が終わるまでフォームを見せない(ログイン画面の裏でチラつくのを防ぐため、authの結果を待つ前に隠す)
    form.classList.add('hidden');
    prefillCheckLoading.classList.remove('hidden');
  }
  initAuth(() => {
    if (prefillUrl) {
      checkPrefillDuplicate(prefillUrl);
    } else {
      loadCategoriesIntoPicker();
    }
  });
}

init();
