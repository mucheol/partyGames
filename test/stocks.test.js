const test = require('node:test');
const assert = require('node:assert/strict');
const { io: client } = require('socket.io-client');
const { httpServer, io } = require('../server');

const emit = (socket, event, data) => new Promise(resolve => socket.emit(event, data, resolve));
const waitFor = (socket, check) => new Promise(resolve => socket.on('room:updated', room => check(room) && resolve(room)));

test('주식 게임은 보유 현금 내 주 단위 거래와 4일 결산을 처리한다', async () => {
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${httpServer.address().port}`;
  const players = [client(url, {transports:['websocket']}), client(url, {transports:['websocket']})];
  try {
    await Promise.all(players.map(socket => new Promise(resolve => socket.on('connect', resolve))));
    const created = await emit(players[0], 'room:create', {nickname:'투자왕', playerId:'stock-0', gameType:'stocks'});
    await emit(players[1], 'room:join', {code:created.room.code, nickname:'투자자', playerId:'stock-1'});
    await emit(players[1], 'room:ready', {ready:true});
    const opened = waitFor(players[0], room => room.game?.type === 'stocks' && room.game.phase === 'trade');
    await emit(players[0], 'room:start', {});
    let room = await opened;
    assert.equal(room.game.markets.length, 6);
    const symbol = room.game.markets[0].symbol;
    const quantity = Math.floor(100_000_000 / room.game.markets[0].price);
    assert.equal((await emit(players[0], 'stocks:trade', {symbol, side:'buy', quantity})).ok, true);
    assert.match((await emit(players[0], 'stocks:trade', {symbol, side:'buy', quantity:1})).error, /보유 현금/);
    for (let day = 1; day <= 4; day++) {
      const next = waitFor(players[0], state => day === 4 ? state.status === 'result' : state.game?.type === 'stocks' && state.game.phase === 'trade' && state.game.day === day + 1);
      await Promise.all(players.map(socket => emit(socket, 'stocks:ready', {ready:true})));
      room = await next;
    }
    assert.equal(room.game.stockRankings.length, 2);
  } finally {
    players.forEach(socket => socket.disconnect());
    await new Promise(resolve => io.close(resolve));
  }
});
