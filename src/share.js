// 共有する文を作る。DOM に依存させず、Node.js でテストできるようにしている。

/**
 * 共有する文。自由入力の文はそのまま使い、空なら空のままにする。
 * 表示する文字列は、利用者がチェックを入れたときだけ自由入力の前に足す（勝手に文を埋めない）。
 * @param {{ text: string, postText: string, postUseText: boolean }} options
 */
export function composePostText({ text, postText, postUseText }) {
  return [postUseText ? String(text).trim() : '', String(postText).trim()].filter(Boolean).join(' ');
}
