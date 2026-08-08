import { initAuth, signOut } from './auth.js';
import * as api from './api.js';
import * as ui from './ui.js';
import { APP_VERSION } from './config.js';

const state = {
  categories: [],
  categoriesById: new Map(),
  // 一覧に適用中(確定済み)のフィルタ
  activeCategoryIds: new Set(),
  activeMinRating: null,
  // フィルタポップアップを開いている間だけの下書き(「絞り込む」を押すまでactiveへ反映しない)
  filterDraftCategoryIds: new Set(),
  filterDraftMinRating: null,
  detailRecipe: null,
  detailCategoryNames: [],
  randomCategoryIds: new Set(),
  randomMinRating: null,
  randomLastId: null,
  randomRecipe: null,
};

// カテゴリIDの選択集合に対するトグル。
function toggleCategoryId(set, id) {
  if (!id) return;
  if (set.has(id)) set.delete(id);
  else set.add(id);
}

async function loadCategories() {
  state.categories = await api.listCategories();
  state.categoriesById = new Map(state.categories.map((c) => [c.id, c]));
}

async function loadRecipes() {
  ui.showState('loading');
  try {
    const recipes = await api.listRecipes({
      categoryIds: [...state.activeCategoryIds],
      minRating: state.activeMinRating,
    });
    if (recipes.length === 0) {
      ui.showState('empty');
    } else {
      ui.renderRecipeGrid(recipes, state.categoriesById);
      ui.showState('content');
    }
  } catch (err) {
    console.error(err);
    ui.setErrorMessage(err.message || '読み込みに失敗しました。');
    ui.showState('error');
  }
}

async function refreshAll() {
  try {
    await loadCategories();
  } catch (err) {
    console.error(err);
  }
  await loadRecipes();
}

function filterActiveCount() {
  return state.activeCategoryIds.size + (state.activeMinRating ? 1 : 0);
}

async function openDetail(id) {
  ui.openDetail();
  ui.showDetailLoading();
  try {
    const recipe = await api.getRecipeDetail(id);
    state.detailRecipe = recipe;
    const names = (recipe.recipe_categories || [])
      .map((rc) => state.categoriesById.get(rc.category_id)?.name)
      .filter(Boolean);
    state.detailCategoryNames = names;
    ui.renderDetail(recipe, names);
  } catch (err) {
    console.error(err);
    ui.closeDetail();
    ui.toast('レシピの読み込みに失敗しました');
  }
}

async function handleRatingSelect(value) {
  const recipe = state.detailRecipe;
  if (!recipe) return;
  const next = recipe.rating === value ? null : value; // 同じ星を再タップで評価解除
  const prev = recipe.rating;

  recipe.rating = next;
  ui.renderDetail(recipe, state.detailCategoryNames);

  try {
    await api.updateRating(recipe.id, next);
    loadRecipes(); // 一覧側の星表示にも反映
  } catch (err) {
    console.error(err);
    recipe.rating = prev;
    ui.renderDetail(recipe, state.detailCategoryNames);
    ui.toast('評価の保存に失敗しました');
  }
}

async function handleDetailDelete() {
  const recipe = state.detailRecipe;
  if (!recipe) return;
  if (!confirm(`「${recipe.title || recipe.url}」を削除しますか?`)) return;
  try {
    await api.deleteRecipe(recipe.id);
    ui.closeDetail();
    ui.toast('削除しました');
    await loadRecipes();
  } catch (err) {
    console.error(err);
    ui.toast('削除に失敗しました');
  }
}

async function drawRandomRecipe({ avoidLastId }) {
  ui.showRandomStep('loading');
  try {
    const categoryIds = [...state.randomCategoryIds];
    const minRating = state.randomMinRating;
    let recipe = await api.getRandomRecipe(categoryIds, minRating);
    if (avoidLastId && recipe && recipe.id === state.randomLastId) {
      const retry = await api.getRandomRecipe(categoryIds, minRating);
      if (retry) recipe = retry;
    }
    if (!recipe) {
      ui.showRandomStep('empty');
      return;
    }
    state.randomRecipe = recipe;
    state.randomLastId = recipe.id;
    ui.renderRandomResult(recipe);
    ui.showRandomStep('result');
  } catch (err) {
    console.error(err);
    ui.showRandomStep('empty');
    ui.toast('提案の取得に失敗しました');
  }
}

