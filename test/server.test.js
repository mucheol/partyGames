const test = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const { blockedNickname, gameSettings, roomCode, selectStocks, shuffle, validNickname } = require('../server');

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
  assert.equal(readdirSync(join(__dirname, '..', 'public', 'assets')).filter(file => /^racer-.+-frame-\d\.png$/.test(file)).length, 20);
});

test('게임 설정값을 허용 범위로 제한한다', () => {
  assert.deepEqual(gameSettings('character', {winnerCount:'9'}), {winnerCount:'9'});
  assert.deepEqual(gameSettings('bomb', {duration:'30-60', stackPenalty:true}), {duration:'30-60', stackPenalty:true});
  assert.deepEqual(gameSettings('cards', {unused:true}), {});
  assert.deepEqual(gameSettings('stocks', {days:'7'}), {days:7});
  assert.deepEqual(gameSettings('stocks', {days:'99'}), {days:7});
});

test('주식은 매 판 한국과 미국의 서로 다른 6개 섹터에서 무작위 선정한다', () => {
  for (let count = 0; count < 20; count++) {
    const stocks = selectStocks();
    assert.equal(stocks.length, 6);
    assert.equal(stocks.filter(stock => stock[2] === 'KR').length, 3);
    assert.equal(stocks.filter(stock => stock[2] === 'US').length, 3);
    assert.equal(new Set(stocks.map(stock => stock[3])).size, 6);
    assert.ok(stocks.every(stock => /^[가-힣\s]+$/.test(stock[1])));
  }
});
