import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composePostText, xIntentUrl } from '../src/share.js';

test('投稿する文が空で、表示する文字列を入れない設定なら、空のまま', () => {
  assert.equal(composePostText({ text: 'HELLO', postText: '', postUseText: false }), '');
  assert.equal(composePostText({ text: 'HELLO', postText: '   ', postUseText: false }), '');
});

test('自由入力の文は、表示する文字列を入れない設定ならそのまま使う', () => {
  assert.equal(composePostText({ text: 'HELLO', postText: '作りました #LED', postUseText: false }), '作りました #LED');
});

test('表示する文字列を入れる設定なら、自由入力の前に足す', () => {
  assert.equal(composePostText({ text: 'HELLO', postText: '作りました', postUseText: true }), 'HELLO 作りました');
  assert.equal(composePostText({ text: ' HELLO ', postText: '', postUseText: true }), 'HELLO');
});

test('表示する文字列が空なら、入れる設定でも自由入力だけになる', () => {
  assert.equal(composePostText({ text: '', postText: '作りました', postUseText: true }), '作りました');
});

test('投稿画面の URL は intent/tweet で、文をエンコードして text に入れる', () => {
  assert.equal(xIntentUrl('a & b #LED'), 'https://x.com/intent/tweet?text=a%20%26%20b%20%23LED');
});

test('文が空なら text を付けずに投稿画面を開く', () => {
  assert.equal(xIntentUrl(''), 'https://x.com/intent/tweet');
});
