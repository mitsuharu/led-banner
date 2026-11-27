// X に投稿する文と、投稿画面の URL を作る。DOM に依存させず、Node.js でテストできるようにしている。

/**
 * 投稿する文。自由入力の文はそのまま使い、空なら空のままにする。
 * 表示する文字列は、利用者がチェックを入れたときだけ自由入力の前に足す（勝手に文を埋めない）。
 * @param {{ text: string, postText: string, postUseText: boolean }} options
 */
export function composePostText({ text, postText, postUseText }) {
  return [postUseText ? String(text).trim() : '', String(postText).trim()].filter(Boolean).join(' ');
}

/**
 * X の投稿画面の URL。多くのサイトの投稿ボタンと同じ intent/tweet を使う（intent/post より広く使われている）。
 * 文が空なら text を付けず、空の投稿画面を開く。
 */
export function xIntentUrl(text) {
  const base = 'https://x.com/intent/tweet';
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
