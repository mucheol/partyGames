const { createServer } = require('node:http');
const { readFile } = require('node:fs');
const { join } = require('node:path');
const { Server } = require('socket.io');

const httpServer = createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const asset = path.match(/^\/assets\/([a-z0-9-]+\.png)$/)?.[1];
  const files = {'/':['index.html', 'text/html; charset=utf-8']};
  if (asset) files[path] = [`assets/${asset}`, 'image/png'];
  if (!files[path]) return response.writeHead(404).end();
  readFile(join(__dirname, 'public', files[path][0]), (error, data) => {
    if (error) response.writeHead(500).end('Server error');
    else response.writeHead(200, {'Content-Type':files[path][1], 'Cache-Control':path === '/' ? 'no-cache' : 'public, max-age=31536000, immutable'}).end(data);
  });
});

const io = new Server(httpServer);
const rooms = new Map();
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const gameTypes = ['character', 'bomb', 'balloon', 'freeze', 'minority', 'silentCount'];
const minorityPrompts = [
  ['평생 탄산 없는 맥주', '평생 김 빠진 콜라'],
  ['내 흑역사 단체 공개', '친구 흑역사 내가 낭독'],
  ['돼지 코로 셀카 찍기', '돼지 목소리로 건배사'],
  ['안주 없이 한 잔', '물 없이 매운맛'],
  ['모두 앞에서 춤추기', '모두 앞에서 노래하기'],
  ['내 폰 사진첩 공개', '최근 검색어 공개'],
  ['한 시간 존댓말', '한 시간 별명으로 불리기'],
  ['평생 여름만 살기', '평생 겨울만 살기']
];
const pigScenes = {
  peek:['pig-peek.png', 'pig-spy.png', 'pig-detective.png', 'pig-ghost.png'],
  pop:['pig-mascot.png', 'pig-beer.png', 'pig-shot.png', 'pig-cheers.png', 'pig-pour.png', 'pig-dizzy.png', 'pig-disco.png', 'pig-selfie.png', 'pig-hide.png', 'pig-dj.png', 'pig-karaoke.png', 'pig-drum.png', 'pig-star.png', 'pig-bow.png', 'pig-sleep.png', 'pig-jump.png', 'pig-juggle.png', 'pig-bottle.png', 'pig-magician.png', 'pig-king.png', 'pig-weights.png', 'pig-yoga.png', 'pig-sneeze.png'],
  run:['pig-run.png', 'pig-tipsy.png', 'pig-moonwalk.png', 'pig-slide.png', 'pig-cartwheel.png', 'pig-parachute.png', 'pig-superhero.png', 'pig-skates.png', 'pig-banana.png', 'pig-umbrella.png', 'pig-rocket.png', 'pig-cowboy.png']
};

function gameSettings(type, input = {}) {
  if (type === 'character') {
    const winnerCount = ['1', '2', '3', 'random'].includes(String(input.winnerCount)) ? String(input.winnerCount) : 'random';
    return {winnerCount};
  }
  if (type === 'bomb') return {duration:input.duration === '30-60' ? '30-60' : '15-30', stackPenalty:Boolean(input.stackPenalty)};
  if (type === 'freeze' || type === 'minority') return {rounds:input.rounds === '3' ? 3 : 5};
  if (type === 'balloon') return {length:input.length === 'long' ? 'long' : 'short'};
  return {};
}

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

function blockedNickname(value) {
  return typeof value === 'string' && value.normalize('NFKC').replace(/[^\p{L}]/gu, '').includes('무철');
}

