import React, { useState, useEffect, useRef } from 'react';
import { Coins, Flower, Wind, ChevronRight, Eye, Info, ArrowUpDown, ShieldAlert, Sparkles, RefreshCw, Trophy, Users, Check, Ban, Layers, Brain, AlertCircle, HelpCircle } from 'lucide-react';

// --- 常量与牌库定义 ---
const SUITS = ['万', '筒', '条'];
const WINDS = ['东风', '南风', '西风', '北风'];
const DRAGONS = ['中', '发', '白'];
const FLOWERS = ['春', '夏', '秋', '冬', '梅', '兰', '竹', '菊'];

// 标准34种可进手牌/胡牌的牌面（不含花牌和中发白）
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
    name: '老千',
    title: '命运操盘手',
    color: 'from-amber-500 to-yellow-600',
    border: 'border-yellow-500',
    text: 'text-yellow-400',
    activeName: '千术 (1币)',
    activeDesc: '查看牌山顶端的3张牌，将其中1张直接收入手牌，其余2张按任意顺序放回牌山顶或牌山底。',
    passiveName: '步步生花',
    passiveDesc: '手中花牌数量大于4时触发：轮到老千的轮次时，可选择消耗1张花牌换取额外的抽牌打牌机会。'
  },
  '麦咭': {
    name: '麦咭',
    title: '机械改装师',
    color: 'from-blue-500 to-cyan-600',
    border: 'border-blue-500',
    text: 'text-blue-400',
    activeName: '刻意求工 (1币)',
    activeDesc: '当其他玩家打出一张牌，而你手中只有1张相同的牌时，可将手里任意1张废牌当作第2张牌强行“碰”出。',
    passiveName: '花团锦簇',
    passiveDesc: '麦咭打出的每个副露（吃、碰、杠）可以额外算作半张花牌（0.5花）。'
  },
  '灵风': {
    name: '灵风',
    title: '疾风刺客',
    color: 'from-emerald-500 to-green-600',
    border: 'border-green-500',
    text: 'text-green-400',
    activeName: '乘风 (1币)',
    activeDesc: '无视上下家，当场上任意玩家打出一张牌时，灵风可以选择吃牌并跳转到灵风的轮次。',
    passiveName: '北风，北北风',
    passiveDesc: '灵风抽取的每一张北风牌可以算作 1 张花牌。'
  },
  '典当师': {
    name: '典当师',
    title: '黑市垄断者',
    color: 'from-purple-500 to-fuchsia-600',
    border: 'border-purple-500',
    text: 'text-purple-400',
    activeName: '售罄 (1币)',
    activeDesc: '在出牌阶段使用。声明一种花色（万、筒、条）。下个回合开始前，全场禁止打出/胡/作为副露亮出该花色的牌（除非无其他牌可打）。',
    passiveName: '繁花似锦',
    passiveDesc: '手中的每一组暗刻和每一个技能币都额外算作 1 张花牌。'
  }
};

// 纯随机洗牌 (Fisher-Yates) - 包含 108序数牌 + 16风牌 + 12中发白 + 8花牌 = 144张
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
  // 标准 Fisher-Yates 纯随机打乱
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

const isFlowerTile = (tile) => {
  return DRAGONS.includes(tile) || tile.startsWith('花-');
};

const getTileSuit = (tile) => {
  if (tile.endsWith('万')) return '万';
  if (tile.endsWith('筒')) return '筒';
  if (tile.endsWith('条')) return '条';
  return '风';
};

// 理牌权重计算：万(1-9) -> 筒(11-19) -> 条(21-29) -> 东南西北(31-34)
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

// 抽牌并自动补花（同时记录灵风抽取过的北风牌）
const drawAndResolveFlowers = (deck, count) => {
  let currentDeck = [...deck];
  let drawnHand = [];
  let drawnFlowers = [];

  while (drawnHand.length < count && currentDeck.length > 0) {
    const tile = currentDeck.shift();
    if (isFlowerTile(tile)) {
      drawnFlowers.push(tile);
    } else {
      drawnHand.push(tile);
    }
  }
  return { drawnHand, drawnFlowers, remainingDeck: currentDeck };
};

// 计算某玩家当前总有效花牌数（严格按最新技能规则拆解）
const getFlowerBreakdown = (player) => {
  const baseFlowers = player.flowerTiles.length;
  const mingGangCount = player.melds.filter(m => m.type === 'minggang').length;
  let bonus = 0;
  let details = [`实体花牌: ${baseFlowers}`];
  if (mingGangCount > 0) details.push(`明杠: +${mingGangCount}`);

  if (player.role === '麦咭') {
    const meldBonus = player.melds.length * 0.5;
    bonus += meldBonus;
    if (meldBonus > 0) details.push(`花团锦簇(副露): +${meldBonus}`);
  } else if (player.role === '灵风') {
    // 灵风抽取的每一张北风牌算作1张花牌（包含手牌、副露、以及自己摸到后打出的北风）
    const handNorth = player.hand.filter(t => t === '北风').length;
    const meldNorth = player.melds.reduce((acc, m) => acc + m.tiles.filter(t => t === '北风').length, 0);
    const discardNorth = (player.discards || []).filter(t => t === '北风').length;
    const northBonus = handNorth + meldNorth + discardNorth;
    bonus += northBonus;
    if (northBonus > 0) details.push(`北风加成: +${northBonus}`);
  } else if (player.role === '典当师') {
    // 最新规则：手中的每一组暗刻和每一个技能币都额外算作1张花牌（已移除「发」的额外加成）
    const coinBonus = player.coins;
    const counts = {};
    player.hand.forEach(t => counts[t] = (counts[t] || 0) + 1);
    const anKeBonus = Object.values(counts).filter(c => c >= 3).length;
    bonus += coinBonus + anKeBonus;
    if (coinBonus > 0) details.push(`技能币加成: +${coinBonus}`);
    if (anKeBonus > 0) details.push(`暗刻加成: +${anKeBonus}`);
  }

  // 解决 0.5 浮点数精度问题
  const rawTotal = Math.round((baseFlowers + mingGangCount + bonus) * 10) / 10;

  return {
    total: rawTotal,
    details
  };
};