function init() {
  const versionEl = document.getElementById('app-version');
  if (versionEl) versionEl.textContent = APP_VERSION;

  ui.initUI({
    onCardClick(id) {
      openDetail(id);
    },
    onRetry() {
      loadRecipes();
    },
    onFilterBtn() {
      state.filterDraftCategoryIds = new Set(state.activeCategoryIds);
      state.filterDraftMinRating = state.activeMinRating;
      ui.renderFilterGroups(state.categories, state.filterDraftCategoryIds);
      ui.renderRatingRow('filter-rating-row', state.filterDraftMinRating);
      ui.openFilterOverlay();
    },
    onFilterClose() {
      ui.closeFilterOverlay();
    },
    onFilterChipToggle(categoryId) {
      toggleCategoryId(state.filterDraftCategoryIds, categoryId);
      ui.renderFilterGroups(state.categories, state.filterDraftCategoryIds);
    },
    onFilterRatingSelect(value) {
      state.filterDraftMinRating = state.filterDraftMinRating === value ? null : value;
      ui.renderRatingRow('filter-rating-row', state.filterDraftMinRating);
    },
    onFilterClear() {
      state.filterDraftCategoryIds.clear();
      state.filterDraftMinRating = null;
      ui.renderFilterGroups(state.categories, state.filterDraftCategoryIds);
      ui.renderRatingRow('filter-rating-row', state.filterDraftMinRating);
    },
    onFilterApply() {
      state.activeCategoryIds = new Set(state.filterDraftCategoryIds);
      state.activeMinRating = state.filterDraftMinRating;
      ui.updateFilterBadge(filterActiveCount());
      ui.closeFilterOverlay();
      loadRecipes();
    },
    onTodayCta() {
      state.randomCategoryIds = new Set(state.activeCategoryIds);
      state.randomMinRating = state.activeMinRating;
      state.randomLastId = null;
      ui.renderRandomCats(state.categories, state.randomCategoryIds);
      ui.renderRatingRow('random-rating-row', state.randomMinRating);
      ui.showRandomStep('pick');
      ui.openRandomOverlay();
    },
    onLogout() {
      if (confirm('ログアウトしますか?')) signOut();
    },
    onDetailOpenOriginal() {
      if (state.detailRecipe) window.open(state.detailRecipe.url, '_blank', 'noopener');
    },
    onDetailToggleArchive() {
      if (state.detailRecipe?.raw_html) ui.toggleArchiveView(state.detailRecipe.raw_html);
    },
    onDetailDelete() {
      handleDetailDelete();
    },
    onRatingSelect(value) {
      handleRatingSelect(value);
    },
    onRandomCatSelect(categoryId) {
      toggleCategoryId(state.randomCategoryIds, categoryId);
      state.randomLastId = null;
      ui.renderRandomCats(state.categories, state.randomCategoryIds);
    },
    onRandomRatingSelect(value) {
      state.randomMinRating = state.randomMinRating === value ? null : value;
      state.randomLastId = null;
      ui.renderRatingRow('random-rating-row', state.randomMinRating);
    },
    onRandomClear() {
      state.randomCategoryIds.clear();
      state.randomMinRating = null;
      state.randomLastId = null;
      ui.renderRandomCats(state.categories, state.randomCategoryIds);
      ui.renderRatingRow('random-rating-row', state.randomMinRating);
    },
    onRandomConfirm() {
      drawRandomRecipe({ avoidLastId: false });
    },
    onRandomAgain() {
      drawRandomRecipe({ avoidLastId: true });
    },
    onRandomOpen() {
      if (state.randomRecipe) window.open(state.randomRecipe.url, '_blank', 'noopener');
    },
  });

  initAuth(refreshAll);
}

init();
