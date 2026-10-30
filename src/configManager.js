const fs = require('fs');
const path = require('path');
const {
  RANK_TIERS,
  sanitizeMmr,
  getRankFromMmr,
  getRankImageCandidates,
  getRankImagePath,
  generateRankSvg,
  identifyRankFromFilename,
  getAllRankBrackets,
  getRankCatalog
} = require('./rankUtils');

const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', 'config.json');

const DEFAULT_CUSTOM_POSITIONS = {
  mmrTracker: { x: 1115, y: 995 },
  aegisTimer: { x: 550, y: 44 },
  roshanTimer: { x: 256, y: 880 },
  minimapBlocker: { x: 0, y: 836 },
  queueBlocker: { x: 1552, y: 980 }
};

const DEFAULT_SCENE_LAYOUTS = {
  main_menu: {
    backdrop: '/images/sample_dota_scene_main_menu.png',
    widgets: {
      mmrTracker: { x: 355, y: 10, width: 275, height: 34, visible: true },
      queueBlocker: { x: 1552, y: 980, width: 352, height: 86, visible: true }
    }
  },
  drafting_phase: {
    backdrop: '/images/sample_dota_scene_drafting_phase.png',
    widgets: {
      draftRadiantSlots: { x: 468, y: 0, width: 352, height: 76, visible: true },
      draftDireSlots: { x: 1100, y: 0, width: 352, height: 76, visible: true },
      draftMinimapMask: { x: 22, y: 790, width: 274, height: 268, visible: true },
      draftChooseHeroMask: { x: 1474, y: 148, width: 420, height: 595, visible: true },
      mmrTracker: { x: 355, y: 10, width: 275, height: 34, visible: false }
    }
  },
  draft_own_hero_locked: {
    backdrop: '/images/sample_dota_scene_draft_own_hero_locked.png',
    widgets: {
      draftRadiantSlots: { x: 468, y: 0, width: 352, height: 76, visible: true },
      draftDireSlots: { x: 1100, y: 0, width: 352, height: 76, visible: true },
      draftMinimapMask: { x: 22, y: 790, width: 274, height: 268, visible: true },
      draftChooseHeroMask: { x: 1474, y: 148, width: 420, height: 595, visible: true },
      mmrTracker: { x: 355, y: 10, width: 275, height: 34, visible: false }
    }
  },
  in_game: {
    backdrop: '/images/sample_dota_scene_in_game.png',
    widgets: {
      mmrTracker: { x: 1115, y: 995, width: 275, height: 36, visible: true },
      roshanTimer: { x: 256, y: 880, width: 60, height: 60, visible: true },
      minimapBlocker: { x: 0, y: 836, width: 244, height: 244, visible: true },
      aegisSlot0: { x: 550, y: 44, width: 60, height: 46, visible: true },
      aegisSlot1: { x: 614, y: 44, width: 60, height: 46, visible: true },
      aegisSlot2: { x: 678, y: 44, width: 60, height: 46, visible: true },
      aegisSlot3: { x: 742, y: 44, width: 60, height: 46, visible: true },
      aegisSlot4: { x: 806, y: 44, width: 60, height: 46, visible: true },
      aegisSlot5: { x: 1104, y: 44, width: 60, height: 46, visible: true },
      aegisSlot6: { x: 1166, y: 44, width: 60, height: 46, visible: true },
      aegisSlot7: { x: 1228, y: 44, width: 60, height: 46, visible: true },
      aegisSlot8: { x: 1290, y: 44, width: 60, height: 46, visible: true },
      aegisSlot9: { x: 1352, y: 44, width: 60, height: 46, visible: true }
    }
  }
};

