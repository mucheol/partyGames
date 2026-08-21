const test = require('node:test');
const assert = require('node:assert/strict');
const { roomCode, shuffle, validNickname } = require('../server');

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
