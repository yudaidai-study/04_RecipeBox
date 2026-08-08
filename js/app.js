import { initAuth, signOut } from './auth.js';
import * as api from './api.js';
import * as ui from './ui.js';
import { APP_VERSION } from './config.js';

const state = {
  categories: [],
  categoriesById: new Map(),
  activeCategoryIds: new Set(),
  detailRecipe: null,
  detailCategoryNames: [],
  randomCategoryIds: new Set(),
  randomLastId: null,
  randomRecipe: null,
};

// 「すべて」チップ(id === '')の選択でクリア、それ以外は集合に対するトグル選択。
function toggleCategoryId(set, id) {
  if (!id) {
    set.clear();
    return;
  }
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
    const recipes = await api.listRecipes({ categoryIds: [...state.activeCategoryIds] });
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
    ui.renderCategoryTabs(state.categories, state.activeCategoryIds);
  } catch (err) {
    console.error(err);
  }
  await loadRecipes();
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
    let recipe = await api.getRandomRecipe(categoryIds);
    if (avoidLastId && recipe && recipe.id === state.randomLastId) {
      const retry = await api.getRandomRecipe(categoryIds);
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
    onSelectCategory(categoryId) {
      toggleCategoryId(state.activeCategoryIds, categoryId);
      ui.renderCategoryTabs(state.categories, state.activeCategoryIds);
      loadRecipes();
    },
    onCardClick(id) {
      openDetail(id);
    },
    onRetry() {
      loadRecipes();
    },
    onTodayCta() {
      state.randomCategoryIds = new Set(state.activeCategoryIds);
      state.randomLastId = null;
      ui.renderRandomCats(state.categories, state.randomCategoryIds);
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
