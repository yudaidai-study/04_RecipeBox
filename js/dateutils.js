// カレンダー機能(献立)まわりで使う日付ユーティリティ。app.js・calendar.js で共用する。
// タイムゾーンのズレを避けるため、UTC変換を経由せず常にローカルの年月日から組み立てる。

export function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayDate() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function startOfWeek(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay()); // 週の始まりは日曜
  x.setHours(0, 0, 0, 0);
  return x;
}

export function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
