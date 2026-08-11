// タグの五十音インデックス用ユーティリティ。
// タグ名(または手動設定した読みがな)の先頭1文字から、五十音の行を判定する。
// 漢字は読みを機械的に確定できない(「大根」→だいこん、等)ため、読みがな未設定の漢字タグは
// 判定不能として全て「他」に入る。カテゴリ編集画面(メニュー>タグの読みがなを設定)で
// 読みがなをひらがなで登録しておくと、そのタグは正しい行に分類されるようになる。

export const GOJUON_ROWS = [
  { key: 'a', label: 'あ' },
  { key: 'ka', label: 'か' },
  { key: 'sa', label: 'さ' },
  { key: 'ta', label: 'た' },
  { key: 'na', label: 'な' },
  { key: 'ha', label: 'は' },
  { key: 'ma', label: 'ま' },
  { key: 'ya', label: 'や' },
  { key: 'ra', label: 'ら' },
  { key: 'wa', label: 'わ' },
];

// 五十音表に載らない(=判定不能な漢字タグ・英数字タグなど)行を表す特別キー。
export const OTHER_ROW = 'other';

// 各行に属するひらがな。濁音・半濁音・拗音・促音・小書き文字も対応する行にまとめる。
const ROW_CHARS = {
  a: 'あいうえおぁぃぅぇぉ',
  ka: 'かきくけこがぎぐげご',
  sa: 'さしすせそざじずぜぞ',
  ta: 'たちつてとだぢづでどっ',
  na: 'なにぬねの',
  ha: 'はひふへほばびぶべぼぱぴぷぺぽ',
  ma: 'まみむめも',
  ya: 'やゆよゃゅょ',
  ra: 'らりるれろ',
  wa: 'わゐゑをんゎ',
};

const CHAR_TO_ROW = new Map();
for (const [row, chars] of Object.entries(ROW_CHARS)) {
  for (const ch of chars) CHAR_TO_ROW.set(ch, row);
}

// カタカナ(ァ-ヶ: U+30A1-U+30F6)をひらがな(U+3041-U+3096)へ変換する。範囲外はそのまま返す。
function toHiragana(ch) {
  const code = ch.codePointAt(0);
  if (code >= 0x30a1 && code <= 0x30f6) return String.fromCodePoint(code - 0x60);
  return ch;
}

// 文字列の先頭1文字から五十音の行キーを判定する。ひらがな/カタカナ以外(漢字・英数字・記号など)は
// 判定不能として null を返す(呼び出し側で「他」扱いにする)。
export function kanaRowOf(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  const first = toHiragana([...trimmed][0]);
  return CHAR_TO_ROW.get(first) || null;
}

// タグ(categories行)の行を判定する。手動設定した読みがな(kana)があれば優先し、
// なければタグ名自体で判定する(ひらがな/カタカナのタグ名はこれだけで正しく分類できる)。
export function categoryRow(cat) {
  return kanaRowOf(cat?.kana) ?? kanaRowOf(cat?.name);
}
