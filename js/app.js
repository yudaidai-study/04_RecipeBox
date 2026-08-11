import { initAuth, signOut } from './auth.js';
import * as api from './api.js';
import * as ui from './ui.js';
import { APP_VERSION } from './config.js';
import { dateKey, todayDate } from './dateutils.js';
import { kanaRowOf } from './gojuon.js';

const state = {
  categories: [],
  categoriesById: new Map(),
  // 一覧に適用中(確定済み)のフィルタ
  activeCategoryIds: new Set(),
  activeMinRating: null,
  activeSortOrder: 'created', // 並び順。デフォルトは最近追加した順(=追加順)
  // 自由入力欄でタグ名と一致しなかった語(①): 料理名の部分一致キーワードとして一覧に適用する
  activeKeywords: new Set(),
  // フィルタポップアップを開いている間だけの下書き(「絞り込む」を押すまでactiveへ反映しない)
  filterDraftCategoryIds: new Set(),
  filterDraftMinRating: null,
  filterDraftSortOrder: 'created',
  filterDraftKeywords: new Set(),
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

// メニュー「タグの読みがなを設定」画面の一覧を、最新のstate.categoriesから再描画する。
// タグ名自体がひらがな/カタカナだけなら、それだけで五十音の行を正しく判定できるため
// 読みがなの登録は不要([[gojuon.js]]のkanaRowOf参照)。タグ編集画面の一覧には、
// 読みがなの登録が実際に意味のあるタグ(漢字・英数字などを含むもの)だけを出す。
function renderKanaList() {
  const freeCats = state.categories
    .filter((c) => !c.group_key && kanaRowOf(c.name) === null)
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  ui.renderMenuKanaList(freeCats);
}

async function loadRecipes() {
  ui.showState('loading');
  try {
    const recipes = await api.listRecipes({
      categoryIds: [...state.activeCategoryIds],
      minRating: state.activeMinRating,
      sortOrder: state.activeSortOrder,
      keywords: [...state.activeKeywords],
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

// 今日の献立(④): ホーム画面ヘッダーに表示する、カレンダーに登録済みの今日分の献立。
async function loadTodayPlan() {
  try {
    const key = dateKey(todayDate());
    const rows = await api.listMealPlan(key, key);
    const entries = rows.map((r) => ({
      recipe_id: r.recipe_id,
      title: r.recipe_id ? (r.recipes?.title || r.recipes?.url || '(削除済みのレシピ)') : r.note,
      image_url: r.recipes?.image_url || null,
      url: r.recipes?.url || null,
    }));
    ui.renderTodayPlan(entries, key);
  } catch (err) {
    console.error(err);
  }
}

// ヘッダーの「全n品」表示(③: バージョン表示の代わりに品目総数を出す)。
async function loadItemCount() {
  try {
    const count = await api.getRecipeCount();
    ui.setAppItemCount(count);
  } catch (err) {
    console.error(err);
  }
}

async function refreshAll() {
  try {
    await loadCategories();
  } catch (err) {
    console.error(err);
  }
  await loadRecipes();
  loadTodayPlan();
  loadItemCount();
}

function filterActiveCount() {
  return state.activeCategoryIds.size + state.activeKeywords.size + (state.activeMinRating ? 1 : 0);
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

// タグ・評価・メモの編集: 詳細画面では表示のみ、実際の変更はedit-overlayの下書きに対して行い、
// 「保存する」を押した時点でまとめてDBへ反映する。メモはチップのような専用stateを持たず、
// テキストエリア自体を下書きとして扱い、保存時にDOMから直接読む(add.jsのmemo-inputと同じ考え方)。
async function handleEditSave() {
  const recipe = state.detailRecipe;
  if (!recipe) return;
  ui.setEditSaving(true);
  try {
    await api.updateRecipeCategories(recipe.id, [...state.editDraftCategoryIds]);
    await api.updateRating(recipe.id, state.editDraftRating);
    const memoInput = document.getElementById('edit-memo-input');
    if (memoInput) await api.updateMemo(recipe.id, memoInput.value.trim());
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
  const addBtn = document.getElementById('edit-free-tag-add');
  addBtn.disabled = true;
  try {
    const cat = await api.createCategory(name);
    if (!state.categoriesById.has(cat.id)) {
      state.categories.push(cat);
      state.categoriesById.set(cat.id, cat);
    }
    state.editDraftCategoryIds.add(cat.id);
    ui.renderCatGroups('edit-cat-groups', state.categories, state.editDraftCategoryIds, { includeFree: false, compact: true });
    ui.renderFreeTagPicker('edit', state.categories, state.editDraftCategoryIds, []);
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

// アーカイブ保存トグルの切り替え(③)。ONにする場合は再取得を伴うため、失敗時は元の状態のまま据え置く。
async function handleToggleArchive() {
  const recipe = state.detailRecipe;
  if (!recipe) return;
  const next = !recipe.archive_enabled;
  ui.setArchiveToggleBusy(true);
  try {
    const result = await api.setArchiveEnabled(recipe, next);
    state.detailRecipe = { ...recipe, ...result };
    ui.renderDetail(state.detailRecipe, state.detailCategoryNames);
    ui.toast(next ? 'アーカイブを保存するようにしました' : 'アーカイブを保存しない設定にしました');
  } catch (err) {
    console.error(err);
    ui.toast(err.message || 'アーカイブ設定の変更に失敗しました');
  } finally {
    ui.setArchiveToggleBusy(false);
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
    loadItemCount();
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
  ui.setMenuVersion(APP_VERSION); // ③: バージョン表示はヘッダーからメニューへ移動

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
      state.filterDraftKeywords = new Set(state.activeKeywords);
      ui.renderFilterGroups(state.categories, state.filterDraftCategoryIds);
      ui.renderFreeTagPicker('filter', state.categories, state.filterDraftCategoryIds, [...state.filterDraftKeywords]);
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
      ui.renderFreeTagPicker('filter', state.categories, state.filterDraftCategoryIds, [...state.filterDraftKeywords]);
    },
    // 自由入力欄(①): テキストとプルダウンを一体化した1つのコンボボックス。既存タグ名と完全一致すればタグとして、
    // 一致しなければ料理名の部分一致キーワードとして追加する(タグ検索・キーワード検索のどちらもヒットする)。
    onFilterFreeTagPick(name) {
      const trimmed = name.trim();
      if (!trimmed) return;
      const input = document.getElementById('filter-free-tag-input');
      const cat = state.categories.find((c) => !c.group_key && c.name === trimmed);
      if (cat) {
        state.filterDraftCategoryIds.add(cat.id);
      } else {
        state.filterDraftKeywords.add(trimmed);
      }
      ui.renderFilterGroups(state.categories, state.filterDraftCategoryIds);
      ui.renderFreeTagPicker('filter', state.categories, state.filterDraftCategoryIds, [...state.filterDraftKeywords]);
      if (input) input.value = '';
    },
    onFilterKeywordRemove(keyword) {
      state.filterDraftKeywords.delete(keyword);
      ui.renderFreeTagPicker('filter', state.categories, state.filterDraftCategoryIds, [...state.filterDraftKeywords]);
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
      state.filterDraftKeywords.clear();
      ui.renderFilterGroups(state.categories, state.filterDraftCategoryIds);
      ui.renderFreeTagPicker('filter', state.categories, state.filterDraftCategoryIds, [...state.filterDraftKeywords]);
      ui.renderRatingRow('filter-rating-row', state.filterDraftMinRating);
      ui.renderSortRow('filter-sort-row', state.filterDraftSortOrder);
    },
    onFilterApply() {
      state.activeCategoryIds = new Set(state.filterDraftCategoryIds);
      state.activeMinRating = state.filterDraftMinRating;
      state.activeSortOrder = state.filterDraftSortOrder;
      state.activeKeywords = new Set(state.filterDraftKeywords);
      ui.updateFilterBadge(filterActiveCount());
      ui.closeFilterOverlay();
      loadRecipes();
    },
    onTodayCta() {
      state.randomCategoryIds = new Set(state.activeCategoryIds);
      state.randomMinRating = state.activeMinRating;
      state.randomLastId = null;
      ui.renderCatGroups('random-cat-groups', state.categories, state.randomCategoryIds, { includeFree: false, compact: true });
      ui.renderFreeTagPicker('random', state.categories, state.randomCategoryIds);
      ui.renderRatingRow('random-rating-row', state.randomMinRating);
      ui.showRandomStep('pick');
      ui.openRandomOverlay();
    },
    onLogout() {
      if (confirm('ログアウトしますか?')) signOut();
    },
    onMenuOpen() {
      ui.showMenuStep('main');
      ui.openMenuOverlay();
    },
    onMenuClose() {
      ui.closeMenuOverlay();
    },
    async onMenuUsageOpen() {
      ui.showMenuStep('usage');
      ui.showMenuUsageLoading();
      try {
        const data = await api.getUsageSummary();
        ui.renderUsageSummary(data);
      } catch (err) {
        console.error(err);
        ui.showMenuUsageError('使用容量の取得に失敗しました');
      }
    },
    onMenuUsageBack() {
      ui.showMenuStep('main');
    },
    async onMenuKanaOpen() {
      ui.showMenuStep('kana');
      ui.showMenuKanaLoading();
      try {
        if (state.categories.length === 0) await loadCategories();
        renderKanaList();
      } catch (err) {
        console.error(err);
        ui.showMenuKanaError('タグの読み込みに失敗しました');
      }
    },
    onMenuKanaBack() {
      ui.showMenuStep('main');
    },
    async onKanaSave(categoryId, kana) {
      try {
        await api.updateCategoryKana(categoryId, kana);
        const cat = state.categoriesById.get(categoryId);
        if (cat) cat.kana = kana.trim() || null;
        ui.setKanaRowSaved(categoryId);
      } catch (err) {
        console.error(err);
        alert('読みがなの保存に失敗しました');
      }
    },
    async onKanaCreate(name, kana) {
      const trimmed = (name || '').trim();
      if (!trimmed) return;
      try {
        await api.createCategory(trimmed, kana);
        await loadCategories();
        renderKanaList();
        ui.clearKanaNewRow();
      } catch (err) {
        console.error(err);
        alert('タグの追加に失敗しました');
      }
    },
    async onKanaDelete(categoryId, name) {
      if (!confirm(`タグ「${name}」を削除しますか?\nこのタグが付いているレシピからも外れます(レシピ自体は削除されません)。`)) return;
      try {
        await api.deleteCategory(categoryId);
        // 削除したタグが検索条件・編集下書きなどに残っていると不整合になるため、全ての選択集合から外す。
        for (const ids of [state.activeCategoryIds, state.filterDraftCategoryIds, state.randomCategoryIds, state.editDraftCategoryIds]) {
          ids.delete(categoryId);
        }
        await loadCategories();
        renderKanaList();
      } catch (err) {
        console.error(err);
        alert('タグの削除に失敗しました');
      }
    },
    async onMenuStatsOpen() {
      ui.showMenuStep('stats');
      ui.showMenuStatsLoading();
      try {
        const stats = await api.getStats();
        ui.renderMenuStats(stats);
      } catch (err) {
        console.error(err);
        ui.showMenuStatsError('統計の取得に失敗しました');
      }
    },
    onMenuStatsBack() {
      ui.showMenuStep('main');
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
    onDetailToggleArchive() {
      handleToggleArchive();
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
        if (added && dateValue === dateKey(todayDate())) loadTodayPlan(); // 今日の献立欄(④)にも反映
      } catch (err) {
        console.error(err);
        ui.toast('献立への追加に失敗しました');
      }
    },
    onTodayPlanItemClick(url) {
      window.open(url, '_blank', 'noopener');
    },
    onDetailEdit() {
      const recipe = state.detailRecipe;
      if (!recipe) return;
      state.editDraftCategoryIds = new Set((recipe.recipe_categories || []).map((rc) => rc.category_id));
      state.editDraftRating = recipe.rating;
      ui.renderCatGroups('edit-cat-groups', state.categories, state.editDraftCategoryIds, { includeFree: false, compact: true });
      ui.renderFreeTagPicker('edit', state.categories, state.editDraftCategoryIds, []);
      ui.renderRatingPicker('edit-rating-row', state.editDraftRating);
      ui.resetEditNewTagRow();
      const memoInput = document.getElementById('edit-memo-input');
      if (memoInput) memoInput.value = recipe.memo || '';
      ui.openEditOverlay();
    },
    onEditClose() {
      ui.closeEditOverlay();
    },
    onEditChipToggle(categoryId) {
      toggleCategoryId(state.editDraftCategoryIds, categoryId);
      ui.renderCatGroups('edit-cat-groups', state.categories, state.editDraftCategoryIds, { includeFree: false, compact: true });
      ui.renderFreeTagPicker('edit', state.categories, state.editDraftCategoryIds, []);
    },
    onEditRatingSelect(value) {
      state.editDraftRating = state.editDraftRating === value ? null : value; // 同じ星を再タップで評価解除
      ui.renderRatingPicker('edit-rating-row', state.editDraftRating);
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
      ui.renderCatGroups('random-cat-groups', state.categories, state.randomCategoryIds, { includeFree: false, compact: true });
      ui.renderFreeTagPicker('random', state.categories, state.randomCategoryIds);
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
      ui.renderCatGroups('random-cat-groups', state.categories, state.randomCategoryIds, { includeFree: false, compact: true });
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
      ui.renderCatGroups('random-cat-groups', state.categories, state.randomCategoryIds, { includeFree: false, compact: true });
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
