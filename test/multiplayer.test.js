const test = require('node:test');
const assert = require('node:assert/strict');
const { io: client } = require('socket.io-client');
const { httpServer, io } = require('../server');

function emit(socket, event, data) {
  return new Promise(resolve => socket.emit(event, data, resolve));
}

test('10명이 같은 방에서 준비하고 게임을 시작한다', async () => {
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${httpServer.address().port}`;
  const clients = Array.from({length:10}, () => client(url, {transports:['websocket']}));

  try {
    await Promise.all(clients.map(socket => new Promise(resolve => socket.on('connect', resolve))));
    const created = await emit(clients[0], 'room:create', {nickname:'방장', playerId:'player-0', gameType:'character'});
    assert.equal(created.room.players.length, 1);
    assert.equal(created.room.selectedGame, 'character');

    for (let index = 1; index < clients.length; index++) {
      const joined = await emit(clients[index], 'room:join', {code:created.room.code, nickname:`참가자${index}`, playerId:`player-${index}`});
      assert.equal(joined.error, undefined);
      await emit(clients[index], 'room:ready', {ready:true});
    }

    const started = await emit(clients[0], 'room:start', {});
    assert.equal(started.ok, true);
    const aborted = await emit(clients[0], 'game:abort', {});
    assert.equal(aborted.ok, true);
  } finally {
    clients.forEach(socket => socket.disconnect());
    await new Promise(resolve => io.close(resolve));
  }
});
