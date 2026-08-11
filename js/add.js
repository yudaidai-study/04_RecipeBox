import { initAuth } from './auth.js';
import * as api from './api.js';
import * as ui from './ui.js';

const form = document.getElementById('add-form');
const urlInput = document.getElementById('url-input');
const errorBox = document.getElementById('add-error');
const saveBtn = document.getElementById('save-btn');
const prefillNote = document.getElementById('prefill-note');
const prefillCheckLoading = document.getElementById('prefill-check-loading');
const saveDone = document.getElementById('save-done');
const saveDoneEmoji = document.getElementById('save-done-emoji');
const saveDoneTitle = document.getElementById('save-done-title');
const saveDoneNote = document.getElementById('save-done-note');
const saveCloseBtn = document.getElementById('save-close-btn');

// 評価・カテゴリ・タグ追加・メモは、検索・ランダム・編集画面と全く同じ骨格(⑰)を
// renderFieldListで組み立てる。追加画面が他と違うのはメモ欄がある点と並び順欄がない点だけ。
ui.renderFieldList('add-field-list', 'add', {
  tagLabel: 'タグ追加',
  showAddButton: true,
  includeMemo: true,
  memoLabel: 'メモ(任意)',
});

const catGroups = document.getElementById('add-cat-groups');
const freeTagRow = document.getElementById('add-free-tag-row');
const ratingRow = document.getElementById('add-rating-row');
const newCatInput = document.getElementById('add-free-tag-input');
const newCatAdd = document.getElementById('add-free-tag-add');
const memoInput = document.getElementById('add-memo-input');

const selectedCategoryIds = new Set();
let selectedRating = null;
// 編集画面のstate.categoriesに相当。カテゴリ一覧全体(固定3グループ+自由入力タグ)を保持し、
// renderCatGroups/renderFreeTagPickerにそのまま渡す。
let allCategories = [];

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
  loadCategories();
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.add('show');
}

function clearError() {
  errorBox.textContent = '';
  errorBox.classList.remove('show');
}

// 評価・カテゴリ・タグ欄の再描画。編集画面のonEditChipToggle相当で、選択状態が変わるたびに
// 呼ぶ(検索・ランダム・編集と同じrenderCatGroups/renderFreeTagPickerをそのまま使う)。
function renderPicker() {
  ui.renderCatGroups('add-cat-groups', allCategories, selectedCategoryIds, { includeFree: false, compact: true });
  ui.renderFreeTagPicker('add', allCategories, selectedCategoryIds, []);
}

async function loadCategories() {
  try {
    allCategories = await api.listCategories();
    renderPicker();
  } catch (err) {
    console.error(err);
    showError('カテゴリの読み込みに失敗しました');
  }
}

function renderRating() {
  ui.renderRatingPicker('add-rating-row', selectedRating);
}

ratingRow.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="set-rating"]');
  if (!btn) return;
  const value = Number(btn.dataset.value);
  selectedRating = selectedRating === value ? null : value; // 同じ星を再タップで評価解除
  renderRating();
});

// 固定3グループ・自由入力タグどちらも同じトグル動作(編集画面のonEditChipToggleと同じ)。
catGroups.addEventListener('click', (e) => {
  const chip = e.target.closest('.cat-chip');
  if (!chip) return;
  toggleCategoryId(chip.dataset.id);
});
freeTagRow.addEventListener('click', (e) => {
  const chip = e.target.closest('.cat-chip');
  if (!chip) return;
  toggleCategoryId(chip.dataset.id);
});

function toggleCategoryId(id) {
  if (!id) return;
  if (selectedCategoryIds.has(id)) selectedCategoryIds.delete(id);
  else selectedCategoryIds.add(id);
  renderPicker();
}

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
    if (!allCategories.some((c) => c.id === cat.id)) {
      allCategories.push(cat);
    }
    selectedCategoryIds.add(cat.id);
    renderPicker();
    newCatInput.value = '';
  } catch (err) {
    console.error(err);
    showError('カテゴリの追加に失敗しました');
  } finally {
    newCatAdd.disabled = false;
  }
});

// 五十音インデックス(⑭)込みのタグ候補ドロップダウンは、検索・ランダム・編集画面と同じ共通コンポーネントを使う。
ui.setupFreeTagDropdown('add', (name) => {
  newCatInput.value = name;
  newCatAdd.click();
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

// window.close()は、そのタブがスクリプト(window.open等)で開かれた場合しか効かない
// (共有メニュー経由やブラウザで直接開いた場合はブラウザ側で無視される)。閉じられなかった場合に
// 備え、押しても何も起きないだけで画面上の「このタブは閉じて大丈夫です」の案内はそのまま残る。
saveCloseBtn.addEventListener('click', () => {
  window.close();
});

function init() {
  renderRating();
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
      loadCategories();
    }
  });
}

init();
