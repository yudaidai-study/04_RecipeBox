import { supabase } from './supabase-client.js';

function assertReady() {
  if (!supabase) {
    throw new Error('Supabaseが未設定です。js/config.js を確認してください。');
  }
}

// アーカイブHTML内の画像をミラーリングして保存しているStorageバケット(archive-recipe Edge Functionが書き込む)。
const ARCHIVE_BUCKET = 'recipe-archives';

// レシピ単位でミラーリング済み画像をまとめて削除する(アーカイブをOFFにした時・レシピ削除時)。
// 一覧取得・削除いずれかに失敗しても、呼び出し元の本処理(トグル更新・レシピ削除)は継続させたいため、
// ここでは例外を投げずログのみに留める(ベストエフォート)。
async function removeArchivedImages(recipeId) {
  try {
    const { data: files, error: listError } = await supabase.storage.from(ARCHIVE_BUCKET).list(recipeId);
    if (listError) {
      console.error('アーカイブ画像の一覧取得に失敗しました', listError);
      return;
    }
    if (!files || files.length === 0) return;
    const paths = files.map((f) => `${recipeId}/${f.name}`);
    const { error: removeError } = await supabase.storage.from(ARCHIVE_BUCKET).remove(paths);
    if (removeError) console.error('アーカイブ画像の削除に失敗しました', removeError);
  } catch (err) {
    console.error('アーカイブ画像の削除に失敗しました', err);
  }
}

// group_key(固定3グループ)の表示順。自由入力タグ(group_key=null)は常に末尾。
const GROUP_ORDER = { genre: 1, role: 2, main_ingredient: 3 };

function sortCategories(categories) {
  return [...categories].sort((a, b) => {
    const ga = a.group_key ? (GROUP_ORDER[a.group_key] ?? 90) : 100;
    const gb = b.group_key ? (GROUP_ORDER[b.group_key] ?? 90) : 100;
    if (ga !== gb) return ga - gb;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.name.localeCompare(b.name, 'ja');
  });
}

// 多対多の埋め込みフィルタ(recipe_categories!inner)で複数タグマッチさせた際、
// 同じレシピが複数回返ってくるケースへの保険としてid単位で重複除去する。
function dedupeById(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows || []) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

export async function listCategories() {
  assertReady();
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, group_key, sort_order');
  if (error) throw error;
  return sortCategories(data);
}

export async function createCategory(name) {
  assertReady();
  const trimmed = name.trim();
  if (!trimmed) throw new Error('カテゴリ名を入力してください');

  const { data, error } = await supabase
    .from('categories')
    .insert({ name: trimmed }) // group_keyは指定しない = 自由入力タグ扱い
    .select('id, name, group_key, sort_order')
    .single();

  if (error) {
    if (error.code === '23505') {
      // 同名カテゴリが既に存在する場合はそれを返す(重複作成エラーにしない)
      const { data: existing, error: fetchError } = await supabase
        .from('categories')
        .select('id, name, group_key, sort_order')
        .eq('name', trimmed)
        .single();
      if (fetchError) throw fetchError;
      return existing;
    }
    throw error;
  }
  return data;
}

// 並び順(フィルタ画面の「並び順」)。'created'(デフォルト・最近追加した順)はDB取得時のorderで既に
// 満たされているのでそのまま、'title'/'rating'はDBの照合順序(日本語のあいうえお順とはズレる)に頼らず
// カテゴリ一覧の並べ替えと同じくクライアント側でlocaleCompare('ja')して揃える。
function sortRecipes(recipes, sortOrder) {
  if (sortOrder === 'title') {
    return [...recipes].sort((a, b) => (a.title || a.url).localeCompare(b.title || b.url, 'ja'));
  }
  if (sortOrder === 'rating') {
    return [...recipes].sort((a, b) => (b.rating || 0) - (a.rating || 0));
  }
  return recipes;
}

