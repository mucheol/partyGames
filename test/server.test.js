const test = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const { blockedNickname, roomCode, shuffle, validNickname } = require('../server');

test('방 코드와 닉네임 경계를 검증한다', () => {
  assert.match(roomCode(), /^[A-Z2-9]{6}$/);
  assert.equal(validNickname('참가자'), true);
  assert.equal(validNickname(''), false);
  assert.equal(validNickname('<script>'), false);
});

test('무작위 순서는 참가자를 잃거나 중복하지 않는다', () => {
  const players = ['a', 'b', 'c', 'd'];
  assert.deepEqual(shuffle(players).sort(), players);
  assert.deepEqual(players, ['a', 'b', 'c', 'd']);
});

test('금지 닉네임의 숫자와 기호 우회를 차단한다', () => {
  assert.equal(blockedNickname('무철'), true);
  assert.equal(blockedNickname('무_철'), true);
  assert.equal(blockedNickname('무1철'), true);
  assert.equal(blockedNickname('무지개'), false);
});

test('돼지 동작 이미지 40개를 제공한다', () => {
  assert.equal(readdirSync(join(__dirname, '..', 'public', 'assets')).filter(file => file.startsWith('pig-')).length, 40);
});
