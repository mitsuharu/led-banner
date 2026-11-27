import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composePostText } from '../src/share.js';

test('共有する文が空で、表示する文字列を入れない設定なら、空のまま', () => {
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
