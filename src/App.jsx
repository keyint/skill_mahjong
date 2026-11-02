import React, { useState, useEffect, useRef } from 'react';
import {
  Coins, Flower, ChevronRight, Eye, Info, ArrowUpDown, Sparkles, RefreshCw, Trophy, Users, Check, Ban, Brain, AlertCircle, RotateCcw, RotateCw, Lock, Calculator, ChevronDown, ChevronUp, Timer, Globe, Copy, Play, Pause
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';

// --- 云端同步初始化 (支持跨设备联机 + 本地跨标签页 BroadcastChannel 双通道同步) ---
let db = null;
let auth = null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'skill-mahjong-online';

// 请确保这里的 API Key 替换成了你在 Firebase 后台复制的真实配置
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyD0e_IKe0jyW6pdohHNypyXn4eJZ9r3Q7I",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "skill-mahjong.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "skill-mahjong",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "skill-mahjong.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "800445625190",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:800445625190:web:b4103d3c8e76d4b98e8ea7"
};

try {
  const firebaseApp = initializeApp(firebaseConfig);
  auth = getAuth(firebaseApp);
  db = getFirestore(firebaseApp);
} catch (e) {
  console.warn("Firebase 初始化失败，请检查配置:", e);
}

// --- 常量与牌库定义 ---
const SUITS = ['万', '筒', '条'];
const WINDS = ['东风', '南风', '西风', '北风'];
const DRAGONS = ['中', '发', '白'];
const FLOWERS = ['春', '夏', '秋', '冬', '梅', '兰', '竹', '菊'];

const ALL_PLAYABLE_TILES = [
  ...SUITS.flatMap(s => [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `${n}${s}`)),
  ...WINDS
];

const AI_DIFFICULTIES = {
  EASY: { id: 'EASY', name: '简单 (休闲)', desc: 'AI 出牌较为随性，较少释放主动技能，适合熟悉规则。', color: 'text-emerald-400', border: 'border-emerald-500' },
  NORMAL: { id: 'NORMAL', name: '普通 (标准)', desc: 'AI 懂得保留搭子与对子，适时配合技能进攻，体验均衡。', color: 'text-blue-400', border: 'border-blue-500' },
  HARD: { id: 'HARD', name: '困难 (雀神)', desc: 'AI 精准计算进张与花数，会针对玩家花色封锁或抢回合。', color: 'text-red-400', border: 'border-red-500' }
};

const ROLES_INFO = {
  '老千': {
    name: '老千', title: '命运操盘手', color: 'from-amber-500 to-yellow-600', border: 'border-yellow-500', text: 'text-yellow-400',
    activeName: '千术 (1币)', activeDesc: '查看牌山顶端的3张牌，将其中1张直接收入手牌，其余2张按任意顺序放回牌山顶或牌山底。',
    passiveName: '步步生花', passiveDesc: '手中花牌数量大于4时触发：轮到老千的轮次时，可选择消耗1张花牌换取额外的抽牌打牌机会（可连续触发）。'
  },
  '麦咭': {
    name: '麦咭', title: '机械改装师', color: 'from-blue-500 to-cyan-600', border: 'border-blue-500', text: 'text-blue-400',
    activeName: '刻意求工 (1币)', activeDesc: '当其他玩家打出一张牌，而你手中只有1张相同的牌时，可将手里任意1张废牌当作第2张牌强行“碰”出。',
    passiveName: '花团锦簇', passiveDesc: '麦咭打出的每个副露（吃、碰、杠）可以额外算作半张花牌（0.5花）。'
  },
  '灵风': {
    name: '灵风', title: '疾风刺客', color: 'from-emerald-500 to-green-600', border: 'border-green-500', text: 'text-green-400',
    activeName: '乘风 (1币)', activeDesc: '无视上下家，当场上任意玩家打出一张牌时，灵风可以选择吃牌并跳转到灵风的轮次。',
    passiveName: '北风，北北风', passiveDesc: '灵风抽取的每一张北风牌自动算作 1 张花牌（自动置入花牌区并补牌），且拥有的其余风牌（东、南、西风）每张额外算作 0.5 张花牌。'
  },
  '典当师': {
    name: '典当师', title: '黑市垄断者', color: 'from-purple-500 to-fuchsia-600', border: 'border-purple-500', text: 'text-purple-400',
    activeName: '售罄 (1币)', activeDesc: '在出牌阶段使用。声明一种花色（万、筒、条）。下个回合开始前，全场禁止打出/胡/作为副露亮出该花色的牌（除非无其他牌可打）。',
    passiveName: '繁花似锦', passiveDesc: '手中的每一组暗刻和每一个技能币都额外算作 1 张花牌。'
  },
  '阿姨': {
    name: '阿姨', title: '牌桌统治者', color: 'from-rose-500 to-orange-600', border: 'border-rose-500', text: 'text-rose-400',
    activeName: '闲人免进 (1币) / 风水轮流转 (1币)', activeDesc: '【闲人免进】指定当前下家1巡禁止任何行动（禁响应、跳过摸打）；【风水轮流转】转换本局游戏的出牌顺序（顺时针⇄逆时针）。',
    passiveName: '神机妙算', passiveDesc: '开局自带记牌器，系统自动记录并实时展示每张牌剩下的未知数量。'
  }
};

