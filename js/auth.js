import { supabase, isConfigured } from './supabase-client.js';
import { LOGIN_EMAIL } from './config.js';

let readyCallback = null;

function els() {
  return {
    overlay: document.getElementById('login-overlay'),
    form: document.getElementById('login-form'),
    password: document.getElementById('login-password'),
    error: document.getElementById('login-error'),
    notConfigured: document.getElementById('login-not-configured'),
    submit: document.getElementById('login-submit'),
  };
}

function showOverlay() {
  els().overlay?.classList.add('open');
}

function hideOverlay() {
  els().overlay?.classList.remove('open');
}

function showError(msg) {
  const { error } = els();
  if (!error) return;
  error.textContent = msg;
  error.classList.add('show');
}

function clearError() {
  const { error } = els();
  if (!error) return;
  error.classList.remove('show');
  error.textContent = '';
}

async function handleSubmit(e) {
  e.preventDefault();
  const { password, submit } = els();
  clearError();
  const pw = password.value;
  if (!pw) return;

  submit.disabled = true;
  submit.textContent = 'ログイン中…';

  const { error } = await supabase.auth.signInWithPassword({ email: LOGIN_EMAIL, password: pw });

  submit.disabled = false;
  submit.textContent = 'ログイン';

  if (error) {
    showError('パスワードが違うようです。もう一度お試しください。');
    password.value = '';
    password.focus();
    return;
  }

  password.value = '';
  hideOverlay();
  readyCallback?.();
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
  location.reload();
}

/**
 * ログイン状態を確認し、未ログインならオーバーレイを表示する。
 * ログイン済み(またはログイン完了時)に callback を呼ぶ。
 */
export function initAuth(callback) {
  readyCallback = callback;
  const { form, notConfigured } = els();

  if (!isConfigured) {
    notConfigured?.classList.add('show');
    showOverlay();
    return;
  }

  form?.addEventListener('submit', handleSubmit);

  supabase.auth.getSession().then(({ data }) => {
    if (data.session) {
      hideOverlay();
      callback();
    } else {
      showOverlay();
    }
  });

  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') showOverlay();
  });
}
