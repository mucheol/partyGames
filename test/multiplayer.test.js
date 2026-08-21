const test = require('node:test');
const assert = require('node:assert/strict');
const { io: client } = require('socket.io-client');
const { httpServer, io } = require('../server');

function emit(socket, event, data) {
  return new Promise(resolve => socket.emit(event, data, resolve));
}

function waitFor(socket, check) {
  return new Promise(resolve => socket.on('room:updated', room => check(room) && resolve(room)));
}

test('10명이 같은 방에서 준비하고 게임을 시작한다', async () => {
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${httpServer.address().port}`;
  const clients = Array.from({length:10}, () => client(url, {transports:['websocket']}));

  try {
    await Promise.all(clients.map(socket => new Promise(resolve => socket.on('connect', resolve))));
    const created = await emit(clients[0], 'room:create', {nickname:'방장', playerId:'player-0', gameType:'cards'});
    assert.equal(created.room.players.length, 1);
    assert.equal(created.room.selectedGame, 'cards');

    for (let index = 1; index < clients.length; index++) {
      const joined = await emit(clients[index], 'room:join', {code:created.room.code, nickname:`참가자${index}`, playerId:`player-${index}`});
      assert.equal(joined.error, undefined);
      await emit(clients[index], 'room:ready', {ready:true});
    }

    const started = await emit(clients[0], 'room:start', {});
    assert.equal(started.ok, true);
    const choosing = await waitFor(clients[0], room => room.game?.type === 'cards' && room.game.phase === 'decide');
    assert.equal(choosing.game.myCards.length, 1);
    const ranked = waitFor(clients[0], room => room.status === 'result' && room.game?.phase === 'ranking');
    const waiting = waitFor(clients[1], room => room.game?.myStanding && room.game.waitingNames.length > 0);
    await emit(clients[1], 'cards:choose', {take:false});
    assert.equal((await waiting).game.waitingNames.length, 9);
    const dealt = waitFor(clients[0], room => room.game?.myCards.length === 2);
    await emit(clients[0], 'cards:choose', {take:true});
    await dealt;
    await Promise.all(clients.map((socket, index) => index <= 1 ? Promise.resolve() : emit(socket, 'cards:choose', {take:false})));
    await emit(clients[0], 'cards:choose', {take:false});
    const result = await ranked;
    assert.equal(result.game.rankings.length, 10);
    assert.ok(result.game.rankings.some(player => player.cards.length === 2));
  } finally {
    clients.forEach(socket => socket.disconnect());
    await new Promise(resolve => io.close(resolve));
  }
});
