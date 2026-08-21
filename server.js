const { createServer } = require('node:http');
const { readFile } = require('node:fs');
const { join } = require('node:path');
const { Server } = require('socket.io');

const httpServer = createServer((request, response) => {
  if (new URL(request.url, 'http://localhost').pathname !== '/') return response.writeHead(404).end();
  readFile(join(__dirname, 'public', 'index.html'), (error, data) => {
    if (error) response.writeHead(500).end('Server error');
    else response.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}).end(data);
  });
});

const io = new Server(httpServer);
const rooms = new Map();
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function roomCode() {
  let code;
  do code = Array.from({length:6}, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  while (rooms.has(code));
  return code;
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function validNickname(value) {
  return typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 12 && !/[<>]/.test(value);
}

function publicRoom(room) {
  const game = room.game ? {type:room.game.type, phase:room.game.phase, activeIds:room.game.activeIds || [], holderId:room.game.holderId || null, winnerIds:room.game.winnerIds || [], round:room.game.round || 0} : null;
  return {code:room.code, status:room.status, hostId:room.hostId, selectedGame:room.selectedGame, game, players:[...room.players.values()].map(({id, nickname, ready, connected}) => ({id, nickname, ready, connected}))};
}

function emitRoom(room) {
  io.to(room.code).emit('room:updated', publicRoom(room));
}

function characterStep(room, stepsLeft) {
  if (room.status !== 'playing') return;
  const ids = [...room.players.values()].filter(player => player.connected).map(player => player.id);
  if (!ids.length) return;
  if (stepsLeft === 0) {
    const winnerCount = Math.min(ids.length, 1 + Math.floor(Math.random() * Math.min(3, ids.length)));
    room.game.phase = 'result';
    room.game.activeIds = [];
    room.game.winnerIds = shuffle(ids).slice(0, winnerCount);
    room.status = 'result';
    emitRoom(room);
    return;
  }
  room.game.activeIds = shuffle(ids).slice(0, stepsLeft === 4 && ids.length > 1 ? Math.min(2, ids.length) : 1);
  room.game.round += 1;
  emitRoom(room);
  room.timer = setTimeout(() => {
    room.game.activeIds = [];
    emitRoom(room);
    room.timer = setTimeout(() => characterStep(room, stepsLeft - 1), 350 + Math.floor(Math.random() * 450));
  }, 700 + Math.floor(Math.random() * 500));
}

function nextBombHolder(room) {
  const connectedIds = [...room.players.values()].filter(player => player.connected).map(player => player.id);
  room.game.queue = room.game.queue.filter(id => connectedIds.includes(id));
  if (!room.game.queue.length) room.game.queue = shuffle(connectedIds);
  const previous = room.game.holderId;
  if (room.game.queue.length > 1 && room.game.queue[0] === previous) room.game.queue.push(room.game.queue.shift());
  room.game.holderId = room.game.queue.shift();
  room.game.round += 1;
}

function startGame(room, type) {
  clearTimeout(room.timer);
  room.status = 'playing';
  room.game = {type, phase:'playing', activeIds:[], winnerIds:[], holderId:null, queue:[], round:0};
  emitRoom(room);
  if (type === 'character') {
    room.timer = setTimeout(() => characterStep(room, 10 + Math.floor(Math.random() * 5)), 1200);
  } else {
    nextBombHolder(room);
    emitRoom(room);
    room.timer = setTimeout(() => {
      if (room.status !== 'playing') return;
      room.status = 'result';
      room.game.phase = 'result';
      room.game.winnerIds = [room.game.holderId];
      emitRoom(room);
    }, 20_000 + Math.floor(Math.random() * 20_001));
  }
}

io.on('connection', socket => {
  socket.on('room:create', ({nickname, playerId, gameType}, done) => {
    if (!validNickname(nickname) || typeof playerId !== 'string') return done({error:'닉네임은 1~12자로 입력해주세요.'});
    if (!['character', 'bomb'].includes(gameType)) return done({error:'게임을 선택해주세요.'});
    const code = roomCode();
    const room = {code, status:'lobby', hostId:playerId, selectedGame:gameType, players:new Map(), game:null, timer:null};
    room.players.set(playerId, {id:playerId, nickname:nickname.trim(), ready:true, connected:true, socketId:socket.id});
    rooms.set(code, room);
    socket.join(code);
    socket.data = {code, playerId};
    done({room:publicRoom(room)});
  });

  socket.on('room:join', ({code, nickname, playerId}, done) => {
    code = String(code || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return done({error:'존재하지 않는 방입니다.'});
    if (room.status !== 'lobby') return done({error:'이미 게임이 시작되었습니다.'});
    if (!validNickname(nickname) || typeof playerId !== 'string') return done({error:'입력 정보를 확인해주세요.'});
    if (room.players.size >= 30) return done({error:'참가 인원이 가득 찼습니다.'});
    if ([...room.players.values()].some(player => player.nickname.toLowerCase() === nickname.trim().toLowerCase())) return done({error:'이미 사용 중인 닉네임입니다.'});
    room.players.set(playerId, {id:playerId, nickname:nickname.trim(), ready:false, connected:true, socketId:socket.id});
    socket.join(code);
    socket.data = {code, playerId};
    done({room:publicRoom(room)});
    emitRoom(room);
  });

  socket.on('room:resume', ({code, playerId}, done) => {
    const room = rooms.get(String(code || '').toUpperCase());
    const player = room?.players.get(playerId);
    if (!player) return done({error:'이전 방이 종료되었습니다.'});
    player.connected = true;
    player.socketId = socket.id;
    socket.join(room.code);
    socket.data = {code:room.code, playerId};
    done({room:publicRoom(room)});
    emitRoom(room);
  });

  socket.on('room:ready', ({ready}, done) => {
    const room = rooms.get(socket.data.code);
    const player = room?.players.get(socket.data.playerId);
    if (!room || !player || player.id === room.hostId) return done({error:'준비 상태를 변경할 수 없습니다.'});
    player.ready = Boolean(ready);
    emitRoom(room);
    done({ok:true});
  });

  socket.on('room:start', (_, done) => {
    const room = rooms.get(socket.data.code);
    if (!room || room.hostId !== socket.data.playerId) return done({error:'방장만 시작할 수 있습니다.'});
    const players = [...room.players.values()];
    if (players.length < 2 || players.some(player => !player.ready || !player.connected)) return done({error:'2명 이상 접속하고 모두 준비해야 합니다.'});
    startGame(room, room.selectedGame);
    done({ok:true});
  });

  socket.on('game:pass', (_, done) => {
    const room = rooms.get(socket.data.code);
    if (!room || room.status !== 'playing' || room.game?.type !== 'bomb' || room.game.holderId !== socket.data.playerId) return done({error:'지금은 폭탄을 넘길 수 없습니다.'});
    nextBombHolder(room);
    emitRoom(room);
    done({ok:true});
  });

  socket.on('game:reset', (_, done) => {
    const room = rooms.get(socket.data.code);
    if (!room || room.hostId !== socket.data.playerId || room.status !== 'result') return done({error:'방장만 다시 시작할 수 있습니다.'});
    clearTimeout(room.timer);
    startGame(room, room.selectedGame);
    done({ok:true});
  });

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.code);
    const player = room?.players.get(socket.data.playerId);
    if (!room || !player || player.socketId !== socket.id) return;
    player.connected = false;
    if (room.hostId === player.id) {
      const nextHost = [...room.players.values()].find(candidate => candidate.connected);
      if (nextHost) { room.hostId = nextHost.id; nextHost.ready = true; }
    }
    if (room.status === 'playing' && room.game?.type === 'bomb' && room.game.holderId === player.id) nextBombHolder(room);
    emitRoom(room);
    const cleanupTimer = setTimeout(() => {
      if ([...room.players.values()].every(candidate => !candidate.connected)) { clearTimeout(room.timer); rooms.delete(room.code); }
    }, 30_000);
    cleanupTimer.unref();
  });
});

if (require.main === module) httpServer.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log(`http://localhost:${process.env.PORT || 3000}`));

module.exports = { httpServer, io, roomCode, shuffle, validNickname };
