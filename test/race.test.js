const test = require('node:test');
const assert = require('node:assert/strict');
const { io: client } = require('socket.io-client');
const { httpServer, io } = require('../server');

const emit = (socket, event, data) => new Promise(resolve => socket.emit(event, data, resolve));
const waitFor = (socket, check) => new Promise(resolve => socket.on('room:updated', room => check(room) && resolve(room)));

test('경마는 전원 선택 후 무작위 진행과 결승 슬로모션을 거쳐 끝난다', async () => {
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${httpServer.address().port}`;
  const players = [client(url, {transports:['websocket']}), client(url, {transports:['websocket']})];
  try {
    await Promise.all(players.map(socket => new Promise(resolve => socket.on('connect', resolve))));
    const created = await emit(players[0], 'room:create', {nickname:'응원왕', playerId:'race-0', gameType:'race'});
    await emit(players[1], 'room:join', {code:created.room.code, nickname:'관중', playerId:'race-1'});
    await emit(players[1], 'room:ready', {ready:true});
    const choosing = waitFor(players[0], room => room.game?.type === 'race' && room.game.phase === 'choose');
    await emit(players[0], 'room:start', {});
    assert.equal((await choosing).game.racers.length, 5);
    const finale = waitFor(players[0], room => room.game?.phase === 'finale');
    const result = waitFor(players[0], room => room.status === 'result' && room.game?.type === 'race');
    const startedAt = Date.now();
    await Promise.all([emit(players[0], 'race:choose', {racerId:'turtle'}), emit(players[1], 'race:choose', {racerId:'worm'})]);
    assert.equal((await finale).game.phase, 'finale');
    const finished = await result;
    assert.ok(Date.now() - startedAt >= 100);
    assert.ok(finished.game.raceWinner);
    assert.ok(Math.max(...Object.values(finished.game.racePositions)) >= 100);
  } finally {
    players.forEach(socket => socket.disconnect());
    await new Promise(resolve => io.close(resolve));
  }
});
