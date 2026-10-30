const fs = require('fs');
const path = require('path');

const RANK_TIERS = [
  {
    tier: 1,
    tierName: 'herald',
    displayName: 'Herald',
    subtiers: [
      { stars: 1, min: 10, max: 153 },
      { stars: 2, min: 154, max: 307 },
      { stars: 3, min: 308, max: 461 },
      { stars: 4, min: 462, max: 615 },
      { stars: 5, min: 616, max: 769 }
    ]
  },
  {
    tier: 2,
    tierName: 'guardian',
    displayName: 'Guardian',
    subtiers: [
      { stars: 1, min: 770, max: 923 },
      { stars: 2, min: 924, max: 1077 },
      { stars: 3, min: 1078, max: 1231 },
      { stars: 4, min: 1232, max: 1385 },
      { stars: 5, min: 1386, max: 1539 }
    ]
  },
  {
    tier: 3,
    tierName: 'crusader',
    displayName: 'Crusader',
    subtiers: [
      { stars: 1, min: 1540, max: 1693 },
      { stars: 2, min: 1694, max: 1847 },
      { stars: 3, min: 1848, max: 2001 },
      { stars: 4, min: 2002, max: 2155 },
      { stars: 5, min: 2156, max: 2309 }
    ]
  },
  {
    tier: 4,
    tierName: 'archon',
    displayName: 'Archon',
    subtiers: [
      { stars: 1, min: 2310, max: 2463 },
      { stars: 2, min: 2464, max: 2617 },
      { stars: 3, min: 2618, max: 2771 },
      { stars: 4, min: 2772, max: 2925 },
      { stars: 5, min: 2926, max: 3079 }
    ]
  },
  {
    tier: 5,
    tierName: 'legend',
    displayName: 'Legend',
    subtiers: [
      { stars: 1, min: 3080, max: 3233 },
      { stars: 2, min: 3234, max: 3387 },
      { stars: 3, min: 3388, max: 3541 },
      { stars: 4, min: 3542, max: 3695 },
      { stars: 5, min: 3696, max: 3849 }
    ]
  },
  {
    tier: 6,
    tierName: 'ancient',
    displayName: 'Ancient',
    subtiers: [
      { stars: 1, min: 3850, max: 4003 },
      { stars: 2, min: 4004, max: 4157 },
      { stars: 3, min: 4158, max: 4311 },
      { stars: 4, min: 4312, max: 4465 },
      { stars: 5, min: 4466, max: 4619 }
    ]
  },
  {
    tier: 7,
    tierName: 'divine',
    displayName: 'Divine',
    subtiers: [
      { stars: 1, min: 4620, max: 4773 },
      { stars: 2, min: 4774, max: 4927 },
      { stars: 3, min: 4928, max: 5081 },
      { stars: 4, min: 5082, max: 5235 },
      { stars: 5, min: 5236, max: 5419 }
    ]
  }
];