function publicRoom(room) {
  const game = room.game ? {type:room.game.type, phase:room.game.phase, move:room.game.move || null, pose:room.game.pose || null, posesById:room.game.posesById || {}, duration:room.game.duration || 1000, startsAt:room.game.startsAt || null, roundEndsAt:room.game.roundEndsAt || null, lastPass:room.game.lastPass || null, activeIds:room.game.activeIds || [], holderId:room.game.holderId || null, winnerIds:room.game.winnerIds || [], round:room.game.round || 0, progress:room.game.progress || 0, count:room.game.count || 0, target:room.game.target || 0, prompt:room.game.prompt || null, optionCounts:room.game.optionCounts || null, responseCount:room.game.responses?.size || 0, strikes:room.game.strikes || {}, message:room.game.message || ''} : null;
  return {code:room.code, status:room.status, hostId:room.hostId, selectedGame:room.selectedGame, settings:room.settings, game, players:[...room.players.values()].map(({id, nickname, ready, connected, penaltyUntil = 0}) => ({id, nickname, ready, connected, penaltyUntil}))};
}

function emitRoom(room) {
  io.to(room.code).emit('room:updated', publicRoom(room));
}

function characterStep(room, stepsLeft) {
  if (room.status !== 'playing') return;
  const ids = [...room.players.values()].filter(player => player.connected).map(player => player.id);
  if (!ids.length) return;
  if (stepsLeft === 0) {
    const configured = room.settings.winnerCount;
    const winnerCount = Math.min(ids.length, configured === 'random' ? 1 + Math.floor(Math.random() * Math.min(3, ids.length)) : Number(configured));
    room.game.phase = 'finale';
    room.game.activeIds = [];
    room.game.winnerIds = shuffle(ids).slice(0, winnerCount);
    emitRoom(room);
    room.timer = setTimeout(() => {
      room.game.phase = 'result';
      room.status = 'result';
      emitRoom(room);
    }, 1300);
    return;
  }
  const split = stepsLeft <= 4 && stepsLeft >= 2 && ids.length > 1;
  room.game.activeIds = shuffle(ids).slice(0, split ? 2 : 1);
  const sceneType = ['peek', 'pop', 'run'][Math.floor(Math.random() * 3)];
  room.game.move = stepsLeft === 6 ? 'fakeout' : stepsLeft === 4 ? 'split' : stepsLeft === 1 ? 'merge' : sceneType === 'peek' ? (Math.random() < .5 ? 'peekLeft' : 'peekRight') : sceneType;
  const scenePoses = pigScenes[sceneType];
  room.game.posesById = Object.fromEntries(room.game.activeIds.map(id => [id, scenePoses[Math.floor(Math.random() * scenePoses.length)]]));
  room.game.pose = room.game.posesById[room.game.activeIds[0]];
  room.game.duration = 700 + stepsLeft * 35;
  room.game.round += 1;
  emitRoom(room);
  room.timer = setTimeout(() => {
    room.game.activeIds = [];
    emitRoom(room);
    room.timer = setTimeout(() => characterStep(room, stepsLeft - 1), 280 + Math.floor(Math.random() * 320));
  }, room.game.duration);
}

function nextBombHolder(room) {
  const connectedIds = [...room.players.values()].filter(player => player.connected).map(player => player.id);
  room.game.queue = room.game.queue.filter(id => connectedIds.includes(id));
  if (!room.game.queue.length) room.game.queue = shuffle(connectedIds);
  const previous = room.game.holderId;
  if (room.game.queue.length > 1 && room.game.queue[0] === previous) room.game.queue.push(room.game.queue.shift());
  room.game.holderId = room.game.queue.shift();
  room.game.lastPass = previous ? {fromId:previous, toId:room.game.holderId} : null;
  room.game.round += 1;
}

function queueGame(room, type) {
  clearTimeout(room.timer);
  room.status = 'countdown';
  room.game = {type, phase:'countdown', startsAt:Date.now() + 3200, activeIds:[], winnerIds:[], round:0};
  emitRoom(room);
  room.timer = setTimeout(() => startGame(room, type), 3200);
}

function finishGame(room, winnerIds, message = '') {
  clearTimeout(room.timer);
  room.status = 'result';
  room.game.phase = 'result';
  room.game.winnerIds = winnerIds;
  room.game.message = message;
  emitRoom(room);
}

function penaltyLeaders(room) {
  const entries = Object.entries(room.game.strikes);
  const highest = Math.max(0, ...entries.map(([, score]) => score));
  return entries.filter(([, score]) => score === highest).map(([id]) => id);
}

