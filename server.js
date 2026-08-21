const { createServer } = require('node:http');
const { randomInt } = require('node:crypto');
const { readFile } = require('node:fs');
const { join } = require('node:path');
const { Server } = require('socket.io');

const httpServer = createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const asset = path.match(/^\/assets\/([a-z0-9-]+\.png)$/)?.[1];
  const files = {'/':['index.html', 'text/html; charset=utf-8'], '/robots.txt':['robots.txt', 'text/plain; charset=utf-8'], '/sitemap.xml':['sitemap.xml', 'application/xml; charset=utf-8'], '/site.webmanifest':['site.webmanifest', 'application/manifest+json; charset=utf-8']};
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
const gameTypes = ['character', 'bomb', 'cards', 'stocks', 'race'];
const racers = [
  {id:'turtle', name:'번개 거북이', image:'racer-turtle.png'},
  {id:'worm', name:'질주 지렁이', image:'racer-worm.png'},
  {id:'human', name:'육상 인간', image:'racer-human.png'},
  {id:'car', name:'꼬마 자동차', image:'racer-car.png'},
  {id:'ufo', name:'초록 UFO', image:'racer-ufo.png'}
];
const random = maximum => randomInt(maximum);
const randomBetween = (minimum, maximum) => randomInt(minimum, maximum + 1);
const randomCard = () => randomBetween(1, 100);
const randomStockChange = country => country === 'KR' ? randomBetween(-3000, 3000) / 100 : randomBetween(-9900, 30000) / 100;
const marketRevealMs = require.main === module ? 3000 : 30;
const raceTiming = require.main === module ? {start:700, normal:320, finale:400} : {start:5, normal:2, finale:4};
const raceDuration = require.main === module ? 10_000 : 100;
const bombPenaltyMs = 2000;
const stockFeeRate = 0.001;
const stockList = [
  ['005930', '삼성전자', 'KR', '반도체'],
  ['000660', '에스케이하이닉스', 'KR', '메모리'],
  ['005380', '현대자동차', 'KR', '자동차'],
  ['000270', '기아', 'KR', '모빌리티'],
  ['068270', '셀트리온', 'KR', '바이오'],
  ['207940', '삼성바이오로직스', 'KR', '의약품'],
  ['105560', '케이비금융', 'KR', '은행'],
  ['055550', '신한지주', 'KR', '금융'],
  ['035420', '네이버', 'KR', '인터넷'],
  ['035720', '카카오', 'KR', '플랫폼'],
  ['005490', '포스코홀딩스', 'KR', '철강'],
  ['051910', '엘지화학', 'KR', '화학'],
  ['012450', '한화에어로스페이스', 'KR', '방산'],
  ['329180', '에이치디현대중공업', 'KR', '조선'],
  ['015760', '한국전력', 'KR', '전력'],
  ['030200', '케이티', 'KR', '통신'],
  ['090430', '아모레퍼시픽', 'KR', '뷰티'],
  ['097950', '씨제이제일제당', 'KR', '식품'],
  ['003490', '대한항공', 'KR', '항공'],
  ['028260', '삼성물산', 'KR', '건설'],
  ['MSFT', '마이크로소프트', 'US', '클라우드'],
  ['ORCL', '오라클', 'US', '데이터베이스'],
  ['XOM', '엑슨모빌', 'US', '에너지'],
  ['CVX', '셰브론', 'US', '석유'],
  ['JPM', '제이피모건', 'US', '투자은행'],
  ['GS', '골드만삭스', 'US', '자산관리'],
  ['NVDA', '엔비디아', 'US', 'AI'],
  ['TSLA', '테슬라', 'US', '전기차'],
  ['LLY', '일라이릴리', 'US', '제약'],
  ['UNH', '유나이티드헬스', 'US', '헬스케어'],
  ['AMZN', '아마존', 'US', '이커머스'],
  ['WMT', '월마트', 'US', '유통'],
  ['KO', '코카콜라', 'US', '음료'],
  ['MCD', '맥도날드', 'US', '외식'],
  ['DIS', '디즈니', 'US', '콘텐츠'],
  ['NFLX', '넷플릭스', 'US', '스트리밍'],
  ['BA', '보잉', 'US', '우주항공'],
  ['CAT', '캐터필러', 'US', '산업재'],
  ['NEE', '넥스트에라 에너지', 'US', '친환경전력'],
  ['PG', '프록터앤드갬블', 'US', '생활용품']
];

