import { initAuth, signOut } from './auth.js';
import * as api from './api.js';
import * as ui from './ui.js';

const state = {
  categories: [],
  categoriesById: new Map(),
  activeCategoryId: null,
  detailRecipe: null,
  randomCategoryId: null,
  randomLastId: null,
  randomRecipe: null,
};

async function loadCategories() {
  state.categories = await api.listCategories();
  state.categoriesById = new Map(state.categories.map((c) => [c.id, c]));
}

async function loadRecipes() {
  ui.showState('loading');
  try {
    const recipes = await api.listRecipes({ categoryId: state.activeCategoryId });
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
    ui.renderCategoryTabs(state.categories, state.activeCategoryId);
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
    const cat = recipe.category_id ? state.categoriesById.get(recipe.category_id) : null;
    ui.renderDetail(recipe, cat?.name);
  } catch (err) {
    console.error(err);
    ui.closeDetail();
    ui.toast('レシピの読み込みに失敗しました');
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
    let recipe = await api.getRandomRecipe(state.randomCategoryId);
    if (avoidLastId && recipe && recipe.id === state.randomLastId) {
      const retry = await api.getRandomRecipe(state.randomCategoryId);
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
  ui.initUI({
    onSelectCategory(categoryId) {
      state.activeCategoryId = categoryId;
      ui.renderCategoryTabs(state.categories, state.activeCategoryId);
      loadRecipes();
    },
    onCardClick(id) {
      openDetail(id);
    },
    onRetry() {
      loadRecipes();
    },
    onTodayCta() {
      state.randomCategoryId = state.activeCategoryId;
      state.randomLastId = null;
      ui.renderRandomCats(state.categories, state.randomCategoryId);
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
    onRandomCatSelect(categoryId) {
      state.randomCategoryId = categoryId;
      state.randomLastId = null;
      ui.renderRandomCats(state.categories, state.randomCategoryId);
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