function freezeRound(room) {
  if (room.game.round >= room.settings.rounds) return finishGame(room, penaltyLeaders(room), '가장 늦게 얼어붙은 참가자!');
  room.game.round += 1;
  room.game.phase = 'dance';
  room.game.responses = new Map();
  room.game.message = '마음껏 흔들흔들!';
  emitRoom(room);
  room.timer = setTimeout(() => {
    room.game.phase = 'freeze';
    room.game.roundEndsAt = Date.now() + 1800;
    room.game.message = '얼음!';
    emitRoom(room);
    room.timer = setTimeout(() => {
      const ids = [...room.players.values()].filter(player => player.connected).map(player => player.id);
      const responses = [...room.game.responses.entries()];
      const slowest = responses.sort((a, b) => b[1] - a[1])[0]?.[0];
      ids.filter(id => !room.game.responses.has(id)).forEach(id => room.game.strikes[id] = (room.game.strikes[id] || 0) + 2);
      if (slowest) room.game.strikes[slowest] = (room.game.strikes[slowest] || 0) + 1;
      room.game.phase = 'reveal';
      room.game.message = slowest ? `${room.players.get(slowest).nickname}, 조금 늦었어요!` : '아무도 얼지 못했어요!';
      emitRoom(room);
      room.timer = setTimeout(() => freezeRound(room), 1500);
    }, 1800);
  }, 1800 + Math.floor(Math.random() * 2200));
}

function minorityRound(room) {
  if (room.game.round >= room.settings.rounds) return finishGame(room, penaltyLeaders(room), '가장 자주 소수파가 된 참가자!');
  room.game.round += 1;
  room.game.phase = 'choose';
  room.game.responses = new Map();
  room.game.prompt = minorityPrompts[(room.game.round - 1) % minorityPrompts.length];
  room.game.optionCounts = null;
  room.game.roundEndsAt = Date.now() + 5000;
  emitRoom(room);
  room.timer = setTimeout(() => {
    const ids = [...room.players.values()].filter(player => player.connected).map(player => player.id);
    const counts = [0, 0];
    room.game.responses.forEach(choice => counts[choice] += 1);
    let minority = counts[0] === counts[1] ? Math.floor(Math.random() * 2) : counts[0] < counts[1] ? 0 : 1;
    ids.forEach(id => {
      const choice = room.game.responses.get(id);
      if (choice === undefined || choice === minority) room.game.strikes[id] = (room.game.strikes[id] || 0) + 1;
    });
    room.game.phase = 'reveal';
    room.game.optionCounts = counts;
    room.game.message = `소수파는 ${room.game.prompt[minority]}!`;
    emitRoom(room);
    room.timer = setTimeout(() => minorityRound(room), 1800);
  }, 5000);
}

function startGame(room, type) {
  clearTimeout(room.timer);
  room.status = 'playing';
  room.game = {type, phase:'playing', startsAt:Date.now(), move:null, pose:null, posesById:{}, duration:1000, activeIds:[], winnerIds:[], holderId:null, lastPass:null, queue:[], round:0};
  emitRoom(room);
  if (type === 'character') {
    room.timer = setTimeout(() => characterStep(room, 12 + Math.floor(Math.random() * 5)), 900);
  } else if (type === 'bomb') {
    nextBombHolder(room);
    emitRoom(room);
    room.timer = setTimeout(() => {
      if (room.status !== 'playing') return;
      room.status = 'result';
      room.game.phase = 'result';
      room.game.winnerIds = [room.game.holderId];
      emitRoom(room);
    }, room.settings.duration === '30-60' ? 30_000 + Math.floor(Math.random() * 30_001) : 15_000 + Math.floor(Math.random() * 15_001));
  } else if (type === 'balloon') {
    room.game.phase = 'tap';
    room.game.threshold = (room.settings.length === 'long' ? 90 : 45) + Math.floor(Math.random() * 31);
    room.game.count = 0;
    room.game.progress = 4;
    room.game.lastTapAt = {};
    emitRoom(room);
  } else if (type === 'freeze') {
    room.game.strikes = Object.fromEntries([...room.players.keys()].map(id => [id, 0]));
    freezeRound(room);
  } else if (type === 'minority') {
    room.game.strikes = Object.fromEntries([...room.players.keys()].map(id => [id, 0]));
    minorityRound(room);
  } else {
    room.game.phase = 'tap';
    room.game.target = room.players.size * 2;
    room.game.pendingIds = new Set();
    room.game.strikes = Object.fromEntries([...room.players.keys()].map(id => [id, 0]));
    room.game.collisions = 0;
    room.game.message = '말하지 말고 한 명씩 눌러요!';
    emitRoom(room);
  }
}

