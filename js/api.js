import { supabase } from './supabase-client.js';

function assertReady() {
  if (!supabase) {
    throw new Error('Supabaseが未設定です。js/config.js を確認してください。');
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

export async function listRecipes({ categoryIds, minRating, sortOrder } = {}) {
  assertReady();
  const hasFilter = Array.isArray(categoryIds) && categoryIds.length > 0;
  const relation = hasFilter ? 'recipe_categories!inner(category_id)' : 'recipe_categories(category_id)';

  let query = supabase
    .from('recipes')
    .select(`id, url, title, image_url, rating, fetch_status, created_at, ${relation}`)
    .order('created_at', { ascending: false });

  if (hasFilter) query = query.in('recipe_categories.category_id', categoryIds);
  if (minRating) query = query.gte('rating', minRating);

  const { data, error } = await query;
  if (error) throw error;
  return sortRecipes(dedupeById(data), sortOrder);
}

export async function getRecipeDetail(id) {
  assertReady();
  const { data, error } = await supabase
    .from('recipes')
    .select('id, url, title, image_url, excerpt, memo, raw_html, rating, fetch_status, created_at, recipe_categories(category_id)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function getRandomRecipe(categoryIds, minRating) {
  assertReady();
  const hasFilter = Array.isArray(categoryIds) && categoryIds.length > 0;
  const relation = hasFilter ? 'recipe_categories!inner(category_id)' : 'recipe_categories(category_id)';

  let query = supabase.from('recipes').select(`id, title, image_url, url, ${relation}`);
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
  const { error } = await supabase.from('recipes').delete().eq('id', id);
  if (error) throw error;
}

/* ===== 献立カレンダー ===== */

// fromKey/toKey は 'YYYY-MM-DD' の日付文字列(両端含む)。
export async function listMealPlan(fromKey, toKey) {
  assertReady();
  const { data, error } = await supabase
    .from('meal_plan')
    .select('id, date, recipe_id, recipes(id, title, image_url, url)')
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
    .select('id, date, recipe_id')
    .single();
  if (error) {
    if (error.code === '23505') return null;
    throw error;
  }
  return data;
}

export async function removeMealPlanEntry(id) {
  assertReady();
  const { error } = await supabase.from('meal_plan').delete().eq('id', id);
  if (error) throw error;
}