const generatePureRandomDeck = () => {
  let deck = [];
  for (let s of SUITS) {
    for (let i = 1; i <= 9; i++) {
      for (let k = 0; k < 4; k++) deck.push(`${i}${s}`);
    }
  }
  for (let w of WINDS) {
    for (let k = 0; k < 4; k++) deck.push(w);
  }
  for (let d of DRAGONS) {
    for (let k = 0; k < 4; k++) deck.push(d);
  }
  for (let f of FLOWERS) {
    deck.push(`花-${f}`);
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

const isFlowerTile = (tile, role = null) => {
  if (!tile) return false;
  if (DRAGONS.includes(tile) || tile.startsWith('花-')) return true;
  if (role === '灵风' && tile === '北风') return true;
  return false;
};

const getTileSuit = (tile) => {
  if (tile.endsWith('万')) return '万';
  if (tile.endsWith('筒')) return '筒';
  if (tile.endsWith('条')) return '条';
  return '风';
};

const getTileSortWeight = (tile) => {
  if (tile.endsWith('万')) return parseInt(tile[0], 10);
  if (tile.endsWith('筒')) return 10 + parseInt(tile[0], 10);
  if (tile.endsWith('条')) return 20 + parseInt(tile[0], 10);
  const windOrder = { '东风': 31, '南风': 32, '西风': 33, '北风': 34 };
  return windOrder[tile] || 99;
};

const sortHandTiles = (hand) => {
  return [...hand].sort((a, b) => getTileSortWeight(a) - getTileSortWeight(b));
};

const drawAndResolveFlowers = (deck, count, role = null) => {
  let currentDeck = [...deck];
  let drawnHand = [];
  let drawnFlowers = [];

  while (drawnHand.length < count && currentDeck.length > 0) {
    const tile = currentDeck.shift();
    if (isFlowerTile(tile, role)) {
      drawnFlowers.push(tile);
    } else {
      drawnHand.push(tile);
    }
  }
  return { drawnHand, drawnFlowers, remainingDeck: currentDeck };
};

const getFlowerBreakdown = (player) => {
  const baseFlowers = player.flowerTiles.length;
  const mingGangCount = player.melds.filter(m => m.type === 'minggang').length;
  let bonus = 0;
  let details = [];

  if (player.role === '灵风') {
    const northInFlowers = player.flowerTiles.filter(t => t === '北风').length;
    const normalFlowers = baseFlowers - northInFlowers;
    details.push(`常规花牌: ${normalFlowers}`);
    if (northInFlowers > 0) details.push(`北风花牌: +${northInFlowers}`);

    const isOtherWind = (t) => t === '东风' || t === '南风' || t === '西风';
    const handOtherWinds = player.hand.filter(isOtherWind).length;
    const meldOtherWinds = player.melds.reduce((acc, m) => acc + m.tiles.filter(isOtherWind).length, 0);
    const discardOtherWinds = (player.discards || []).filter(isOtherWind).length;
    const otherWindBonus = (handOtherWinds + meldOtherWinds + discardOtherWinds) * 0.5;
    bonus += otherWindBonus;
    if (otherWindBonus > 0) details.push(`其余风牌(0.5/张): +${otherWindBonus}`);
  } else {
    details.push(`实体花牌: ${baseFlowers}`);
  }

  if (mingGangCount > 0) details.push(`明杠: +${mingGangCount}`);

  if (player.role === '麦咭') {
    const meldBonus = player.melds.length * 0.5;
    bonus += meldBonus;
    if (meldBonus > 0) details.push(`花团锦簇(副露): +${meldBonus}`);
  } else if (player.role === '典当师') {
    const coinBonus = player.coins;
    const counts = {};
    player.hand.forEach(t => counts[t] = (counts[t] || 0) + 1);
    const anKeBonus = Object.values(counts).filter(c => c >= 3).length;
    bonus += coinBonus + anKeBonus;
    if (coinBonus > 0) details.push(`技能币加成: +${coinBonus}`);
    if (anKeBonus > 0) details.push(`暗刻加成: +${anKeBonus}`);
  }

  const rawTotal = Math.round((baseFlowers + mingGangCount + bonus) * 10) / 10;
  return { total: rawTotal, details };
};

const canFormSets = (tiles) => {
  if (tiles.length === 0) return true;
  const sorted = sortHandTiles(tiles);
  const first = sorted[0];

  if (sorted.filter(t => t === first).length >= 3) {
    const next = [...sorted];
    for (let i = 0; i < 3; i++) next.splice(next.indexOf(first), 1);
    if (canFormSets(next)) return true;
  }

  const suit = getTileSuit(first);
  if (SUITS.includes(suit)) {
    const num = parseInt(first[0], 10);
    if (num <= 7) {
      const t2 = `${num + 1}${suit}`;
      const t3 = `${num + 2}${suit}`;
      if (sorted.includes(t2) && sorted.includes(t3)) {
        const next = [...sorted];
        next.splice(next.indexOf(first), 1);
        next.splice(next.indexOf(t2), 1);
        next.splice(next.indexOf(t3), 1);
        if (canFormSets(next)) return true;
      }
    }
  }
  return false;
};

const isPureMahjongWinPattern = (handTiles, meldCount) => {
  if (meldCount === 0 && handTiles.length === 14) {
    const counts = {};
    handTiles.forEach(t => counts[t] = (counts[t] || 0) + 1);
    const isSevenPairs = Object.values(counts).every(c => c === 2 || c === 4);
    if (isSevenPairs) return { valid: true, patternName: '七小对' };
  }

  if (handTiles.length + meldCount * 3 !== 14) {
    return { valid: false };
  }

  const uniqueTiles = [...new Set(handTiles)];
  for (let pairTile of uniqueTiles) {
    if (handTiles.filter(t => t === pairTile).length >= 2) {
      const remaining = [...handTiles];
      remaining.splice(remaining.indexOf(pairTile), 1);
      remaining.splice(remaining.indexOf(pairTile), 1);
      if (canFormSets(remaining)) {
        return { valid: true, patternName: '标准胡牌' };
      }
    }
  }

  return { valid: false };
};

const checkCanHu = (player, extraTile = null, bannedSuitInfo = null) => {
  const allHand = extraTile ? [...player.hand, extraTile] : [...player.hand];
  const meldCount = player.melds.length;

  const patternRes = isPureMahjongWinPattern(allHand, meldCount);
  if (!patternRes.valid) {
    return { canHu: false, lockedReason: null };
  }

  const targetHuTile = extraTile || player.hand[player.hand.length - 1];
  if (bannedSuitInfo && bannedSuitInfo.ownerId !== player.id && targetHuTile) {
    const huTileSuit = getTileSuit(targetHuTile);
    if (huTileSuit === bannedSuitInfo.suit) {
      return {
        canHu: false,
        lockedReason: `受【典当师·售罄】封锁，当前回合禁止胡「${bannedSuitInfo.suit}」花色的牌！`
      };
    }
  }

  const hasPeng = player.melds.some(m => m.type === 'peng');
  const { total: totalFlowers } = getFlowerBreakdown(player);
  if (hasPeng && Math.round(totalFlowers * 10) < 40) {
    return {
      canHu: false,
      lockedReason: `副露含有「碰」牌，需满 4 花才可胡牌（当前 ${totalFlowers} 花）`
    };
  }

  const typeLabel = patternRes.patternName === '七小对'
    ? '七小对'
    : (hasPeng ? '碰牌胡 (满4花解锁)' : '平胡/门清胡');

  return { canHu: true, type: typeLabel, lockedReason: null };
};

const getTingTiles = (player, bannedSuitInfo = null) => {
  if (player.hand.length + player.melds.length * 3 !== 13) return [];
  const tingList = [];
  for (let candidate of ALL_PLAYABLE_TILES) {
    if (player.role === '灵风' && candidate === '北风') continue;
    const patternRes = isPureMahjongWinPattern([...player.hand, candidate], player.melds.length);
    if (patternRes.valid) {
      const fullCheck = checkCanHu(player, candidate, bannedSuitInfo);
      tingList.push({
        tile: candidate,
        canHuNow: fullCheck.canHu,
        lockedReason: fullCheck.lockedReason
      });
    }
  }
  return tingList;
};

const getValidChiCombinations = (hand, discardedTile, bannedSuit) => {
  const suit = getTileSuit(discardedTile);
  if (!SUITS.includes(suit)) return [];
  if (bannedSuit && suit === bannedSuit) return [];

  const num = parseInt(discardedTile[0], 10);
  const combos = [];
  const patterns = [
    [num - 2, num - 1],
    [num - 1, num + 1],
    [num + 1, num + 2]
  ];

  patterns.forEach(([n1, n2]) => {
    if (n1 >= 1 && n2 <= 9) {
      const t1 = `${n1}${suit}`;
      const t2 = `${n2}${suit}`;
      if (hand.includes(t1) && hand.includes(t2)) {
        combos.push([t1, t2]);
      }
    }
  });
  return combos;
};

const computeRemainingTileCounts = (players, viewerId = 0) => {
  const counts = {};
  ALL_PLAYABLE_TILES.forEach(t => counts[t] = 4);
  DRAGONS.forEach(d => counts[d] = 4);
  counts['八花'] = 8;

  if (!players || players.length === 0) return counts;

  const deduct = (tile) => {
    if (!tile) return;
    if (tile.startsWith('花-')) {
      counts['八花'] = Math.max(0, counts['八花'] - 1);
    } else if (counts[tile] !== undefined) {
      counts[tile] = Math.max(0, counts[tile] - 1);
    }
  };

  players.forEach(p => {
    if (p.id === viewerId) {
      p.hand.forEach(deduct);
    }
    p.discards.forEach(deduct);
    p.flowerTiles.forEach(deduct);
    p.melds.forEach(m => {
      if (m.fakeTile) {
        deduct(m.tiles[0]);
        deduct(m.tiles[1]);
        deduct(m.fakeTile);
      } else {
        m.tiles.forEach(deduct);
      }
    });
  });

  return counts;
};

export default function App() {
  const [gameMode, setGameMode] = useState('SINGLE'); 
  const [user, setUser] = useState(null);
  const [playerName, setPlayerName] = useState('雀神玩家');
  const [roomCode, setRoomCode] = useState('');
  const [activeRoomCode, setActiveRoomCode] = useState('');
  const [mySeatId, setMySeatId] = useState(0); 
  const [roomSeats, setRoomSeats] = useState([
    { seatId: 0, uid: 'local', name: '雀神玩家', role: '阿姨', isAI: false },
    { seatId: 1, uid: null, name: 'AI-1 (待加入)', role: '麦咭', isAI: true },
    { seatId: 2, uid: null, name: 'AI-2 (待加入)', role: '灵风', isAI: true },
    { seatId: 3, uid: null, name: 'AI-3 (待加入)', role: '典当师', isAI: true }
  ]);
  const [copySuccess, setCopySuccess] = useState(false);

  const [selectedHumanRole, setSelectedHumanRole] = useState('阿姨');
  const [aiDifficulty, setAiDifficulty] = useState('NORMAL');
  const [showRoleSelectModal, setShowRoleSelectModal] = useState(true);

  const [deck, setDeck] = useState([]);
  const [players, setPlayers] = useState([]);
  const [turn, setTurn] = useState(0);
  const [turnDirection, setTurnDirection] = useState(1);
  const [gamePhase, setGamePhase] = useState('ROLE_SELECT');

  const [timeLeft, setTimeLeft] = useState(30);
  const [timerEnabled, setTimerEnabled] = useState(true);

  const [logs, setLogs] = useState([]);
  const [lastDiscard, setLastDiscard] = useState(null);
  const [bannedSuitInfo, setBannedSuitInfo] = useState(null);
  const [winnerInfo, setWinnerInfo] = useState(null);

  const [laoqianExtraQueued, setLaoqianExtraQueued] = useState(false);
  const [showCardCounter, setShowCardCounter] = useState(true);
  const [selectedHandIdx, setSelectedHandIdx] = useState(null);

  const [qianshuData, setQianshuData] = useState(null);
  const [maijiModal, setMaijiModal] = useState(false);
  const [lingfengCombos, setLingfengCombos] = useState(null);
  const [pawnModal, setPawnModal] = useState(false);
  const [pendingReactions, setPendingReactions] = useState(null);

  const logsEndRef = useRef(null);
  const broadcastChannelRef = useRef(null);
  const isApplyingRemoteRef = useRef(false);

  useEffect(() => {
    if (auth) {
      const initAuth = async () => {
        try {
          if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
          } else {
            await signInAnonymously(auth);
          }
        } catch (e) {
          console.warn('Auth fallback:', e);
        }
      };
      initAuth();
      const unsubscribe = onAuthStateChanged(auth, setUser);
      return () => unsubscribe();
    }
  }, []);

  useEffect(() => {
    if (gameMode !== 'ONLINE' || !activeRoomCode) return;

    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(`mahjong_room_${activeRoomCode}`);
      broadcastChannelRef.current = bc;
      bc.onmessage = (event) => {
        const data = event.data;
        if (data && data.type === 'ROOM_SYNC') {
          applyRemoteRoomState(data.payload);
        }
      };
    }

    let unsubFirestore = null;
    if (db) {
      const roomRef = doc(db, 'mahjong_rooms', activeRoomCode);
      unsubFirestore = onSnapshot(
        roomRef,
        (snapshot) => {
          if (snapshot.exists()) {
            applyRemoteRoomState(snapshot.data());
          }
        },
        (err) => console.warn('Firestore room snapshot error:', err)
      );
    }

    return () => {
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
        broadcastChannelRef.current = null;
      }
      if (unsubFirestore) unsubFirestore();
    };
  }, [gameMode, activeRoomCode]);

  const applyRemoteRoomState = (remote) => {
    if (!remote) return;
    isApplyingRemoteRef.current = true;
    if (remote.roomSeats) setRoomSeats(JSON.parse(remote.roomSeats));
    if (remote.aiDifficulty) setAiDifficulty(remote.aiDifficulty);

    if (remote.gameStarted) {
      setShowRoleSelectModal(false);
      if (remote.deck) setDeck(JSON.parse(remote.deck));
      if (remote.players) setPlayers(JSON.parse(remote.players));
      if (remote.turn !== undefined) setTurn(remote.turn);
      if (remote.turnDirection !== undefined) setTurnDirection(remote.turnDirection);
      if (remote.gamePhase) setGamePhase(remote.gamePhase);
      if (remote.logs) setLogs(JSON.parse(remote.logs));
      if (remote.lastDiscard !== undefined) setLastDiscard(remote.lastDiscard ? JSON.parse(remote.lastDiscard) : null);
      if (remote.bannedSuitInfo !== undefined) setBannedSuitInfo(remote.bannedSuitInfo ? JSON.parse(remote.bannedSuitInfo) : null);
      if (remote.winnerInfo !== undefined) setWinnerInfo(remote.winnerInfo ? JSON.parse(remote.winnerInfo) : null);
      if (remote.pendingReactions !== undefined) setPendingReactions(remote.pendingReactions ? JSON.parse(remote.pendingReactions) : null);
    }
    setTimeout(() => {
      isApplyingRemoteRef.current = false;
    }, 60);
  };

  const pushRoomState = async (overrides = {}) => {
    if (gameMode !== 'ONLINE' || !activeRoomCode || isApplyingRemoteRef.current) return;

    const payload = {
      roomCode: activeRoomCode,
      roomSeats: JSON.stringify(overrides.roomSeats || roomSeats),
      aiDifficulty: overrides.aiDifficulty || aiDifficulty,
      gameStarted: overrides.gameStarted !== undefined ? overrides.gameStarted : !showRoleSelectModal,
      deck: JSON.stringify(overrides.deck || deck),
      players: JSON.stringify(overrides.players || players),
      turn: overrides.turn !== undefined ? overrides.turn : turn,
      turnDirection: overrides.turnDirection !== undefined ? overrides.turnDirection : turnDirection,
      gamePhase: overrides.gamePhase || gamePhase,
      logs: JSON.stringify(overrides.logs || logs),
      lastDiscard: JSON.stringify(overrides.lastDiscard !== undefined ? overrides.lastDiscard : lastDiscard),
      bannedSuitInfo: JSON.stringify(overrides.bannedSuitInfo !== undefined ? overrides.bannedSuitInfo : bannedSuitInfo),
      winnerInfo: JSON.stringify(overrides.winnerInfo !== undefined ? overrides.winnerInfo : winnerInfo),
      pendingReactions: JSON.stringify(overrides.pendingReactions !== undefined ? overrides.pendingReactions : pendingReactions),
      updatedAt: Date.now()
    };

    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({ type: 'ROOM_SYNC', payload });
    }

    if (db) {
      try {
        const roomRef = doc(db, 'mahjong_rooms', activeRoomCode);
        await setDoc(roomRef, payload, { merge: true });
      } catch (e) {
        console.warn('Failed to sync state to cloud:', e);
      }
    }
  };

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const addLog = (msg) => {
    setLogs(prev => [...prev, msg]);
  };

  useEffect(() => {
    if (['DRAW', 'ACTION', 'REACTION', 'LAOQIAN_EXTRA_PROMPT', 'SKILL_MODAL'].includes(gamePhase) && !showRoleSelectModal) {
      setTimeLeft(30);
    }
  }, [turn, gamePhase, showRoleSelectModal]);

  useEffect(() => {
    if (!timerEnabled || showRoleSelectModal) return;
    if (!['DRAW', 'ACTION', 'REACTION', 'LAOQIAN_EXTRA_PROMPT', 'SKILL_MODAL'].includes(gamePhase)) return;

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          handleTurnTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [turn, gamePhase, timerEnabled, showRoleSelectModal, pendingReactions, qianshuData, players]);

  const handleTurnTimeout = () => {
    if (gamePhase === 'REACTION' && pendingReactions) {
      if (pendingReactions.responderId === undefined || pendingReactions.responderId === mySeatId) {
        addLog(`⏰ [${players[mySeatId]?.role}] 响应思考超时（30秒），系统已自动选择【过】！`);
        handleHumanPassReaction();
      }
      return;
    }

    if (gamePhase === 'LAOQIAN_EXTRA_PROMPT' && turn === mySeatId) {
      addLog(`⏰ [${players[mySeatId]?.role}] 步步生花确认超时（30秒），自动结束本回合！`);
      const nextId = getNextPlayerId(mySeatId, turnDirection);
      advanceTurn(nextId, players);
      return;
    }

    if (turn === mySeatId) {
      const me = players[mySeatId];
      if (!me) return;

      if (gamePhase === 'DRAW') {
        addLog(`⏰ [${me.role}] 摸牌超时（30秒），系统自动执行摸牌！`);
        handleDrawTile(mySeatId);
      } else if (gamePhase === 'SKILL_MODAL' && qianshuData) {
        addLog(`⏰ [${me.role}] 千术操作超时（30秒），系统自动确认千术！`);
        handleConfirmQianshu();
      } else if (gamePhase === 'ACTION') {
        let discardIdx = me.hand.length - 1;
        for (let i = me.hand.length - 1; i >= 0; i--) {
          if (canPlayerDiscardTile(me, me.hand[i])) {
            discardIdx = i;
            break;
          }
        }
        addLog(`⏰ [${me.role}] 出牌超时（30秒），系统自动打出【${me.hand[discardIdx]}】！`);
        executeDiscard(mySeatId, discardIdx);
      }
    }
  };

  const getNextPlayerId = (currentId, dir = turnDirection) => (currentId + dir + 4) % 4;
  const getUpperPlayerId = (currentId, dir = turnDirection) => (currentId - dir + 4) % 4;

  const handleCreateOrJoinRoom = async (targetCode) => {
    if (!db) {
      alert('Firebase Firestore 未初始化！');
      return;
    }

    let currentUser = auth?.currentUser || user;
    if (!currentUser && auth) {
      try {
        const cred = await signInAnonymously(auth);
        currentUser = cred.user;
        setUser(currentUser);
      } catch (authErr) {
        console.warn('Auth fallback:', authErr);
      }
    }
    const myUid = currentUser?.uid || `guest_${Math.random().toString(36).slice(2, 8)}`;

    const cleanCode = (targetCode || roomCode || Math.floor(1000 + Math.random() * 9000).toString()).trim().toUpperCase();
    setRoomCode(cleanCode);
    setActiveRoomCode(cleanCode);

    const roomRef = doc(db, 'mahjong_rooms', cleanCode);

    try {
      const snap = await getDoc(roomRef);

      if (snap.exists()) {
        const data = snap.data();
        const existingSeats = data.roomSeats ? JSON.parse(data.roomSeats) : roomSeats;

        let assignedSeat = existingSeats.findIndex(s => s.uid === myUid);
        if (assignedSeat === -1) {
          assignedSeat = existingSeats.findIndex(s => s.isAI);
        }
        if (assignedSeat === -1) assignedSeat = 0;

        const usedRoles = existingSeats.filter((_, i) => i !== assignedSeat).map(s => s.role);
        const availableRole = !usedRoles.includes(selectedHumanRole)
          ? selectedHumanRole
          : Object.keys(ROLES_INFO).find(r => !usedRoles.includes(r)) || '麦咭';

        const updatedSeats = existingSeats.map((s, idx) =>
          idx === assignedSeat
            ? { seatId: idx, uid: myUid, name: playerName || `玩家${idx + 1}`, role: availableRole, isAI: false }
            : s
        );

        setMySeatId(assignedSeat);
        setSelectedHumanRole(availableRole);
        setRoomSeats(updatedSeats);

        await setDoc(roomRef, {
          roomCode: cleanCode,
          roomSeats: JSON.stringify(updatedSeats),
          updatedAt: Date.now()
        }, { merge: true });
        return;
      }

      const allRoles = Object.keys(ROLES_INFO);
      const otherRoles = allRoles.filter(r => r !== selectedHumanRole);
      const initSeats = [
        { seatId: 0, uid: myUid, name: playerName || '房主', role: selectedHumanRole, isAI: false },
        { seatId: 1, uid: null, name: 'AI-1 (可加入)', role: otherRoles[0], isAI: true },
        { seatId: 2, uid: null, name: 'AI-2 (可加入)', role: otherRoles[1], isAI: true },
        { seatId: 3, uid: null, name: 'AI-3 (可加入)', role: otherRoles[2], isAI: true }
      ];

      setMySeatId(0);
      setRoomSeats(initSeats);

      await setDoc(roomRef, {
        roomCode: cleanCode,
        roomSeats: JSON.stringify(initSeats),
        gameStarted: false,
        updatedAt: Date.now()
      });
    } catch (error) {
      console.error('Room error:', error);
      alert(`联机失败：${error.message}`);
    }
  };

  const handleSelectOnlineSeat = (targetSeatId) => {
    const myUid = user?.uid || 'local';
    const updated = roomSeats.map(s => {
      if (s.seatId === targetSeatId) {
        return { seatId: targetSeatId, uid: myUid, name: playerName || `玩家${targetSeatId + 1}`, role: selectedHumanRole, isAI: false };
      }
      if (s.seatId === mySeatId) {
        return { seatId: mySeatId, uid: null, name: `AI-${mySeatId} (可加入)`, role: s.role, isAI: true };
      }
      return s;
    });
    setMySeatId(targetSeatId);
    setRoomSeats(updated);
    pushRoomState({ roomSeats: updated, gameStarted: false });
  };

  const handleChangeRoleInLobby = (newRole) => {
    setSelectedHumanRole(newRole);
    if (gameMode === 'ONLINE' && activeRoomCode) {
      const updated = roomSeats.map(s =>
        s.seatId === mySeatId ? { ...s, role: newRole, name: playerName } : s
      );
      setRoomSeats(updated);
      pushRoomState({ roomSeats: updated, gameStarted: false });
    }
  };

  const startNewGame = (chosenRole = selectedHumanRole, chosenDiff = aiDifficulty) => {
    const allRoles = ['老千', '麦咭', '灵风', '典当师', '阿姨'];
    let freshDeck = generatePureRandomDeck();
    const positions = ['bottom', 'right', 'top', 'left'];

    let initPlayers = [];

    if (gameMode === 'ONLINE' && activeRoomCode) {
      const usedRoles = new Set();
      const resolvedSeats = roomSeats.map((seat, idx) => {
        let r = seat.role;
        if (usedRoles.has(r)) {
          r = allRoles.find(cand => !usedRoles.has(cand)) || r;
        }
        usedRoles.add(r);
        return { ...seat, role: r, id: idx };
      });

      initPlayers = resolvedSeats.map((seat, idx) => {
        const { drawnHand, drawnFlowers, remainingDeck } = drawAndResolveFlowers(freshDeck, 13, seat.role);
        freshDeck = remainingDeck;
        return {
          id: idx,
          name: seat.isAI ? `AI-${idx}` : seat.name,
          role: seat.role,
          isAI: seat.isAI,
          coins: 2,
          hand: sortHandTiles(drawnHand),
          flowerTiles: drawnFlowers,
          melds: [],
          discards: [],
          isFrozen: false,
          position: positions[idx]
        };
      });
    } else {
      setMySeatId(0);
      const remainingRoles = allRoles.filter(r => r !== chosenRole);
      for (let i = remainingRoles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remainingRoles[i], remainingRoles[j]] = [remainingRoles[j], remainingRoles[i]];
      }
      const seatRoles = [chosenRole, ...remainingRoles.slice(0, 3)];

      initPlayers = seatRoles.map((role, idx) => {
        const { drawnHand, drawnFlowers, remainingDeck } = drawAndResolveFlowers(freshDeck, 13, role);
        freshDeck = remainingDeck;
        return {
          id: idx,
          name: idx === 0 ? '你' : `AI-${idx}`,
          role,
          isAI: idx !== 0,
          coins: 2,
          hand: sortHandTiles(drawnHand),
          flowerTiles: drawnFlowers,
          melds: [],
          discards: [],
          isFrozen: false,
          position: positions[idx]
        };
      });
    }

    const initialLogs = [
      `🎲 牌局开始！模式：【${gameMode === 'ONLINE' ? `联机房 #${activeRoomCode}` : AI_DIFFICULTIES[chosenDiff].name}】，每步限时 30 秒。`,
      `👤 你的座位：${mySeatId}号位【${initPlayers[mySeatId]?.role}】，开局拥有 2 枚技能币。`
    ];
    initPlayers.forEach(p => {
      if (p.role === '灵风') {
        const northCount = p.flowerTiles.filter(t => t === '北风').length;
        if (northCount > 0) {
          initialLogs.push(`🌪️ 【灵风】开局触发《北风，北北风》，摸到的 ${northCount} 张【北风】已自动置入花牌区并补牌！`);
        }
      }
    });
    if (initPlayers[mySeatId]?.role === '阿姨') {
      initialLogs.push(`🧮 【阿姨】被动《神机妙算》已激活！记牌器已为你实时开启。`);
    }

    setDeck(freshDeck);
    setPlayers(initPlayers);
    setTurn(0);
    setTurnDirection(1);
    setTimeLeft(30);
    setLastDiscard(null);
    setBannedSuitInfo(null);
    setWinnerInfo(null);
    setLaoqianExtraQueued(false);
    setSelectedHandIdx(null);
    setPendingReactions(null);
    setQianshuData(null);
    setMaijiModal(false);
    setLingfengCombos(null);
    setPawnModal(false);
    setShowRoleSelectModal(false);
    setShowCardCounter(initPlayers[mySeatId]?.role === '阿姨');
    setGamePhase('DRAW');
    setLogs(initialLogs);

    if (gameMode === 'ONLINE' && activeRoomCode) {
      pushRoomState({
        gameStarted: true,
        deck: freshDeck,
        players: initPlayers,
        turn: 0,
        turnDirection: 1,
        gamePhase: 'DRAW',
        logs: initialLogs,
        lastDiscard: null,
        bannedSuitInfo: null,
        winnerInfo: null,
        pendingReactions: null
      });
    }
  };

  const advanceTurn = (targetPlayerId, currentPlayersState = players, customLogs = null) => {
    let actualNextId = targetPlayerId;
    let workingPlayers = [...currentPlayersState];
    let nextBannedSuit = bannedSuitInfo;
    let workingLogs = customLogs ? [...customLogs] : [...logs];

    for (let step = 0; step < 4; step++) {
      const targetObj = workingPlayers[actualNextId];
      if (!targetObj) break;

      if (nextBannedSuit && nextBannedSuit.ownerId === actualNextId) {
        workingLogs.push(`🔓 轮回到【典当师】，「售罄」对【${nextBannedSuit.suit}】花色的封锁已解除！`);
        nextBannedSuit = null;
        setBannedSuitInfo(null);
      }

      if (targetObj.isFrozen) {
        workingLogs.push(`⛔ [${targetObj.role}](${targetObj.name}) 受【阿姨·闲人免进】限制，本巡禁止任何行动，直接跳过回合！`);
        workingPlayers = workingPlayers.map(p =>
          p.id === actualNextId ? { ...p, isFrozen: false } : p
        );
        actualNextId = getNextPlayerId(actualNextId, turnDirection);
      } else {
        break;
      }
    }

    setLogs(workingLogs);
    setPlayers(workingPlayers);
    setTurn(actualNextId);
    setSelectedHandIdx(null);
    setGamePhase('DRAW');

    if (gameMode === 'ONLINE') {
      pushRoomState({
        players: workingPlayers,
        turn: actualNextId,
        gamePhase: 'DRAW',
        bannedSuitInfo: nextBannedSuit,
        logs: workingLogs,
        pendingReactions: null
      });
    }
  };

  const handleDrawTile = (playerId, isExtraFlowersSkill = false, customPlayers = null) => {
    const activePlayers = customPlayers || players;
    const targetPlayer = activePlayers[playerId];
    if (!targetPlayer) return;

    const expectedBeforeDraw = 13 - targetPlayer.melds.length * 3;
    if (targetPlayer.hand.length > expectedBeforeDraw) {
      setGamePhase('ACTION');
      return;
    }

    if (deck.length === 0) {
      setGamePhase('DRAW_GAME');
      addLog(`🛑 牌山已摸空，本局荒牌流局！`);
      return;
    }

    const { drawnHand, drawnFlowers, remainingDeck } = drawAndResolveFlowers(deck, 1, targetPlayer.role);
    if (drawnHand.length === 0) {
      setDeck(remainingDeck);
      setGamePhase('DRAW_GAME');
      addLog(`🛑 补花时牌山已摸空，本局荒牌流局！`);
      return;
    }

    setDeck(remainingDeck);

    let nextLogs = [...logs];
    if (drawnFlowers.length > 0) {
      const hasNorth = targetPlayer.role === '灵风' && drawnFlowers.includes('北风');
      if (hasNorth) {
        nextLogs.push(`🌪️ [灵风] 摸到花牌/北风 (${drawnFlowers.join('、')})，触发《北风，北北风》自动置入花牌区并补牌！`);
      } else {
        nextLogs.push(`🌸 [${targetPlayer.role}] 摸到花牌 (${drawnFlowers.join('、')})，自动亮出并补牌！`);
      }
    }

    if (isExtraFlowersSkill) {
      nextLogs.push(`🌺 [${targetPlayer.role}] 发动《步步生花》额外摸入1张牌，请继续出牌！`);
    }

    const updatedPlayers = activePlayers.map(p => {
      if (p.id === playerId) {
        return {
          ...p,
          hand: [...p.hand, ...drawnHand],
          flowerTiles: [...p.flowerTiles, ...drawnFlowers]
        };
      }
      return p;
    });

    setLogs(nextLogs);
    setPlayers(updatedPlayers);
    setGamePhase('ACTION');

    if (gameMode === 'ONLINE') {
      pushRoomState({
        deck: remainingDeck,
        players: updatedPlayers,
        gamePhase: 'ACTION',
        logs: nextLogs
      });
    }
  };

  const canPlayerDiscardTile = (player, tile) => {
    if (!bannedSuitInfo || bannedSuitInfo.ownerId === player.id) return true;
    const suit = getTileSuit(tile);
    if (suit !== bannedSuitInfo.suit) return true;
    const hasOtherOption = player.hand.some(t => getTileSuit(t) !== bannedSuitInfo.suit);
    return !hasOtherOption;
  };

  const handleHumanTileClick = (index) => {
    const human = players[mySeatId];
    if (!human) return;

    if (turn !== mySeatId || gamePhase !== 'ACTION') {
      if (selectedHandIdx === null) {
        setSelectedHandIdx(index);
      } else {
        if (selectedHandIdx !== index) {
          setPlayers(prev => prev.map(p => {
            if (p.id === mySeatId) {
              const newHand = [...p.hand];
              [newHand[selectedHandIdx], newHand[index]] = [newHand[index], newHand[selectedHandIdx]];
              return { ...p, hand: newHand };
            }
            return p;
          }));
        }
        setSelectedHandIdx(null);
      }
      return;
    }

    const tile = human.hand[index];
    if (!canPlayerDiscardTile(human, tile)) {
      addLog(`⚠️ 无法打出 [${tile}]！当前处于【典当师-售罄】封锁期，禁止打出「${bannedSuitInfo.suit}」花色！`);
      return;
    }

    executeDiscard(mySeatId, index);
  };

  const handleAutoSortHumanHand = () => {
    setPlayers(prev => prev.map(p => p.id === mySeatId ? { ...p, hand: sortHandTiles(p.hand) } : p));
    setSelectedHandIdx(null);
  };

  const executeDiscard = (playerId, tileIndex) => {
    const player = players[playerId];
    const discardedTile = player.hand[tileIndex];

    const updatedPlayers = players.map(p => {
      if (p.id === playerId) {
        const nextHand = [...p.hand];
        nextHand.splice(tileIndex, 1);
        return {
          ...p,
          hand: p.isAI ? sortHandTiles(nextHand) : nextHand,
          discards: [...p.discards, discardedTile]
        };
      }
      return p;
    });

    const discardRecord = { playerId, role: player.role, tile: discardedTile };
    const nextLogs = [...logs, `🀄 [${player.role}] 打出了 【${discardedTile}】`];

    setPlayers(updatedPlayers);
    setLastDiscard(discardRecord);
    setLogs(nextLogs);

    evaluateReactionsAfterDiscard(updatedPlayers, discardRecord, nextLogs);
  };

  const evaluateReactionsAfterDiscard = (currentPlayers, discardRecord, currentLogs = logs) => {
    const { playerId: discarderId, tile } = discardRecord;
    const tileSuit = getTileSuit(tile);

    for (let step = 1; step <= 3; step++) {
      const checkId = (discarderId + step * turnDirection + 4) % 4;
      const candidate = currentPlayers[checkId];
      if (!candidate || candidate.isAI || candidate.isFrozen) continue;

      const isSuitBanned = bannedSuitInfo && bannedSuitInfo.ownerId !== checkId && bannedSuitInfo.suit === tileSuit;
      const huResult = checkCanHu(candidate, tile, bannedSuitInfo);
      const sameTileCount = candidate.hand.filter(t => t === tile).length;

      const canNormalPeng = !isSuitBanned && sameTileCount >= 2;
      const canMingGang = !isSuitBanned && sameTileCount === 3;
      const canMaijiPeng = !isSuitBanned && candidate.role === '麦咭' && candidate.coins >= 1 && sameTileCount >= 1 && candidate.hand.length >= 2;

      const candidateUpperId = getUpperPlayerId(checkId, turnDirection);
      const chiCombos = getValidChiCombinations(candidate.hand, tile, isSuitBanned ? tileSuit : null);
      const canNormalChi = discarderId === candidateUpperId && chiCombos.length > 0;
      const canLingfengChi = discarderId !== candidateUpperId && candidate.role === '灵风' && candidate.coins >= 1 && chiCombos.length > 0;

      const hasLockedHuHint = !huResult.canHu && Boolean(huResult.lockedReason);

      if (huResult.canHu || hasLockedHuHint || canNormalPeng || canMingGang || canMaijiPeng || canNormalChi || canLingfengChi) {
        const reactionObj = {
          responderId: checkId,
          discardRecord,
          canHu: huResult.canHu,
          huType: huResult.type,
          huLockedReason: huResult.lockedReason,
          canNormalPeng,
          canMingGang,
          canMaijiPeng,
          canNormalChi,
          canLingfengChi,
          chiCombos
        };
        setPendingReactions(reactionObj);
        setGamePhase('REACTION');
        if (gameMode === 'ONLINE') {
          pushRoomState({
            players: currentPlayers,
            lastDiscard: discardRecord,
            pendingReactions: reactionObj,
            gamePhase: 'REACTION',
            logs: currentLogs
          });
        }
        return;
      }
    }

    processAIReactions(currentPlayers, discardRecord, currentLogs);
  };

  const checkLaoqianExtraTurnOrAdvance = (currentPlayers, discarderId, currentLogs = logs) => {
    const discarder = currentPlayers[discarderId];
    if (discarder && discarder.role === '老千') {
      const { total: totalFlw } = getFlowerBreakdown(discarder);
      if (totalFlw > 4 && discarder.flowerTiles.length > 0 && deck.length > 0) {
        if (!discarder.isAI) {
          if (laoqianExtraQueued) {
            setLaoqianExtraQueued(false);
            executeLaoqianExtraTurn(discarderId, currentPlayers);
            return;
          } else {
            setGamePhase('LAOQIAN_EXTRA_PROMPT');
            if (gameMode === 'ONLINE') {
              pushRoomState({
                players: currentPlayers,
                gamePhase: 'LAOQIAN_EXTRA_PROMPT',
                logs: currentLogs
              });
            }
            return;
          }
        } else {
          const extraProb = aiDifficulty === 'EASY' ? 0.35 : aiDifficulty === 'NORMAL' ? 0.75 : 0.95;
          if (Math.random() < extraProb) {
            setTimeout(() => {
              executeLaoqianExtraTurn(discarderId, currentPlayers);
            }, 500);
            return;
          }
        }
      }
    }

    const nextId = getNextPlayerId(discarderId, turnDirection);
    advanceTurn(nextId, currentPlayers, currentLogs);
  };

  const executeLaoqianExtraTurn = (playerId, currentPlayersState = players) => {
    const target = currentPlayersState[playerId];
    if (!target || target.flowerTiles.length === 0) return;

    const nextFlowers = [...target.flowerTiles];
    const burnedFlower = nextFlowers.pop();
    const updatedPlayers = currentPlayersState.map(p =>
      p.id === playerId ? { ...p, flowerTiles: nextFlowers } : p
    );

    const remainingFlw = getFlowerBreakdown(updatedPlayers[playerId]).total;
    addLog(`🌺 【老千】触发被动《步步生花》！消耗 1 张花牌【${burnedFlower.replace('花-', '')}】（剩余 ${remainingFlw} 花），获得额外摸牌打牌回合！`);

    setTurn(playerId);
    handleDrawTile(playerId, true, updatedPlayers);
  };

  const processAIReactions = (currentPlayers, discardRecord, currentLogs = logs) => {
    const { playerId: discarderId, tile } = discardRecord;
    const tileSuit = getTileSuit(tile);

    const skillProb = aiDifficulty === 'EASY' ? 0.15 : aiDifficulty === 'NORMAL' ? 0.45 : 0.85;
    const pengProb = aiDifficulty === 'EASY' ? 0.35 : aiDifficulty === 'NORMAL' ? 0.7 : 0.95;

    for (let i = 0; i < 4; i++) {
      if (i === discarderId) continue;
      const ai = currentPlayers[i];
      if (!ai || !ai.isAI || ai.isFrozen) continue;
      const huRes = checkCanHu(ai, tile, bannedSuitInfo);
      if (huRes.canHu) {
        const winObj = { winner: ai, winType: `点炮胡 (${huRes.type})`, winningTile: tile };
        const winLogs = [...currentLogs, `🏆 [${ai.role}] 胡了 [${currentPlayers[discarderId].role}] 打出的【${tile}】(${huRes.type})！`];
        setWinnerInfo(winObj);
        setGamePhase('WINNER');
        setLogs(winLogs);
        if (gameMode === 'ONLINE') {
          pushRoomState({ players: currentPlayers, winnerInfo: winObj, gamePhase: 'WINNER', logs: winLogs });
        }
        return;
      }
    }

    for (let i = 0; i < 4; i++) {
      if (i === discarderId) continue;
      const ai = currentPlayers[i];
      if (!ai || !ai.isAI || ai.isFrozen) continue;

      const isSuitBanned = bannedSuitInfo && bannedSuitInfo.ownerId !== ai.id && bannedSuitInfo.suit === tileSuit;
      if (isSuitBanned) continue;

      const sameCount = ai.hand.filter(t => t === tile).length;
      const { total: aiFlowers } = getFlowerBreakdown(ai);

      const flowerThreshold = aiDifficulty === 'HARD' ? 2.5 : 3;
      if (sameCount >= 2 && (aiFlowers >= flowerThreshold || ai.role === '麦咭') && Math.random() < pengProb) {
        setTimeout(() => {
          const nextPlayers = currentPlayers.map(p => {
            if (p.id === ai.id) {
              const nextHand = [...p.hand];
              nextHand.splice(nextHand.indexOf(tile), 1);
              nextHand.splice(nextHand.indexOf(tile), 1);
              return {
                ...p,
                hand: nextHand,
                melds: [...p.melds, { type: 'peng', tiles: [tile, tile, tile] }]
              };
            }
            return p;
          });
          const nextLogs = [...currentLogs, `💥 [${ai.role}] 碰了 【${tile}】！进入出牌阶段。`];
          setPlayers(nextPlayers);
          setLogs(nextLogs);
          setTurn(ai.id);
          setGamePhase('ACTION');
          if (gameMode === 'ONLINE') {
            pushRoomState({ players: nextPlayers, turn: ai.id, gamePhase: 'ACTION', logs: nextLogs, pendingReactions: null });
          }
        }, 600);
        return;
      }

      if (ai.role === '麦咭' && ai.coins >= 1 && sameCount === 1 && ai.hand.length >= 2 && Math.random() < skillProb) {
        setTimeout(() => {
          const nextPlayers = currentPlayers.map(p => {
            if (p.id === ai.id) {
              const nextHand = [...p.hand];
              nextHand.splice(nextHand.indexOf(tile), 1);
              const counts = {};
              nextHand.forEach(t => counts[t] = (counts[t] || 0) + 1);
              let wasteIdx = nextHand.findIndex(t => counts[t] === 1);
              if (wasteIdx === -1) wasteIdx = nextHand.length - 1;
              const wasteTile = nextHand.splice(wasteIdx, 1)[0];

              return {
                ...p,
                coins: p.coins - 1,
                hand: nextHand,
                melds: [...p.melds, { type: 'peng', tiles: [tile, tile, tile], fakeTile: wasteTile }]
              };
            }
            return p;
          });
          const nextLogs = [...currentLogs, `🔧 【麦咭】消耗1币发动《刻意求工》！用1张废牌强行碰出【${tile}】，轮到麦咭出牌！`];
          setPlayers(nextPlayers);
          setLogs(nextLogs);
          setTurn(ai.id);
          setGamePhase('ACTION');
          if (gameMode === 'ONLINE') {
            pushRoomState({ players: nextPlayers, turn: ai.id, gamePhase: 'ACTION', logs: nextLogs, pendingReactions: null });
          }
        }, 650);
        return;
      }

      const aiUpperId = getUpperPlayerId(ai.id, turnDirection);
      if (ai.role === '灵风' && ai.coins >= 1 && discarderId !== aiUpperId) {
        const combos = getValidChiCombinations(ai.hand, tile, null);
        if (combos.length > 0 && Math.random() < skillProb) {
          const chosenCombo = combos[0];
          setTimeout(() => {
            const nextPlayers = currentPlayers.map(p => {
              if (p.id === ai.id) {
                const nextHand = [...p.hand];
                nextHand.splice(nextHand.indexOf(chosenCombo[0]), 1);
                nextHand.splice(nextHand.indexOf(chosenCombo[1]), 1);
                const meldTiles = sortHandTiles([tile, ...chosenCombo]);
                return {
                  ...p,
                  coins: p.coins - 1,
                  hand: nextHand,
                  melds: [...p.melds, { type: 'chi', tiles: meldTiles }]
                };
              }
              return p;
            });
            const nextLogs = [...currentLogs, `🌪️ 【灵风】消耗1币发动《乘风》！跨座位吃了【${tile}】，轮次直接跳转至灵风！`];
            setPlayers(nextPlayers);
            setLogs(nextLogs);
            setTurn(ai.id);
            setGamePhase('ACTION');
            if (gameMode === 'ONLINE') {
              pushRoomState({ players: nextPlayers, turn: ai.id, gamePhase: 'ACTION', logs: nextLogs, pendingReactions: null });
            }
          }, 650);
          return;
        }
      }
    }

    checkLaoqianExtraTurnOrAdvance(currentPlayers, discarderId, currentLogs);
  };

  const handleHumanPassReaction = () => {
    if (!pendingReactions) return;
    const record = pendingReactions.discardRecord;
    setPendingReactions(null);
    processAIReactions(players, record, logs);
  };

  const handleHumanHuReaction = () => {
    const responderId = pendingReactions.responderId ?? mySeatId;
    const { discardRecord, huType } = pendingReactions;
    const winObj = { winner: players[responderId], winType: `点炮胡 (${huType})`, winningTile: discardRecord.tile };
    const nextLogs = [...logs, `🎉 恭喜！[${players[responderId].role}] 胡了 [${discardRecord.role}] 打出的【${discardRecord.tile}】(${huType})！`];
    setPendingReactions(null);
    setWinnerInfo(winObj);
    setGamePhase('WINNER');
    setLogs(nextLogs);
    if (gameMode === 'ONLINE') {
      pushRoomState({ winnerInfo: winObj, gamePhase: 'WINNER', logs: nextLogs, pendingReactions: null });
    }
  };

  const handleHumanNormalPeng = () => {
    const responderId = pendingReactions.responderId ?? mySeatId;
    const { tile } = pendingReactions.discardRecord;
    setPendingReactions(null);
    const updatedPlayers = players.map(p => {
      if (p.id === responderId) {
        const nextHand = [...p.hand];
        nextHand.splice(nextHand.indexOf(tile), 1);
        nextHand.splice(nextHand.indexOf(tile), 1);
        return {
          ...p,
          hand: nextHand,
          melds: [...p.melds, { type: 'peng', tiles: [tile, tile, tile] }]
        };
      }
      return p;
    });
    const nextLogs = [...logs, `💥 [${players[responderId].role}] 碰了【${tile}】！请打出一张牌。`];
    setPlayers(updatedPlayers);
    setLogs(nextLogs);
    setTurn(responderId);
    setGamePhase('ACTION');
    if (gameMode === 'ONLINE') {
      pushRoomState({ players: updatedPlayers, turn: responderId, gamePhase: 'ACTION', logs: nextLogs, pendingReactions: null });
    }
  };

  const handleHumanMingGang = () => {
    const responderId = pendingReactions.responderId ?? mySeatId;
    const { tile } = pendingReactions.discardRecord;
    setPendingReactions(null);
    const humanRole = players[responderId]?.role;
    const { drawnHand, drawnFlowers, remainingDeck } = drawAndResolveFlowers(deck, 1, humanRole);
    setDeck(remainingDeck);

    const updatedPlayers = players.map(p => {
      if (p.id === responderId) {
        const nextHand = [...p.hand];
        for (let i = 0; i < 3; i++) nextHand.splice(nextHand.indexOf(tile), 1);
        return {
          ...p,
          hand: [...nextHand, ...drawnHand],
          flowerTiles: [...p.flowerTiles, ...drawnFlowers],
          melds: [...p.melds, { type: 'minggang', tiles: [tile, tile, tile, tile] }]
        };
      }
      return p;
    });
    const nextLogs = [...logs, `⚡ [${players[responderId].role}] 明杠了【${tile}】（算作1张花牌），并补摸了1张牌！`];
    setPlayers(updatedPlayers);
    setLogs(nextLogs);
    setTurn(responderId);
    setGamePhase('ACTION');
    if (gameMode === 'ONLINE') {
      pushRoomState({ deck: remainingDeck, players: updatedPlayers, turn: responderId, gamePhase: 'ACTION', logs: nextLogs, pendingReactions: null });
    }
  };

  const handleOpenMaijiSkillModal = () => {
    setMaijiModal(true);
  };

  const handleConfirmMaijiPeng = (wasteCardIdx) => {
    const responderId = pendingReactions.responderId ?? mySeatId;
    const { tile } = pendingReactions.discardRecord;
    const human = players[responderId];
    const wasteTile = human.hand[wasteCardIdx];

    setMaijiModal(false);
    setPendingReactions(null);

    const updatedPlayers = players.map(p => {
      if (p.id === responderId) {
        const nextHand = [...p.hand];
        nextHand.splice(wasteCardIdx, 1);
        const targetIdx = nextHand.indexOf(tile);
        if (targetIdx !== -1) {
          nextHand.splice(targetIdx, 1);
        }

        return {
          ...p,
          coins: p.coins - 1,
          hand: nextHand,
          melds: [...p.melds, { type: 'peng', tiles: [tile, tile, tile], fakeTile: wasteTile }]
        };
      }
      return p;
    });

    const nextLogs = [...logs, `🔧 [${human.role}] 消耗1币发动《刻意求工》，用废牌【${wasteTile}】强行碰出【${tile}】！`];
    setPlayers(updatedPlayers);
    setLogs(nextLogs);
    setTurn(responderId);
    setGamePhase('ACTION');
    if (gameMode === 'ONLINE') {
      pushRoomState({ players: updatedPlayers, turn: responderId, gamePhase: 'ACTION', logs: nextLogs, pendingReactions: null });
    }
  };

  const handleTriggerChi = (isSkill) => {
    const { chiCombos, discardRecord } = pendingReactions;
    if (chiCombos.length === 1) {
      executeHumanChi(chiCombos[0], discardRecord.tile, isSkill);
    } else {
      setLingfengCombos({ combos: chiCombos, tile: discardRecord.tile, isSkill });
    }
  };

  const executeHumanChi = (combo, targetTile, isSkill) => {
    const responderId = pendingReactions?.responderId ?? mySeatId;
    setLingfengCombos(null);
    setPendingReactions(null);

    const updatedPlayers = players.map(p => {
      if (p.id === responderId) {
        const nextHand = [...p.hand];
        nextHand.splice(nextHand.indexOf(combo[0]), 1);
        nextHand.splice(nextHand.indexOf(combo[1]), 1);
        const meldTiles = sortHandTiles([targetTile, ...combo]);
        return {
          ...p,
          coins: isSkill ? p.coins - 1 : p.coins,
          hand: nextHand,
          melds: [...p.melds, { type: 'chi', tiles: meldTiles }]
        };
      }
      return p;
    });

    const nextLogs = [
      ...logs,
      isSkill
        ? `🌪️ [${players[responderId].role}] 消耗1币发动《乘风》！跨座位吃入【${targetTile}】，轮次跳转！`
        : `🍽️ [${players[responderId].role}] 吃了上家的【${targetTile}】！请打出一张牌。`
    ];
    setPlayers(updatedPlayers);
    setLogs(nextLogs);
    setTurn(responderId);
    setGamePhase('ACTION');
    if (gameMode === 'ONLINE') {
      pushRoomState({ players: updatedPlayers, turn: responderId, gamePhase: 'ACTION', logs: nextLogs, pendingReactions: null });
    }
  };

  const handleOpenQianshu = () => {
    const me = players[mySeatId];
    if (turn !== mySeatId || gamePhase !== 'DRAW' || !me || me.coins < 1 || deck.length < 3) return;
    const top3 = deck.slice(0, 3);
    setQianshuData({
      cards: top3,
      pickedIdx: 0,
      firstPutIdx: 1,
      putPosition: 'bottom'
    });
    setGamePhase('SKILL_MODAL');
  };

  const handleConfirmQianshu = () => {
    const { cards, pickedIdx, firstPutIdx, putPosition } = qianshuData;
    const pickedCard = cards[pickedIdx];
    const remainingIndices = [0, 1, 2].filter(idx => idx !== pickedIdx);
    const secondPutIdx = remainingIndices.find(idx => idx !== firstPutIdx);
    const orderedRest = [cards[firstPutIdx], cards[secondPutIdx]];

    let restDeck = deck.slice(3);
    if (putPosition === 'top') {
      restDeck = [...orderedRest, ...restDeck];
    } else {
      restDeck = [...restDeck, ...orderedRest];
    }

    let finalHandAdd = [];
    let finalFlowerAdd = [];
    const myRole = players[mySeatId]?.role;

    if (isFlowerTile(pickedCard, myRole)) {
      finalFlowerAdd.push(pickedCard);
      const { drawnHand, drawnFlowers, remainingDeck } = drawAndResolveFlowers(restDeck, 1, myRole);
      finalHandAdd = drawnHand;
      finalFlowerAdd.push(...drawnFlowers);
      restDeck = remainingDeck;
    } else {
      finalHandAdd = [pickedCard];
    }

    const updatedPlayers = players.map(p => {
      if (p.id === mySeatId) {
        return {
          ...p,
          coins: p.coins - 1,
          hand: [...p.hand, ...finalHandAdd],
          flowerTiles: [...p.flowerTiles, ...finalFlowerAdd]
        };
      }
      return p;
    });

    const nextLogs = [...logs, `👁️ 【老千】消耗1币发动《千术》！挑走1张牌，并将剩余2张按序放回${putPosition === 'top' ? '牌山顶' : '牌山底'}！`];
    setDeck(restDeck);
    setPlayers(updatedPlayers);
    setLogs(nextLogs);
    setQianshuData(null);
    setGamePhase('ACTION');
    if (gameMode === 'ONLINE') {
      pushRoomState({ deck: restDeck, players: updatedPlayers, gamePhase: 'ACTION', logs: nextLogs });
    }
  };

  const handleConfirmPawnBan = (suit) => {
    setPawnModal(false);
    const updatedPlayers = players.map(p => p.id === mySeatId ? { ...p, coins: p.coins - 1 } : p);
    const banObj = { suit, ownerId: mySeatId };
    const nextLogs = [...logs, `🚫 【典当师】消耗1币发动《售罄》！下回合开始前，全场禁止打出/胡/副露亮出「${suit}」花色！`];
    setPlayers(updatedPlayers);
    setBannedSuitInfo(banObj);
    setLogs(nextLogs);
    if (gameMode === 'ONLINE') {
      pushRoomState({ players: updatedPlayers, bannedSuitInfo: banObj, logs: nextLogs });
    }
  };

  const handleAyiFreezeNext = () => {
    const human = players[mySeatId];
    if (turn !== mySeatId || (gamePhase !== 'DRAW' && gamePhase !== 'ACTION') || human.role !== '阿姨' || human.coins < 1) return;
    const nextId = getNextPlayerId(mySeatId, turnDirection);
    const nextPlayer = players[nextId];
    if (!nextPlayer || nextPlayer.isFrozen) return;

    const updatedPlayers = players.map(p => {
      if (p.id === mySeatId) return { ...p, coins: p.coins - 1 };
      if (p.id === nextId) return { ...p, isFrozen: true };
      return p;
    });
    const nextLogs = [...logs, `⛔ 【阿姨】消耗1币发动《闲人免进》！指定当前下家 [${nextPlayer.role}](${nextPlayer.name}) 1巡禁止任何行动！`];
    setPlayers(updatedPlayers);
    setLogs(nextLogs);
    if (gameMode === 'ONLINE') {
      pushRoomState({ players: updatedPlayers, logs: nextLogs });
    }
  };

  const handleAyiReverseDirection = () => {
    const human = players[mySeatId];
    if (turn !== mySeatId || (gamePhase !== 'DRAW' && gamePhase !== 'ACTION') || human.role !== '阿姨' || human.coins < 1) return;
    const newDir = turnDirection * -1;
    const updatedPlayers = players.map(p => p.id === mySeatId ? { ...p, coins: p.coins - 1 } : p);
    const newNextPlayer = players[getNextPlayerId(mySeatId, newDir)];
    const nextLogs = [...logs, `🔄 【阿姨】消耗1币发动《风水轮流转》！全场出牌顺序已转换为【${newDir === 1 ? '逆时针' : '顺时针'}】，当前下家变为 [${newNextPlayer.role}](${newNextPlayer.name})！`];

    setTurnDirection(newDir);
    setPlayers(updatedPlayers);
    setLogs(nextLogs);
    if (gameMode === 'ONLINE') {
      pushRoomState({ turnDirection: newDir, players: updatedPlayers, logs: nextLogs });
    }
  };

  const getHumanSelfGangOptions = () => {
    if (turn !== mySeatId || gamePhase !== 'ACTION') return [];
    const human = players[mySeatId];
    if (!human) return [];
    const counts = {};
    human.hand.forEach(t => counts[t] = (counts[t] || 0) + 1);
    return Object.keys(counts).filter(t => counts[t] === 4);
  };

  const handleHumanAnGang = (tile, isMingChoice = false) => {
    const humanRole = players[mySeatId]?.role;
    const { drawnHand, drawnFlowers, remainingDeck } = drawAndResolveFlowers(deck, 1, humanRole);
    setDeck(remainingDeck);

    const updatedPlayers = players.map(p => {
      if (p.id === mySeatId) {
        const nextHand = p.hand.filter(t => t !== tile);
        return {
          ...p,
          hand: [...nextHand, ...drawnHand],
          flowerTiles: [...p.flowerTiles, ...drawnFlowers],
          melds: [...p.melds, { type: isMingChoice ? 'minggang' : 'angang', tiles: [tile, tile, tile, tile] }]
        };
      }
      return p;
    });
    const nextLogs = [...logs, `🀄 [${players[mySeatId].role}] 选择了${isMingChoice ? '【明杠】(算1张花牌)' : '【暗杠】(不算花牌)'}【${tile}】，并补摸1张牌！`];
    setPlayers(updatedPlayers);
    setLogs(nextLogs);
    if (gameMode === 'ONLINE') {
      pushRoomState({ deck: remainingDeck, players: updatedPlayers, logs: nextLogs });
    }
  };

  const handleHumanTsumo = () => {
    const me = players[mySeatId];
    const res = checkCanHu(me, null, bannedSuitInfo);
    if (!res.canHu) return;
    const winObj = { winner: me, winType: `自摸 (${res.type})`, winningTile: me.hand[me.hand.length - 1] };
    const nextLogs = [...logs, `🎉 恭喜！[${me.role}] 自摸胡牌 (${res.type})！`];
    setWinnerInfo(winObj);
    setGamePhase('WINNER');
    setLogs(nextLogs);
    if (gameMode === 'ONLINE') {
      pushRoomState({ winnerInfo: winObj, gamePhase: 'WINNER', logs: nextLogs });
    }
  };

  const selectAIDiscardIndex = (aiPlayer) => {
    const validIndices = [];
    aiPlayer.hand.forEach((t, idx) => {
      if (canPlayerDiscardTile(aiPlayer, t)) validIndices.push(idx);
    });
    if (validIndices.length === 0) return 0;

    if (aiDifficulty === 'EASY' && Math.random() < 0.5) {
      return validIndices[Math.floor(Math.random() * validIndices.length)];
    }

    const counts = {};
    aiPlayer.hand.forEach(t => counts[t] = (counts[t] || 0) + 1);
    const remainingMap = aiPlayer.role === '阿姨' ? computeRemainingTileCounts(players, aiPlayer.id) : null;

    let lowestScore = Infinity;
    let bestDiscardIdx = validIndices[0];

    for (let idx of validIndices) {
      const tile = aiPlayer.hand[idx];
      let keepScore = 0;

      if (counts[tile] === 2) keepScore += 40;
      if (counts[tile] >= 3) keepScore += 90;
      if (aiPlayer.role === '典当师' && counts[tile] >= 3) keepScore += 50;

      if (aiPlayer.role === '灵风' && tile.endsWith('风') && counts[tile] >= 2) {
        keepScore += 25;
      }

      if (remainingMap && counts[tile] === 1 && remainingMap[tile] === 0) {
        keepScore -= 25;
      }

      const suit = getTileSuit(tile);
      if (SUITS.includes(suit)) {
        const num = parseInt(tile[0], 10);
        if (num >= 3 && num <= 7) keepScore += 5;
        if (aiPlayer.hand.includes(`${num - 1}${suit}`) || aiPlayer.hand.includes(`${num + 1}${suit}`)) {
          keepScore += 25;
        }
        if (aiPlayer.hand.includes(`${num - 2}${suit}`) || aiPlayer.hand.includes(`${num + 2}${suit}`)) {
          keepScore += 12;
        }
      } else {
        if (counts[tile] === 1) keepScore -= 20;
      }

      if (keepScore < lowestScore) {
        lowestScore = keepScore;
        bestDiscardIdx = idx;
      }
    }

    return bestDiscardIdx;
  };

  useEffect(() => {
    if (gamePhase === 'WINNER' || gamePhase === 'DRAW_GAME' || gamePhase === 'ROLE_SELECT' || showRoleSelectModal) return;

    const currentActor = players[turn];
    if (!currentActor || !currentActor.isAI) return;

    if (gameMode === 'ONLINE') {
      const firstHumanSeat = players.find(p => !p.isAI)?.id ?? 0;
      if (mySeatId !== firstHumanSeat) return;
    }

    if (currentActor.isFrozen) {
      const skipTimer = setTimeout(() => {
        advanceTurn(turn, players);
      }, 450);
      return () => clearTimeout(skipTimer);
    }

    const skillTriggerProb = aiDifficulty === 'EASY' ? 0.15 : aiDifficulty === 'NORMAL' ? 0.45 : 0.85;

    if (gamePhase === 'DRAW') {
      const timer = setTimeout(() => {
        if (currentActor.role === '老千' && currentActor.coins >= 1 && deck.length >= 3 && Math.random() < skillTriggerProb) {
          const top3 = deck.slice(0, 3);
          let pickIdx = top3.findIndex(t => isFlowerTile(t, currentActor.role) || currentActor.hand.includes(t));
          if (pickIdx === -1) pickIdx = 0;
          const picked = top3[pickIdx];
          const others = top3.filter((_, idx) => idx !== pickIdx);
          const rest = [...deck.slice(3), ...others];

          let addH = [];
          let addF = [];
          let finalDeck = rest;
          if (isFlowerTile(picked, currentActor.role)) {
            addF.push(picked);
            const res = drawAndResolveFlowers(rest, 1, currentActor.role);
            addH = res.drawnHand;
            addF.push(...res.drawnFlowers);
            finalDeck = res.remainingDeck;
          } else {
            addH = [picked];
          }
          const updatedPlayers = players.map(p => p.id === currentActor.id ? {
            ...p,
            coins: p.coins - 1,
            hand: [...p.hand, ...addH],
            flowerTiles: [...p.flowerTiles, ...addF]
          } : p);
          const nextLogs = [...logs, `👁️ [${currentActor.role}] 消耗1币发动《千术》，从牌山顶挑选了1张牌并将余牌沉底！`];
          setDeck(finalDeck);
          setPlayers(updatedPlayers);
          setLogs(nextLogs);
          setGamePhase('ACTION');
          if (gameMode === 'ONLINE') {
            pushRoomState({ deck: finalDeck, players: updatedPlayers, gamePhase: 'ACTION', logs: nextLogs });
          }
        } else {
          handleDrawTile(turn);
        }
      }, 650);
      return () => clearTimeout(timer);
    }

    if (gamePhase === 'ACTION') {
      const timer = setTimeout(() => {
        const currentAI = players[turn];
        const huRes = checkCanHu(currentAI, null, bannedSuitInfo);
        if (huRes.canHu) {
          const winObj = { winner: currentAI, winType: `自摸 (${huRes.type})`, winningTile: currentAI.hand[currentAI.hand.length - 1] };
          const nextLogs = [...logs, `🏆 [${currentAI.role}] 自摸胡牌 (${huRes.type})！`];
          setWinnerInfo(winObj);
          setGamePhase('WINNER');
          setLogs(nextLogs);
          if (gameMode === 'ONLINE') {
            pushRoomState({ winnerInfo: winObj, gamePhase: 'WINNER', logs: nextLogs });
          }
          return;
        }

        const { total: currentAIFlw } = getFlowerBreakdown(currentAI);
        const aiHasPeng = currentAI.melds.some(m => m.type === 'peng');
        const safeToSpendCoin = !aiHasPeng || (currentAIFlw - 1 >= 4);

        if (currentAI.role === '典当师' && currentAI.coins >= 1 && safeToSpendCoin && !bannedSuitInfo && Math.random() < skillTriggerProb * 0.6) {
          const suitCounts = { '万': 0, '筒': 0, '条': 0 };
          currentAI.hand.forEach(t => {
            const s = getTileSuit(t);
            if (suitCounts[s] !== undefined) suitCounts[s]++;
          });
          const leastSuit = Object.keys(suitCounts).sort((a, b) => suitCounts[a] - suitCounts[b])[0];
          setPlayers(prev => prev.map(p => p.id === currentAI.id ? { ...p, coins: p.coins - 1 } : p));
          setBannedSuitInfo({ suit: leastSuit, ownerId: currentAI.id });
          addLog(`🚫 【典当师】消耗1币发动《售罄》！全场禁止打出/胡/副露亮出「${leastSuit}」花色！`);
        }

        if (currentAI.role === '阿姨' && currentAI.coins >= 1 && Math.random() < skillTriggerProb * 0.65) {
          const nextId = getNextPlayerId(currentAI.id, turnDirection);
          const nextPlayerObj = players[nextId];
          if (nextPlayerObj && !nextPlayerObj.isFrozen && Math.random() < 0.6) {
            setPlayers(prev => prev.map(p => {
              if (p.id === currentAI.id) return { ...p, coins: p.coins - 1 };
              if (p.id === nextId) return { ...p, isFrozen: true };
              return p;
            }));
            addLog(`⛔ 【阿姨】消耗1币发动《闲人免进》！指定下家 [${nextPlayerObj.role}](${nextPlayerObj.name}) 1巡禁止任何行动！`);
          } else {
            const newDir = turnDirection * -1;
            setTurnDirection(newDir);
            setPlayers(prev => prev.map(p => p.id === currentAI.id ? { ...p, coins: p.coins - 1 } : p));
            addLog(`🔄 【阿姨】消耗1币发动《风水轮流转》！出牌顺序已反转为【${newDir === 1 ? '逆时针' : '顺时针'}】！`);
          }
        }

        const chosenIdx = selectAIDiscardIndex(currentAI);
        executeDiscard(turn, chosenIdx);
      }, 850);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, gamePhase, players, deck.length, turnDirection, showRoleSelectModal]);

  const getTileStyle = (tile) => {
    if (!tile) return 'text-gray-800';
    if (tile.includes('万')) return 'text-red-700';
    if (tile.includes('筒')) return 'text-blue-700';
    if (tile.includes('条')) return 'text-emerald-700';
    if (tile === '北风') return 'text-indigo-900 font-black';
    if (tile.includes('风')) return 'text-slate-800';
    if (tile === '发') return 'text-green-700 font-black';
    if (tile === '中') return 'text-red-600 font-black';
    return 'text-pink-600';
  };

  const renderMahjongTile = (tile, opts = {}) => {
    const { isHidden = false, onClick = null, isSelected = false, isDisabled = false, size = 'md', badge = null } = opts;
    const sizeClasses = {
      sm: 'w-7 h-10 text-xs',
      md: 'w-10 h-14 md:w-12 md:h-16 text-sm md:text-lg',
      lg: 'w-14 h-20 text-xl'
    }[size];

    return (
      <div
        onClick={!isDisabled && onClick ? onClick : undefined}
        className={`relative ${sizeClasses} flex flex-col items-center justify-center rounded-md border border-stone-400 shadow-md font-bold select-none transition-all duration-150 ${isHidden ? 'bg-gradient-to-b from-emerald-700 to-emerald-800 border-emerald-600' : 'bg-gradient-to-b from-[#FFFDF7] to-[#EFECE0]'} ${onClick && !isDisabled ? 'cursor-pointer hover:-translate-y-2 hover:shadow-xl' : ''} ${isSelected ? '-translate-y-3 ring-2 ring-yellow-400 bg-yellow-50' : ''} ${isDisabled ? 'opacity-40 cursor-not-allowed grayscale' : ''} ${!isHidden ? getTileStyle(tile) : ''}`}
      >
        {!isHidden && (
          <>
            <span className="leading-none">{tile.startsWith('花-') ? tile.replace('花-', '') : tile.replace('风', '')}</span>
            {tile.startsWith('花-') && <span className="text-[10px] text-pink-500 mt-0.5">🌸</span>}
            {tile.endsWith('风') && <span className="text-[9px] text-stone-400 font-normal">风</span>}
          </>
        )}
        {badge && (
          <span className="absolute -top-2 -right-2 bg-amber-600 text-white text-[9px] px-1 rounded shadow">{badge}</span>
        )}
      </div>
    );
  };

  const renderPlayerCard = (player) => {
    if (!player) return null;
    const isActive = turn === player.id && gamePhase !== 'WINNER';
    const { total: totalFlw, details } = getFlowerBreakdown(player);
    const hasPeng = player.melds.some(m => m.type === 'peng');
    const isPengLocked = hasPeng && totalFlw < 4;
    const roleCfg = ROLES_INFO[player.role];
    const isHumanNextTarget = getNextPlayerId(mySeatId, turnDirection) === player.id;
    const isHumanUpperTarget = getUpperPlayerId(mySeatId, turnDirection) === player.id;

    return (
      <div className={`bg-neutral-900/85 border ${isActive ? 'border-yellow-400 ring-2 ring-yellow-400/50' : player.isFrozen ? 'border-rose-500 ring-2 ring-rose-500/50' : 'border-neutral-700'} px-3 py-2 rounded-xl shadow-lg backdrop-blur-md text-xs transition-all`}>
        <div className="flex items-center justify-between space-x-3 mb-1">
          <span className={`font-black text-sm ${roleCfg.text} flex items-center`}>
            {player.role}
            <span className="text-[10px] text-gray-400 font-normal ml-1">({player.name})</span>
            {player.id !== mySeatId && isHumanNextTarget && (
              <span className="ml-1.5 bg-cyan-950 border border-cyan-600 text-cyan-300 text-[9px] px-1 py-0.2 rounded">当前下家</span>
            )}
            {player.id !== mySeatId && isHumanUpperTarget && (
              <span className="ml-1.5 bg-amber-950 border border-amber-600 text-amber-300 text-[9px] px-1 py-0.2 rounded">当前上家</span>
            )}
          </span>
          <div className="flex items-center space-x-2">
            <span className="flex items-center bg-yellow-950/70 border border-yellow-700/50 px-1.5 py-0.5 rounded text-yellow-300" title="技能币">
              <Coins size={12} className="mr-1 text-yellow-400" /> {player.coins}
            </span>
            <span className={`flex items-center px-1.5 py-0.5 rounded border ${totalFlw >= 4 ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300' : 'bg-pink-950/70 border-pink-700/50 text-pink-300'}`} title={details.join(' | ')}>
              <Flower size={12} className="mr-1 text-pink-400" /> {totalFlw}花
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 items-center text-[10px] text-gray-400">
          <span>花牌区:{player.flowerTiles.length}</span>
          {player.melds.length > 0 && <span>| 副露:{player.melds.length}</span>}
          {player.isFrozen && (
            <span className="bg-rose-900/90 border border-rose-500 text-rose-200 px-1.5 py-0.2 rounded font-bold flex items-center animate-pulse">
              <Lock size={10} className="mr-0.5" /> 闲人免进(禁动1巡)
            </span>
          )}
          {isPengLocked && (
            <span className="bg-red-900/80 text-red-200 px-1.5 py-0.2 rounded font-bold animate-pulse">
              已碰未满4花(禁胡)
            </span>
          )}
          {hasPeng && totalFlw >= 4 && (
            <span className="bg-emerald-900/80 text-emerald-200 px-1.5 py-0.2 rounded">
              满4花碰牌生效
            </span>
          )}
        </div>

        {player.melds.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5 pt-1.5 border-t border-neutral-800">
            {player.melds.map((m, idx) => (
              <div key={idx} className="flex items-center space-x-0.5 bg-black/40 p-1 rounded border border-neutral-700">
                {m.tiles.map((t, tidx) => (
                  <div key={tidx}>
                    {renderMahjongTile(t, { size: 'sm', badge: m.fakeTile && tidx === 2 ? `替:${m.fakeTile}` : (m.type === 'angang' ? '暗' : null) })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const bottomPlayer = players[mySeatId];
  const rightPlayer = players[(mySeatId + 1) % 4];
  const topPlayer = players[(mySeatId + 2) % 4];
  const leftPlayer = players[(mySeatId + 3) % 4];

  const humanFlowerInfo = bottomPlayer ? getFlowerBreakdown(bottomPlayer) : { total: 0, details: [] };
  const humanHuCheck = bottomPlayer && turn === mySeatId && gamePhase === 'ACTION'
    ? checkCanHu(bottomPlayer, null, bannedSuitInfo)
    : { canHu: false, lockedReason: null };
  const humanGangOptions = getHumanSelfGangOptions();
  const humanTingList = bottomPlayer ? getTingTiles(bottomPlayer, bannedSuitInfo) : [];
  const cardCounterMap = bottomPlayer?.role === '阿姨' ? computeRemainingTileCounts(players, mySeatId) : null;
  const currentNextPlayer = players[getNextPlayerId(mySeatId, turnDirection)];

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col lg:flex-row text-gray-100 font-sans select-none overflow-hidden">
      
      {/* 左侧/中央 麻将牌桌主区域 */}
      <div className="flex-1 relative bg-gradient-to-br from-emerald-900 via-teal-900 to-emerald-950 flex flex-col justify-between p-3 md:p-5 shadow-[inset_0_0_120px_rgba(0,0,0,0.75)] border-b lg:border-b-0 lg:border-r border-amber-900/40">
        
        {/* 顶部栏：场地状态 & 对家(Top) */}
        <div className="flex flex-col items-center space-y-2 z-10">
          <div className="w-full flex justify-between items-start">
            <div className="flex flex-col space-y-1.5">
              <button
                onClick={() => setShowRoleSelectModal(true)}
                className="bg-neutral-900/85 hover:bg-neutral-800 border border-neutral-700 text-xs px-3 py-1.5 rounded-lg flex items-center text-gray-200 shadow"
              >
                <Users size={14} className="mr-1.5 text-yellow-400" /> 模式 / 房间 / 角色设置
              </button>
              <div className="text-[11px] bg-black/35 px-2.5 py-1 rounded border border-white/10 flex flex-wrap items-center gap-2">
                {gameMode === 'ONLINE' && activeRoomCode ? (
                  <span className="flex items-center text-cyan-300 font-bold">
                    <Globe size={12} className="mr-1 text-cyan-400" /> 房间 #{activeRoomCode} ({mySeatId + 1}号座)
                  </span>
                ) : (
                  <span className="flex items-center">
                    <Brain size={12} className="text-cyan-400 mr-1" />
                    <span className={`font-bold ${AI_DIFFICULTIES[aiDifficulty].color}`}>
                      {AI_DIFFICULTIES[aiDifficulty].name}
                    </span>
                  </span>
                )}
                <span>|</span>
                <span className="flex items-center text-amber-300 font-bold" title="当前出牌顺序（阿姨【风水轮流转】可反转）">
                  {turnDirection === 1 ? <RotateCcw size={12} className="mr-1" /> : <RotateCw size={12} className="mr-1" />}
                  {turnDirection === 1 ? '逆时针' : '顺时针'}
                </span>
              </div>
            </div>

            {topPlayer && (
              <div className="flex flex-col items-center">
                {renderPlayerCard(topPlayer)}
                <div className="flex space-x-1 mt-1.5">
                  {topPlayer.hand.map((_, i) => (
                    <div key={i} className="w-5 h-7 bg-emerald-700 border-b-2 border-emerald-950 rounded-sm shadow" />
                  ))}
                </div>
              </div>
            )}

            <div className="min-w-[150px] flex flex-col items-end space-y-1.5">
              {bannedSuitInfo ? (
                <div className="bg-purple-950/90 border-2 border-purple-400 px-3 py-1.5 rounded-xl flex items-center space-x-2 animate-pulse shadow-lg">
                  <Ban size={16} className="text-purple-300" />
                  <div className="text-xs">
                    <div className="font-black text-purple-200">售罄封锁：「{bannedSuitInfo.suit}」</div>
                    <div className="text-[10px] text-purple-300">禁打 / 禁胡 / 禁副露</div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-emerald-300/60 bg-black/20 px-3 py-1.5 rounded-lg">
                  当前无花色封锁
                </div>
              )}

              {bottomPlayer?.role === '阿姨' && (
                <button
                  onClick={() => setShowCardCounter(prev => !prev)}
                  className="bg-rose-950/90 hover:bg-rose-900 border border-rose-500 text-rose-200 text-xs px-2.5 py-1 rounded-lg flex items-center shadow-md font-bold"
                >
                  <Calculator size={13} className="mr-1 text-rose-400" />
                  神机妙算记牌器
                  {showCardCounter ? <ChevronUp size={13} className="ml-1" /> : <ChevronDown size={13} className="ml-1" />}
                </button>
              )}
            </div>
          </div>

          {bottomPlayer?.role === '阿姨' && showCardCounter && cardCounterMap && (
            <div className="w-full max-w-4xl bg-neutral-950/90 border border-rose-500/50 rounded-2xl p-2.5 shadow-2xl backdrop-blur-md text-[11px]">
              <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-neutral-800">
                <span className="font-black text-rose-400 flex items-center">
                  <Calculator size={13} className="mr-1" /> 阿姨 · 神机妙算记牌器（未现身剩余张数）
                </span>
                <span className="text-[10px] text-gray-400">
                  已自动扣除你的手牌、全场弃牌河、副露与花牌区
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {SUITS.map(suit => (
                  <div key={suit} className="flex items-center space-x-1 bg-black/40 px-2 py-1 rounded">
                    <span className="font-bold text-gray-300 w-5">{suit}:</span>
                    <div className="flex-1 grid grid-cols-9 gap-1">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => {
                        const tileKey = `${num}${suit}`;
                        const left = cardCounterMap[tileKey];
                        return (
                          <div
                            key={tileKey}
                            className={`flex flex-col items-center py-0.5 rounded border ${
                              left === 0
                                ? 'bg-neutral-900 border-neutral-800 text-neutral-600'
                                : left === 1
                                ? 'bg-red-950/60 border-red-700/60 text-red-300 font-bold'
                                : 'bg-neutral-800/80 border-neutral-700 text-gray-200'
                            }`}
                          >
                            <span className="text-[10px] leading-none">{num}{suit}</span>
                            <span className={`text-[10px] font-black mt-0.5 ${left >= 3 ? 'text-emerald-400' : left === 2 ? 'text-yellow-300' : ''}`}>
                              剩{left}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div className="flex items-center space-x-1 bg-black/40 px-2 py-1 rounded">
                  <span className="font-bold text-gray-300 w-5">风/花:</span>
                  <div className="flex-1 grid grid-cols-8 gap-1">
                    {[...WINDS, ...DRAGONS].map(t => {
                      const left = cardCounterMap[t];
                      return (
                        <div
                          key={t}
                          className={`flex flex-col items-center py-0.5 rounded border ${
                            left === 0
                              ? 'bg-neutral-900 border-neutral-800 text-neutral-600'
                              : left === 1
                              ? 'bg-red-950/60 border-red-700/60 text-red-300 font-bold'
                              : 'bg-neutral-800/80 border-neutral-700 text-gray-200'
                          }`}
                        >
                          <span className="text-[10px] leading-none">{t.replace('风', '')}</span>
                          <span className={`text-[10px] font-black mt-0.5 ${left >= 3 ? 'text-emerald-400' : left === 2 ? 'text-yellow-300' : ''}`}>
                            剩{left}
                          </span>
                        </div>
                      );
                    })}
                    <div className="flex flex-col items-center py-0.5 rounded border bg-pink-950/50 border-pink-700/50 text-pink-200">
                      <span className="text-[10px] leading-none">8花</span>
                      <span className="text-[10px] font-black mt-0.5">剩{cardCounterMap['八花']}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 中部区域：左侧(Left) + 中央牌河与30秒倒计时 + 右侧(Right) */}
        <div className="w-full flex justify-between items-center my-2 flex-1">
          {leftPlayer && (
            <div className="flex items-center space-x-2">
              <div className="flex flex-col space-y-1">
                {leftPlayer.hand.slice(0, 10).map((_, i) => (
                  <div key={i} className="w-7 h-4 bg-emerald-700 border-r-2 border-emerald-950 rounded-sm shadow" />
                ))}
              </div>
              {renderPlayerCard(leftPlayer)}
            </div>
          )}

          <div className="flex-1 max-w-xl mx-4 bg-black/25 border-2 border-emerald-800/60 rounded-3xl p-4 flex flex-col items-center justify-between min-h-[215px] backdrop-blur-sm shadow-2xl">
            <div className="flex flex-wrap items-center justify-center gap-2.5 text-xs md:text-sm text-emerald-200 font-bold">
              <span>剩余牌山: <strong className="text-yellow-400 text-base">{deck.length}</strong> 张</span>
              <span>|</span>
              <span>当前轮次: <strong className="text-white">{players[turn]?.role}</strong></span>
              <span>|</span>
              <div className="flex items-center space-x-1">
                <span
                  className={`px-2.5 py-0.5 rounded-full font-black border flex items-center transition-all ${
                    !timerEnabled
                      ? 'bg-neutral-800 text-gray-400 border-neutral-600'
                      : timeLeft <= 5
                      ? 'bg-red-600 text-white border-red-300 animate-bounce shadow-lg'
                      : timeLeft <= 10
                      ? 'bg-amber-600/90 text-yellow-100 border-amber-300 animate-pulse'
                      : 'bg-emerald-950/90 text-emerald-300 border-emerald-500/60'
                  }`}
                  title="每步限时30秒，超时自动摸牌/打牌/跳过"
                >
                  <Timer size={13} className="mr-1" />
                  {timerEnabled ? `${timeLeft}s` : '已暂停'}
                </span>
                <button
                  onClick={() => setTimerEnabled(prev => !prev)}
                  className="p-1 rounded-full bg-neutral-800/80 hover:bg-neutral-700 text-gray-300 border border-neutral-600"
                  title={timerEnabled ? '暂停30秒倒计时' : '恢复30秒倒计时'}
                >
                  {timerEnabled ? <Pause size={11} /> : <Play size={11} />}
                </button>
              </div>
            </div>

            <div className="my-3 flex flex-col items-center">
              {lastDiscard ? (
                <div className="flex flex-col items-center">
                  <span className="text-[11px] bg-yellow-500/20 border border-yellow-500/40 text-yellow-200 px-2 py-0.5 rounded-full mb-1.5">
                    {lastDiscard.role} 最新打出
                  </span>
                  {renderMahjongTile(lastDiscard.tile, { size: 'lg' })}
                </div>
              ) : (
                <div className="text-emerald-300/40 text-sm py-6">等待第一张出牌...</div>
              )}
            </div>

            <div className="w-full grid grid-cols-2 gap-2 text-[11px] border-t border-emerald-800/50 pt-2">
              {players.map(p => (
                <div key={p.id} className="bg-black/30 px-2 py-1 rounded flex items-center overflow-x-auto whitespace-nowrap">
                  <span className="text-gray-400 font-bold mr-1.5">{p.role}河:</span>
                  <div className="flex space-x-1">
                    {p.discards.length === 0 ? (
                      <span className="text-gray-600">无</span>
                    ) : (
                      p.discards.slice(-8).map((d, idx) => (
                        <span key={idx} className="bg-stone-200 text-stone-900 px-1 rounded font-bold">
                          {d.replace('风', '')}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {rightPlayer && (
            <div className="flex items-center space-x-2">
              {renderPlayerCard(rightPlayer)}
              <div className="flex flex-col space-y-1">
                {rightPlayer.hand.slice(0, 10).map((_, i) => (
                  <div key={i} className="w-7 h-4 bg-emerald-700 border-l-2 border-emerald-950 rounded-sm shadow" />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 底部本机玩家操作台与手牌 */}
        {bottomPlayer && (
          <div className="flex flex-col items-center w-full max-w-5xl mx-auto space-y-2.5 z-10">
            
            {gamePhase === 'LAOQIAN_EXTRA_PROMPT' && turn === mySeatId && (
              <div className="w-full bg-pink-950/95 border-2 border-pink-400 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 shadow-2xl animate-pulse">
                <div className="flex items-center space-x-2">
                  <Flower className="text-pink-400" size={20} />
                  <div className="text-xs md:text-sm text-white">
                    <span className="font-black text-pink-300">【老千 · 步步生花】已就绪！({timeLeft}s)</span>
                    <span className="ml-1">你当前拥有 <strong>{humanFlowerInfo.total} 花</strong>（大于4花），是否消耗 1 张花牌换取<strong>额外的抽牌打牌机会</strong>？</span>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => executeLaoqianExtraTurn(mySeatId, players)}
                    className="bg-pink-600 hover:bg-pink-500 text-white font-black px-4 py-1.5 rounded-lg shadow-lg text-xs md:text-sm"
                  >
                    🌺 消耗1花：额外摸牌并继续打牌
                  </button>
                  <button
                    onClick={() => {
                      const nextId = getNextPlayerId(mySeatId, turnDirection);
                      advanceTurn(nextId, players);
                    }}
                    className="bg-neutral-700 hover:bg-neutral-600 text-gray-200 font-bold px-4 py-1.5 rounded-lg text-xs md:text-sm"
                  >
                    不发动，结束回合
                  </button>
                </div>
              </div>
            )}

            {gamePhase === 'REACTION' && pendingReactions && (pendingReactions.responderId === undefined || pendingReactions.responderId === mySeatId) && (
              <div className="w-full bg-amber-950/95 border-2 border-yellow-400 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 shadow-2xl">
                <div className="flex flex-col">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="text-yellow-400" size={18} />
                    <span className="text-sm font-bold text-white">
                      [{pendingReactions.discardRecord.role}] 打出了 <strong className="text-yellow-300 text-base">【{pendingReactions.discardRecord.tile}】</strong>，请在 <strong className="text-amber-300">{timeLeft}s</strong> 内选择响应：
                    </span>
                  </div>
                  {pendingReactions.huLockedReason && (
                    <div className="text-xs text-red-300 flex items-center mt-1">
                      <AlertCircle size={13} className="mr-1 text-red-400" />
                      无法点炮胡该牌：{pendingReactions.huLockedReason}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {pendingReactions.canHu && (
                    <button onClick={handleHumanHuReaction} className="bg-red-600 hover:bg-red-500 text-white font-black px-4 py-1.5 rounded-lg shadow animate-bounce">
                      🀄 点炮胡牌 ({pendingReactions.huType})
                    </button>
                  )}
                  {pendingReactions.canNormalPeng && (
                    <button onClick={handleHumanNormalPeng} className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-lg shadow">
                      碰牌
                    </button>
                  )}
                  {pendingReactions.canMingGang && (
                    <button onClick={handleHumanMingGang} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-1.5 rounded-lg shadow">
                      明杠 (+1花)
                    </button>
                  )}
                  {pendingReactions.canMaijiPeng && (
                    <button onClick={handleOpenMaijiSkillModal} className="bg-cyan-500 hover:bg-cyan-400 text-black font-black px-3 py-1.5 rounded-lg shadow flex items-center">
                      🔧 刻意求工强碰 (1币)
                    </button>
                  )}
                  {pendingReactions.canNormalChi && (
                    <button onClick={() => handleTriggerChi(false)} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg shadow">
                      吃上家牌
                    </button>
                  )}
                  {pendingReactions.canLingfengChi && (
                    <button onClick={() => handleTriggerChi(true)} className="bg-green-500 hover:bg-green-400 text-black font-black px-3 py-1.5 rounded-lg shadow flex items-center">
                      🌪️ 乘风跨座吃 (1币)
                    </button>
                  )}
                  <button onClick={handleHumanPassReaction} className="bg-neutral-700 hover:bg-neutral-600 text-gray-200 font-bold px-4 py-1.5 rounded-lg">
                    过 ({timeLeft}s)
                  </button>
                </div>
              </div>
            )}

            {turn === mySeatId && gamePhase === 'ACTION' && !humanHuCheck.canHu && humanHuCheck.lockedReason && (
              <div className="w-full bg-red-950/90 border border-red-500 px-3 py-1.5 rounded-xl flex items-center justify-center text-xs text-red-200 shadow">
                <AlertCircle size={15} className="mr-1.5 text-red-400 shrink-0" />
                <span><strong>牌型已胡但暂被锁死：</strong>{humanHuCheck.lockedReason}</span>
              </div>
            )}

            {humanTingList.length > 0 && (
              <div className="w-full bg-emerald-950/90 border border-emerald-500/60 px-3 py-1.5 rounded-xl flex flex-wrap items-center justify-between text-xs shadow">
                <div className="flex items-center space-x-2">
                  <span className="bg-emerald-500 text-black font-black px-2 py-0.5 rounded text-[11px]">⚡ 听牌中</span>
                  <span className="text-emerald-200 font-bold">可胡牌面：</span>
                  <div className="flex flex-wrap gap-1.5">
                    {humanTingList.map((item, idx) => (
                      <span
                        key={idx}
                        className={`px-2 py-0.5 rounded font-black border ${
                          item.canHuNow
                            ? 'bg-yellow-500/20 border-yellow-400 text-yellow-200'
                            : 'bg-red-950/70 border-red-600 text-red-300'
                        }`}
                        title={item.lockedReason || '可直接胡牌'}
                      >
                        {item.tile} {!item.canHuNow && '(需补花/解封)'}
                      </span>
                    ))}
                  </div>
                </div>
                {humanTingList.some(t => !t.canHuNow) && (
                  <span className="text-[11px] text-amber-300">
                    ⚠️ 注意：{humanTingList.find(t => !t.canHuNow)?.lockedReason}
                  </span>
                )}
              </div>
            )}

            <div className="w-full flex flex-wrap justify-between items-end gap-2 px-2">
              {renderPlayerCard(bottomPlayer)}

              <div className="flex flex-wrap items-center gap-1 bg-black/35 px-3 py-1.5 rounded-xl border border-pink-500/20 max-w-md">
                <span className="text-xs text-pink-300 mr-1 font-bold">花牌区 ({humanFlowerInfo.total}花):</span>
                {bottomPlayer.flowerTiles.length === 0 ? (
                  <span className="text-xs text-gray-500">暂无实体花</span>
                ) : (
                  bottomPlayer.flowerTiles.map((ft, idx) => (
                    <span
                      key={idx}
                      className={`text-xs px-1.5 py-0.5 rounded font-bold border ${
                        ft === '北风'
                          ? 'bg-emerald-950 border-emerald-500 text-emerald-200'
                          : 'bg-pink-950/90 border-pink-700 text-pink-200'
                      }`}
                    >
                      {ft.replace('花-', '')}
                    </span>
                  ))
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 bg-neutral-900/90 p-2 rounded-xl border border-neutral-700 shadow-xl">
                <button
                  onClick={handleAutoSortHumanHand}
                  className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-gray-200 text-xs font-bold flex items-center border border-neutral-600"
                  title="按万、筒、条、风顺序整理手牌"
                >
                  <ArrowUpDown size={14} className="mr-1 text-blue-400" /> 自动理牌
                </button>

                <button
                  onClick={() => handleDrawTile(mySeatId)}
                  disabled={turn !== mySeatId || gamePhase !== 'DRAW'}
                  className={`px-4 py-2 rounded-lg font-bold text-xs md:text-sm flex items-center transition-all ${
                    turn === mySeatId && gamePhase === 'DRAW'
                      ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg scale-105'
                      : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                  }`}
                >
                  摸牌 <ChevronRight size={16} className="ml-0.5" />
                </button>

                {bottomPlayer.role === '老千' && (
                  <>
                    <button
                      onClick={handleOpenQianshu}
                      disabled={turn !== mySeatId || gamePhase !== 'DRAW' || bottomPlayer.coins < 1 || deck.length < 3}
                      className={`px-3 py-2 rounded-lg font-bold text-xs md:text-sm flex items-center ${
                        turn === mySeatId && gamePhase === 'DRAW' && bottomPlayer.coins >= 1
                          ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-lg'
                          : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                      }`}
                    >
                      <Eye size={15} className="mr-1" /> 千术 (1币)
                    </button>
                    <button
                      onClick={() => setLaoqianExtraQueued(prev => !prev)}
                      disabled={turn !== mySeatId || (gamePhase !== 'DRAW' && gamePhase !== 'ACTION') || humanFlowerInfo.total <= 4 || bottomPlayer.flowerTiles.length === 0}
                      className={`px-3 py-2 rounded-lg font-bold text-xs md:text-sm flex items-center transition-all ${
                        turn === mySeatId && (gamePhase === 'DRAW' || gamePhase === 'ACTION') && humanFlowerInfo.total > 4 && bottomPlayer.flowerTiles.length > 0
                          ? laoqianExtraQueued
                            ? 'bg-pink-500 text-white ring-2 ring-yellow-300 shadow-lg'
                            : 'bg-pink-700 hover:bg-pink-600 text-white shadow-lg'
                          : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                      }`}
                      title="花牌大于4时，开启后打出本张牌将自动消耗1张花牌并立即额外摸1张牌继续出牌"
                    >
                      <Flower size={15} className="mr-1" />
                      {laoqianExtraQueued ? '✅ 已预约步步生花(-1花)' : '步步生花:额外摸打(-1花)'}
                    </button>
                  </>
                )}

                {bottomPlayer.role === '典当师' && (
                  <button
                    onClick={() => setPawnModal(true)}
                    disabled={turn !== mySeatId || gamePhase !== 'ACTION' || bottomPlayer.coins < 1}
                    className={`px-3 py-2 rounded-lg font-bold text-xs md:text-sm flex items-center ${
                      turn === mySeatId && gamePhase === 'ACTION' && bottomPlayer.coins >= 1
                        ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg'
                        : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                    }`}
                  >
                    <Ban size={15} className="mr-1" /> 售罄禁花色 (1币)
                  </button>
                )}

                {bottomPlayer.role === '阿姨' && (
                  <>
                    <button
                      onClick={handleAyiFreezeNext}
                      disabled={turn !== mySeatId || (gamePhase !== 'DRAW' && gamePhase !== 'ACTION') || bottomPlayer.coins < 1 || currentNextPlayer?.isFrozen}
                      className={`px-3 py-2 rounded-lg font-bold text-xs md:text-sm flex items-center ${
                        turn === mySeatId && (gamePhase === 'DRAW' || gamePhase === 'ACTION') && bottomPlayer.coins >= 1 && !currentNextPlayer?.isFrozen
                          ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg'
                          : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                      }`}
                      title="指定当前下家1巡禁止任何行动（禁响应、跳过下回合）"
                    >
                      <Lock size={14} className="mr-1" />
                      闲人免进:禁{currentNextPlayer?.role} (1币)
                    </button>
                    <button
                      onClick={handleAyiReverseDirection}
                      disabled={turn !== mySeatId || (gamePhase !== 'DRAW' && gamePhase !== 'ACTION') || bottomPlayer.coins < 1}
                      className={`px-3 py-2 rounded-lg font-bold text-xs md:text-sm flex items-center ${
                        turn === mySeatId && (gamePhase === 'DRAW' || gamePhase === 'ACTION') && bottomPlayer.coins >= 1
                          ? 'bg-orange-500 hover:bg-orange-400 text-black shadow-lg'
                          : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                      }`}
                      title="转换本局游戏的出牌顺序（顺时针 ⇄ 逆时针）"
                    >
                      {turnDirection === 1 ? <RotateCw size={14} className="mr-1" /> : <RotateCcw size={14} className="mr-1" />}
                      风水轮流转 (1币)
                    </button>
                  </>
                )}

                {humanGangOptions.map(gangTile => (
                  <div key={gangTile} className="flex space-x-1">
                    <button
                      onClick={() => handleHumanAnGang(gangTile, false)}
                      className="px-2.5 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold"
                    >
                      暗杠[{gangTile}]
                    </button>
                    <button
                      onClick={() => handleHumanAnGang(gangTile, true)}
                      className="px-2.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
                    >
                      明杠[{gangTile}](+1花)
                    </button>
                  </div>
                ))}

                {humanHuCheck.canHu && (
                  <button
                    onClick={handleHumanTsumo}
                    className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black text-sm shadow-xl animate-bounce"
                  >
                    🀄 自摸胡牌 ({humanHuCheck.type})
                  </button>
                )}
              </div>
            </div>

            <div className="bg-black/45 p-3 md:p-4 rounded-2xl w-full flex flex-col items-center border border-emerald-800/50 shadow-2xl">
              <div className="flex flex-wrap justify-center gap-1.5 md:gap-2">
                {bottomPlayer.hand.map((tile, i) => {
                  const isAllowed = turn === mySeatId && gamePhase === 'ACTION' ? canPlayerDiscardTile(bottomPlayer, tile) : true;
                  const isLingfengWind = bottomPlayer.role === '灵风' && (tile === '东风' || tile === '南风' || tile === '西风');
                  return (
                    <div key={i} className="relative group">
                      {renderMahjongTile(tile, {
                        onClick: () => handleHumanTileClick(i),
                        isSelected: selectedHandIdx === i,
                        isDisabled: turn === mySeatId && gamePhase === 'ACTION' && !isAllowed,
                        badge: isLingfengWind ? '+0.5花' : null
                      })}
                      {turn === mySeatId && gamePhase === 'ACTION' && isAllowed && (
                        <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                          {laoqianExtraQueued ? '打出并再摸1张' : '打出'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="text-[11px] text-emerald-200/70 mt-2 flex flex-wrap items-center justify-center gap-3">
                <span>💡 提示：{turn === mySeatId && gamePhase === 'ACTION' ? `请在 ${timeLeft}s 内点击手牌打出` : '非出牌阶段点击两张手牌可自由交换位置（手动理牌）'}</span>
                <span>|</span>
                <span>花数详情：{humanFlowerInfo.details.join('，')}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 右侧边栏：角色技能图鉴 & 实时战况日志 */}
      <div className="w-full lg:w-80 bg-neutral-900 border-l border-neutral-800 flex flex-col h-72 lg:h-screen">
        <div className="p-4 border-b border-neutral-800 bg-neutral-950 flex justify-between items-center">
          <div>
            <h1 className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-500">
              技能麻将 · 联机对战版
            </h1>
            <p className="text-[11px] text-gray-400">30s限时出牌 · 灵风全风牌加成</p>
          </div>
          <button
            onClick={() => startNewGame(selectedHumanRole, aiDifficulty)}
            className="bg-neutral-800 hover:bg-neutral-700 text-gray-200 p-2 rounded-lg border border-neutral-700"
            title="重开本局"
          >
            <RefreshCw size={15} />
          </button>
        </div>

        <div className="p-3 border-b border-neutral-800 bg-neutral-900/60 text-xs space-y-2 overflow-y-auto max-h-64">
          <div className="font-bold text-gray-200 flex items-center">
            <Info size={14} className="mr-1.5 text-yellow-400" /> 核心规则速览
          </div>
          <ul className="list-disc pl-4 space-y-1 text-gray-400 text-[11px]">
            <li><strong className="text-pink-400">花牌补牌：</strong>8花 + 中、发、白（灵风含北风）算1花，抽到自动置入花牌区并补牌；灵风其余风牌各算0.5花。</li>
            <li><strong className="text-amber-400">4花解锁碰牌：</strong>每个玩家满4花时所“碰”的牌才生效；含“碰”牌型满4花前不能胡牌。</li>
            <li><strong className="text-emerald-400">30秒限时：</strong>每步摸牌、出牌或响应限时30秒，超时自动代打。</li>
          </ul>

          {bottomPlayer && (
            <div className={`p-2.5 rounded-lg bg-neutral-800/90 border-l-4 ${ROLES_INFO[bottomPlayer.role].border} mt-2`}>
              <div className={`font-bold ${ROLES_INFO[bottomPlayer.role].text}`}>
                当前角色：{bottomPlayer.role}
              </div>
              <div className="text-[11px] text-gray-300 mt-1">
                <strong>主动·{ROLES_INFO[bottomPlayer.role].activeName}：</strong>{ROLES_INFO[bottomPlayer.role].activeDesc}
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                <strong>被动·{ROLES_INFO[bottomPlayer.role].passiveName}：</strong>{ROLES_INFO[bottomPlayer.role].passiveDesc}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 p-3 overflow-y-auto space-y-2 text-xs bg-neutral-950/60">
          {logs.map((log, index) => (
            <div key={index} className="bg-neutral-900/90 border border-neutral-800/80 p-2 rounded-lg text-gray-300 leading-relaxed">
              {log}
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      </div>

      {/* ================== 弹窗 1：开局大厅 ================== */}
      {showRoleSelectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
          <div className="bg-neutral-900 border-2 border-yellow-600/60 rounded-3xl max-w-4xl w-full p-5 md:p-7 shadow-2xl my-auto">
            <h2 className="text-2xl md:text-3xl font-black text-center text-white mb-1">技能麻将 · 对局大厅</h2>
            <p className="text-center text-gray-400 text-xs mb-4">支持单机 AI 练习与好友联机房间同台竞技 · 每步 30 秒倒计时</p>

            <div className="flex justify-center space-x-3 mb-5">
              <button
                onClick={() => setGameMode('SINGLE')}
                className={`px-5 py-2 rounded-xl font-black text-xs md:text-sm flex items-center border-2 transition-all ${
                  gameMode === 'SINGLE' ? 'bg-amber-500 text-black border-yellow-300 shadow-lg' : 'bg-neutral-800 text-gray-300 border-neutral-700 hover:bg-neutral-700'
                }`}
              >
                <Brain size={16} className="mr-1.5" /> 单机 AI 模式
              </button>
              <button
                onClick={() => {
                  setGameMode('ONLINE');
                  if (!activeRoomCode) handleCreateOrJoinRoom();
                }}
                className={`px-5 py-2 rounded-xl font-black text-xs md:text-sm flex items-center border-2 transition-all ${
                  gameMode === 'ONLINE' ? 'bg-cyan-500 text-black border-cyan-300 shadow-lg' : 'bg-neutral-800 text-gray-300 border-neutral-700 hover:bg-neutral-700'
                }`}
              >
                <Globe size={16} className="mr-1.5" /> 联机对战房间 (支持多窗口/好友同玩)
              </button>
            </div>

            {gameMode === 'ONLINE' && (
              <div className="bg-neutral-950/90 border-2 border-cyan-500/50 rounded-2xl p-4 mb-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-cyan-300">你的昵称:</span>
                    <input type="text" value={playerName} onChange={(e) => setPlayerName(e.target.value)} className="bg-neutral-800 border border-neutral-600 rounded-lg px-2.5 py-1 text-xs text-white w-28" placeholder="输入昵称" />
                    <span className="text-xs font-bold text-cyan-300 ml-2">房间号:</span>
                    <input type="text" value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase())} className="bg-neutral-800 border border-cyan-600 rounded-lg px-2.5 py-1 text-xs font-black text-yellow-300 w-24 uppercase" placeholder="如 8888" />
                    <button onClick={() => handleCreateOrJoinRoom(roomCode)} className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow">创建 / 加入房间</button>
                  </div>

                  {activeRoomCode && (
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-gray-300">当前房间: <strong className="text-yellow-400 text-sm">#{activeRoomCode}</strong></span>
                      <button onClick={() => { if (navigator.clipboard) { navigator.clipboard.writeText(activeRoomCode); setCopySuccess(true); setTimeout(() => setCopySuccess(false), 2000); } }} className="bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-xs px-2.5 py-1 rounded flex items-center text-cyan-300">
                        <Copy size={12} className="mr-1" /> {copySuccess ? '已复制' : '复制房号'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2">
                  {roomSeats.map((s) => {
                    const isMe = s.seatId === mySeatId;
                    return (
                      <div key={s.seatId} onClick={() => handleSelectOnlineSeat(s.seatId)} className={`cursor-pointer p-2.5 rounded-xl border transition-all ${isMe ? 'bg-cyan-950/70 border-cyan-400 ring-1 ring-cyan-400' : 'bg-neutral-900 border-neutral-700 hover:border-neutral-500'}`}>
                        <div className="flex justify-between items-center text-xs font-bold mb-1">
                          <span className="text-gray-300">{s.seatId + 1}号座</span>
                          <span className={isMe ? 'text-cyan-300' : s.isAI ? 'text-gray-500' : 'text-emerald-400'}>{isMe ? '👉 你自己' : s.isAI ? '🤖 AI替补' : '👤 真人玩家'}</span>
                        </div>
                        <div className="text-xs font-black text-white truncate">{isMe ? playerName : s.name}</div>
                        <div className={`text-[11px] font-bold mt-0.5 ${ROLES_INFO[s.role]?.text || 'text-yellow-400'}`}>角色：{isMe ? selectedHumanRole : s.role}</div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-gray-400">💡 联机说明：将房间号发给好友（或在本机新开浏览器标签页输入相同房间号）即可加入不同座位，未坐满的空位将由 AI 自动补位！</p>
              </div>
            )}

            <div className="mb-5">
              <div className="text-xs font-bold text-gray-300 mb-2 flex items-center"><Brain size={14} className="mr-1.5 text-cyan-400" /> 选择 AI 对手难度：</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                {Object.values(AI_DIFFICULTIES).map(diff => (
                  <div key={diff.id} onClick={() => setAiDifficulty(diff.id)} className={`cursor-pointer p-3 rounded-xl border-2 transition-all ${aiDifficulty === diff.id ? `${diff.border} bg-neutral-800 shadow-lg` : 'border-neutral-800 bg-neutral-950/60 hover:bg-neutral-800/40'}`}>
                    <div className="flex justify-between items-center mb-1"><span className={`font-black text-sm ${diff.color}`}>{diff.name}</span>{aiDifficulty === diff.id && <Check size={15} className="text-yellow-400" />}</div>
                    <p className="text-[11px] text-gray-400 leading-relaxed">{diff.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-xs font-bold text-gray-300 mb-2 flex items-center"><Users size={14} className="mr-1.5 text-yellow-400" /> 选择你的角色（5选1）：</div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
              {Object.values(ROLES_INFO).map(role => {
                const isSelected = selectedHumanRole === role.name;
                return (
                  <div key={role.name} onClick={() => handleChangeRoleInLobby(role.name)} className={`cursor-pointer rounded-2xl p-3.5 border-2 transition-all ${isSelected ? `${role.border} bg-neutral-800 scale-[1.01] shadow-xl` : 'border-neutral-700 bg-neutral-900/60 hover:bg-neutral-800/50'}`}>
                    <div className="flex justify-between items-center mb-1.5">
                      <div><span className={`text-base font-black ${role.text}`}>{role.name}</span><span className="text-xs text-gray-400 ml-2">· {role.title}</span></div>
                      {isSelected && <Check size={18} className="text-yellow-400" />}
                    </div>
                    <div className="text-xs text-gray-200 mb-1 leading-relaxed"><span className="bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded mr-1 font-bold">{role.activeName}</span>{role.activeDesc}</div>
                    <div className="text-xs text-gray-400 leading-relaxed"><span className="bg-pink-500/20 text-pink-300 px-1.5 py-0.5 rounded mr-1 font-bold">被动·{role.passiveName}</span>{role.passiveDesc}</div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-center">
              <button onClick={() => startNewGame(selectedHumanRole, aiDifficulty)} className="bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-black font-black px-8 py-3 rounded-xl text-base shadow-xl">
                {gameMode === 'ONLINE' ? `开始联机房间 #${activeRoomCode} 对局 (座位 ${mySeatId + 1} · ${selectedHumanRole})` : `以【${selectedHumanRole}】开始单机对局 (${AI_DIFFICULTIES[aiDifficulty].name})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================== 弹窗 2：老千《千术》控牌 ================== */}
      {gamePhase === 'SKILL_MODAL' && qianshuData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border-2 border-yellow-500 rounded-2xl p-6 max-w-lg w-full shadow-2xl">
            <div className="flex justify-between items-center mb-1"><h3 className="text-xl font-black text-yellow-400 flex items-center"><Eye className="mr-2" /> 老千 · 千术控牌</h3><span className="text-xs font-bold text-amber-300">⏱️ {timeLeft}s</span></div>
            <p className="text-xs text-gray-400 mb-4">第1步：点击选择 1 张收入手牌（若选花牌将自动补花）：</p>
            <div className="flex justify-center space-x-6 mb-6">
              {qianshuData.cards.map((c, idx) => (
                <div key={idx} className="flex flex-col items-center">
                  {renderMahjongTile(c, { size: 'lg', isSelected: qianshuData.pickedIdx === idx, onClick: () => { const otherIndices = [0, 1, 2].filter(i => i !== idx); setQianshuData({ ...qianshuData, pickedIdx: idx, firstPutIdx: otherIndices[0] }); }})}
                  <span className="text-xs mt-2 font-bold text-yellow-300">{qianshuData.pickedIdx === idx ? '✅ 收入手牌' : '放回牌山'}</span>
                </div>
              ))}
            </div>
            <div className="bg-neutral-800 p-3 rounded-xl mb-5 space-y-3 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-gray-300 font-bold">第2步：其余 2 张放回位置：</span>
                <div className="flex space-x-2">
                  <button onClick={() => setQianshuData({ ...qianshuData, putPosition: 'top' })} className={`px-3 py-1 rounded font-bold ${qianshuData.putPosition === 'top' ? 'bg-yellow-500 text-black' : 'bg-neutral-700 text-gray-300'}`}>放回牌山顶</button>
                  <button onClick={() => setQianshuData({ ...qianshuData, putPosition: 'bottom' })} className={`px-3 py-1 rounded font-bold ${qianshuData.putPosition === 'bottom' ? 'bg-yellow-500 text-black' : 'bg-neutral-700 text-gray-300'}`}>放回牌山底</button>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300 font-bold">第3步：调整其余 2 张的先后顺序：</span>
                <button onClick={() => { const others = [0, 1, 2].filter(i => i !== qianshuData.pickedIdx); const nextFirst = qianshuData.firstPutIdx === others[0] ? others[1] : others[0]; setQianshuData({ ...qianshuData, firstPutIdx: nextFirst }); }} className="bg-neutral-700 hover:bg-neutral-600 px-2.5 py-1 rounded text-yellow-300 font-bold">
                  🔄 互换顺序 ({qianshuData.cards[qianshuData.firstPutIdx]} 在前)
                </button>
              </div>
            </div>
            <button onClick={handleConfirmQianshu} className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-black py-2.5 rounded-xl">确认执行千术</button>
          </div>
        </div>
      )}

      {/* ================== 弹窗 3：麦咭《刻意求工》 ================== */}
      {maijiModal && pendingReactions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border-2 border-cyan-400 rounded-2xl p-6 max-w-xl w-full shadow-2xl">
            <h3 className="text-xl font-black text-cyan-400 mb-2">🔧 麦咭 · 刻意求工 (消耗1币)</h3>
            <p className="text-xs text-gray-300 mb-4">你要强行碰出 <strong className="text-yellow-300">【{pendingReactions.discardRecord.tile}】</strong>。系统会自动扣除你手中 1 张【{pendingReactions.discardRecord.tile}】，请从下方其余手牌中点击选择 1 张<strong>废牌</strong>充当第 2 张碰牌材料：</p>
            <div className="flex flex-wrap justify-center gap-2 mb-5">
              {bottomPlayer?.hand.map((t, idx) => {
                const targetTile = pendingReactions.discardRecord.tile;
                const firstTargetIdx = bottomPlayer.hand.indexOf(targetTile);
                const isReservedTarget = idx === firstTargetIdx;
                return (
                  <div key={idx} className="flex flex-col items-center">
                    {renderMahjongTile(t, { isDisabled: isReservedTarget, badge: isReservedTarget ? '配对真牌' : null, onClick: () => handleConfirmMaijiPeng(idx) })}
                  </div>
                );
              })}
            </div>
            <button onClick={() => setMaijiModal(false)} className="w-full bg-neutral-700 hover:bg-neutral-600 text-gray-200 py-2 rounded-xl font-bold text-xs">取消</button>
          </div>
        </div>
      )}

      {/* ================== 弹窗 4：灵风吃牌选择 ================== */}
      {lingfengCombos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border-2 border-emerald-400 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-black text-emerald-400 mb-3">选择用于吃【{lingfengCombos.tile}】的手牌搭子：</h3>
            <div className="space-y-2 mb-4">
              {lingfengCombos.combos.map((combo, idx) => (
                <button key={idx} onClick={() => executeHumanChi(combo, lingfengCombos.tile, lingfengCombos.isSkill)} className="w-full bg-neutral-800 hover:bg-emerald-900/60 border border-emerald-600/50 p-3 rounded-xl flex items-center justify-center space-x-3 font-bold">
                  <span>用【{combo[0]}】+【{combo[1]}】吃【{lingfengCombos.tile}】</span>
                </button>
              ))}
            </div>
            <button onClick={() => setLingfengCombos(null)} className="w-full bg-neutral-700 py-2 rounded-xl text-xs font-bold">取消</button>
          </div>
        </div>
      )}

      {/* ================== 弹窗 5：典当师《售罄》 ================== */}
      {pawnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border-2 border-purple-500 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-black text-purple-400 mb-2">🚫 典当师 · 售罄 (消耗1币)</h3>
            <p className="text-xs text-gray-300 mb-3">声明一种花色，在你的下个回合开始前，全场所有玩家<strong>禁止打出 / 胡 / 作为副露亮出</strong>该花色的牌：</p>
            {bottomPlayer && bottomPlayer.melds.some(m => m.type === 'peng') && humanFlowerInfo.total - 1 < 4 && (
              <div className="bg-amber-950/80 border border-amber-500 text-amber-200 text-[11px] p-2 rounded-lg mb-4">
                ⚠️ 提醒：你当前已碰牌，消耗 1 枚技能币后你的有效花数将变为 {humanFlowerInfo.total - 1} 花（低于4花解锁线）。
              </div>
            )}
            <div className="grid grid-cols-3 gap-3 mb-5">
              {SUITS.map(s => (
                <button key={s} onClick={() => handleConfirmPawnBan(s)} className="bg-purple-900/60 hover:bg-purple-600 border border-purple-400 py-4 rounded-xl text-lg font-black text-white shadow-lg">禁【{s}】</button>
              ))}
            </div>
            <button onClick={() => setPawnModal(false)} className="w-full bg-neutral-700 py-2 rounded-xl text-xs font-bold">取消</button>
          </div>
        </div>
      )}

      {/* ================== 弹窗 6：胡牌结算 / 流局 ================== */}
      {(gamePhase === 'WINNER' || gamePhase === 'DRAW_GAME') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="bg-neutral-900 border-2 border-yellow-500 rounded-3xl p-6 md:p-8 max-w-xl w-full text-center shadow-2xl">
            <Trophy size={48} className="text-yellow-400 mx-auto mb-3" />
            {gamePhase === 'WINNER' && winnerInfo ? (
              <>
                <h2 className="text-2xl md:text-3xl font-black text-white mb-1">【{winnerInfo.winner.role}】({winnerInfo.winner.name}) 获胜！</h2>
                <p className="text-yellow-400 font-bold text-sm mb-4">胡牌方式：{winnerInfo.winType} · 有效花牌数：{getFlowerBreakdown(winnerInfo.winner).total} 花</p>
                <div className="bg-black/40 p-4 rounded-2xl mb-6 flex flex-wrap justify-center gap-1.5">
                  {winnerInfo.winner.melds.map((m, i) => (
                    <div key={i} className="flex space-x-0.5 mr-2 bg-neutral-800 p-1 rounded">
                      {m.tiles.map((t, j) => <div key={j}>{renderMahjongTile(t, { size: 'sm' })}</div>)}
                    </div>
                  ))}
                  {winnerInfo.winner.hand.map((t, i) => (
                    <div key={i}>{renderMahjongTile(t, { size: 'sm' })}</div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-black text-gray-200 mb-2">荒牌流局</h2>
                <p className="text-xs text-gray-400 mb-6">牌山已全部摸完，无人达成合法胡牌条件。</p>
              </>
            )}

            <div className="flex justify-center space-x-4">
              <button onClick={() => startNewGame(selectedHumanRole, aiDifficulty)} className="bg-yellow-500 hover:bg-yellow-400 text-black font-black px-6 py-2.5 rounded-xl">再来一局</button>
              <button onClick={() => setShowRoleSelectModal(true)} className="bg-neutral-700 hover:bg-neutral-600 text-white font-bold px-6 py-2.5 rounded-xl">更换模式 / 角色</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}