// keywords(①: フィルタ画面の自由入力欄でタグ名と一致しなかった語)は、
// (a) タグ名の部分一致で該当するカテゴリを絞り込み条件に合流させる ことと
// (b) 料理名(title)の部分一致 の両方でヒットさせる(「タグ検索+キーワード検索のどちらもヒット」)。
// PostgRESTのor=構文の手書きエスケープは値に , ( ) 等が混じると壊れやすいため、
// キーワードごとに素直なilikeクエリを発行してクライアント側でマージする。
export async function listRecipes({ categoryIds, minRating, sortOrder, keywords } = {}) {
  assertReady();
  const baseCategoryIds = Array.isArray(categoryIds) ? categoryIds : [];
  const kws = (Array.isArray(keywords) ? keywords : []).map((k) => (k || '').trim()).filter(Boolean);

  let keywordCategoryIds = [];
  for (const kw of kws) {
    const { data, error } = await supabase.from('categories').select('id').ilike('name', `%${kw}%`);
    if (error) throw error;
    keywordCategoryIds.push(...(data || []).map((c) => c.id));
  }

  const effectiveCategoryIds = [...new Set([...baseCategoryIds, ...keywordCategoryIds])];
  // カテゴリクエリを実行するのは「明示的なタグ選択がある」か「キーワードがタグ名にもヒットした」場合のみ。
  // キーワードだけ指定してタグには一件もヒットしなかった場合は、絞り込みなし(全件)扱いにしない。
  const runCategoryQuery = effectiveCategoryIds.length > 0 || (baseCategoryIds.length === 0 && kws.length === 0);

  let results = [];
  if (runCategoryQuery) {
    const hasFilter = effectiveCategoryIds.length > 0;
    const relation = hasFilter ? 'recipe_categories!inner(category_id)' : 'recipe_categories(category_id)';
    let query = supabase
      .from('recipes')
      .select(`id, url, title, image_url, rating, fetch_status, created_at, ${relation}`)
      .order('created_at', { ascending: false });
    if (hasFilter) query = query.in('recipe_categories.category_id', effectiveCategoryIds);
    if (minRating) query = query.gte('rating', minRating);
    const { data, error } = await query;
    if (error) throw error;
    results = dedupeById(data);
  }

  // 料理名(title)の部分一致(①)。カテゴリ側の結果と合わせて重複除去する。
  for (const kw of kws) {
    let titleQuery = supabase
      .from('recipes')
      .select('id, url, title, image_url, rating, fetch_status, created_at, recipe_categories(category_id)')
      .ilike('title', `%${kw}%`);
    if (minRating) titleQuery = titleQuery.gte('rating', minRating);
    const { data, error } = await titleQuery;
    if (error) throw error;
    results = dedupeById([...results, ...(data || [])]);
  }

  return sortRecipes(results, sortOrder);
}