function sanitizeMmr(raw) {
  if (raw === null || raw === undefined || raw === '' || typeof raw === 'boolean') {
    return 0;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function getRankFromMmr(rawMmr) {
  const mmr = sanitizeMmr(rawMmr);

  if (mmr < 10) {
    const info = {
      mmr,
      tier: 0,
      tierName: 'unranked',
      displayName: 'Unranked',
      stars: 0,
      rankName: 'Unranked',
      bracketMin: 0,
      bracketMax: 9
    };
    info.imageCandidates = getRankImageCandidates(info);
    return info;
  }

  if (mmr >= 5420) {
    const info = {
      mmr,
      tier: 8,
      tierName: 'immortal',
      displayName: 'Immortal',
      stars: 0,
      rankName: 'Immortal',
      bracketMin: 5420,
      bracketMax: null
    };
    info.imageCandidates = getRankImageCandidates(info);
    return info;
  }

  for (const t of RANK_TIERS) {
    const firstSub = t.subtiers[0];
    const lastSub = t.subtiers[t.subtiers.length - 1];
    if (mmr >= firstSub.min && mmr <= lastSub.max) {
      for (const sub of t.subtiers) {
        if (mmr >= sub.min && mmr <= sub.max) {
          const info = {
            mmr,
            tier: t.tier,
            tierName: t.tierName,
            displayName: t.displayName,
            stars: sub.stars,
            rankName: `${t.displayName} ${sub.stars}`,
            bracketMin: sub.min,
            bracketMax: sub.max
          };
          info.imageCandidates = getRankImageCandidates(info);
          return info;
        }
      }
    }
  }

  // Fallback if boundary gap
  const info = {
    mmr,
    tier: 1,
    tierName: 'herald',
    displayName: 'Herald',
    stars: 1,
    rankName: 'Herald 1',
    bracketMin: 10,
    bracketMax: 153
  };
  info.imageCandidates = getRankImageCandidates(info);
  return info;
}

function identifyRankFromFilename(rawName) {
  if (!rawName || typeof rawName !== 'string') return null;
  const baseName = path.basename(rawName);
  const extMatch = baseName.match(/\.(png|webp|svg|jpe?g)$/i);
  if (!extMatch) return null;
  const clean = baseName.slice(0, -extMatch[0].length).toLowerCase().replace(/[\s-]+/g, '_');

  if (['unranked', 'rank_unranked', 'tier_0', 'rank_0', '0'].includes(clean)) {
    return {
      tier: 0,
      tierName: 'unranked',
      displayName: 'Unranked',
      stars: 0,
      rankName: 'Unranked',
      bracketMin: 0,
      bracketMax: 9
    };
  }

  if (['immortal', 'rank_immortal', 'tier_8', 'rank_8', '80', '8', 'rank_icon_80', 'rank_icon_8'].includes(clean)) {
    return {
      tier: 8,
      tierName: 'immortal',
      displayName: 'Immortal',
      stars: 0,
      rankName: 'Immortal',
      bracketMin: 5420,
      bracketMax: null
    };
  }

  const tierMap = {
    herald: 1,
    guardian: 2,
    crusader: 3,
    archon: 4,
    legend: 5,
    ancient: 6,
    divine: 7
  };

  // 1. Tier name + stars: e.g. ancient_5, ancient5, rank_ancient_5, ancient-5
  const nameStarMatch = clean.match(/(?:^|.*_)(herald|guardian|crusader|archon|legend|ancient|divine)_?([1-5])(?:_.*|$)/);
  if (nameStarMatch) {
    const tName = nameStarMatch[1];
    const tier = tierMap[tName];
    const stars = parseInt(nameStarMatch[2], 10);
    const tierObj = RANK_TIERS.find((t) => t.tier === tier);
    const sub = tierObj ? tierObj.subtiers.find((s) => s.stars === stars) : null;
    return {
      tier,
      tierName: tName,
      displayName: tierObj ? tierObj.displayName : tName.charAt(0).toUpperCase() + tName.slice(1),
      stars,
      rankName: `${tierObj ? tierObj.displayName : tName} ${stars}`,
      bracketMin: sub ? sub.min : null,
      bracketMax: sub ? sub.max : null
    };
  }

  // 2. Dota 2 OpenDota / Web API 2-digit rank_tier code: e.g. 65, rank_icon_65, rank_65, tier_65
  const codeMatch = clean.match(/(?:^|.*_)([1-7])([1-5])(?:_.*|$)/);
  if (codeMatch) {
    const tier = parseInt(codeMatch[1], 10);
    const stars = parseInt(codeMatch[2], 10);
    const tierObj = RANK_TIERS.find((t) => t.tier === tier);
    const sub = tierObj ? tierObj.subtiers.find((s) => s.stars === stars) : null;
    return {
      tier,
      tierName: tierObj ? tierObj.tierName : 'unknown',
      displayName: tierObj ? tierObj.displayName : `Tier ${tier}`,
      stars,
      rankName: `${tierObj ? tierObj.displayName : `Tier ${tier}`} ${stars}`,
      bracketMin: sub ? sub.min : null,
      bracketMax: sub ? sub.max : null
    };
  }

  // 3. tier_X_Y or rank_X_Y
  const numMatch = clean.match(/(?:tier|rank)_([1-7])_([1-5])/);
  if (numMatch) {
    const tier = parseInt(numMatch[1], 10);
    const stars = parseInt(numMatch[2], 10);
    const tierObj = RANK_TIERS.find((t) => t.tier === tier);
    const sub = tierObj ? tierObj.subtiers.find((s) => s.stars === stars) : null;
    return {
      tier,
      tierName: tierObj ? tierObj.tierName : 'unknown',
      displayName: tierObj ? tierObj.displayName : `Tier ${tier}`,
      stars,
      rankName: `${tierObj ? tierObj.displayName : `Tier ${tier}`} ${stars}`,
      bracketMin: sub ? sub.min : null,
      bracketMax: sub ? sub.max : null
    };
  }

  // 4. Base tier without stars: e.g. ancient.png, rank_ancient.png, tier_6.png
  const baseMatch = clean.match(/(?:^|.*_)(herald|guardian|crusader|archon|legend|ancient|divine)(?:_.*|$)/);
  if (baseMatch) {
    const tName = baseMatch[1];
    const tier = tierMap[tName];
    const tierObj = RANK_TIERS.find((t) => t.tier === tier);
    return {
      tier,
      tierName: tName,
      displayName: tierObj ? tierObj.displayName : tName,
      stars: 0,
      rankName: tierObj ? tierObj.displayName : tName,
      isBaseTier: true
    };
  }

  return null;
}

function getAllRankBrackets() {
  const brackets = [
    {
      tier: 0,
      tierName: 'unranked',
      displayName: 'Unranked',
      stars: 0,
      rankName: 'Unranked',
      bracketMin: 0,
      bracketMax: 9
    }
  ];

  for (const t of RANK_TIERS) {
    for (const sub of t.subtiers) {
      brackets.push({
        tier: t.tier,
        tierName: t.tierName,
        displayName: t.displayName,
        stars: sub.stars,
        rankName: `${t.displayName} ${sub.stars}`,
        bracketMin: sub.min,
        bracketMax: sub.max
      });
    }
  }

  brackets.push({
    tier: 8,
    tierName: 'immortal',
    displayName: 'Immortal',
    stars: 0,
    rankName: 'Immortal',
    bracketMin: 5420,
    bracketMax: null
  });

  return brackets;
}

function getRankCatalog(publicDir) {
  const all = getAllRankBrackets();
  return all.map((b) => {
    const img = getRankImagePath(b, publicDir);
    return {
      ...b,
      image: img,
      hasImage: Boolean(img)
    };
  });
}

function getRankImageCandidates(rankInfo) {
  const { tier, tierName, stars } = rankInfo;
  if (tier === 0) {
    return [
      '/images/ranks/rank_unranked.png',
      '/images/ranks/unranked.png',
      '/images/ranks/rank_0.png',
      '/images/ranks/0.png',
      '/images/rank_unranked.png',
      '/images/unranked.png',
      '/images/rank_0.png',
      '/images/0.png'
    ];
  }
  if (tier === 8) {
    return [
      '/images/ranks/rank_immortal.png',
      '/images/ranks/immortal.png',
      '/images/ranks/rank_icon_80.png',
      '/images/ranks/rank_80.png',
      '/images/ranks/80.png',
      '/images/ranks/tier_8.png',
      '/images/ranks/rank_8.png',
      '/images/ranks/Immortal.png',
      '/images/rank_immortal.png',
      '/images/immortal.png',
      '/images/rank_icon_80.png',
      '/images/rank_80.png',
      '/images/80.png',
      '/images/tier_8.png',
      '/images/rank_8.png',
      '/images/Immortal.png'
    ];
  }

  const cap = tierName.charAt(0).toUpperCase() + tierName.slice(1);
  const code = `${tier}${stars}`;
  return [
    `/images/ranks/rank_${tierName}_${stars}.png`,
    `/images/ranks/${tierName}_${stars}.png`,
    `/images/ranks/${tierName}${stars}.png`,
    `/images/ranks/rank_${tierName}${stars}.png`,
    `/images/ranks/rank_icon_${code}.png`,
    `/images/ranks/rank_${code}.png`,
    `/images/ranks/${code}.png`,
    `/images/ranks/tier_${tier}_${stars}.png`,
    `/images/ranks/${cap}_${stars}.png`,
    `/images/ranks/${cap}${stars}.png`,
    `/images/ranks/rank_${tier}.png`,
    `/images/ranks/${tierName}.png`,
    `/images/ranks/${cap}.png`,
    `/images/rank_${tierName}_${stars}.png`,
    `/images/${tierName}_${stars}.png`,
    `/images/${tierName}${stars}.png`,
    `/images/rank_${tierName}${stars}.png`,
    `/images/rank_icon_${code}.png`,
    `/images/rank_${code}.png`,
    `/images/${code}.png`,
    `/images/tier_${tier}_${stars}.png`,
    `/images/${cap}_${stars}.png`,
    `/images/${cap}${stars}.png`,
    `/images/rank_${tier}.png`,
    `/images/${tierName}.png`,
    `/images/${cap}.png`
  ];
}

function getRankImagePath(rankInfo, publicDir) {
  if (!rankInfo || !publicDir) return null;

  // 1. Check direct predefined candidates
  const candidates = rankInfo.imageCandidates || getRankImageCandidates(rankInfo);
  for (const cand of candidates) {
    const diskPath = path.join(publicDir, cand.replace(/^\//, '').replace(/\//g, path.sep));
    if (fs.existsSync(diskPath)) {
      return cand;
    }
  }

  // 2. Dynamically scan public/images/ranks and public/images for files that match this rank
  const dirsToScan = [
    { prefix: '/images/ranks/', dir: path.join(publicDir, 'images', 'ranks') },
    { prefix: '/images/', dir: path.join(publicDir, 'images') }
  ];

  for (const { prefix, dir } of dirsToScan) {
    try {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const f of files) {
          const identified = identifyRankFromFilename(f);
          if (identified && identified.tier === rankInfo.tier) {
            // For unranked and immortal, tier match is enough
            if (rankInfo.tier === 0 || rankInfo.tier === 8) {
              return `${prefix}${f}`;
            }
            // For standard tiers, match star if present, or accept base tier
            if (identified.stars === rankInfo.stars || identified.isBaseTier) {
              return `${prefix}${f}`;
            }
          }
        }
      }
    } catch (_) {}
  }

  return null;
}

function generateRankSvg(rankInfo, size = 64) {
  const info = typeof rankInfo === 'number' ? getRankFromMmr(rankInfo) : rankInfo || getRankFromMmr(0);
  const { tier, stars, rankName } = info;

  // Tier color themes
  const themes = {
    0: { primary: '#64748b', secondary: '#334155', accent: '#94a3b8', glow: 'rgba(148, 163, 184, 0.4)' }, // Unranked
    1: { primary: '#a87146', secondary: '#5c3a21', accent: '#d97706', glow: 'rgba(168, 113, 70, 0.45)' }, // Herald
    2: { primary: '#94a3b8', secondary: '#475569', accent: '#cbd5e1', glow: 'rgba(203, 213, 225, 0.45)' }, // Guardian
    3: { primary: '#d97706', secondary: '#78350f', accent: '#f59e0b', glow: 'rgba(217, 119, 6, 0.45)' }, // Crusader
    4: { primary: '#38bdf8', secondary: '#0369a1', accent: '#7dd3fc', glow: 'rgba(56, 189, 248, 0.45)' }, // Archon
    5: { primary: '#fbbf24', secondary: '#b45309', accent: '#fef08a', glow: 'rgba(251, 191, 36, 0.5)' }, // Legend
    6: { primary: '#c084fc', secondary: '#6b21a8', accent: '#f59e0b', glow: 'rgba(192, 132, 252, 0.55)' }, // Ancient
    7: { primary: '#facc15', secondary: '#854d0e', accent: '#38bdf8', glow: 'rgba(250, 204, 21, 0.6)' }, // Divine
    8: { primary: '#ef4444', secondary: '#991b1b', accent: '#f59e0b', glow: 'rgba(239, 68, 68, 0.65)' }  // Immortal
  };

  const t = themes[tier] || themes[0];
  const starCoords = [
    [], // 0
    [{ x: 32, y: 10 }], // 1
    [{ x: 26, y: 11 }, { x: 38, y: 11 }], // 2
    [{ x: 21, y: 12 }, { x: 32, y: 9.5 }, { x: 43, y: 12 }], // 3
    [{ x: 17, y: 13 }, { x: 27, y: 10.5 }, { x: 37, y: 10.5 }, { x: 47, y: 13 }], // 4
    [{ x: 14, y: 14 }, { x: 23, y: 11 }, { x: 32, y: 9.5 }, { x: 41, y: 11 }, { x: 50, y: 14 }] // 5
  ];

  const starsMarkup = (starCoords[stars] || []).map((pt) => `
    <polygon points="${pt.x},${pt.y - 3.5} ${pt.x + 1.1},${pt.y - 1} ${pt.x + 3.5},${pt.y - 0.7} ${pt.x + 1.7},${pt.y + 1} ${pt.x + 2.2},${pt.y + 3.5} ${pt.x},${pt.y + 2.2} ${pt.x - 2.2},${pt.y + 3.5} ${pt.x - 1.7},${pt.y + 1} ${pt.x - 3.5},${pt.y - 0.7} ${pt.x - 1.1},${pt.y - 1}"
      fill="#fef08a" stroke="#d97706" stroke-width="0.5" filter="url(#starGlow)" />
  `).join('');

  return `
<svg class="dota-rank-svg" viewBox="0 0 64 64" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" aria-label="${rankName}">
  <defs>
    <filter id="starGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="0.6" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <linearGradient id="rankShieldGrad_${tier}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${t.accent}" />
      <stop offset="50%" stop-color="${t.primary}" />
      <stop offset="100%" stop-color="${t.secondary}" />
    </linearGradient>
    <linearGradient id="rankWingGrad_${tier}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${t.accent}" stop-opacity="0.9" />
      <stop offset="100%" stop-color="${t.secondary}" stop-opacity="0.8" />
    </linearGradient>
  </defs>

  <!-- Side Wings / Trim -->
  <path d="M 12 28 C 10 22 14 16 20 18 C 16 23 18 29 23 33 C 18 33 13 31 12 28 Z" fill="url(#rankWingGrad_${tier})" opacity="0.85" />
  <path d="M 52 28 C 54 22 50 16 44 18 C 48 23 46 29 41 33 C 46 33 51 31 52 28 Z" fill="url(#rankWingGrad_${tier})" opacity="0.85" />
  <path d="M 8 36 C 7 30 11 25 18 27 C 14 32 17 38 22 41 C 16 41 9 39 8 36 Z" fill="url(#rankWingGrad_${tier})" opacity="0.7" />
  <path d="M 56 36 C 57 30 53 25 46 27 C 50 32 47 38 42 41 C 48 41 55 39 56 36 Z" fill="url(#rankWingGrad_${tier})" opacity="0.7" />

  <!-- Main Shield Body -->
  <path d="M 32 17 L 46 23 L 42 43 L 32 55 L 22 43 L 18 23 Z"
    fill="url(#rankShieldGrad_${tier})" stroke="#0f172a" stroke-width="1.2" stroke-linejoin="round" />

  <!-- Inner Crest / Gem -->
  <path d="M 32 23 L 40 28 L 38 41 L 32 48 L 26 41 L 24 28 Z"
    fill="${t.secondary}" stroke="${t.accent}" stroke-width="0.8" opacity="0.9" />

  <!-- Core Jewel Accent -->
  <polygon points="32,27 36,33 32,39 28,33" fill="${t.accent}" />
  <circle cx="32" cy="33" r="1.5" fill="#ffffff" opacity="0.85" />

  <!-- Bottom Tip Accent -->
  <line x1="32" y1="48" x2="32" y2="54" stroke="${t.accent}" stroke-width="1.2" stroke-linecap="round" />

  <!-- Rank Stars -->
  ${starsMarkup}
</svg>
`.trim();
}

module.exports = {
  RANK_TIERS,
  sanitizeMmr,
  getRankFromMmr,
  getRankImageCandidates,
  getRankImagePath,
  generateRankSvg,
  identifyRankFromFilename,
  getAllRankBrackets,
  getRankCatalog
};
