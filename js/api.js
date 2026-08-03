import { supabase } from './supabase-client.js';

function assertReady() {
  if (!supabase) {
    throw new Error('Supabaseが未設定です。js/config.js を確認してください。');
  }
}

export async function listCategories() {
  assertReady();
  const { data, error } = await supabase
    .from('categories')
    .select('id, name')
    .order('name', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createCategory(name) {
  assertReady();
  const trimmed = name.trim();
  if (!trimmed) throw new Error('カテゴリ名を入力してください');

  const { data, error } = await supabase
    .from('categories')
    .insert({ name: trimmed })
    .select('id, name')
    .single();

  if (error) {
    if (error.code === '23505') {
      // 同名カテゴリが既に存在する場合はそれを返す(重複作成エラーにしない)
      const { data: existing, error: fetchError } = await supabase
        .from('categories')
        .select('id, name')
        .eq('name', trimmed)
        .single();
      if (fetchError) throw fetchError;
      return existing;
    }
    throw error;
  }
  return data;
}

export async function listRecipes({ categoryId } = {}) {
  assertReady();
  let query = supabase
    .from('recipes')
    .select('id, url, title, image_url, category_id, fetch_status, created_at')
    .order('created_at', { ascending: false });

  if (categoryId) query = query.eq('category_id', categoryId);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getRecipeDetail(id) {
  assertReady();
  const { data, error } = await supabase
    .from('recipes')
    .select('id, url, title, image_url, excerpt, memo, category_id, raw_html, fetch_status, created_at')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function getRandomRecipe(categoryId) {
  assertReady();
  let query = supabase.from('recipes').select('id, title, image_url, url, category_id');
  if (categoryId) query = query.eq('category_id', categoryId);

  const { data, error } = await query;
  if (error) throw error;
  if (!data || data.length === 0) return null;

  return data[Math.floor(Math.random() * data.length)];
}

export async function saveRecipe({ url, categoryId, memo }) {
  assertReady();
  const { data, error } = await supabase.functions.invoke('fetch-recipe', {
    body: { url, categoryId: categoryId || null, memo: memo || null },
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
    throw new Error(data?.message || '保存に失敗しました。');
  }
  return data.recipe;
}

export async function deleteRecipe(id) {
  assertReady();
  const { error } = await supabase.from('recipes').delete().eq('id', id);
  if (error) throw error;
}
