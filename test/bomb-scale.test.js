const test = require('node:test');
const assert = require('node:assert/strict');
const {io:client} = require('socket.io-client');
const {httpServer, io} = require('../server');

const emit = (socket, event, data) => new Promise(resolve => socket.emit(event, data, resolve));
const waitFor = (socket, check) => new Promise(resolve => socket.on('room:updated', room => check(room) && resolve(room)));

test('15명부터 폭탄이 두 개로 늘어난다', async () => {
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${httpServer.address().port}`;
  const players = Array.from({length:15}, () => client(url, {transports:['websocket']}));
  try {
    await Promise.all(players.map(socket => new Promise(resolve => socket.on('connect', resolve))));
    const created = await emit(players[0], 'room:create', {nickname:'방장', playerId:'bomb-0', gameType:'bomb'});
    for (let index = 1; index < players.length; index++) {
      await emit(players[index], 'room:join', {code:created.room.code, nickname:`참가자${index}`, playerId:`bomb-${index}`});
      await emit(players[index], 'room:ready', {ready:true});
    }
    const playing = waitFor(players[0], room => room.game?.type === 'bomb' && room.game.holderIds.length === 2);
    await emit(players[0], 'room:start', {});
    const room = await playing;
    assert.equal(room.game.holderIds.length, 2);
    assert.equal(new Set(room.game.holderIds).size, 2);
    await emit(players[0], 'game:abort', {});
  } finally {
    players.forEach(socket => socket.disconnect());
    await new Promise(resolve => io.close(resolve));
  }
});