// --- 完备无死角胡牌算法 (递归回溯支持复杂多面听、7小对、3x4+2、4花解锁碰牌、售罄禁胡校验) ---
const canFormSets = (tiles) => {
  if (tiles.length === 0) return true;
  const sorted = sortHandTiles(tiles);
  const first = sorted[0];

  // 分支1：尝试将第一张牌作为刻子(3张相同)移除
  if (sorted.filter(t => t === first).length >= 3) {
    const next = [...sorted];
    for (let i = 0; i < 3; i++) next.splice(next.indexOf(first), 1);
    if (canFormSets(next)) return true;
  }

  // 分支2：尝试将第一张牌作为顺子(同花色连续3张)移除
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

// 仅判断牌型本身是否满足 3x4+2 或 七小对
const isPureMahjongWinPattern = (handTiles, meldCount) => {
  // 1. 七小对判定 (必须门前清，无副露，14张牌，支持龙七对即4张相同算2对)
  if (meldCount === 0 && handTiles.length === 14) {
    const counts = {};
    handTiles.forEach(t => counts[t] = (counts[t] || 0) + 1);
    const isSevenPairs = Object.values(counts).every(c => c === 2 || c === 4);
    if (isSevenPairs) return { valid: true, patternName: '七小对' };
  }

  // 2. 标准 3x4 + 2 判定（手牌数 + 副露数*3 必须严格等于 14）
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

// 完整胡牌判定（含4花解锁碰牌限制 + 典当师售罄禁胡限制）
const checkCanHu = (player, extraTile = null, bannedSuitInfo = null) => {
  const allHand = extraTile ? [...player.hand, extraTile] : [...player.hand];
  const meldCount = player.melds.length;

  // 第一步：检查牌型是否成型
  const patternRes = isPureMahjongWinPattern(allHand, meldCount);
  if (!patternRes.valid) {
    return { canHu: false, lockedReason: null };
  }

  // 第二步：检查典当师《售罄》禁胡限制（“全场所有玩家禁止打出/胡/作为副露亮出该花色的牌”）
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

  // 第三步：检查 4花解锁碰牌限制（如果副露中有碰牌，则必须满4花才可胡牌）
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

// 计算玩家当前听哪些牌（用于实时听牌提示器，帮助玩家清楚掌握胡牌条件）
const getTingTiles = (player, bannedSuitInfo = null) => {
  // 当手牌数为 13 - melds*3 时，直接计算听哪些牌
  if (player.hand.length + player.melds.length * 3 !== 13) return [];
  const tingList = [];
  for (let candidate of ALL_PLAYABLE_TILES) {
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

// 检查可吃的组合
const getValidChiCombinations = (hand, discardedTile, bannedSuit) => {
  const suit = getTileSuit(discardedTile);
  if (!SUITS.includes(suit)) return [];
  if (bannedSuit && suit === bannedSuit) return []; // 售罄封锁下不可作为副露亮出

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

export default function MahjongApp() {
  // --- 游戏核心状态 ---
  const [selectedHumanRole, setSelectedHumanRole] = useState('麦咭');
  const [aiDifficulty, setAiDifficulty] = useState('NORMAL'); // 'EASY' | 'NORMAL' | 'HARD'
  const [showRoleSelectModal, setShowRoleSelectModal] = useState(true);

  const [deck, setDeck] = useState([]);
  const [players, setPlayers] = useState([]);
  const [turn, setTurn] = useState(0);
  const [gamePhase, setGamePhase] = useState('ROLE_SELECT'); 
  // ROLE_SELECT, DRAW, ACTION, REACTION, SKILL_MODAL, WINNER, DRAW_GAME
  
  const [logs, setLogs] = useState([]);
  const [lastDiscard, setLastDiscard] = useState(null); // { playerId, role, tile }
  const [bannedSuitInfo, setBannedSuitInfo] = useState(null); // { suit: '万', ownerId: 3 }
  const [winnerInfo, setWinnerInfo] = useState(null);

  // 手动理牌状态
  const [selectedHandIdx, setSelectedHandIdx] = useState(null);

  // 弹窗与技能交互状态
  const [qianshuData, setQianshuData] = useState(null); // { cards: [], pickedIdx: null, firstPutIdx: null, putPosition: 'bottom' }
  const [maijiModal, setMaijiModal] = useState(false); // 麦咭选择废牌弹窗
  const [lingfengCombos, setLingfengCombos] = useState(null); // { combos: [], tile: '', isSkill: false }
  const [pawnModal, setPawnModal] = useState(false); // 典当师选择禁打花色弹窗
  const [pendingReactions, setPendingReactions] = useState(null); // 玩家响应面板选项

  const logsEndRef = useRef(null);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const addLog = (msg) => {
    setLogs(prev => [...prev, msg]);
  };

  // --- 初始化对局 ---
  const startNewGame = (chosenRole = selectedHumanRole, chosenDiff = aiDifficulty) => {
    const allRoles = ['老千', '麦咭', '灵风', '典当师'];
    const remainingRoles = allRoles.filter(r => r !== chosenRole);
    // 随机分配 AI 角色
    for (let i = remainingRoles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remainingRoles[i], remainingRoles[j]] = [remainingRoles[j], remainingRoles[i]];
    }

    let freshDeck = generatePureRandomDeck();
    const positions = ['bottom', 'right', 'top', 'left'];
    const seatRoles = [chosenRole, ...remainingRoles];

    const initPlayers = seatRoles.map((role, idx) => {
      const { drawnHand, drawnFlowers, remainingDeck } = drawAndResolveFlowers(freshDeck, 13);
      freshDeck = remainingDeck;
      return {
        id: idx,
        name: idx === 0 ? '你' : `AI-${idx}`,
        role,
        isAI: idx !== 0,
        coins: 2,
        hand: sortHandTiles(drawnHand),
        flowerTiles: drawnFlowers,
        melds: [], // { type: 'chi'|'peng'|'minggang'|'angang', tiles: [], fakeTile?: string }
        discards: [],
        position: positions[idx]
      };
    });

    setDeck(freshDeck);
    setPlayers(initPlayers);
    setTurn(0);
    setLastDiscard(null);
    setBannedSuitInfo(null);
    setWinnerInfo(null);
    setSelectedHandIdx(null);
    setPendingReactions(null);
    setQianshuData(null);
    setMaijiModal(false);
    setLingfengCombos(null);
    setPawnModal(false);
    setShowRoleSelectModal(false);
    setGamePhase('DRAW');
    setLogs([
      `🎲 牌局开始！AI难度：【${AI_DIFFICULTIES[chosenDiff].name}】，纯随机洗牌完成（144张）。`,
      `👤 你选择了【${chosenRole}】，开局拥有 2 枚技能币。`,
      `👉 轮到你的回合，请摸牌或使用摸牌前技能。`
    ]);
  };

  // --- 回合推进与典当师封锁解除检查 ---
  const advanceTurn = (nextPlayerId) => {
    if (bannedSuitInfo && bannedSuitInfo.ownerId === nextPlayerId) {
      addLog(`🔓 轮回到【典当师】，「售罄」对【${bannedSuitInfo.suit}】花色的封锁已解除！`);
      setBannedSuitInfo(null);
    }
    setTurn(nextPlayerId);
    setSelectedHandIdx(null);
    setGamePhase('DRAW');
  };

  // --- 摸牌动作（加入严格的手牌数量守恒保护，防止任何重复摸牌导致大相公） ---
  const handleDrawTile = (playerId, isExtraFlowersSkill = false) => {
    const targetPlayer = players[playerId];
    if (!targetPlayer) return;

    // 强制校验手牌恒等式：摸牌前手牌数 + 副露数*3 必须等于 13
    const expectedBeforeDraw = 13 - targetPlayer.melds.length * 3;
    if (targetPlayer.hand.length > expectedBeforeDraw) {
      // 已经处于待出牌数量，直接进入 ACTION 阶段避免多摸牌
      setGamePhase('ACTION');
      return;
    }

    if (deck.length === 0) {
      setGamePhase('DRAW_GAME');
      addLog(`🛑 牌山已摸空，本局荒牌流局！`);
      return;
    }

    const { drawnHand, drawnFlowers, remainingDeck } = drawAndResolveFlowers(deck, 1);
    if (drawnHand.length === 0) {
      setDeck(remainingDeck);
      setGamePhase('DRAW_GAME');
      addLog(`🛑 补花时牌山已摸空，本局荒牌流局！`);
      return;
    }

    setDeck(remainingDeck);

    setPlayers(prev => prev.map(p => {
      if (p.id === playerId) {
        if (drawnFlowers.length > 0) {
          addLog(`🌸 [${p.role}] 摸到花牌 (${drawnFlowers.join('、')})，自动亮出并补牌！`);
        }
        return {
          ...p,
          hand: [...p.hand, ...drawnHand],
          flowerTiles: [...p.flowerTiles, ...drawnFlowers]
        };
      }
      return p;
    }));

    if (isExtraFlowersSkill) {
      addLog(`🌺 [${targetPlayer.role}] 通过《步步生花》完成了额外摸牌，请打出一张牌！`);
    }

    setGamePhase('ACTION');
  };

  // --- 检查玩家是否被禁打某张牌 (典当师-售罄) ---
  const canPlayerDiscardTile = (player, tile) => {
    if (!bannedSuitInfo || bannedSuitInfo.ownerId === player.id) return true;
    const suit = getTileSuit(tile);
    if (suit !== bannedSuitInfo.suit) return true;
    // 除非手中无其他花色的牌可打，否则禁止打出该花色
    const hasOtherOption = player.hand.some(t => getTileSuit(t) !== bannedSuitInfo.suit);
    return !hasOtherOption;
  };

  // --- 手牌点击（支持理牌交换 + 出牌） ---
  const handleHumanTileClick = (index) => {
    const human = players[0];
    // 非出牌阶段或玩家主动开启理牌：点击两张牌交换位置
    if (turn !== 0 || gamePhase !== 'ACTION') {
      if (selectedHandIdx === null) {
        setSelectedHandIdx(index);
      } else {
        if (selectedHandIdx !== index) {
          setPlayers(prev => prev.map(p => {
            if (p.id === 0) {
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

    // 出牌阶段：校验是否被典当师售罄封锁
    const tile = human.hand[index];
    if (!canPlayerDiscardTile(human, tile)) {
      addLog(`⚠️ 无法打出 [${tile}]！当前处于【典当师-售罄】封锁期，禁止打出「${bannedSuitInfo.suit}」花色！`);
      return;
    }

    executeDiscard(0, index);
  };

  // 一键自动理牌
  const handleAutoSortHumanHand = () => {
    setPlayers(prev => prev.map(p => p.id === 0 ? { ...p, hand: sortHandTiles(p.hand) } : p));
    setSelectedHandIdx(null);
  };

  // --- 执行出牌并进入全场响应判定 ---
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

    setPlayers(updatedPlayers);
    const discardRecord = { playerId, role: player.role, tile: discardedTile };
    setLastDiscard(discardRecord);
    addLog(`🀄 [${player.role}] 打出了 【${discardedTile}】`);

    evaluateReactionsAfterDiscard(updatedPlayers, discardRecord);
  };

  // --- 评估打出一张牌后的吃、碰、杠、胡与技能响应 ---
  const evaluateReactionsAfterDiscard = (currentPlayers, discardRecord) => {
    const { playerId: discarderId, tile } = discardRecord;
    const tileSuit = getTileSuit(tile);

    // 1. 优先检查人类玩家 (id === 0) 是否有可响应动作
    if (discarderId !== 0) {
      const human = currentPlayers[0];
      const isSuitBannedForHuman = bannedSuitInfo && bannedSuitInfo.ownerId !== 0 && bannedSuitInfo.suit === tileSuit;

      const huResult = checkCanHu(human, tile, bannedSuitInfo);
      const sameTileCount = human.hand.filter(t => t === tile).length;

      const canNormalPeng = !isSuitBannedForHuman && sameTileCount >= 2;
      const canMingGang = !isSuitBannedForHuman && sameTileCount === 3;
      // 最新规则：麦咭《刻意求工》消耗 1 币，手里有 1 张相同牌 + 至少 1 张其他废牌即可强行碰出
      const canMaijiPeng = !isSuitBannedForHuman && human.role === '麦咭' && human.coins >= 1 && sameTileCount >= 1 && human.hand.length >= 2;

      // 常规上家吃牌 (discarderId === 3 为人类上家)
      const chiCombos = getValidChiCombinations(human.hand, tile, isSuitBannedForHuman ? tileSuit : null);
      const canNormalChi = discarderId === 3 && chiCombos.length > 0;
      // 灵风跨座位吃牌 (非上家，消耗1币)
      const canLingfengChi = discarderId !== 3 && human.role === '灵风' && human.coins >= 1 && chiCombos.length > 0;

      // 即使因为未满4花或售罄被锁胡，如果牌型已经满足胡牌，也弹出响应面板告知玩家原因，避免玩家疑惑“为什么没提示我胡”
      const hasLockedHuHint = !huResult.canHu && Boolean(huResult.lockedReason);

      if (huResult.canHu || hasLockedHuHint || canNormalPeng || canMingGang || canMaijiPeng || canNormalChi || canLingfengChi) {
        setPendingReactions({
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
        });
        setGamePhase('REACTION');
        return;
      }
    }

    // 2. 若人类无可响应或打牌者是人类，评估 AI 的响应
    processAIReactions(currentPlayers, discardRecord);
  };

  // --- AI 响应吃碰胡逻辑（根据 AI 难度分级决策） ---
  const processAIReactions = (currentPlayers, discardRecord) => {
    const { playerId: discarderId, tile } = discardRecord;
    const tileSuit = getTileSuit(tile);

    // 根据难度设定技能与副露积极度
    const skillProb = aiDifficulty === 'EASY' ? 0.15 : aiDifficulty === 'NORMAL' ? 0.45 : 0.85;
    const pengProb = aiDifficulty === 'EASY' ? 0.35 : aiDifficulty === 'NORMAL' ? 0.7 : 0.95;

    // 1. 检查是否有 AI 可以点炮胡牌
    for (let i = 1; i <= 3; i++) {
      if (i === discarderId) continue;
      const ai = currentPlayers[i];
      const huRes = checkCanHu(ai, tile, bannedSuitInfo);
      if (huRes.canHu) {
        setWinnerInfo({ winner: ai, winType: `点炮胡 (${huRes.type})`, winningTile: tile });
        setGamePhase('WINNER');
        addLog(`🏆 [${ai.role}] 胡了 [${currentPlayers[discarderId].role}] 打出的【${tile}】(${huRes.type})！`);
        return;
      }
    }

    // 2. 检查 AI 碰牌或技能响应
    for (let i = 1; i <= 3; i++) {
      if (i === discarderId) continue;
      const ai = currentPlayers[i];
      const isSuitBanned = bannedSuitInfo && bannedSuitInfo.ownerId !== ai.id && bannedSuitInfo.suit === tileSuit;
      if (isSuitBanned) continue;

      const sameCount = ai.hand.filter(t => t === tile).length;
      const { total: aiFlowers } = getFlowerBreakdown(ai);

      // AI 常规碰牌：当花牌>=3（或困难模式下>=2.5）或角色是麦咭时才碰，防止AI无脑碰牌锁死自己
      const flowerThreshold = aiDifficulty === 'HARD' ? 2.5 : 3;
      if (sameCount >= 2 && (aiFlowers >= flowerThreshold || ai.role === '麦咭') && Math.random() < pengProb) {
        setTimeout(() => {
          setPlayers(prev => prev.map(p => {
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
          }));
          addLog(`💥 [${ai.role}] 碰了 【${tile}】！进入出牌阶段。`);
          setTurn(ai.id);
          setGamePhase('ACTION');
        }, 600);
        return;
      }

      // 麦咭 AI 发动【刻意求工】（最新规则：1币，用1张真牌+1张废牌强行碰出，不再额外摸牌！）
      if (ai.role === '麦咭' && ai.coins >= 1 && sameCount === 1 && ai.hand.length >= 2 && Math.random() < skillProb) {
        setTimeout(() => {
          setPlayers(prev => prev.map(p => {
            if (p.id === ai.id) {
              const nextHand = [...p.hand];
              // 先移除那1张目标真牌
              nextHand.splice(nextHand.indexOf(tile), 1);
              // 挑选一张孤张作为废牌移除
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
          }));
          addLog(`🔧 【麦咭】消耗1币发动《刻意求工》！用1张废牌强行碰出【${tile}】，轮到麦咭出牌！`);
          setTurn(ai.id);
          setGamePhase('ACTION');
        }, 650);
        return;
      }

      // 灵风 AI 发动【乘风】跨座位吃牌（1币）
      if (ai.role === '灵风' && ai.coins >= 1 && discarderId !== (ai.id + 3) % 4) {
        const combos = getValidChiCombinations(ai.hand, tile, null);
        if (combos.length > 0 && Math.random() < skillProb) {
          const chosenCombo = combos[0];
          setTimeout(() => {
            setPlayers(prev => prev.map(p => {
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
            }));
            addLog(`🌪️ 【灵风】消耗1币发动《乘风》！跨座位吃了【${tile}】，轮次直接跳转至灵风！`);
            setTurn(ai.id);
            setGamePhase('ACTION');
          }, 650);
          return;
        }
      }
    }

    // 无人响应，进入下一顺位玩家回合
    advanceTurn((discarderId + 1) % 4);
  };

  // --- 人类玩家响应面板操作 ---
  const handleHumanPassReaction = () => {
    const record = pendingReactions.discardRecord;
    setPendingReactions(null);
    processAIReactions(players, record);
  };

  const handleHumanHuReaction = () => {
    const { discardRecord, huType } = pendingReactions;
    setPendingReactions(null);
    setWinnerInfo({ winner: players[0], winType: `点炮胡 (${huType})`, winningTile: discardRecord.tile });
    setGamePhase('WINNER');
    addLog(`🎉 恭喜！你胡了 [${discardRecord.role}] 打出的【${discardRecord.tile}】(${huType})！`);
  };

  const handleHumanNormalPeng = () => {
    const { tile } = pendingReactions.discardRecord;
    setPendingReactions(null);
    setPlayers(prev => prev.map(p => {
      if (p.id === 0) {
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
    }));
    addLog(`💥 你碰了【${tile}】！请打出一张牌。`);
    setTurn(0);
    setGamePhase('ACTION');
  };

  const handleHumanMingGang = () => {
    const { tile } = pendingReactions.discardRecord;
    setPendingReactions(null);
    const { drawnHand, drawnFlowers, remainingDeck } = drawAndResolveFlowers(deck, 1);
    setDeck(remainingDeck);

    setPlayers(prev => prev.map(p => {
      if (p.id === 0) {
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
    }));
    addLog(`⚡ 你明杠了【${tile}】（算作1张花牌），并补摸了1张牌！`);
    setTurn(0);
    setGamePhase('ACTION');
  };

  // 麦咭：点击“刻意求工强碰”打开选废牌弹窗
  const handleOpenMaijiSkillModal = () => {
    setMaijiModal(true);
  };

  // 修复核心 Bug：麦咭《刻意求工》（费用1元），移除真牌+废牌共2张手牌，直接进入出牌阶段，绝不额外摸牌！
  const handleConfirmMaijiPeng = (wasteCardIdx) => {
    const { tile } = pendingReactions.discardRecord;
    const human = players[0];
    const wasteTile = human.hand[wasteCardIdx];

    setMaijiModal(false);
    setPendingReactions(null);

    setPlayers(prev => prev.map(p => {
      if (p.id === 0) {
        const nextHand = [...p.hand];
        // 1. 先移除被选作废牌的那张手牌
        nextHand.splice(wasteCardIdx, 1);
        // 2. 再移除手牌中对应的那1张目标真牌
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
    }));

    addLog(`🔧 你消耗1币发动《刻意求工》，用废牌【${wasteTile}】强行碰出【${tile}】！现在请打出一张牌。`);
    setTurn(0);
    setGamePhase('ACTION');
  };

  // 吃牌或灵风《乘风》吃牌
  const handleTriggerChi = (isSkill) => {
    const { chiCombos, discardRecord } = pendingReactions;
    if (chiCombos.length === 1) {
      executeHumanChi(chiCombos[0], discardRecord.tile, isSkill);
    } else {
      setLingfengCombos({ combos: chiCombos, tile: discardRecord.tile, isSkill });
    }
  };

  const executeHumanChi = (combo, targetTile, isSkill) => {
    setLingfengCombos(null);
    setPendingReactions(null);

    setPlayers(prev => prev.map(p => {
      if (p.id === 0) {
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
    }));

    if (isSkill) {
      addLog(`🌪️ 你消耗1币发动《乘风》！跨座位吃入【${targetTile}】，轮次跳转至你的回合！`);
    } else {
      addLog(`🍽️ 你吃了上家的【${targetTile}】！请打出一张牌。`);
    }
    setTurn(0);
    setGamePhase('ACTION');
  };

  // --- 回合内主动动作：自摸、暗杠、老千千术、老千步步生花、典当师售罄 ---
  
  // 1. 老千《千术》 (摸牌阶段使用)
  const handleOpenQianshu = () => {
    if (turn !== 0 || gamePhase !== 'DRAW' || players[0].coins < 1 || deck.length < 3) return;
    const top3 = deck.slice(0, 3);
    setQianshuData({
      cards: top3,
      pickedIdx: 0,
      firstPutIdx: 1,
      putPosition: 'bottom' // 'top' | 'bottom'
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

    if (isFlowerTile(pickedCard)) {
      finalFlowerAdd.push(pickedCard);
      const { drawnHand, drawnFlowers, remainingDeck } = drawAndResolveFlowers(restDeck, 1);
      finalHandAdd = drawnHand;
      finalFlowerAdd.push(...drawnFlowers);
      restDeck = remainingDeck;
    } else {
      finalHandAdd = [pickedCard];
    }

    setDeck(restDeck);
    setPlayers(prev => prev.map(p => {
      if (p.id === 0) {
        return {
          ...p,
          coins: p.coins - 1,
          hand: [...p.hand, ...finalHandAdd],
          flowerTiles: [...p.flowerTiles, ...finalFlowerAdd]
        };
      }
      return p;
    }));

    addLog(`👁️ 【老千】消耗1币发动《千术》！挑走1张牌，并将剩余2张按序放回${putPosition === 'top' ? '牌山顶' : '牌山底'}！`);
    setQianshuData(null);
    setGamePhase('ACTION');
  };

  // 2. 老千被动《步步生花》 (手中花牌数量 > 4 时，在轮到老千摸牌前可消耗1张花牌换取额外摸牌打牌机会)
  const handleTriggerBubuShenghua = () => {
    const human = players[0];
    const { total } = getFlowerBreakdown(human);
    // 严格在 DRAW 阶段（老千轮次摸牌时）触发，消耗1张花牌立刻完成摸牌进入出牌阶段，保证手牌恒等式绝不出错
    if (turn !== 0 || gamePhase !== 'DRAW' || human.role !== '老千' || total <= 4 || human.flowerTiles.length === 0) return;

    setPlayers(prev => prev.map(p => {
      if (p.id === 0) {
        const nextFlowers = [...p.flowerTiles];
        const burned = nextFlowers.pop();
        addLog(`🌺 【老千】触发《步步生花》！消耗1张花牌【${burned}】，换取本轮额外摸打机会！`);
        return { ...p, flowerTiles: nextFlowers };
      }
      return p;
    }));

    handleDrawTile(0, true);
  };

  // 3. 典当师《售罄》 (出牌阶段声明花色：禁打 / 禁胡 / 禁作为副露亮出)
  const handleConfirmPawnBan = (suit) => {
    setPawnModal(false);
    setPlayers(prev => prev.map(p => p.id === 0 ? { ...p, coins: p.coins - 1 } : p));
    setBannedSuitInfo({ suit, ownerId: 0 });
    addLog(`🚫 【典当师】消耗1币发动《售罄》！下回合开始前，全场禁止打出/胡/副露亮出「${suit}」花色！`);
  };

  // 4. 自己回合暗杠或加杠
  const getHumanSelfGangOptions = () => {
    if (turn !== 0 || gamePhase !== 'ACTION') return [];
    const human = players[0];
    const counts = {};
    human.hand.forEach(t => counts[t] = (counts[t] || 0) + 1);
    return Object.keys(counts).filter(t => counts[t] === 4);
  };

  const handleHumanAnGang = (tile, isMingChoice = false) => {
    const { drawnHand, drawnFlowers, remainingDeck } = drawAndResolveFlowers(deck, 1);
    setDeck(remainingDeck);

    setPlayers(prev => prev.map(p => {
      if (p.id === 0) {
        const nextHand = p.hand.filter(t => t !== tile);
        return {
          ...p,
          hand: [...nextHand, ...drawnHand],
          flowerTiles: [...p.flowerTiles, ...drawnFlowers],
          melds: [...p.melds, { type: isMingChoice ? 'minggang' : 'angang', tiles: [tile, tile, tile, tile] }]
        };
      }
      return p;
    }));
    addLog(`🀄 你选择了${isMingChoice ? '【明杠】(算1张花牌)' : '【暗杠】(不算花牌)'}【${tile}】，并补摸1张牌！`);
  };

  // 5. 自摸胡牌
  const handleHumanTsumo = () => {
    const res = checkCanHu(players[0], null, bannedSuitInfo);
    if (!res.canHu) return;
    setWinnerInfo({ winner: players[0], winType: `自摸 (${res.type})`, winningTile: players[0].hand[players[0].hand.length - 1] });
    setGamePhase('WINNER');
    addLog(`🎉 恭喜！你自摸胡牌 (${res.type})！`);
  };

  // --- 智能 AI 出牌评分器（根据简单/普通/困难难度决定打哪张牌） ---
  const selectAIDiscardIndex = (aiPlayer) => {
    const validIndices = [];
    aiPlayer.hand.forEach((t, idx) => {
      if (canPlayerDiscardTile(aiPlayer, t)) validIndices.push(idx);
    });
    if (validIndices.length === 0) return 0;

    // 简单模式：有 50% 概率随机打出一张合法牌
    if (aiDifficulty === 'EASY' && Math.random() < 0.5) {
      return validIndices[Math.floor(Math.random() * validIndices.length)];
    }

    const counts = {};
    aiPlayer.hand.forEach(t => counts[t] = (counts[t] || 0) + 1);

    // 为每张可打出的牌计算保留价值分（分数越低越优先打出）
    let lowestScore = Infinity;
    let bestDiscardIdx = validIndices[0];

    for (let idx of validIndices) {
      const tile = aiPlayer.hand[idx];
      let keepScore = 0;

      // 对子或刻子价值高
      if (counts[tile] === 2) keepScore += 40;
      if (counts[tile] >= 3) keepScore += 90;

      // 典当师极力保留暗刻（算花牌）
      if (aiPlayer.role === '典当师' && counts[tile] >= 3) keepScore += 50;

      // 灵风保留北风做牌
      if (aiPlayer.role === '灵风' && tile === '北风') keepScore += 35;

      // 序数牌检查相邻搭子
      const suit = getTileSuit(tile);
      if (SUITS.includes(suit)) {
        const num = parseInt(tile[0], 10);
        if (num >= 3 && num <= 7) keepScore += 5; // 中张比边张更有用
        if (aiPlayer.hand.includes(`${num - 1}${suit}`) || aiPlayer.hand.includes(`${num + 1}${suit}`)) {
          keepScore += 25; // 连张搭子
        }
        if (aiPlayer.hand.includes(`${num - 2}${suit}`) || aiPlayer.hand.includes(`${num + 2}${suit}`)) {
          keepScore += 12; // 嵌张搭子
        }
      } else {
        // 孤张风牌最优先打出
        if (counts[tile] === 1) keepScore -= 20;
      }

      if (keepScore < lowestScore) {
        lowestScore = keepScore;
        bestDiscardIdx = idx;
      }
    }

    return bestDiscardIdx;
  };

  // --- AI 回合驱动逻辑 ---
  useEffect(() => {
    if (turn === 0 || gamePhase === 'WINNER' || gamePhase === 'DRAW_GAME' || gamePhase === 'ROLE_SELECT') return;

    const ai = players[turn];
    if (!ai) return;

    const skillTriggerProb = aiDifficulty === 'EASY' ? 0.15 : aiDifficulty === 'NORMAL' ? 0.45 : 0.85;

    if (gamePhase === 'DRAW') {
      const timer = setTimeout(() => {
        const { total: aiFlw } = getFlowerBreakdown(ai);

        // 1. 老千 AI 优先检查被动《步步生花》（花>4且有实体花牌时，消耗1花获得额外摸打）
        if (ai.role === '老千' && aiFlw > 4 && ai.flowerTiles.length > 0 && Math.random() < skillTriggerProb) {
          setPlayers(prev => prev.map(p => {
            if (p.id === ai.id) {
              const nextF = [...p.flowerTiles];
              nextF.pop();
              return { ...p, flowerTiles: nextF };
            }
            return p;
          }));
          addLog(`🌺 【老千】触发《步步生花》，消耗1张花牌进行额外摸打！`);
          handleDrawTile(turn, true);
          return;
        }

        // 2. 老千 AI 在摸牌阶段发动《千术》看3拿1
        if (ai.role === '老千' && ai.coins >= 1 && deck.length >= 3 && Math.random() < skillTriggerProb) {
          const top3 = deck.slice(0, 3);
          // 优先挑选花牌或者手里已有的对子搭子
          let pickIdx = top3.findIndex(t => isFlowerTile(t) || ai.hand.includes(t));
          if (pickIdx === -1) pickIdx = 0;
          const picked = top3[pickIdx];
          const others = top3.filter((_, idx) => idx !== pickIdx);
          const rest = [...deck.slice(3), ...others];

          let addH = [];
          let addF = [];
          if (isFlowerTile(picked)) {
            addF.push(picked);
            const res = drawAndResolveFlowers(rest, 1);
            addH = res.drawnHand;
            addF.push(...res.drawnFlowers);
            setDeck(res.remainingDeck);
          } else {
            addH = [picked];
            setDeck(rest);
          }
          setPlayers(prev => prev.map(p => p.id === ai.id ? {
            ...p,
            coins: p.coins - 1,
            hand: [...p.hand, ...addH],
            flowerTiles: [...p.flowerTiles, ...addF]
          } : p));
          addLog(`👁️ [${ai.role}] 消耗1币发动《千术》，从牌山顶挑选了1张牌并将余牌沉底！`);
          setGamePhase('ACTION');
        } else {
          handleDrawTile(turn);
        }
      }, 650);
      return () => clearTimeout(timer);
    }

    if (gamePhase === 'ACTION') {
      const timer = setTimeout(() => {
        const currentAI = players[turn];
        // 1. 检查 AI 是否自摸
        const huRes = checkCanHu(currentAI, null, bannedSuitInfo);
        if (huRes.canHu) {
          setWinnerInfo({ winner: currentAI, winType: `自摸 (${huRes.type})`, winningTile: currentAI.hand[currentAI.hand.length - 1] });
          setGamePhase('WINNER');
          addLog(`🏆 [${currentAI.role}] 自摸胡牌 (${huRes.type})！`);
          return;
        }

        // 2. 典当师 AI 发动《售罄》（注意：如果花掉1币会导致典当师已碰牌但花数跌破4花，聪明AI不会乱放）
        const { total: currentAIFlw } = getFlowerBreakdown(currentAI);
        const aiHasPeng = currentAI.melds.some(m => m.type === 'peng');
        const safeToSpendCoin = !aiHasPeng || (currentAIFlw - 1 >= 4);

        if (currentAI.role === '典当师' && currentAI.coins >= 1 && safeToSpendCoin && !bannedSuitInfo && Math.random() < skillTriggerProb * 0.6) {
          const suitCounts = { '万': 0, '筒': 0, '条': 0 };
          currentAI.hand.forEach(t => {
            const s = getTileSuit(t);
            if (suitCounts[s] !== undefined) suitCounts[s]++;
          });
          // 封锁自己手牌中最少的花色
          const leastSuit = Object.keys(suitCounts).sort((a, b) => suitCounts[a] - suitCounts[b])[0];
          setPlayers(prev => prev.map(p => p.id === currentAI.id ? { ...p, coins: p.coins - 1 } : p));
          setBannedSuitInfo({ suit: leastSuit, ownerId: currentAI.id });
          addLog(`🚫 【典当师】消耗1币发动《售罄》！全场禁止打出/胡/副露亮出「${leastSuit}」花色！`);
        }

        // 3. 选择最合理的牌打出
        const chosenIdx = selectAIDiscardIndex(currentAI);
        executeDiscard(turn, chosenIdx);
      }, 850);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, gamePhase, players, deck.length]);

  // --- UI 渲染辅助函数 ---
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
        className={`
          relative ${sizeClasses} flex flex-col items-center justify-center rounded-md
          border border-stone-400 shadow-md font-bold select-none transition-all duration-150
          ${isHidden ? 'bg-gradient-to-b from-emerald-700 to-emerald-800 border-emerald-600' : 'bg-gradient-to-b from-[#FFFDF7] to-[#EFECE0]'}
          ${onClick && !isDisabled ? 'cursor-pointer hover:-translate-y-2 hover:shadow-xl' : ''}
          ${isSelected ? '-translate-y-3 ring-2 ring-yellow-400 bg-yellow-50' : ''}
          ${isDisabled ? 'opacity-40 cursor-not-allowed grayscale' : ''}
          ${!isHidden ? getTileStyle(tile) : ''}
        `}
      >
        {!isHidden && (
          <>
            <span className="leading-none">{tile.startsWith('花-') ? tile.replace('花-', '') : tile.replace('风', '')}</span>
            {tile.startsWith('花-') && <span className="text-[10px] text-pink-500 mt-0.5">🌸</span>}
            {tile.endsWith('风') && <span className="text-[9px] text-stone-400 font-normal">风</span>}
          </>
        )}
        {badge && (
          <span className="absolute -top-2 -right-2 bg-amber-600 text-white text-[9px] px-1 rounded shadow">
            {badge}
          </span>
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

    return (
      <div className={`bg-neutral-900/85 border ${isActive ? 'border-yellow-400 ring-2 ring-yellow-400/50' : 'border-neutral-700'} px-3 py-2 rounded-xl shadow-lg backdrop-blur-md text-xs transition-all`}>
        <div className="flex items-center justify-between space-x-3 mb-1">
          <span className={`font-black text-sm ${roleCfg.text} flex items-center`}>
            {player.role}
            <span className="text-[10px] text-gray-400 font-normal ml-1">({player.name})</span>
          </span>
          <div className="flex items-center space-x-2">
            <span className="flex items-center bg-yellow-950/70 border border-yellow-700/50 px-1.5 py-0.5 rounded text-yellow-300" title="技能币">
              <Coins size={12} className="mr-1 text-yellow-400" /> {player.coins}
            </span>
            <span
              className={`flex items-center px-1.5 py-0.5 rounded border ${totalFlw >= 4 ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300' : 'bg-pink-950/70 border-pink-700/50 text-pink-300'}`}
              title={details.join(' | ')}
            >
              <Flower size={12} className="mr-1 text-pink-400" /> {totalFlw}花
            </span>
          </div>
        </div>

        {/* 状态标签栏 */}
        <div className="flex flex-wrap gap-1 items-center text-[10px] text-gray-400">
          <span>实体花:{player.flowerTiles.length}</span>
          {player.melds.length > 0 && <span>| 副露:{player.melds.length}</span>}
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

        {/* 展示副露 */}
        {player.melds.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5 pt-1.5 border-t border-neutral-800">
            {player.melds.map((m, idx) => (
              <div key={idx} className="flex items-center space-x-0.5 bg-black/40 p-1 rounded border border-neutral-700">
                {m.tiles.map((t, tidx) => (
                  <div key={tidx}>
                    {renderMahjongTile(t, {
                      size: 'sm',
                      badge: m.fakeTile && tidx === 2 ? `替:${m.fakeTile}` : (m.type === 'angang' ? '暗' : null)
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const humanPlayer = players[0];
  const humanFlowerInfo = humanPlayer ? getFlowerBreakdown(humanPlayer) : { total: 0, details: [] };
  const humanHuCheck = humanPlayer && turn === 0 && gamePhase === 'ACTION'
    ? checkCanHu(humanPlayer, null, bannedSuitInfo)
    : { canHu: false, lockedReason: null };
  const humanGangOptions = getHumanSelfGangOptions();
  const humanTingList = humanPlayer ? getTingTiles(humanPlayer, bannedSuitInfo) : [];

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col lg:flex-row text-gray-100 font-sans select-none overflow-hidden">
      
      {/* 左侧/中央 麻将牌桌主区域 */}
      <div className="flex-1 relative bg-gradient-to-br from-emerald-900 via-teal-900 to-emerald-950 flex flex-col justify-between p-3 md:p-5 shadow-[inset_0_0_120px_rgba(0,0,0,0.75)] border-b lg:border-b-0 lg:border-r border-amber-900/40">
        
        {/* 顶部栏：场地状态 & 对家(AI-2) */}
        <div className="flex flex-col items-center space-y-2 z-10">
          <div className="w-full flex justify-between items-start">
            {/* 左上角快捷重选角色与难度按钮 */}
            <div className="flex flex-col space-y-1.5">
              <button
                onClick={() => setShowRoleSelectModal(true)}
                className="bg-neutral-900/85 hover:bg-neutral-800 border border-neutral-700 text-xs px-3 py-1.5 rounded-lg flex items-center text-gray-200 shadow"
              >
                <Users size={14} className="mr-1.5 text-yellow-400" /> 角色 / AI难度设置
              </button>
              <div className="text-[11px] bg-black/35 px-2.5 py-1 rounded border border-white/10 flex items-center space-x-1">
                <Brain size={12} className="text-cyan-400" />
                <span className="text-gray-300">AI难度:</span>
                <span className={`font-bold ${AI_DIFFICULTIES[aiDifficulty].color}`}>
                  {AI_DIFFICULTIES[aiDifficulty].name}
                </span>
              </div>
            </div>

            {/* 对家信息 */}
            {players[2] && (
              <div className="flex flex-col items-center">
                {renderPlayerCard(players[2])}
                <div className="flex space-x-1 mt-1.5">
                  {players[2].hand.map((_, i) => (
                    <div key={i} className="w-5 h-7 bg-emerald-700 border-b-2 border-emerald-950 rounded-sm shadow" />
                  ))}
                </div>
              </div>
            )}

            {/* 右上角全场封锁警示 */}
            <div className="min-w-[150px] flex justify-end">
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
            </div>
          </div>
        </div>

        {/* 中部区域：上家(AI-3) + 中央牌河与牌山信息 + 下家(AI-1) */}
        <div className="w-full flex justify-between items-center my-2 flex-1">
          
          {/* 左侧上家 (AI-3) */}
          {players[3] && (
            <div className="flex items-center space-x-2">
              <div className="flex flex-col space-y-1">
                {players[3].hand.slice(0, 10).map((_, i) => (
                  <div key={i} className="w-7 h-4 bg-emerald-700 border-r-2 border-emerald-950 rounded-sm shadow" />
                ))}
              </div>
              {renderPlayerCard(players[3])}
            </div>
          )}

          {/* 中央牌池与公牌信息 */}
          <div className="flex-1 max-w-xl mx-4 bg-black/25 border-2 border-emerald-800/60 rounded-3xl p-4 flex flex-col items-center justify-between min-h-[210px] backdrop-blur-sm shadow-2xl">
            <div className="flex items-center space-x-4 text-xs md:text-sm text-emerald-200 font-bold">
              <span>剩余牌山: <strong className="text-yellow-400 text-base">{deck.length}</strong> 张</span>
              <span>|</span>
              <span>当前轮次: <strong className="text-white">{players[turn]?.role}</strong></span>
            </div>

            {/* 最新打出的一张牌高亮 */}
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

            {/* 四家弃牌河简览 */}
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

          {/* 右侧下家 (AI-1) */}
          {players[1] && (
            <div className="flex items-center space-x-2">
              {renderPlayerCard(players[1])}
              <div className="flex flex-col space-y-1">
                {players[1].hand.slice(0, 10).map((_, i) => (
                  <div key={i} className="w-7 h-4 bg-emerald-700 border-l-2 border-emerald-950 rounded-sm shadow" />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 底部人类玩家操作台与手牌 */}
        {humanPlayer && (
          <div className="flex flex-col items-center w-full max-w-5xl mx-auto space-y-2.5 z-10">
            
            {/* 当别人打牌时：吃 / 碰 / 杠 / 胡 / 技能响应浮层 */}
            {gamePhase === 'REACTION' && pendingReactions && (
              <div className="w-full bg-amber-950/95 border-2 border-yellow-400 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 shadow-2xl">
                <div className="flex flex-col">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="text-yellow-400" size={18} />
                    <span className="text-sm font-bold text-white">
                      [{pendingReactions.discardRecord.role}] 打出了 <strong className="text-yellow-300 text-base">【{pendingReactions.discardRecord.tile}】</strong>，请选择响应：
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
                      吃牌
                    </button>
                  )}
                  {pendingReactions.canLingfengChi && (
                    <button onClick={() => handleTriggerChi(true)} className="bg-green-500 hover:bg-green-400 text-black font-black px-3 py-1.5 rounded-lg shadow flex items-center">
                      🌪️ 乘风跨座吃 (1币)
                    </button>
                  )}
                  <button onClick={handleHumanPassReaction} className="bg-neutral-700 hover:bg-neutral-600 text-gray-200 font-bold px-4 py-1.5 rounded-lg">
                    过
                  </button>
                </div>
              </div>
            )}

            {/* 自摸被锁死时的醒目提示条 */}
            {turn === 0 && gamePhase === 'ACTION' && !humanHuCheck.canHu && humanHuCheck.lockedReason && (
              <div className="w-full bg-red-950/90 border border-red-500 px-3 py-1.5 rounded-xl flex items-center justify-center text-xs text-red-200 shadow">
                <AlertCircle size={15} className="mr-1.5 text-red-400 shrink-0" />
                <span><strong>牌型已胡但暂被锁死：</strong>{humanHuCheck.lockedReason}</span>
              </div>
            )}

            {/* 实时听牌提示器（当玩家处于13张有效牌等摸牌/等点炮时自动显示听哪些牌） */}
            {humanTingList.length > 0 && (
              <div className="w-full bg-emerald-950/90 border border-emerald-500/60 px-3 py-1.5 rounded-xl flex flex-wrap items-center justify-between text-xs shadow">
                <div className="flex items-center space-x-2">
                  <span className="bg-emerald-500 text-black font-black px-2 py-0.5 rounded text-[11px]">
                    ⚡ 听牌中
                  </span>
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

            {/* 玩家状态与主动技能按钮栏 */}
            <div className="w-full flex flex-wrap justify-between items-end gap-2 px-2">
              {renderPlayerCard(humanPlayer)}

              {/* 拔出的实体花牌展示 */}
              <div className="flex items-center space-x-1 bg-black/35 px-3 py-1.5 rounded-xl border border-pink-500/20">
                <span className="text-xs text-pink-300 mr-1 font-bold">花牌区 ({humanFlowerInfo.total}花):</span>
                {humanPlayer.flowerTiles.length === 0 ? (
                  <span className="text-xs text-gray-500">暂无实体花</span>
                ) : (
                  humanPlayer.flowerTiles.map((ft, idx) => (
                    <span key={idx} className="text-xs bg-pink-950/90 border border-pink-700 text-pink-200 px-1.5 py-0.5 rounded font-bold">
                      {ft.replace('花-', '')}
                    </span>
                  ))
                )}
              </div>

              {/* 角色专属技能与摸牌/理牌控制栏 */}
              <div className="flex flex-wrap items-center gap-2 bg-neutral-900/90 p-2 rounded-xl border border-neutral-700 shadow-xl">
                {/* 理牌按钮 */}
                <button
                  onClick={handleAutoSortHumanHand}
                  className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-gray-200 text-xs font-bold flex items-center border border-neutral-600"
                  title="按万、筒、条、风顺序整理手牌"
                >
                  <ArrowUpDown size={14} className="mr-1 text-blue-400" /> 自动理牌
                </button>

                {/* 普通摸牌 */}
                <button
                  onClick={() => handleDrawTile(0)}
                  disabled={turn !== 0 || gamePhase !== 'DRAW'}
                  className={`px-4 py-2 rounded-lg font-bold text-xs md:text-sm flex items-center transition-all ${
                    turn === 0 && gamePhase === 'DRAW'
                      ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg scale-105'
                      : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                  }`}
                >
                  摸牌 <ChevronRight size={16} className="ml-0.5" />
                </button>

                {/* 老千专属：千术 + 步步生花 */}
                {humanPlayer.role === '老千' && (
                  <>
                    <button
                      onClick={handleOpenQianshu}
                      disabled={turn !== 0 || gamePhase !== 'DRAW' || humanPlayer.coins < 1 || deck.length < 3}
                      className={`px-3 py-2 rounded-lg font-bold text-xs md:text-sm flex items-center ${
                        turn === 0 && gamePhase === 'DRAW' && humanPlayer.coins >= 1
                          ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-lg'
                          : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                      }`}
                    >
                      <Eye size={15} className="mr-1" /> 千术 (1币)
                    </button>
                    <button
                      onClick={handleTriggerBubuShenghua}
                      disabled={turn !== 0 || gamePhase !== 'DRAW' || humanFlowerInfo.total <= 4 || humanPlayer.flowerTiles.length === 0}
                      className={`px-3 py-2 rounded-lg font-bold text-xs md:text-sm flex items-center ${
                        turn === 0 && gamePhase === 'DRAW' && humanFlowerInfo.total > 4 && humanPlayer.flowerTiles.length > 0
                          ? 'bg-pink-600 hover:bg-pink-500 text-white shadow-lg animate-pulse'
                          : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                      }`}
                      title="花牌大于4时，轮到老千摸牌时可消耗1张花牌换取摸打机会"
                    >
                      <Flower size={15} className="mr-1" /> 步步生花 (-1花)
                    </button>
                  </>
                )}

                {/* 典当师专属：售罄 */}
                {humanPlayer.role === '典当师' && (
                  <button
                    onClick={() => setPawnModal(true)}
                    disabled={turn !== 0 || gamePhase !== 'ACTION' || humanPlayer.coins < 1}
                    className={`px-3 py-2 rounded-lg font-bold text-xs md:text-sm flex items-center ${
                      turn === 0 && gamePhase === 'ACTION' && humanPlayer.coins >= 1
                        ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg'
                        : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                    }`}
                  >
                    <Ban size={15} className="mr-1" /> 售罄禁花色 (1币)
                  </button>
                )}

                {/* 暗杠 / 明杠选择 */}
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

                {/* 自摸胡牌按钮 */}
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

            {/* 人类手牌区 */}
            <div className="bg-black/45 p-3 md:p-4 rounded-2xl w-full flex flex-col items-center border border-emerald-800/50 shadow-2xl">
              <div className="flex flex-wrap justify-center gap-1.5 md:gap-2">
                {humanPlayer.hand.map((tile, i) => {
                  const isAllowed = turn === 0 && gamePhase === 'ACTION' ? canPlayerDiscardTile(humanPlayer, tile) : true;
                  return (
                    <div key={i} className="relative group">
                      {renderMahjongTile(tile, {
                        onClick: () => handleHumanTileClick(i),
                        isSelected: selectedHandIdx === i,
                        isDisabled: turn === 0 && gamePhase === 'ACTION' && !isAllowed,
                        badge: humanPlayer.role === '灵风' && tile === '北风' ? '+1花' : null
                      })}
                      {turn === 0 && gamePhase === 'ACTION' && isAllowed && (
                        <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                          打出
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="text-[11px] text-emerald-200/70 mt-2 flex items-center space-x-4">
                <span>💡 提示：{turn === 0 && gamePhase === 'ACTION' ? '点击手牌即可打出' : '非出牌阶段点击两张手牌可自由交换位置（手动理牌）'}</span>
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
              技能麻将 · 完整版
            </h1>
            <p className="text-[11px] text-gray-400">4花解锁碰牌 · 实时听牌助手</p>
          </div>
          <button
            onClick={() => startNewGame(selectedHumanRole, aiDifficulty)}
            className="bg-neutral-800 hover:bg-neutral-700 text-gray-200 p-2 rounded-lg border border-neutral-700"
            title="重开本局"
          >
            <RefreshCw size={15} />
          </button>
        </div>

        {/* 规则与当前角色提示 */}
        <div className="p-3 border-b border-neutral-800 bg-neutral-900/60 text-xs space-y-2 overflow-y-auto max-h-64">
          <div className="font-bold text-gray-200 flex items-center">
            <Info size={14} className="mr-1.5 text-yellow-400" /> 核心规则速览
          </div>
          <ul className="list-disc pl-4 space-y-1 text-gray-400 text-[11px]">
            <li><strong className="text-pink-400">20张花牌：</strong>8花 + 中、发、白，抽到自动亮出并补牌。</li>
            <li><strong className="text-amber-400">4花解锁碰牌：</strong>未满4花可先碰牌，但凑齐4花前无法胡含碰的牌型（吃牌不受限）。</li>
            <li><strong className="text-blue-400">杠牌规则：</strong>明杠算1张花牌，暗杠不算花牌（典当师暗刻算1花）。</li>
          </ul>

          {humanPlayer && (
            <div className={`p-2.5 rounded-lg bg-neutral-800/90 border-l-4 ${ROLES_INFO[humanPlayer.role].border} mt-2`}>
              <div className={`font-bold ${ROLES_INFO[humanPlayer.role].text}`}>
                当前角色：{humanPlayer.role}
              </div>
              <div className="text-[11px] text-gray-300 mt-1">
                <strong>主动·{ROLES_INFO[humanPlayer.role].activeName}：</strong>{ROLES_INFO[humanPlayer.role].activeDesc}
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                <strong>被动·{ROLES_INFO[humanPlayer.role].passiveName}：</strong>{ROLES_INFO[humanPlayer.role].passiveDesc}
              </div>
            </div>
          )}
        </div>

        {/* 对局实时日志 */}
        <div className="flex-1 p-3 overflow-y-auto space-y-2 text-xs bg-neutral-950/60">
          {logs.map((log, index) => (
            <div key={index} className="bg-neutral-900/90 border border-neutral-800/80 p-2 rounded-lg text-gray-300 leading-relaxed">
              {log}
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      </div>

      {/* ================== 弹窗 1：开局选择角色与 AI 难度 ================== */}
      {showRoleSelectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
          <div className="bg-neutral-900 border-2 border-yellow-600/60 rounded-3xl max-w-3xl w-full p-5 md:p-7 shadow-2xl my-auto">
            <h2 className="text-2xl md:text-3xl font-black text-center text-white mb-1">
              选择角色与 AI 难度
            </h2>
            <p className="text-center text-gray-400 text-xs mb-4">
              每位角色开局拥有 2 枚技能币，最新技能与手牌恒等校验已全面实装
            </p>

            {/* AI 难度选择栏 */}
            <div className="mb-5">
              <div className="text-xs font-bold text-gray-300 mb-2 flex items-center">
                <Brain size={14} className="mr-1.5 text-cyan-400" /> 选择 AI 对手难度：
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                {Object.values(AI_DIFFICULTIES).map(diff => {
                  const isDiffSelected = aiDifficulty === diff.id;
                  return (
                    <div
                      key={diff.id}
                      onClick={() => setAiDifficulty(diff.id)}
                      className={`cursor-pointer p-3 rounded-xl border-2 transition-all ${
                        isDiffSelected
                          ? `${diff.border} bg-neutral-800 shadow-lg`
                          : 'border-neutral-800 bg-neutral-950/60 hover:bg-neutral-800/40'
                      }`}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className={`font-black text-sm ${diff.color}`}>{diff.name}</span>
                        {isDiffSelected && <Check size={15} className="text-yellow-400" />}
                      </div>
                      <p className="text-[11px] text-gray-400 leading-relaxed">{diff.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 角色选择栏 */}
            <div className="text-xs font-bold text-gray-300 mb-2 flex items-center">
              <Users size={14} className="mr-1.5 text-yellow-400" /> 选择你的角色：
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mb-6">
              {Object.values(ROLES_INFO).map(role => {
                const isSelected = selectedHumanRole === role.name;
                return (
                  <div
                    key={role.name}
                    onClick={() => setSelectedHumanRole(role.name)}
                    className={`cursor-pointer rounded-2xl p-3.5 border-2 transition-all ${
                      isSelected
                        ? `${role.border} bg-neutral-800 scale-[1.01] shadow-xl`
                        : 'border-neutral-700 bg-neutral-900/60 hover:bg-neutral-800/50'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1.5">
                      <div>
                        <span className={`text-base font-black ${role.text}`}>{role.name}</span>
                        <span className="text-xs text-gray-400 ml-2">· {role.title}</span>
                      </div>
                      {isSelected && <Check size={18} className="text-yellow-400" />}
                    </div>
                    <div className="text-xs text-gray-200 mb-1">
                      <span className="bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded mr-1 font-bold">
                        {role.activeName}
                      </span>
                      {role.activeDesc}
                    </div>
                    <div className="text-xs text-gray-400">
                      <span className="bg-pink-500/20 text-pink-300 px-1.5 py-0.5 rounded mr-1 font-bold">
                        被动·{role.passiveName}
                      </span>
                      {role.passiveDesc}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-center">
              <button
                onClick={() => startNewGame(selectedHumanRole, aiDifficulty)}
                className="bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-black font-black px-8 py-3 rounded-xl text-base shadow-xl"
              >
                以【{selectedHumanRole}】开始对局 ({AI_DIFFICULTIES[aiDifficulty].name})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================== 弹窗 2：老千《千术》控顶/控底交互 ================== */}
      {gamePhase === 'SKILL_MODAL' && qianshuData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border-2 border-yellow-500 rounded-2xl p-6 max-w-lg w-full shadow-2xl">
            <h3 className="text-xl font-black text-yellow-400 mb-1 flex items-center">
              <Eye className="mr-2" /> 老千 · 千术控牌
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              第1步：点击选择 1 张收入手牌（若选花牌将自动补花）：
            </p>

            <div className="flex justify-center space-x-6 mb-6">
              {qianshuData.cards.map((c, idx) => (
                <div key={idx} className="flex flex-col items-center">
                  {renderMahjongTile(c, {
                    size: 'lg',
                    isSelected: qianshuData.pickedIdx === idx,
                    onClick: () => {
                      const otherIndices = [0, 1, 2].filter(i => i !== idx);
                      setQianshuData({
                        ...qianshuData,
                        pickedIdx: idx,
                        firstPutIdx: otherIndices[0]
                      });
                    }
                  })}
                  <span className="text-xs mt-2 font-bold text-yellow-300">
                    {qianshuData.pickedIdx === idx ? '✅ 收入手牌' : '放回牌山'}
                  </span>
                </div>
              ))}
            </div>

            {/* 剩余2张排序与放回位置 */}
            <div className="bg-neutral-800 p-3 rounded-xl mb-5 space-y-3 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-gray-300 font-bold">第2步：其余 2 张放回位置：</span>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setQianshuData({ ...qianshuData, putPosition: 'top' })}
                    className={`px-3 py-1 rounded font-bold ${qianshuData.putPosition === 'top' ? 'bg-yellow-500 text-black' : 'bg-neutral-700 text-gray-300'}`}
                  >
                    放回牌山顶
                  </button>
                  <button
                    onClick={() => setQianshuData({ ...qianshuData, putPosition: 'bottom' })}
                    className={`px-3 py-1 rounded font-bold ${qianshuData.putPosition === 'bottom' ? 'bg-yellow-500 text-black' : 'bg-neutral-700 text-gray-300'}`}
                  >
                    放回牌山底
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-300 font-bold">第3步：调整其余 2 张的先后顺序：</span>
                <button
                  onClick={() => {
                    const others = [0, 1, 2].filter(i => i !== qianshuData.pickedIdx);
                    const nextFirst = qianshuData.firstPutIdx === others[0] ? others[1] : others[0];
                    setQianshuData({ ...qianshuData, firstPutIdx: nextFirst });
                  }}
                  className="bg-neutral-700 hover:bg-neutral-600 px-2.5 py-1 rounded text-yellow-300 font-bold"
                >
                  🔄 互换顺序 ({qianshuData.cards[qianshuData.firstPutIdx]} 在前)
                </button>
              </div>
            </div>

            <button
              onClick={handleConfirmQianshu}
              className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-black py-2.5 rounded-xl"
            >
              确认执行千术
            </button>
          </div>
        </div>
      )}

      {/* ================== 弹窗 3：麦咭《刻意求工》选择废牌充当碰牌 ================== */}
      {maijiModal && pendingReactions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border-2 border-cyan-400 rounded-2xl p-6 max-w-xl w-full shadow-2xl">
            <h3 className="text-xl font-black text-cyan-400 mb-2">
              🔧 麦咭 · 刻意求工 (消耗1币)
            </h3>
            <p className="text-xs text-gray-300 mb-4">
              你要强行碰出 <strong className="text-yellow-300">【{pendingReactions.discardRecord.tile}】</strong>。系统会自动扣除你手中 1 张【{pendingReactions.discardRecord.tile}】，请从下方其余手牌中点击选择 1 张<strong>废牌</strong>充当第 2 张碰牌材料（碰出后直接轮到你出牌）：
            </p>
            <div className="flex flex-wrap justify-center gap-2 mb-5">
              {humanPlayer.hand.map((t, idx) => {
                // 避免玩家误把唯一那张真牌当成废牌点掉（若手里只有1张目标牌，则将该张标记为自动配对不可作为废牌）
                const targetTile = pendingReactions.discardRecord.tile;
                const firstTargetIdx = humanPlayer.hand.indexOf(targetTile);
                const isReservedTarget = idx === firstTargetIdx;
                return (
                  <div key={idx} className="flex flex-col items-center">
                    {renderMahjongTile(t, {
                      isDisabled: isReservedTarget,
                      badge: isReservedTarget ? '配对真牌' : null,
                      onClick: () => handleConfirmMaijiPeng(idx)
                    })}
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => setMaijiModal(false)}
              className="w-full bg-neutral-700 hover:bg-neutral-600 text-gray-200 py-2 rounded-xl font-bold text-xs"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* ================== 弹窗 4：吃牌多组合选择弹窗 ================== */}
      {lingfengCombos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border-2 border-emerald-400 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-black text-emerald-400 mb-3">
              选择用于吃【{lingfengCombos.tile}】的手牌搭子：
            </h3>
            <div className="space-y-2 mb-4">
              {lingfengCombos.combos.map((combo, idx) => (
                <button
                  key={idx}
                  onClick={() => executeHumanChi(combo, lingfengCombos.tile, lingfengCombos.isSkill)}
                  className="w-full bg-neutral-800 hover:bg-emerald-900/60 border border-emerald-600/50 p-3 rounded-xl flex items-center justify-center space-x-3 font-bold"
                >
                  <span>用【{combo[0]}】+【{combo[1]}】吃【{lingfengCombos.tile}】</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setLingfengCombos(null)}
              className="w-full bg-neutral-700 py-2 rounded-xl text-xs font-bold"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* ================== 弹窗 5：典当师《售罄》声明花色 ================== */}
      {pawnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border-2 border-purple-500 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-black text-purple-400 mb-2">
              🚫 典当师 · 售罄 (消耗1币)
            </h3>
            <p className="text-xs text-gray-300 mb-3">
              声明一种花色，在你的下个回合开始前，全场所有玩家<strong>禁止打出 / 胡 / 作为副露亮出</strong>该花色的牌（除非无其他牌可打）：
            </p>
            {humanPlayer && humanPlayer.melds.some(m => m.type === 'peng') && humanFlowerInfo.total - 1 < 4 && (
              <div className="bg-amber-950/80 border border-amber-500 text-amber-200 text-[11px] p-2 rounded-lg mb-4">
                ⚠️ 提醒：你当前已碰牌，消耗 1 枚技能币后你的有效花数将变为 {humanFlowerInfo.total - 1} 花（低于4花解锁线）。
              </div>
            )}
            <div className="grid grid-cols-3 gap-3 mb-5">
              {SUITS.map(s => (
                <button
                  key={s}
                  onClick={() => handleConfirmPawnBan(s)}
                  className="bg-purple-900/60 hover:bg-purple-600 border border-purple-400 py-4 rounded-xl text-lg font-black text-white shadow-lg"
                >
                  禁【{s}】
                </button>
              ))}
            </div>
            <button
              onClick={() => setPawnModal(false)}
              className="w-full bg-neutral-700 py-2 rounded-xl text-xs font-bold"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* ================== 弹窗 6：胡牌结算 / 流局弹窗 ================== */}
      {(gamePhase === 'WINNER' || gamePhase === 'DRAW_GAME') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="bg-neutral-900 border-2 border-yellow-500 rounded-3xl p-6 md:p-8 max-w-xl w-full text-center shadow-2xl">
            <Trophy size={48} className="text-yellow-400 mx-auto mb-3" />
            {gamePhase === 'WINNER' && winnerInfo ? (
              <>
                <h2 className="text-2xl md:text-3xl font-black text-white mb-1">
                  【{winnerInfo.winner.role}】({winnerInfo.winner.name}) 获胜！
                </h2>
                <p className="text-yellow-400 font-bold text-sm mb-4">
                  胡牌方式：{winnerInfo.winType} · 有效花牌数：{getFlowerBreakdown(winnerInfo.winner).total} 花
                </p>
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
              <button
                onClick={() => startNewGame(selectedHumanRole, aiDifficulty)}
                className="bg-yellow-500 hover:bg-yellow-400 text-black font-black px-6 py-2.5 rounded-xl"
              >
                再来一局
              </button>
              <button
                onClick={() => setShowRoleSelectModal(true)}
                className="bg-neutral-700 hover:bg-neutral-600 text-white font-bold px-6 py-2.5 rounded-xl"
              >
                更换角色 / 难度
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}