export async function getRecipeDetail(id) {
  assertReady();
  const { data, error } = await supabase
    .from('recipes')
    .select('id, url, title, image_url, excerpt, memo, raw_html, rating, fetch_status, archive_enabled, created_at, recipe_categories(category_id)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function getRandomRecipe(categoryIds, minRating) {
  assertReady();
  const hasFilter = Array.isArray(categoryIds) && categoryIds.length > 0;
  const relation = hasFilter ? 'recipe_categories!inner(category_id)' : 'recipe_categories(category_id)';

  // ランダム表示の結果もレシピ詳細画面と同じレイアウトで表示するため、評価・メモも合わせて取得する。
  let query = supabase.from('recipes').select(`id, title, image_url, url, rating, memo, ${relation}`);
  if (hasFilter) query = query.in('recipe_categories.category_id', categoryIds);
  if (minRating) query = query.gte('rating', minRating);

  const { data, error } = await query;
  if (error) throw error;
  const list = dedupeById(data);
  if (list.length === 0) return null;

  return list[Math.floor(Math.random() * list.length)];
}

// 共有メニュー経由の遷移時(①)に、保存ボタンを押す前でも登録済みかどうかを判定するための軽量チェック。
// fetch-recipe Edge Functionを呼ばず、recipesテーブルへ直接問い合わせるだけなのでページ取得は発生しない。
export async function findRecipeByUrl(url) {
  assertReady();
  let normalized;
  try {
    normalized = new URL(url).href; // fetch-recipe側の重複判定(parsed.href)と同じ正規化に揃える
  } catch {
    return null;
  }
  const { data, error } = await supabase
    .from('recipes')
    .select('id, title, image_url, url')
    .eq('url', normalized)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveRecipe({ url, categoryIds, memo, rating }) {
  assertReady();
  const { data, error } = await supabase.functions.invoke('fetch-recipe', {
    body: { url, categoryIds: categoryIds || [], memo: memo || null, rating: rating || null },
  });

  if (error) {
    let message = '保存に失敗しました。しばらくしてからもう一度お試しください。';
    try {
      const body = await error.context?.json?.();
      if (body?.message) message = body.message;
    } catch {
      // レスポンス本文を読めない場合は既定メッセージのまま
    }
    throw new Error(message);
  }
  if (!data?.ok) {
    // code: 'duplicate' の場合はdata.recipeに既存レシピの情報が入る(⑩の重複表示で使う)
    const err = new Error(data?.message || '保存に失敗しました。');
    err.code = data?.code;
    err.recipe = data?.recipe;
    throw err;
  }
  return data.recipe;
}

// 「元のレシピを見る」で開いたURLが現在も生きているかをサーバー側(Edge Function)で判定する(③)。
// 判定自体が失敗した場合(関数エラー・ネットワーク不調など)は、誤ってアーカイブに切り替えないよう
// 安全側に倒してreachable=true(リンク切れとは断定しない)を返す。
export async function checkLinkReachable(url) {
  assertReady();
  try {
    const { data, error } = await supabase.functions.invoke('check-link', { body: { url } });
    if (error || !data?.ok) return true;
    return !!data.reachable;
  } catch {
    return true;
  }
}

// アーカイブ保存の選択制トグル(③)。
// OFFにする場合はDB更新のみ(raw_htmlを削除して「保持しない」状態にする)。
// ONにする場合はarchive-recipe Edge Functionを呼び、改めてページを取得してraw_htmlを保存する。
export async function setArchiveEnabled(recipe, enabled) {
  assertReady();
  if (!enabled) {
    await removeArchivedImages(recipe.id); // ミラーリング済み画像も一緒に破棄する
    const { error } = await supabase
      .from('recipes')
      .update({ archive_enabled: false, raw_html: null })
      .eq('id', recipe.id);
    if (error) throw error;
    return { archive_enabled: false, raw_html: null };
  }

  const { data, error } = await supabase.functions.invoke('archive-recipe', {
    body: { recipeId: recipe.id },
  });
  if (error) {
    let message = 'アーカイブの取得に失敗しました。';
    try {
      const body = await error.context?.json?.();
      if (body?.message) message = body.message;
    } catch {
      // レスポンス本文を読めない場合は既定メッセージのまま
    }
    throw new Error(message);
  }
  if (!data?.ok) throw new Error(data?.message || 'アーカイブの取得に失敗しました。');
  return data.recipe;
}

export async function updateRating(id, rating) {
  assertReady();
  const { error } = await supabase.from('recipes').update({ rating }).eq('id', id);
  if (error) throw error;
}

export async function updateMemo(id, memo) {
  assertReady();
  const { error } = await supabase.from('recipes').update({ memo: memo || null }).eq('id', id);
  if (error) throw error;
}

// 既存の紐付けを一旦全削除してから選択中のカテゴリで貼り直す(差分更新はせず単純化)。
export async function updateRecipeCategories(recipeId, categoryIds) {
  assertReady();
  const { error: delError } = await supabase.from('recipe_categories').delete().eq('recipe_id', recipeId);
  if (delError) throw delError;
  if (categoryIds.length > 0) {
    const { error: insError } = await supabase
      .from('recipe_categories')
      .insert(categoryIds.map((category_id) => ({ recipe_id: recipeId, category_id })));
    if (insError) throw insError;
  }
}

export async function deleteRecipe(id) {
  assertReady();
  await removeArchivedImages(id); // ミラーリング済み画像も一緒に破棄する(ベストエフォート)
  const { error } = await supabase.from('recipes').delete().eq('id', id);
  if (error) throw error;
}

/* ===== 献立カレンダー ===== */

// fromKey/toKey は 'YYYY-MM-DD' の日付文字列(両端含む)。
export async function listMealPlan(fromKey, toKey) {
  assertReady();
  const { data, error } = await supabase
    .from('meal_plan')
    .select('id, date, recipe_id, note, recipes(id, title, image_url, url)')
    .gte('date', fromKey)
    .lte('date', toKey)
    .order('date', { ascending: true });
  if (error) throw error;
  return data;
}

// 既に同じ日に同じレシピが登録済み(unique制約違反)の場合はnullを返し、エラー扱いにしない。
export async function addMealPlanEntry(dateKey, recipeId) {
  assertReady();
  const { data, error } = await supabase
    .from('meal_plan')
    .insert({ date: dateKey, recipe_id: recipeId })
    .select('id, date, recipe_id, note')
    .single();
  if (error) {
    if (error.code === '23505') return null;
    throw error;
  }
  return data;
}

// レシピに紐付かないテキストのみの献立を登録する(②: 「魚を焼く」のような、レシピURLを保存しない献立)。
export async function addMealPlanTextEntry(dateKey, note) {
  assertReady();
  const trimmed = (note || '').trim();
  if (!trimmed) throw new Error('内容を入力してください');
  const { data, error } = await supabase
    .from('meal_plan')
    .insert({ date: dateKey, recipe_id: null, note: trimmed })
    .select('id, date, recipe_id, note')
    .single();
  if (error) throw error;
  return data;
}

export async function removeMealPlanEntry(id) {
  assertReady();
  const { error } = await supabase.from('meal_plan').delete().eq('id', id);
  if (error) throw error;
}

/* ===== DB使用容量(左下メニュー) ===== */

// db_usage_summary()はSECURITY DEFINER関数(0011)。テーブルごとの実サイズ・Storageバケットごとの
// 使用量・DB全体サイズをまとめて返す。個人利用の2人共有アプリのため内訳まで見せてよい設計。
export async function getUsageSummary() {
  assertReady();
  const { data, error } = await supabase.rpc('db_usage_summary');
  if (error) throw error;
  return data;
}

/* ===== 統計(左下メニュー・ヘッダーの品目総数) ===== */

// 保存レシピの総数。ヘッダーの「全n品」表示と統計画面の両方から使う軽量カウントクエリ。
export async function getRecipeCount() {
  assertReady();
  const { count, error } = await supabase.from('recipes').select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

// 人気のレシピランキング(献立カレンダーへの登録回数が多い順)。PostgRESTはGROUP BY集計を
// 直接扱えないため、meal_plan.recipe_idを全件取得してクライアント側で集計する
// (個人利用アプリのため件数は少なく、この程度の集計は許容範囲)。
export async function getStats() {
  assertReady();
  const recipeCount = await getRecipeCount();

  const { data: planRows, error: planError } = await supabase
    .from('meal_plan')
    .select('recipe_id')
    .not('recipe_id', 'is', null);
  if (planError) throw planError;

  const countsByRecipe = new Map();
  for (const row of planRows || []) {
    countsByRecipe.set(row.recipe_id, (countsByRecipe.get(row.recipe_id) || 0) + 1);
  }
  const topIds = [...countsByRecipe.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);

  let ranking = [];
  if (topIds.length > 0) {
    const { data: recipes, error: recipesError } = await supabase
      .from('recipes')
      .select('id, title, url, image_url')
      .in('id', topIds);
    if (recipesError) throw recipesError;
    const recipesById = new Map(recipes.map((r) => [r.id, r]));
    ranking = topIds
      .map((id) => {
        const r = recipesById.get(id);
        if (!r) return null; // 削除済みのレシピはランキングから除外
        return { id: r.id, title: r.title || r.url, image_url: r.image_url, count: countsByRecipe.get(id) };
      })
      .filter(Boolean);
  }

  return { recipeCount, ranking };
}