function selectStocks() {
  const selected = [];
  for (const country of shuffle(['KR', 'KR', 'KR', 'US', 'US', 'US'])) {
    const choices = shuffle(stockList).filter(stock => stock[2] === country && !selected.some(chosen => chosen[3] === stock[3]));
    selected.push(choices[0]);
  }
  return selected;
}
const pigScenes = {
  peek:['pig-peek.png', 'pig-spy.png', 'pig-detective.png', 'pig-ghost.png'],
  pop:['pig-mascot.png', 'pig-beer.png', 'pig-shot.png', 'pig-cheers.png', 'pig-pour.png', 'pig-dizzy.png', 'pig-disco.png', 'pig-selfie.png', 'pig-hide.png', 'pig-dj.png', 'pig-karaoke.png', 'pig-drum.png', 'pig-star.png', 'pig-bow.png', 'pig-sleep.png', 'pig-jump.png', 'pig-juggle.png', 'pig-bottle.png', 'pig-magician.png', 'pig-king.png', 'pig-weights.png', 'pig-yoga.png', 'pig-sneeze.png'],
  run:['pig-run.png', 'pig-tipsy.png', 'pig-moonwalk.png', 'pig-slide.png', 'pig-cartwheel.png', 'pig-parachute.png', 'pig-superhero.png', 'pig-skates.png', 'pig-banana.png', 'pig-umbrella.png', 'pig-rocket.png', 'pig-cowboy.png']
};

function gameSettings(type, input = {}) {
  if (type === 'character') {
    const winnerCount = ['random', ...Array.from({length:10}, (_, index) => String(index + 1))].includes(String(input.winnerCount)) ? String(input.winnerCount) : 'random';
    return {winnerCount};
  }
  if (type === 'bomb') return {duration:input.duration === '30-60' ? '30-60' : '15-30', stackPenalty:Boolean(input.stackPenalty)};
  if (type === 'stocks') return {days:Math.max(3, Math.min(7, Number(input.days) || 4))};
  return {};
}