const DEFAULT_CONFIG = {
  mmrTracker: {
    enabled: true,
    showInMenu: true,
    showInGame: true,
    autoTrackGsi: true,
    label: 'STREAM',
    startingMmr: 7455,
    currentMmr: 7455,
    mmrStep: 25,
    wins: 0,
    losses: 0,
    showRankIcon: true,
    opacity: 80,
    inGamePosition: 'bottom_hud'
  },
  timers: {
    aegisEnabled: true,
    roshanEnabled: true,
    aegisDurationSec: 300,
    roshanMinSec: 480,
    roshanMaxSec: 660,
    defaultHeroSlot: 0
  },
  queueBlocker: {
    enabled: true,
    showFindingMatch: true,
    customText: 'Ranked match / All pick / SE Asia'
  },
  heroPickBlocker: {
    enabled: true,
    blockTopSlots: true,
    blockMinimapPreview: true,
    blockChooseHeroBox: true,
    revealOwnHero: true,
    streamerSlot: 0
  },
  minimapBlocker: {
    enabled: true,
    style: 'realistic', // 'realistic' | 'complex' | 'simple'
    extraLarge: false, // false = 244x244, true = 280x280
    rightSide: false, // false = bottom-left, true = bottom-right
    battlepassOffset: false, // shifts padding slightly for custom HUD skins
    customOffsetX: 0,
    customOffsetY: 0,
    intensity: 75 // 0 to 100 (%)
  },
  gsi: {
    dotaPath: '',
    lastRecordedMatchId: null
  },
  customPositions: {
    mmrTracker: null,
    aegisTimer: null,
    roshanTimer: null,
    minimapBlocker: null,
    queueBlocker: null
  },
  sceneLayouts: JSON.parse(JSON.stringify(DEFAULT_SCENE_LAYOUTS))
};

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function toFiniteNumber(val, fallback) {
  if (val === null || val === undefined || val === '' || typeof val === 'boolean' || Array.isArray(val)) {
    return fallback;
  }
  if (typeof val === 'string' && val.trim() === '') {
    return fallback;
  }
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeConfig(raw) {
  const merged = deepClone(DEFAULT_CONFIG);
  if (!raw || typeof raw !== 'object') return merged;

  for (const section of Object.keys(DEFAULT_CONFIG)) {
    if (raw[section] && typeof raw[section] === 'object') {
      Object.assign(merged[section], raw[section]);
    }
  }

  // Enforce constraints & types
  merged.mmrTracker.enabled = Boolean(merged.mmrTracker.enabled);
  merged.mmrTracker.showInMenu = Boolean(merged.mmrTracker.showInMenu);
  merged.mmrTracker.showInGame = Boolean(merged.mmrTracker.showInGame);
  merged.mmrTracker.autoTrackGsi = Boolean(merged.mmrTracker.autoTrackGsi);
  merged.mmrTracker.label = String(merged.mmrTracker.label || 'STREAM').slice(0, 24);
  merged.mmrTracker.startingMmr = Math.max(
    0,
    Math.round(toFiniteNumber(merged.mmrTracker.startingMmr, DEFAULT_CONFIG.mmrTracker.startingMmr))
  );
  merged.mmrTracker.currentMmr = Math.max(
    0,
    Math.round(toFiniteNumber(merged.mmrTracker.currentMmr, merged.mmrTracker.startingMmr))
  );
  merged.mmrTracker.mmrStep = Math.max(
    0,
    Math.round(toFiniteNumber(merged.mmrTracker.mmrStep, DEFAULT_CONFIG.mmrTracker.mmrStep))
  );
  merged.mmrTracker.wins = Math.max(0, Math.round(toFiniteNumber(merged.mmrTracker.wins, 0)));
  merged.mmrTracker.losses = Math.max(0, Math.round(toFiniteNumber(merged.mmrTracker.losses, 0)));
  merged.mmrTracker.showRankIcon = merged.mmrTracker.showRankIcon !== false;
  merged.mmrTracker.opacity = Math.min(
    100,
    Math.max(10, Math.round(toFiniteNumber(merged.mmrTracker.opacity, 80)))
  );
  merged.mmrTracker.inGamePosition =
    merged.mmrTracker.inGamePosition === 'top_bar' ? 'top_bar' : 'bottom_hud';

  merged.timers.aegisEnabled = Boolean(merged.timers.aegisEnabled);
  merged.timers.roshanEnabled = Boolean(merged.timers.roshanEnabled);
  merged.timers.aegisDurationSec = Math.max(
    1,
    Math.round(toFiniteNumber(merged.timers.aegisDurationSec, 300))
  );
  merged.timers.roshanMinSec = Math.max(
    1,
    Math.round(toFiniteNumber(merged.timers.roshanMinSec, 480))
  );
  merged.timers.roshanMaxSec = Math.max(
    merged.timers.roshanMinSec,
    Math.round(toFiniteNumber(merged.timers.roshanMaxSec, 660))
  );
  merged.timers.defaultHeroSlot = Math.min(
    9,
    Math.max(0, Math.round(toFiniteNumber(merged.timers.defaultHeroSlot, 0)))
  );

  merged.queueBlocker.enabled = Boolean(merged.queueBlocker.enabled);
  merged.queueBlocker.showFindingMatch = Boolean(merged.queueBlocker.showFindingMatch);
  merged.queueBlocker.customText = String(
    merged.queueBlocker.customText !== undefined && merged.queueBlocker.customText !== null
      ? merged.queueBlocker.customText
      : DEFAULT_CONFIG.queueBlocker.customText
  ).slice(0, 45);

  merged.heroPickBlocker.enabled = Boolean(merged.heroPickBlocker.enabled);
  merged.heroPickBlocker.blockTopSlots = Boolean(merged.heroPickBlocker.blockTopSlots);
  merged.heroPickBlocker.blockMinimapPreview = Boolean(merged.heroPickBlocker.blockMinimapPreview);
  merged.heroPickBlocker.blockChooseHeroBox = Boolean(merged.heroPickBlocker.blockChooseHeroBox);
  merged.heroPickBlocker.revealOwnHero = Boolean(merged.heroPickBlocker.revealOwnHero);
  merged.heroPickBlocker.streamerSlot = Math.min(
    9,
    Math.max(0, Math.round(toFiniteNumber(merged.heroPickBlocker.streamerSlot, 0)))
  );

  merged.minimapBlocker.enabled = Boolean(merged.minimapBlocker.enabled);
  merged.minimapBlocker.style = ['simple', 'complex', 'realistic'].includes(merged.minimapBlocker.style)
    ? merged.minimapBlocker.style
    : 'realistic';
  merged.minimapBlocker.extraLarge = Boolean(merged.minimapBlocker.extraLarge);
  merged.minimapBlocker.rightSide = Boolean(merged.minimapBlocker.rightSide);
  merged.minimapBlocker.battlepassOffset = Boolean(merged.minimapBlocker.battlepassOffset);
  merged.minimapBlocker.customOffsetX = Math.round(
    toFiniteNumber(merged.minimapBlocker.customOffsetX, 0)
  );
  merged.minimapBlocker.customOffsetY = Math.round(
    toFiniteNumber(merged.minimapBlocker.customOffsetY, 0)
  );
  merged.minimapBlocker.intensity = Math.min(
    100,
    Math.max(0, Math.round(toFiniteNumber(merged.minimapBlocker.intensity, 75)))
  );

  merged.gsi.dotaPath = String(merged.gsi.dotaPath || '');

  const WIDGET_KEYS = ['mmrTracker', 'aegisTimer', 'roshanTimer', 'minimapBlocker', 'queueBlocker'];
  if (!merged.customPositions || typeof merged.customPositions !== 'object') {
    merged.customPositions = {
      mmrTracker: null,
      aegisTimer: null,
      roshanTimer: null,
      minimapBlocker: null,
      queueBlocker: null
    };
  } else {
    const sanitizedPositions = {};
    for (const key of WIDGET_KEYS) {
      const pos = merged.customPositions[key];
      if (pos && typeof pos === 'object') {
        const x = toFiniteNumber(pos.x, null);
        const y = toFiniteNumber(pos.y, null);
        if (x !== null && y !== null) {
          sanitizedPositions[key] = {
            x: Math.max(0, Math.min(1920, Math.round(x))),
            y: Math.max(0, Math.min(1080, Math.round(y)))
          };
        } else {
          sanitizedPositions[key] = null;
        }
      } else {
        sanitizedPositions[key] = null;
      }
    }
    merged.customPositions = sanitizedPositions;
  }

  // Sanitize sceneLayouts for multi-scene layout editor
  const sanitizedLayouts = deepClone(DEFAULT_SCENE_LAYOUTS);
  if (raw && raw.sceneLayouts && typeof raw.sceneLayouts === 'object') {
    for (const scene of Object.keys(DEFAULT_SCENE_LAYOUTS)) {
      const rawScene = raw.sceneLayouts[scene];
      if (rawScene && typeof rawScene === 'object') {
        if (typeof rawScene.backdrop === 'string' && rawScene.backdrop.trim() !== '') {
          sanitizedLayouts[scene].backdrop = rawScene.backdrop.trim();
        }
        if (rawScene.widgets && typeof rawScene.widgets === 'object') {
          for (const [wKey, rawW] of Object.entries(rawScene.widgets)) {
            if (rawW && typeof rawW === 'object') {
              const defW = sanitizedLayouts[scene].widgets[wKey] || { x: 0, y: 0, width: 100, height: 40, visible: true };
              const xVal = toFiniteNumber(rawW.x, defW.x);
              const yVal = toFiniteNumber(rawW.y, defW.y);
              const wVal = toFiniteNumber(rawW.width, defW.width);
              const hVal = toFiniteNumber(rawW.height, defW.height);
              sanitizedLayouts[scene].widgets[wKey] = {
                x: Math.max(0, Math.min(1920, Math.round(xVal))),
                y: Math.max(0, Math.min(1080, Math.round(yVal))),
                width: Math.max(10, Math.min(1920, Math.round(wVal))),
                height: Math.max(10, Math.min(1080, Math.round(hVal))),
                visible: rawW.visible !== undefined ? Boolean(rawW.visible) : (defW.visible !== undefined ? defW.visible : true)
              };
            }
          }
        }
      }
    }
  }

  // Cross-sync customPositions with sceneLayouts
  if (merged.customPositions.mmrTracker && sanitizedLayouts.in_game.widgets.mmrTracker) {
    sanitizedLayouts.in_game.widgets.mmrTracker.x = merged.customPositions.mmrTracker.x;
    sanitizedLayouts.in_game.widgets.mmrTracker.y = merged.customPositions.mmrTracker.y;
  }
  if (merged.customPositions.roshanTimer && sanitizedLayouts.in_game.widgets.roshanTimer) {
    sanitizedLayouts.in_game.widgets.roshanTimer.x = merged.customPositions.roshanTimer.x;
    sanitizedLayouts.in_game.widgets.roshanTimer.y = merged.customPositions.roshanTimer.y;
  }
  if (merged.customPositions.minimapBlocker && sanitizedLayouts.in_game.widgets.minimapBlocker) {
    sanitizedLayouts.in_game.widgets.minimapBlocker.x = merged.customPositions.minimapBlocker.x;
    sanitizedLayouts.in_game.widgets.minimapBlocker.y = merged.customPositions.minimapBlocker.y;
  }
  if (merged.customPositions.queueBlocker && sanitizedLayouts.main_menu.widgets.queueBlocker) {
    sanitizedLayouts.main_menu.widgets.queueBlocker.x = merged.customPositions.queueBlocker.x;
    sanitizedLayouts.main_menu.widgets.queueBlocker.y = merged.customPositions.queueBlocker.y;
  }

  merged.sceneLayouts = sanitizedLayouts;

  return merged;
}

class ConfigManager {
  constructor(configPath = DEFAULT_CONFIG_PATH) {
    this.configPath = configPath;
    this.config = this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.configPath)) {
        const rawText = fs.readFileSync(this.configPath, 'utf8');
        const parsed = JSON.parse(rawText);
        const sanitized = sanitizeConfig(parsed);
        this.config = sanitized;
        this.save();
        return deepClone(this.config);
      }
    } catch (err) {
      console.error('[ConfigManager] Failed to load config.json, using defaults:', err.message);
    }
    this.config = deepClone(DEFAULT_CONFIG);
    this.save();
    return deepClone(this.config);
  }

  save() {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
    } catch (err) {
      console.error('[ConfigManager] Failed to save config.json:', err.message);
    }
  }

  get() {
    const copy = deepClone(this.config);
    if (copy.mmrTracker) {
      const rank = getRankFromMmr(copy.mmrTracker.currentMmr);
      const publicDir = path.join(__dirname, '..', 'public');
      rank.image = getRankImagePath(rank, publicDir);
      rank.svg = generateRankSvg(rank);
      copy.mmrTracker.rank = rank;
    }
    return copy;
  }

  update(patch) {
    if (!patch || typeof patch !== 'object') return this.get();

    const next = deepClone(this.config);
    for (const key of Object.keys(DEFAULT_CONFIG)) {
      if (patch[key] && typeof patch[key] === 'object') {
        next[key] = { ...next[key], ...patch[key] };
      }
    }

    this.config = sanitizeConfig(next);
    this.save();
    return this.get();
  }

  recordWin(customDelta) {
    const step = Math.round(toFiniteNumber(customDelta, this.config.mmrTracker.mmrStep));
    this.config.mmrTracker.wins += 1;
    this.config.mmrTracker.currentMmr = Math.max(0, this.config.mmrTracker.currentMmr + step);
    this.save();
    return this.get();
  }

  recordLoss(customDelta) {
    const step = Math.round(toFiniteNumber(customDelta, this.config.mmrTracker.mmrStep));
    this.config.mmrTracker.losses += 1;
    this.config.mmrTracker.currentMmr = Math.max(0, this.config.mmrTracker.currentMmr - step);
    this.save();
    return this.get();
  }

  resetSession(newStartingMmr) {
    const parsedStart = toFiniteNumber(newStartingMmr, null);
    if (parsedStart !== null) {
      this.config.mmrTracker.startingMmr = Math.max(0, Math.round(parsedStart));
    }
    this.config.mmrTracker.currentMmr = this.config.mmrTracker.startingMmr;
    this.config.mmrTracker.wins = 0;
    this.config.mmrTracker.losses = 0;
    this.config.gsi.lastRecordedMatchId = null;
    this.save();
    return this.get();
  }

  updatePositions(positions) {
    if (!positions || typeof positions !== 'object') return this.get();
    if (!this.config.customPositions || typeof this.config.customPositions !== 'object') {
      this.config.customPositions = {
        mmrTracker: null,
        aegisTimer: null,
        roshanTimer: null,
        minimapBlocker: null,
        queueBlocker: null
      };
    }
    const WIDGET_KEYS = ['mmrTracker', 'aegisTimer', 'roshanTimer', 'minimapBlocker', 'queueBlocker'];
    for (const key of WIDGET_KEYS) {
      if (key in positions) {
        const pos = positions[key];
        if (pos === null) {
          this.config.customPositions[key] = null;
        } else if (pos && typeof pos === 'object') {
          const x = toFiniteNumber(pos.x, null);
          const y = toFiniteNumber(pos.y, null);
          if (x !== null && y !== null) {
            this.config.customPositions[key] = {
              x: Math.max(0, Math.min(1920, Math.round(x))),
              y: Math.max(0, Math.min(1080, Math.round(y)))
            };
          }
        }
      }
    }
    this.save();
    return this.get();
  }

  resetPositions(explicitDefaults = false) {
    if (explicitDefaults) {
      this.config.customPositions = deepClone(DEFAULT_CUSTOM_POSITIONS);
    } else {
      this.config.customPositions = {
        mmrTracker: null,
        aegisTimer: null,
        roshanTimer: null,
        minimapBlocker: null,
        queueBlocker: null
      };
    }
    this.save();
    return this.get();
  }

  updateSceneLayout(scene, widgetUpdates) {
    if (!scene || !widgetUpdates || typeof widgetUpdates !== 'object') {
      return this.get();
    }
    if (!this.config.sceneLayouts || typeof this.config.sceneLayouts !== 'object') {
      this.config.sceneLayouts = deepClone(DEFAULT_SCENE_LAYOUTS);
    }
    if (!this.config.sceneLayouts[scene]) {
      this.config.sceneLayouts[scene] = deepClone(DEFAULT_SCENE_LAYOUTS[scene] || { backdrop: '', widgets: {} });
    }

    const targetWidgets = this.config.sceneLayouts[scene].widgets;
    for (const [wKey, rawW] of Object.entries(widgetUpdates)) {
      if (rawW && typeof rawW === 'object') {
        const cur = targetWidgets[wKey] || { x: 0, y: 0, width: 100, height: 40, visible: true };
        const xVal = toFiniteNumber(rawW.x, cur.x);
        const yVal = toFiniteNumber(rawW.y, cur.y);
        const wVal = toFiniteNumber(rawW.width, cur.width);
        const hVal = toFiniteNumber(rawW.height, cur.height);
        targetWidgets[wKey] = {
          x: Math.max(0, Math.min(1920, Math.round(xVal))),
          y: Math.max(0, Math.min(1080, Math.round(yVal))),
          width: Math.max(10, Math.min(1920, Math.round(wVal))),
          height: Math.max(10, Math.min(1080, Math.round(hVal))),
          visible: rawW.visible !== undefined ? Boolean(rawW.visible) : (cur.visible !== undefined ? cur.visible : true)
        };
      }
    }

    // Keep customPositions in sync with in-game widgets for backward compatibility
    if (scene === 'in_game') {
      if (widgetUpdates.mmrTracker) {
        this.config.customPositions.mmrTracker = { x: targetWidgets.mmrTracker.x, y: targetWidgets.mmrTracker.y };
      }
      if (widgetUpdates.roshanTimer) {
        this.config.customPositions.roshanTimer = { x: targetWidgets.roshanTimer.x, y: targetWidgets.roshanTimer.y };
      }
      if (widgetUpdates.minimapBlocker) {
        this.config.customPositions.minimapBlocker = { x: targetWidgets.minimapBlocker.x, y: targetWidgets.minimapBlocker.y };
      }
      if (widgetUpdates.aegisSlot0) {
        this.config.customPositions.aegisTimer = { x: targetWidgets.aegisSlot0.x, y: targetWidgets.aegisSlot0.y };
      }
    } else if (scene === 'main_menu') {
      if (widgetUpdates.queueBlocker) {
        this.config.customPositions.queueBlocker = { x: targetWidgets.queueBlocker.x, y: targetWidgets.queueBlocker.y };
      }
    }

    this.save();
    return this.get();
  }

  updateSceneLayouts(layouts) {
    if (!layouts || typeof layouts !== 'object') return this.get();
    for (const [scene, sceneData] of Object.entries(layouts)) {
      if (sceneData && sceneData.widgets) {
        this.updateSceneLayout(scene, sceneData.widgets);
      }
    }
    return this.get();
  }

  resetSceneLayout(scene = null) {
    if (!this.config.sceneLayouts || typeof this.config.sceneLayouts !== 'object') {
      this.config.sceneLayouts = deepClone(DEFAULT_SCENE_LAYOUTS);
    }
    if (scene && DEFAULT_SCENE_LAYOUTS[scene]) {
      this.config.sceneLayouts[scene] = deepClone(DEFAULT_SCENE_LAYOUTS[scene]);
    } else {
      this.config.sceneLayouts = deepClone(DEFAULT_SCENE_LAYOUTS);
    }
    this.save();
    return this.get();
  }

  autoAlignAegisSlots() {
    if (!this.config.sceneLayouts || !this.config.sceneLayouts.in_game) {
      this.config.sceneLayouts = deepClone(DEFAULT_SCENE_LAYOUTS);
    }
    const widgets = this.config.sceneLayouts.in_game.widgets;

    // Radiant Slots 0..4 (5 heroes: Blue, Teal, Purple, Yellow, Orange)
    const radStart = widgets.aegisSlot0 ? widgets.aegisSlot0.x : 550;
    const radEnd = widgets.aegisSlot4 ? widgets.aegisSlot4.x : 806;
    const radY = widgets.aegisSlot0 ? widgets.aegisSlot0.y : 44;
    for (let i = 0; i < 5; i++) {
      const x = Math.round(radStart + (i / 4) * (radEnd - radStart));
      widgets[`aegisSlot${i}`] = {
        x: Math.max(0, Math.min(1920, x)),
        y: Math.max(0, Math.min(1080, radY)),
        width: 60,
        height: 46,
        visible: true
      };
    }

    // Dire Slots 5..9 (5 heroes: Pink, Olive, Light Blue, Dark Green, Brown)
    const direStart = widgets.aegisSlot5 ? widgets.aegisSlot5.x : 1104;
    const direEnd = widgets.aegisSlot9 ? widgets.aegisSlot9.x : 1352;
    const direY = widgets.aegisSlot5 ? widgets.aegisSlot5.y : 44;
    for (let i = 0; i < 5; i++) {
      const s = 5 + i;
      const x = Math.round(direStart + (i / 4) * (direEnd - direStart));
      widgets[`aegisSlot${s}`] = {
        x: Math.max(0, Math.min(1920, x)),
        y: Math.max(0, Math.min(1080, direY)),
        width: 60,
        height: 46,
        visible: true
      };
    }

    this.save();
    return this.get();
  }
}

module.exports = {
  ConfigManager,
  DEFAULT_CONFIG,
  DEFAULT_CUSTOM_POSITIONS,
  DEFAULT_SCENE_LAYOUTS,
  sanitizeConfig,
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