io.on('connection', socket => {
  socket.on('room:create', ({nickname, playerId, gameType, settings}, done) => {
    if (blockedNickname(nickname)) return done({error:'해당 닉네임은 사용할 수 없습니다. 다른 닉네임을 골라주세요.'});
    if (!validNickname(nickname) || typeof playerId !== 'string') return done({error:'닉네임은 1~12자로 입력해주세요.'});
    if (!gameTypes.includes(gameType)) return done({error:'게임을 선택해주세요.'});
    const code = roomCode();
    const room = {code, status:'lobby', hostId:playerId, selectedGame:gameType, settings:gameSettings(gameType, settings), players:new Map(), game:null, timer:null};
    room.players.set(playerId, {id:playerId, nickname:nickname.trim(), ready:true, connected:true, penaltyUntil:0, socketId:socket.id});
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
    if (blockedNickname(nickname)) return done({error:'해당 닉네임은 사용할 수 없습니다. 다른 닉네임을 골라주세요.'});
    if (!validNickname(nickname) || typeof playerId !== 'string') return done({error:'입력 정보를 확인해주세요.'});
    if (room.players.size >= 30) return done({error:'참가 인원이 가득 찼습니다.'});
    if ([...room.players.values()].some(player => player.nickname.toLowerCase() === nickname.trim().toLowerCase())) return done({error:'이미 사용 중인 닉네임입니다.'});
    room.players.set(playerId, {id:playerId, nickname:nickname.trim(), ready:false, connected:true, penaltyUntil:0, socketId:socket.id});
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
    queueGame(room, room.selectedGame);
    done({ok:true});
  });

  socket.on('game:pass', (_, done) => {
    const room = rooms.get(socket.data.code);
    if (!room || room.status !== 'playing' || room.game?.type !== 'bomb' || room.game.holderId !== socket.data.playerId) return done({error:'지금은 폭탄을 넘길 수 없습니다.'});
    if ((room.players.get(socket.data.playerId).penaltyUntil || 0) > Date.now()) return done({error:'패널티 중에는 폭탄을 넘길 수 없습니다.'});
    nextBombHolder(room);
    emitRoom(room);
    done({ok:true});
  });

  socket.on('game:mistake', (_, done) => {
    const room = rooms.get(socket.data.code);
    const player = room?.players.get(socket.data.playerId);
    if (!room || !player || room.status !== 'playing' || room.game?.type !== 'bomb' || room.game.holderId === player.id) return done({error:'패널티를 적용할 수 없습니다.'});
    player.penaltyUntil = room.settings.stackPenalty ? Math.max(Date.now(), player.penaltyUntil || 0) + 1000 : Date.now() + 1000;
    emitRoom(room);
    setTimeout(() => emitRoom(room), 1050).unref();
    done({ok:true});
  });

  socket.on('balloon:tap', (_, done) => {
    const room = rooms.get(socket.data.code);
    const player = room?.players.get(socket.data.playerId);
    if (!room || !player || room.status !== 'playing' || room.game?.type !== 'balloon') return done({error:'지금은 풍선을 누를 수 없습니다.'});
    const now = Date.now();
    if (now - (room.game.lastTapAt[player.id] || 0) < 90) return done({ok:true});
    room.game.lastTapAt[player.id] = now;
    room.game.count += 1;
    room.game.progress = Math.min(99, Math.floor(room.game.count / room.game.threshold * 100));
    if (room.game.count >= room.game.threshold) finishGame(room, [player.id], '돼지 풍선을 터뜨린 참가자!');
    else emitRoom(room);
    done({ok:true});
  });

  socket.on('freeze:hold', (_, done) => {
    const room = rooms.get(socket.data.code);
    if (!room || room.status !== 'playing' || room.game?.type !== 'freeze' || room.game.phase !== 'freeze') return done({error:'아직 얼음이 아닙니다.'});
    if (!room.game.responses.has(socket.data.playerId)) {
      room.game.responses.set(socket.data.playerId, Date.now());
      emitRoom(room);
    }
    done({ok:true});
  });

  socket.on('minority:choose', ({choice}, done) => {
    const room = rooms.get(socket.data.code);
    if (!room || room.status !== 'playing' || room.game?.type !== 'minority' || room.game.phase !== 'choose' || ![0, 1].includes(choice)) return done({error:'지금은 선택할 수 없습니다.'});
    room.game.responses.set(socket.data.playerId, choice);
    emitRoom(room);
    done({ok:true});
  });

  socket.on('silent:tap', (_, done) => {
    const room = rooms.get(socket.data.code);
    if (!room || room.status !== 'playing' || room.game?.type !== 'silentCount' || room.game.phase !== 'tap') return done({error:'잠시 기다려주세요.'});
    room.game.pendingIds.add(socket.data.playerId);
    if (!room.game.batchOpen) {
      room.game.batchOpen = true;
      room.timer = setTimeout(() => {
        const tapped = [...room.game.pendingIds];
        room.game.pendingIds.clear();
        room.game.batchOpen = false;
        if (tapped.length === 1) {
          room.game.count += 1;
          room.game.message = `${room.game.count}! 성공`;
          if (room.game.count >= room.game.target) return finishGame(room, tapped, '마지막 숫자를 완성한 참가자!');
          emitRoom(room);
        } else {
          tapped.forEach(id => room.game.strikes[id] = (room.game.strikes[id] || 0) + 1);
          room.game.collisions += 1;
          room.game.phase = 'collision';
          room.game.message = `${tapped.length}명이 동시에 눌렀어요!`;
          emitRoom(room);
          if (room.game.collisions >= 3) return finishGame(room, penaltyLeaders(room), '가장 많이 겹쳐 누른 참가자!');
          room.timer = setTimeout(() => {
            room.game.phase = 'tap';
            room.game.message = '다시 한 명씩!';
            emitRoom(room);
          }, 1100);
        }
      }, 420);
    }
    done({ok:true});
  });

  socket.on('game:reset', ({mode}, done) => {
    const room = rooms.get(socket.data.code);
    if (!room || room.hostId !== socket.data.playerId || room.status !== 'result') return done({error:'방장만 다시 시작할 수 있습니다.'});
    clearTimeout(room.timer);
    if (mode === 'choose') {
      room.status = 'choosing';
      room.game = null;
      emitRoom(room);
    } else {
      queueGame(room, room.selectedGame);
    }
    done({ok:true});
  });

  socket.on('game:change', ({type, settings}, done) => {
    const room = rooms.get(socket.data.code);
    if (!room || room.hostId !== socket.data.playerId || room.status !== 'choosing') return done({error:'게임을 변경할 수 없습니다.'});
    if (!gameTypes.includes(type)) return done({error:'지원하지 않는 게임입니다.'});
    room.selectedGame = type;
    room.settings = gameSettings(type, settings);
    queueGame(room, type);
    done({ok:true});
  });

  socket.on('game:abort', (_, done) => {
    const room = rooms.get(socket.data.code);
    if (!room || room.hostId !== socket.data.playerId || !['countdown', 'playing'].includes(room.status)) return done({error:'게임을 종료할 수 없습니다.'});
    clearTimeout(room.timer);
    room.status = 'lobby';
    room.game = null;
    emitRoom(room);
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

module.exports = { blockedNickname, gameSettings, httpServer, io, roomCode, shuffle, validNickname };