function roomCode() {
  let code;
  do code = Array.from({length:6}, () => alphabet[random(alphabet.length)]).join('');
  while (rooms.has(code));
  return code;
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = random(i + 1);
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

function publicRoom(room, viewerId) {
  const myCards = room.game?.cardsById?.[viewerId] || [];
  const maySeeWaiting = room.game?.standing?.has(viewerId) || myCards.reduce((sum, card) => sum + card, 0) > 100;
  const cardEligible = room.game?.cardsById ? [...room.players.values()].filter(player => !room.game.standing.has(player.id) && room.game.cardsById[player.id].reduce((sum, card) => sum + card, 0) <= 100) : [];
  const waitingNames = maySeeWaiting ? cardEligible.map(player => player.nickname) : [];
  const game = room.game ? {type:room.game.type, phase:room.game.phase, move:room.game.move || null, pose:room.game.pose || null, posesById:room.game.posesById || {}, duration:room.game.duration || 1000, startsAt:room.game.startsAt || null, revealAt:room.game.revealAt || null, lastPass:room.game.lastPass || null, activeIds:room.game.activeIds || [], holderId:room.game.holderId || null, holderIds:room.game.holderIds || [], winnerIds:room.game.winnerIds || [], round:room.game.round || 0, day:room.game.day || 0, myCards, myChoice:room.game.choices?.[viewerId] ?? null, myStanding:room.game.standing?.has(viewerId) || false, choiceCount:room.game.standing?.size || 0, eligibleCount:cardEligible.length, waitingNames, rankings:room.game.phase === 'ranking' ? room.game.rankings : [], markets:room.game.markets || [], myCash:room.game.cashById?.[viewerId] ?? 0, myHoldings:room.game.holdingsById?.[viewerId] || {}, stockReadyIds:[...(room.game.stockReady || [])], stockRankings:room.game.type === 'stocks' && room.game.phase === 'ranking' ? room.game.stockRankings : [], racers:room.game.racers || [], racePositions:room.game.racePositions || {}, raceEvents:room.game.raceEvents || {}, raceTick:room.game.raceTick || 0, raceFinale:room.game.raceFinale || false, myRacer:room.game.raceChoices?.[viewerId] || null, raceChoiceCount:room.game.raceChoices ? Object.keys(room.game.raceChoices).length : 0, raceWinner:room.game.raceWinner || null} : null;
  return {code:room.code, status:room.status, hostId:room.hostId, selectedGame:room.selectedGame, settings:room.settings, game, players:[...room.players.values()].map(({id, nickname, ready, connected, penaltyUntil = 0}) => ({id, nickname, ready, connected, penaltyUntil}))};
}

function emitRoom(room) {
  room.players.forEach(player => player.socketId && io.to(player.socketId).emit('room:updated', publicRoom(room, player.id)));
}

function characterStep(room, stepsLeft) {
  if (room.status !== 'playing') return;
  const ids = [...room.players.values()].filter(player => player.connected).map(player => player.id);
  if (!ids.length) return;
  if (stepsLeft === 0) {
    const configured = room.settings.winnerCount;
    const winnerCount = Math.min(ids.length, configured === 'random' ? randomBetween(1, Math.min(10, ids.length)) : Number(configured));
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
  const pigCount = Math.min(ids.length, 1 + Math.floor(ids.length / 15));
  const split = stepsLeft <= 4 && stepsLeft >= 2 && ids.length > pigCount;
  room.game.activeIds = shuffle(ids).slice(0, Math.min(ids.length, pigCount + (split ? 1 : 0)));
  const sceneType = ['peek', 'pop', 'run'][random(3)];
  room.game.move = stepsLeft === 6 ? 'fakeout' : stepsLeft === 4 ? 'split' : stepsLeft === 1 ? 'merge' : sceneType === 'peek' ? (random(2) ? 'peekLeft' : 'peekRight') : sceneType;
  const scenePoses = pigScenes[sceneType];
  room.game.posesById = Object.fromEntries(room.game.activeIds.map(id => [id, scenePoses[random(scenePoses.length)]]));
  room.game.pose = room.game.posesById[room.game.activeIds[0]];
  room.game.duration = 700 + stepsLeft * 35;
  room.game.round += 1;
  emitRoom(room);
  room.timer = setTimeout(() => {
    room.game.activeIds = [];
    emitRoom(room);
    room.timer = setTimeout(() => characterStep(room, stepsLeft - 1), randomBetween(280, 599));
  }, room.game.duration);
}

function nextBombHolder(room, bombIndex) {
  const connectedIds = [...room.players.values()].filter(player => player.connected).map(player => player.id);
  const bomb = room.game.bombs[bombIndex];
  const unavailable = room.game.bombs.filter((_, index) => index !== bombIndex).map(item => item.holderId);
  const candidates = connectedIds.filter(id => !unavailable.includes(id));
  bomb.queue = bomb.queue.filter(id => candidates.includes(id));
  if (!bomb.queue.length) bomb.queue = shuffle(candidates);
  const previous = bomb.holderId;
  if (bomb.queue.length > 1 && bomb.queue[0] === previous) bomb.queue.push(bomb.queue.shift());
  bomb.holderId = bomb.queue.shift();
  room.game.holderIds = room.game.bombs.map(item => item.holderId);
  room.game.holderId = room.game.holderIds[0];
  room.game.lastPass = previous ? {fromId:previous, toId:bomb.holderId} : null;
  room.game.round += 1;
}

function queueGame(room, type) {
  clearTimeout(room.timer);
  room.status = 'countdown';
  room.game = {type, phase:'countdown', startsAt:Date.now() + 1000, activeIds:[], winnerIds:[], round:0};
  emitRoom(room);
  room.timer = setTimeout(() => startGame(room, type), 1000);
}

function finishCardChoices(room) {
  if (room.game?.type !== 'cards' || room.game.phase !== 'decide') return;
  const eligible = [...room.players.values()].filter(player => !room.game.standing.has(player.id) && room.game.cardsById[player.id].reduce((sum, card) => sum + card, 0) <= 100);
  if (eligible.length) return;
  room.game.phase = 'reveal';
  room.game.revealAt = Date.now() + 3000;
  emitRoom(room);
  room.timer = setTimeout(() => {
    room.game.rankings = [...room.players.values()].map(player => {
      const cards = room.game.cardsById[player.id];
      const total = cards.reduce((sum, card) => sum + card, 0);
      return {id:player.id, nickname:player.nickname, cards, total, busted:total > 100};
    }).sort((a, b) => Number(a.busted) - Number(b.busted) || (a.busted ? a.total - b.total : b.total - a.total));
    const winner = room.game.rankings.find(result => !result.busted);
    room.game.winnerIds = winner ? [winner.id] : [];
    room.game.phase = 'ranking';
    room.status = 'result';
    emitRoom(room);
  }, 3000);
}

function stockValue(room, playerId) {
  const holdings = room.game.holdingsById[playerId];
  return room.game.cashById[playerId] + room.game.markets.reduce((sum, stock) => sum + (holdings[stock.symbol] || 0) * stock.price, 0);
}

function closeStockDay(room) {
  if (room.game?.type !== 'stocks' || room.game.phase !== 'trade' || room.game.stockReady.size < room.players.size) return;
  room.game.phase = 'market';
  room.game.stockReady.clear();
  room.game.markets.forEach(stock => {
    stock.change = randomStockChange(stock.country);
    stock.price = Math.max(100, Math.round(stock.price * (1 + stock.change / 100)));
    stock.history.push(stock.price);
  });
  emitRoom(room);
  room.timer = setTimeout(() => {
    if (room.game.day === room.settings.days) {
      room.game.stockRankings = [...room.players.values()].map(player => ({id:player.id, nickname:player.nickname, value:Math.round(stockValue(room, player.id))})).sort((a, b) => b.value - a.value);
      const highest = room.game.stockRankings[0]?.value;
      room.game.winnerIds = room.game.stockRankings.filter(player => player.value === highest).map(player => player.id);
      room.game.phase = 'ranking';
      room.status = 'result';
    } else {
      room.game.day += 1;
      room.game.phase = 'trade';
    }
    emitRoom(room);
  }, marketRevealMs);
}

function raceStep(room) {
  if (room.status !== 'playing' || room.game?.type !== 'race') return;
  const slow = room.game.phase === 'finale';
  const incidents = ['backward', 'flipped', 'sick', 'broken'];
  room.game.raceTick += 1;
  room.game.raceEvents = {};
  racers.forEach(racer => {
    const roll = Math.random();
    const stopped = (room.game.raceStops[racer.id] || 0) > 0;
    const incident = stopped ? 'stopped' : !slow && roll < .08 ? 'backward' : !slow && roll < .18 ? 'boost' : !slow && roll < .30 ? incidents[randomBetween(1, incidents.length - 1)] : '';
    room.game.raceEvents[racer.id] = incident;
    if (stopped) room.game.raceStops[racer.id] -= 1;
    if (incident === 'backward') room.game.raceStops[racer.id] = randomBetween(1, 2);
    const distance = incident === 'backward' ? -randomBetween(4, 8) : incident === 'boost' ? randomBetween(6, 8) : ['stopped', 'flipped', 'sick', 'broken'].includes(incident) ? 0 : slow ? randomBetween(1, 2) : randomBetween(4, 6);
    room.game.racePositions[racer.id] = Math.min(98, Math.max(0, room.game.racePositions[racer.id] + distance));
  });
  const leaders = Object.values(room.game.racePositions).sort((a, b) => b - a);
  if (!slow && room.game.raceEndsAt - Date.now() <= raceDuration / 5 && leaders[0] >= 80 && leaders[0] - leaders[1] <= 6) {
    room.game.phase = 'finale';
    room.game.raceFinale = true;
  }
  if (Date.now() >= room.game.raceEndsAt) {
    const winner = shuffle(racers).sort((a, b) => room.game.racePositions[b.id] - room.game.racePositions[a.id])[0];
    room.game.raceWinner = winner;
    room.game.racePositions[winner.id] = 108;
    room.game.winnerIds = [...room.players.values()].filter(player => room.game.raceChoices[player.id] === winner.id).map(player => player.id);
    room.game.raceEvents = {};
    room.game.phase = 'finish';
    emitRoom(room);
    room.timer = setTimeout(() => {
      room.game.phase = 'ranking';
      room.status = 'result';
      emitRoom(room);
    }, raceTiming.finale * 2);
    return;
  }
  emitRoom(room);
  room.timer = setTimeout(() => raceStep(room), room.game.phase === 'finale' ? raceTiming.finale : raceTiming.normal);
}

function startRace(room) {
  room.game.phase = 'race';
  room.game.racePositions = Object.fromEntries(racers.map(racer => [racer.id, 0]));
  room.game.raceEvents = {};
  room.game.raceStops = Object.fromEntries(racers.map(racer => [racer.id, 0]));
  room.game.raceEndsAt = Date.now() + raceDuration;
  room.game.raceFinale = false;
  room.game.raceTick = 0;
  emitRoom(room);
  room.timer = setTimeout(() => raceStep(room), raceTiming.start);
}

function startGame(room, type) {
  clearTimeout(room.timer);
  room.status = 'playing';
  room.game = {type, phase:'playing', startsAt:Date.now(), move:null, pose:null, posesById:{}, duration:1000, activeIds:[], winnerIds:[], holderId:null, holderIds:[], lastPass:null, round:0};
  emitRoom(room);
  if (type === 'character') {
    room.timer = setTimeout(() => characterStep(room, randomBetween(12, 16)), 900);
  } else if (type === 'bomb') {
    room.game.bombs = Array.from({length:1 + Math.floor(room.players.size / 15)}, () => ({holderId:null, queue:[]}));
    room.game.bombs.forEach((_, index) => nextBombHolder(room, index));
    emitRoom(room);
    room.timer = setTimeout(() => {
      if (room.status !== 'playing') return;
      room.status = 'result';
      room.game.phase = 'result';
      room.game.winnerIds = [...room.game.holderIds];
      emitRoom(room);
    }, room.settings.duration === '30-60' ? randomBetween(30_000, 60_000) : randomBetween(15_000, 30_000));
  } else if (type === 'cards') {
    room.game.phase = 'decide';
    room.game.cardsById = {};
    room.game.choices = {};
    room.game.standing = new Set();
    room.players.forEach(player => room.game.cardsById[player.id] = [randomCard()]);
    emitRoom(room);
  } else if (type === 'stocks') {
    room.game.phase = 'trade';
    room.game.day = 1;
    room.game.markets = selectStocks().map(([symbol, name, country, sector]) => {
      const price = randomBetween(50_000, 300_000);
      const history = Array.from({length:4}, () => Math.max(100, Math.round(price * (1 + randomBetween(-2000, 2000) / 10_000))));
      return {symbol, name, country, sector, price, change:0, history:[...history, price]};
    });
    room.game.cashById = {};
    room.game.holdingsById = {};
    room.game.stockReady = new Set();
    room.players.forEach(player => {
      room.game.cashById[player.id] = 100_000_000;
      room.game.holdingsById[player.id] = {};
    });
    emitRoom(room);
  } else {
    room.game.phase = 'choose';
    room.game.racers = racers;
    room.game.raceChoices = {};
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
    done({room:publicRoom(room, playerId)});
  });

  socket.on('room:join', ({code, nickname, playerId}, done) => {
    code = String(code || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return done({error:'존재하지 않는 방입니다.'});
    if (room.status !== 'lobby') return done({error:'이미 게임이 시작되었습니다.'});
    if (blockedNickname(nickname)) return done({error:'해당 닉네임은 사용할 수 없습니다. 다른 닉네임을 골라주세요.'});
    if (!validNickname(nickname) || typeof playerId !== 'string') return done({error:'입력 정보를 확인해주세요.'});
    if ([...room.players.values()].some(player => player.nickname.toLowerCase() === nickname.trim().toLowerCase())) return done({error:'이미 사용 중인 닉네임입니다.'});
    if (room.players.size >= 40) return done({error:'참가 인원이 가득 찼습니다.'});
    room.players.set(playerId, {id:playerId, nickname:nickname.trim(), ready:false, connected:true, penaltyUntil:0, socketId:socket.id});
    socket.join(code);
    socket.data = {code, playerId};
    done({room:publicRoom(room, playerId)});
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
    done({room:publicRoom(room, playerId)});
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
    const bombIndex = room?.game?.bombs?.findIndex(bomb => bomb.holderId === socket.data.playerId) ?? -1;
    if (!room || room.status !== 'playing' || room.game?.type !== 'bomb' || bombIndex < 0) return done({error:'지금은 폭탄을 넘길 수 없습니다.'});
    if ((room.players.get(socket.data.playerId).penaltyUntil || 0) > Date.now()) return done({error:'패널티 중에는 폭탄을 넘길 수 없습니다.'});
    nextBombHolder(room, bombIndex);
    emitRoom(room);
    done({ok:true});
  });

  socket.on('game:mistake', (_, done) => {
    const room = rooms.get(socket.data.code);
    const player = room?.players.get(socket.data.playerId);
    if (!room || !player || room.status !== 'playing' || room.game?.type !== 'bomb' || room.game.holderIds.includes(player.id)) return done({error:'패널티를 적용할 수 없습니다.'});
    player.penaltyUntil = room.settings.stackPenalty ? Math.max(Date.now(), player.penaltyUntil || 0) + bombPenaltyMs : Date.now() + bombPenaltyMs;
    emitRoom(room);
    setTimeout(() => {
      if (player.penaltyUntil <= Date.now()) player.penaltyUntil = 0;
      emitRoom(room);
    }, Math.max(0, player.penaltyUntil - Date.now()) + 50).unref();
    done({ok:true});
  });

  socket.on('cards:choose', ({take}, done) => {
    const room = rooms.get(socket.data.code);
    if (!room || room.status !== 'playing' || room.game?.type !== 'cards' || room.game.phase !== 'decide') return done({error:'지금은 카드를 선택할 수 없습니다.'});
    const cards = room.game.cardsById[socket.data.playerId];
    if (room.game.standing.has(socket.data.playerId) || cards.reduce((sum, card) => sum + card, 0) > 100) return done({error:'이미 선택을 마쳤습니다.'});
    if (take) room.game.cardsById[socket.data.playerId].push(randomCard());
    else room.game.standing.add(socket.data.playerId);
    room.game.round += 1;
    emitRoom(room);
    finishCardChoices(room);
    done({ok:true});
  });

  socket.on('stocks:trade', ({symbol, side, quantity}, done) => {
    const room = rooms.get(socket.data.code);
    const playerId = socket.data.playerId;
    if (!room || room.status !== 'playing' || room.game?.type !== 'stocks' || room.game.phase !== 'trade' || room.game.stockReady.has(playerId)) return done({error:'지금은 거래할 수 없습니다.'});
    const stock = room.game.markets.find(item => item.symbol === symbol);
    quantity = Number(quantity);
    if (!stock || !['buy', 'sell'].includes(side) || !Number.isSafeInteger(quantity) || quantity < 1) return done({error:'거래 수량은 1주 이상 입력해주세요.'});
    const holdings = room.game.holdingsById[playerId];
    const amount = stock.price * quantity;
    const fee = Math.round(amount * stockFeeRate);
    if (side === 'buy') {
      if (amount + fee > room.game.cashById[playerId]) return done({error:'수수료를 포함한 주문금액이 보유 현금을 넘습니다.'});
      holdings[symbol] = (holdings[symbol] || 0) + quantity;
      room.game.cashById[playerId] -= amount + fee;
    } else {
      if (quantity > (holdings[symbol] || 0)) return done({error:'보유 주식보다 많이 팔 수 없습니다.'});
      holdings[symbol] -= quantity;
      room.game.cashById[playerId] += amount - fee;
    }
    emitRoom(room);
    done({ok:true});
  });

  socket.on('stocks:ready', ({ready}, done) => {
    const room = rooms.get(socket.data.code);
    if (!room || room.status !== 'playing' || room.game?.type !== 'stocks' || room.game.phase !== 'trade') return done({error:'지금은 투자 완료를 변경할 수 없습니다.'});
    if (ready) room.game.stockReady.add(socket.data.playerId);
    else room.game.stockReady.delete(socket.data.playerId);
    emitRoom(room);
    closeStockDay(room);
    done({ok:true});
  });

  socket.on('race:choose', ({racerId}, done) => {
    const room = rooms.get(socket.data.code);
    if (!room || room.status !== 'playing' || room.game?.type !== 'race' || room.game.phase !== 'choose' || !racers.some(racer => racer.id === racerId)) return done({error:'지금은 선수를 선택할 수 없습니다.'});
    room.game.raceChoices[socket.data.playerId] = racerId;
    emitRoom(room);
    if (Object.keys(room.game.raceChoices).length === room.players.size) startRace(room);
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
    if (room.status === 'playing' && room.game?.type === 'bomb') {
      const bombIndex = room.game.bombs.findIndex(bomb => bomb.holderId === player.id);
      if (bombIndex >= 0) nextBombHolder(room, bombIndex);
    }
    if (room.status === 'playing' && room.game?.type === 'cards' && room.game.phase === 'decide' && !room.game.standing.has(player.id) && room.game.cardsById[player.id].reduce((sum, card) => sum + card, 0) <= 100) {
      room.game.standing.add(player.id);
      finishCardChoices(room);
    }
    if (room.status === 'playing' && room.game?.type === 'stocks' && room.game.phase === 'trade') {
      room.game.stockReady.add(player.id);
      closeStockDay(room);
    }
    if (room.status === 'playing' && room.game?.type === 'race' && room.game.phase === 'choose' && !room.game.raceChoices[player.id]) {
      room.game.raceChoices[player.id] = racers[random(racers.length)].id;
      if (Object.keys(room.game.raceChoices).length === room.players.size) startRace(room);
    }
    emitRoom(room);
    const cleanupTimer = setTimeout(() => {
      if ([...room.players.values()].every(candidate => !candidate.connected)) { clearTimeout(room.timer); rooms.delete(room.code); }
    }, 30_000);
    cleanupTimer.unref();
  });
});

if (require.main === module) httpServer.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log(`http://localhost:${process.env.PORT || 3000}`));

module.exports = { blockedNickname, gameSettings, httpServer, io, roomCode, selectStocks, shuffle, validNickname };
