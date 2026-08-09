import { initAuth, signOut } from './auth.js';
import * as api from './api.js';
import * as ui from './ui.js';
import { APP_VERSION } from './config.js';
import { dateKey, todayDate } from './dateutils.js';

const state = {
  categories: [],
  categoriesById: new Map(),
  // 一覧に適用中(確定済み)のフィルタ
  activeCategoryIds: new Set(),
  activeMinRating: null,
  activeSortOrder: 'created', // 並び順。デフォルトは最近追加した順(=追加順)
  // フィルタポップアップを開いている間だけの下書き(「絞り込む」を押すまでactiveへ反映しない)
  filterDraftCategoryIds: new Set(),
  filterDraftMinRating: null,
  filterDraftSortOrder: 'created',
  detailRecipe: null,
  detailCategoryNames: [],
  // 編集ポップアップを開いている間だけの下書き(「保存する」を押すまでDBへ反映しない)
  editDraftCategoryIds: new Set(),
  editDraftRating: null,
  // 献立に追加するレシピのid(詳細画面・今日は何作る結果画面のどちらから開いたかは問わない)
  mealPlanTargetRecipeId: null,
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
      sortOrder: state.activeSortOrder,
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

// タグ・評価の編集(⑪): 詳細画面では表示のみ、実際の変更はedit-overlayの下書きに対して行い、
// 「保存する」を押した時点でまとめてDBへ反映する。
async function handleEditSave() {
  const recipe = state.detailRecipe;
  if (!recipe) return;
  ui.setEditSaving(true);
  try {
    await api.updateRecipeCategories(recipe.id, [...state.editDraftCategoryIds]);
    await api.updateRating(recipe.id, state.editDraftRating);
    ui.closeEditOverlay();
    ui.toast('更新しました');
    await openDetail(recipe.id); // 詳細を再取得して反映
    loadRecipes(); // 一覧側にも反映
  } catch (err) {
    console.error(err);
    ui.toast('更新に失敗しました');
  } finally {
    ui.setEditSaving(false);
  }
}

// 編集画面の自由入力タグ追加(⑨): 既存タグ名ならそれを、新規名なら新しいカテゴリを作って選択状態に加える。
// レシピ追加画面(add.js)のnewCatAdd相当だが、保存は「保存する」ボタン押下時にまとめて行うため、
// ここではeditDraftCategoryIdsへ加えるだけでDB更新はしない。
async function handleEditNewTagAdd(name) {
  const addBtn = document.getElementById('edit-new-cat-add');
  addBtn.disabled = true;
  try {
    const cat = await api.createCategory(name);
    if (!state.categoriesById.has(cat.id)) {
      state.categories.push(cat);
      state.categoriesById.set(cat.id, cat);
      ui.renderEditFreeTagSuggestions(state.categories);
    }
    state.editDraftCategoryIds.add(cat.id);
    ui.renderEditGroups(state.categories, state.editDraftCategoryIds);
    ui.resetEditNewTagRow();
  } catch (err) {
    console.error(err);
    ui.toast('タグの追加に失敗しました');
  } finally {
    addBtn.disabled = false;
  }
}

// 「元のレシピを見る」を開いた後、非同期でリンク生死を判定する(③)。結果が遅れて届いても構わない設計。
// 判定中に詳細シートが閉じられた/別レシピに切り替わった場合は結果を無視する。
async function checkOriginalLinkAndFallback(recipe) {
  let reachable = true;
  try {
    reachable = await api.checkLinkReachable(recipe.url);
  } catch (err) {
    console.error(err);
    return; // 判定自体に失敗した場合は何もしない(誤ってアーカイブに切り替えない)
  }
  if (reachable) return;
  if (state.detailRecipe?.id !== recipe.id) return;
  if (recipe.raw_html) {
    ui.showArchiveFallback(recipe.raw_html);
    ui.toast('リンク切れのようです。保存したアーカイブを表示しています');
  } else {
    ui.toast('リンク切れのようです(アーカイブは保存されていません)');
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
      state.filterDraftSortOrder = state.activeSortOrder;
      ui.renderFilterGroups(state.categories, state.filterDraftCategoryIds);
      ui.renderFreeTagPicker('filter', state.categories, state.filterDraftCategoryIds);
      ui.renderRatingRow('filter-rating-row', state.filterDraftMinRating);
      ui.renderSortRow('filter-sort-row', state.filterDraftSortOrder);
      ui.openFilterOverlay();
    },
    onFilterClose() {
      ui.closeFilterOverlay();
    },
    onFilterChipToggle(categoryId) {
      toggleCategoryId(state.filterDraftCategoryIds, categoryId);
      ui.renderFilterGroups(state.categories, state.filterDraftCategoryIds);
      ui.renderFreeTagPicker('filter', state.categories, state.filterDraftCategoryIds);
    },
    // 自由入力タグの選択(⑪): プルダウン(id直接指定)とテキスト入力(既存タグ名と完全一致した場合だけ)の2通り。
    onFilterFreeTagSelect(id) {
      if (!id) return;
      state.filterDraftCategoryIds.add(id);
      ui.renderFilterGroups(state.categories, state.filterDraftCategoryIds);
      ui.renderFreeTagPicker('filter', state.categories, state.filterDraftCategoryIds);
      const select = document.getElementById('filter-free-tag-select');
      if (select) select.value = '';
    },
    onFilterFreeTagPick(name) {
      const trimmed = name.trim();
      const cat = state.categories.find((c) => !c.group_key && c.name === trimmed);
      const input = document.getElementById('filter-free-tag-input');
      if (!cat) {
        if (trimmed) ui.toast('そのタグは見つかりませんでした');
        return;
      }
      state.filterDraftCategoryIds.add(cat.id);
      ui.renderFilterGroups(state.categories, state.filterDraftCategoryIds);
      ui.renderFreeTagPicker('filter', state.categories, state.filterDraftCategoryIds);
      if (input) input.value = '';
    },
    onFilterRatingSelect(value) {
      state.filterDraftMinRating = state.filterDraftMinRating === value ? null : value;
      ui.renderRatingRow('filter-rating-row', state.filterDraftMinRating);
    },
    // 並び順は常にどれか1つが選ばれている状態(トグルではなく選択)。
    onFilterSortSelect(value) {
      state.filterDraftSortOrder = value;
      ui.renderSortRow('filter-sort-row', state.filterDraftSortOrder);
    },
    onFilterClear() {
      state.filterDraftCategoryIds.clear();
      state.filterDraftMinRating = null;
      state.filterDraftSortOrder = 'created';
      ui.renderFilterGroups(state.categories, state.filterDraftCategoryIds);
      ui.renderFreeTagPicker('filter', state.categories, state.filterDraftCategoryIds);
      ui.renderRatingRow('filter-rating-row', state.filterDraftMinRating);
      ui.renderSortRow('filter-sort-row', state.filterDraftSortOrder);
    },
    onFilterApply() {
      state.activeCategoryIds = new Set(state.filterDraftCategoryIds);
      state.activeMinRating = state.filterDraftMinRating;
      state.activeSortOrder = state.filterDraftSortOrder;
      ui.updateFilterBadge(filterActiveCount());
      ui.closeFilterOverlay();
      loadRecipes();
    },
    onTodayCta() {
      state.randomCategoryIds = new Set(state.activeCategoryIds);
      state.randomMinRating = state.activeMinRating;
      state.randomLastId = null;
      ui.renderRandomCats(state.categories, state.randomCategoryIds);
      ui.renderFreeTagPicker('random', state.categories, state.randomCategoryIds);
      ui.renderRatingRow('random-rating-row', state.randomMinRating);
      ui.showRandomStep('pick');
      ui.openRandomOverlay();
    },
    onLogout() {
      if (confirm('ログアウトしますか?')) signOut();
    },
    onDetailOpenOriginal() {
      const recipe = state.detailRecipe;
      if (!recipe) return;
      window.open(recipe.url, '_blank', 'noopener'); // クリック直後に開く(判定待ちにするとポップアップブロック対象になるため)
      checkOriginalLinkAndFallback(recipe);
    },
    onDetailAddToPlan() {
      if (!state.detailRecipe) return;
      state.mealPlanTargetRecipeId = state.detailRecipe.id;
      ui.openMealPlanAddOverlay(dateKey(todayDate()));
    },
    onRandomAddToPlan() {
      if (!state.randomRecipe) return;
      state.mealPlanTargetRecipeId = state.randomRecipe.id;
      ui.openMealPlanAddOverlay(dateKey(todayDate()));
    },
    onMealPlanAddClose() {
      ui.closeMealPlanAddOverlay();
    },
    async onMealPlanAddConfirm(dateValue) {
      if (!state.mealPlanTargetRecipeId || !dateValue) return;
      try {
        const added = await api.addMealPlanEntry(dateValue, state.mealPlanTargetRecipeId);
        ui.closeMealPlanAddOverlay();
        ui.toast(added ? '献立に追加しました' : 'その日にはすでに追加済みです');
      } catch (err) {
        console.error(err);
        ui.toast('献立への追加に失敗しました');
      }
    },
    onDetailEdit() {
      const recipe = state.detailRecipe;
      if (!recipe) return;
      state.editDraftCategoryIds = new Set((recipe.recipe_categories || []).map((rc) => rc.category_id));
      state.editDraftRating = recipe.rating;
      ui.renderEditGroups(state.categories, state.editDraftCategoryIds);
      ui.renderEditFreeTagSuggestions(state.categories);
      ui.renderEditRating(state.editDraftRating);
      ui.resetEditNewTagRow();
      ui.openEditOverlay();
    },
    onEditClose() {
      ui.closeEditOverlay();
    },
    onEditChipToggle(categoryId) {
      toggleCategoryId(state.editDraftCategoryIds, categoryId);
      ui.renderEditGroups(state.categories, state.editDraftCategoryIds);
    },
    onEditRatingSelect(value) {
      state.editDraftRating = state.editDraftRating === value ? null : value; // 同じ星を再タップで評価解除
      ui.renderEditRating(state.editDraftRating);
    },
    onEditSave() {
      handleEditSave();
    },
    onEditDelete() {
      ui.closeEditOverlay();
      handleDetailDelete();
    },
    async onEditNewTagAdd(name) {
      handleEditNewTagAdd(name);
    },
    onRandomCatSelect(categoryId) {
      toggleCategoryId(state.randomCategoryIds, categoryId);
      state.randomLastId = null;
      ui.renderRandomCats(state.categories, state.randomCategoryIds);
      ui.renderFreeTagPicker('random', state.categories, state.randomCategoryIds);
    },
    // 自由入力タグの選択(⑪): プルダウン(id直接指定)とテキスト入力(既存タグ名と完全一致した場合だけ)の2通り。
    onRandomFreeTagSelect(id) {
      if (!id) return;
      state.randomCategoryIds.add(id);
      state.randomLastId = null;
      ui.renderRandomCats(state.categories, state.randomCategoryIds);
      ui.renderFreeTagPicker('random', state.categories, state.randomCategoryIds);
      const select = document.getElementById('random-free-tag-select');
      if (select) select.value = '';
    },
    onRandomFreeTagPick(name) {
      const trimmed = name.trim();
      const cat = state.categories.find((c) => !c.group_key && c.name === trimmed);
      const input = document.getElementById('random-free-tag-input');
      if (!cat) {
        if (trimmed) ui.toast('そのタグは見つかりませんでした');
        return;
      }
      state.randomCategoryIds.add(cat.id);
      state.randomLastId = null;
      ui.renderRandomCats(state.categories, state.randomCategoryIds);
      ui.renderFreeTagPicker('random', state.categories, state.randomCategoryIds);
      if (input) input.value = '';
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
      ui.renderFreeTagPicker('random', state.categories, state.randomCategoryIds);
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
