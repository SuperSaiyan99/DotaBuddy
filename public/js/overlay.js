(function () {
  const viewport = document.getElementById('overlay-viewport');

  // Auto-scale 1920x1080 canvas if viewed in a smaller browser window or preview iframe
  let scaleRaf = null;
  function updateViewportScale() {
    if (!viewport) return;
    const scaleX = window.innerWidth / 1920;
    const scaleY = window.innerHeight / 1080;
    const scale = Math.min(scaleX, scaleY);
    if (Math.abs(scale - 1) < 0.01) {
      viewport.style.transform = 'none';
    } else {
      viewport.style.transform = `scale(${scale})`;
    }
  }

  function scheduleViewportScale() {
    if (typeof requestAnimationFrame === 'function') {
      if (scaleRaf) return;
      scaleRaf = requestAnimationFrame(() => {
        scaleRaf = null;
        updateViewportScale();
      });
    } else {
      updateViewportScale();
    }
  }

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('resize', scheduleViewportScale);
    updateViewportScale();
  }

  // DOM Elements
  const mmrTrackerEl = document.getElementById('mmr-tracker');
  const mmrTrackerTextEl = document.getElementById('mmr-tracker-text');

  const aegisTimerEl = document.getElementById('aegis-timer');
  const aegisTimeTextEl = document.getElementById('aegis-time-text');
  const aegisBarFillEl = document.getElementById('aegis-bar-fill');
  const aegisAllSlotsEl = document.getElementById('aegis-all-slots');

  const roshanTimerEl = document.getElementById('roshan-timer');
  const roshanRingProgressEl = document.getElementById('roshan-ring-progress');
  const roshanPhaseLabelEl = document.getElementById('roshan-phase-label');
  const roshanTimeTextEl = document.getElementById('roshan-time-text');
  const roshanSubTextEl = document.getElementById('roshan-sub-text');
  const roshanEyeLeftEl = document.getElementById('roshan-eye-left');
  const roshanEyeRightEl = document.getElementById('roshan-eye-right');

  const queueBlockerEl = document.getElementById('queue-blocker');
  const queueFindingViewEl = document.getElementById('queue-finding-view');
  const queueSolidViewEl = document.getElementById('queue-solid-view');
  const queueCustomTextEl = document.getElementById('queue-custom-text');

  const heroPickBlockerEl = document.getElementById('hero-pick-blocker');
  const draftRadiantSlotsEl = document.getElementById('draft-radiant-slots');
  const draftDireSlotsEl = document.getElementById('draft-dire-slots');
  const draftMinimapMaskEl = document.getElementById('draft-minimap-mask');
  const draftChooseHeroMaskEl = document.getElementById('draft-choose-hero-mask');
  const draftPhaseBadgeEl = document.getElementById('draft-phase-status-badge');
  const draftSlotEls = typeof document !== 'undefined' && document.querySelectorAll
    ? Array.from(document.querySelectorAll('.draft-slot'))
    : [];

  const minimapBlockerEl = document.getElementById('minimap-blocker');
  const minimapSvgComplexEl = document.getElementById('minimap-svg-complex');
  const minimapSvgSimpleEl = document.getElementById('minimap-svg-simple');
  const minimapImageEl = document.getElementById('minimap-image');

  const rankBadgeWrapEl = document.getElementById('rank-badge-wrap');
  const rankBadgeImgEl = document.getElementById('rank-badge-img');
  const rankBadgeSvgEl = document.getElementById('rank-badge-svg');

  // Layout Editor & HUD Guide Elements
  const hudGuideEl = document.getElementById('hud-guide') || document.getElementById('overlay-hud-guide');
  const overlayHudGuideEl = document.getElementById('overlay-hud-guide');
  const overlayEditToolbarEl = document.getElementById('overlay-edit-toolbar');
  const toolbarBtnEdit = document.getElementById('toolbar-btn-edit');
  const toolbarBtnGuide = document.getElementById('toolbar-btn-guide');
  const toolbarBtnReset = document.getElementById('toolbar-btn-reset');
  const toolbarBtnDock = document.getElementById('toolbar-btn-dock');
  const toolbarDragHandleEl = document.getElementById('toolbar-drag-handle');
  const toolbarStatusText = document.getElementById('toolbar-status-text');
  const toolbarBtnAlignAegis = document.getElementById('toolbar-btn-align-aegis');
  const toolbarSceneTabsEl = document.getElementById('toolbar-scene-tabs');

  const SCENE_DEFINITIONS = ['main_menu', 'drafting_phase', 'draft_own_hero_locked', 'in_game'];

  const SCENE_BACKDROPS = {
    main_menu: '/images/sample_dota_scene_main_menu.png',
    drafting_phase: '/images/sample_dota_scene_drafting_phase.png',
    draft_own_hero_locked: '/images/sample_dota_scene_draft_own_hero_locked.png',
    in_game: '/images/sample_dota_scene_in_game.png'
  };

  const SCENE_WIDGET_DEFS = {
    main_menu: [
      { key: 'mmrTracker', id: 'mmr-tracker', label: 'MMR Tracker', defaultX: 355, defaultY: 10, defaultWidth: 275, defaultHeight: 34, resizable: true },
      { key: 'queueBlocker', id: 'queue-blocker', label: 'Queue Blocker', defaultX: 1552, defaultY: 980, defaultWidth: 352, defaultHeight: 86, resizable: true }
    ],
    drafting_phase: [
      { key: 'draftRadiantSlots', id: 'draft-radiant-slots', label: 'Radiant Picks', defaultX: 468, defaultY: 0, defaultWidth: 352, defaultHeight: 76, resizable: true },
      { key: 'draftDireSlots', id: 'draft-dire-slots', label: 'Dire Picks', defaultX: 1100, defaultY: 0, defaultWidth: 352, defaultHeight: 76, resizable: true },
      { key: 'draftMinimapMask', id: 'draft-minimap-mask', label: 'Draft Minimap Shield', defaultX: 22, defaultY: 790, defaultWidth: 274, defaultHeight: 268, resizable: true },
      { key: 'draftChooseHeroMask', id: 'draft-choose-hero-mask', label: 'Choose Hero Box', defaultX: 1474, defaultY: 148, defaultWidth: 420, defaultHeight: 595, resizable: true },
      { key: 'mmrTracker', id: 'mmr-tracker', label: 'MMR Tracker', defaultX: 355, defaultY: 10, defaultWidth: 275, defaultHeight: 34, resizable: true }
    ],
    draft_own_hero_locked: [
      { key: 'draftRadiantSlots', id: 'draft-radiant-slots', label: 'Radiant Picks', defaultX: 468, defaultY: 0, defaultWidth: 352, defaultHeight: 76, resizable: true },
      { key: 'draftDireSlots', id: 'draft-dire-slots', label: 'Dire Picks', defaultX: 1100, defaultY: 0, defaultWidth: 352, defaultHeight: 76, resizable: true },
      { key: 'draftMinimapMask', id: 'draft-minimap-mask', label: 'Draft Minimap Shield', defaultX: 22, defaultY: 790, defaultWidth: 274, defaultHeight: 268, resizable: true },
      { key: 'draftChooseHeroMask', id: 'draft-choose-hero-mask', label: 'Choose Hero Box', defaultX: 1474, defaultY: 148, defaultWidth: 420, defaultHeight: 595, resizable: true },
      { key: 'mmrTracker', id: 'mmr-tracker', label: 'MMR Tracker', defaultX: 355, defaultY: 10, defaultWidth: 275, defaultHeight: 34, resizable: true }
    ],
    in_game: [
      { key: 'mmrTracker', id: 'mmr-tracker', label: 'MMR & Rank Tracker', defaultX: 1115, defaultY: 995, defaultWidth: 275, defaultHeight: 36, resizable: true },
      { key: 'roshanTimer', id: 'roshan-timer', label: 'Roshan Timer', defaultX: 256, defaultY: 880, defaultWidth: 60, defaultHeight: 60, resizable: false },
      { key: 'minimapBlocker', id: 'minimap-blocker', label: 'Minimap Blocker', defaultX: 0, defaultY: 836, defaultWidth: 244, defaultHeight: 244, resizable: true },
      { key: 'aegisSlot0', id: 'aegis-slot-0', label: 'Aegis Slot 0 (R1)', defaultX: 550, defaultY: 44, defaultWidth: 60, defaultHeight: 46, resizable: false },
      { key: 'aegisSlot1', id: 'aegis-slot-1', label: 'Aegis Slot 1 (R2)', defaultX: 614, defaultY: 44, defaultWidth: 60, defaultHeight: 46, resizable: false },
      { key: 'aegisSlot2', id: 'aegis-slot-2', label: 'Aegis Slot 2 (R3)', defaultX: 678, defaultY: 44, defaultWidth: 60, defaultHeight: 46, resizable: false },
      { key: 'aegisSlot3', id: 'aegis-slot-3', label: 'Aegis Slot 3 (R4)', defaultX: 742, defaultY: 44, defaultWidth: 60, defaultHeight: 46, resizable: false },
      { key: 'aegisSlot4', id: 'aegis-slot-4', label: 'Aegis Slot 4 (R5)', defaultX: 806, defaultY: 44, defaultWidth: 60, defaultHeight: 46, resizable: false },
      { key: 'aegisSlot5', id: 'aegis-slot-5', label: 'Aegis Slot 5 (D1)', defaultX: 1104, defaultY: 44, defaultWidth: 60, defaultHeight: 46, resizable: false },
      { key: 'aegisSlot6', id: 'aegis-slot-6', label: 'Aegis Slot 6 (D2)', defaultX: 1166, defaultY: 44, defaultWidth: 60, defaultHeight: 46, resizable: false },
      { key: 'aegisSlot7', id: 'aegis-slot-7', label: 'Aegis Slot 7 (D3)', defaultX: 1228, defaultY: 44, defaultWidth: 60, defaultHeight: 46, resizable: false },
      { key: 'aegisSlot8', id: 'aegis-slot-8', label: 'Aegis Slot 8 (D4)', defaultX: 1290, defaultY: 44, defaultWidth: 60, defaultHeight: 46, resizable: false },
      { key: 'aegisSlot9', id: 'aegis-slot-9', label: 'Aegis Slot 9 (D5)', defaultX: 1352, defaultY: 44, defaultWidth: 60, defaultHeight: 46, resizable: false }
    ]
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

  const DRAGGABLE_WIDGETS = [
    { key: 'mmrTracker', id: 'mmr-tracker', label: 'MMR & Rank Tracker', defaultX: 1115, defaultY: 995, defaultWidth: 275, defaultHeight: 36, resizable: true },
    { key: 'aegisTimer', id: 'aegis-timer', label: 'Aegis Timer', defaultX: 550, defaultY: 44, defaultWidth: 60, defaultHeight: 46, resizable: false },
    { key: 'roshanTimer', id: 'roshan-timer', label: 'Roshan Timer', defaultX: 256, defaultY: 880, defaultWidth: 60, defaultHeight: 60, resizable: false },
    { key: 'minimapBlocker', id: 'minimap-blocker', label: 'Minimap Blocker', defaultX: 0, defaultY: 836, defaultWidth: 244, defaultHeight: 244, resizable: true },
    { key: 'queueBlocker', id: 'queue-blocker', label: 'Queue Blocker', defaultX: 1552, defaultY: 980, defaultWidth: 352, defaultHeight: 86, resizable: true },
    { key: 'draftRadiantSlots', id: 'draft-radiant-slots', label: 'Top Radiant Picks', defaultX: 468, defaultY: 0, defaultWidth: 352, defaultHeight: 76, resizable: true },
    { key: 'draftDireSlots', id: 'draft-dire-slots', label: 'Top Dire Picks', defaultX: 1100, defaultY: 0, defaultWidth: 352, defaultHeight: 76, resizable: true },
    { key: 'draftMinimapMask', id: 'draft-minimap-mask', label: 'Draft Minimap Shield', defaultX: 22, defaultY: 790, defaultWidth: 274, defaultHeight: 268, resizable: true },
    { key: 'draftChooseHeroMask', id: 'draft-choose-hero-mask', label: 'Choose Hero Box', defaultX: 1474, defaultY: 148, defaultWidth: 420, defaultHeight: 595, resizable: true },
    { key: 'aegisSlot0', id: 'aegis-slot-0', label: 'Aegis Slot 0 (R1)', defaultX: 550, defaultY: 44, defaultWidth: 60, defaultHeight: 46, resizable: false },
    { key: 'aegisSlot1', id: 'aegis-slot-1', label: 'Aegis Slot 1 (R2)', defaultX: 614, defaultY: 44, defaultWidth: 60, defaultHeight: 46, resizable: false },
    { key: 'aegisSlot2', id: 'aegis-slot-2', label: 'Aegis Slot 2 (R3)', defaultX: 678, defaultY: 44, defaultWidth: 60, defaultHeight: 46, resizable: false },
    { key: 'aegisSlot3', id: 'aegis-slot-3', label: 'Aegis Slot 3 (R4)', defaultX: 742, defaultY: 44, defaultWidth: 60, defaultHeight: 46, resizable: false },
    { key: 'aegisSlot4', id: 'aegis-slot-4', label: 'Aegis Slot 4 (R5)', defaultX: 806, defaultY: 44, defaultWidth: 60, defaultHeight: 46, resizable: false },
    { key: 'aegisSlot5', id: 'aegis-slot-5', label: 'Aegis Slot 5 (D1)', defaultX: 1104, defaultY: 44, defaultWidth: 60, defaultHeight: 46, resizable: false },
    { key: 'aegisSlot6', id: 'aegis-slot-6', label: 'Aegis Slot 6 (D2)', defaultX: 1166, defaultY: 44, defaultWidth: 60, defaultHeight: 46, resizable: false },
    { key: 'aegisSlot7', id: 'aegis-slot-7', label: 'Aegis Slot 7 (D3)', defaultX: 1228, defaultY: 44, defaultWidth: 60, defaultHeight: 46, resizable: false },
    { key: 'aegisSlot8', id: 'aegis-slot-8', label: 'Aegis Slot 8 (D4)', defaultX: 1290, defaultY: 44, defaultWidth: 60, defaultHeight: 46, resizable: false },
    { key: 'aegisSlot9', id: 'aegis-slot-9', label: 'Aegis Slot 9 (D5)', defaultX: 1352, defaultY: 44, defaultWidth: 60, defaultHeight: 46, resizable: false }
  ];

  let isEditMode = false;
  let isHudGuideVisible = false;
  let selectedWidgetKey = null;
  let currentActiveScene = 'in_game';
  let manualSelectedScene = null;
  let currentCustomPositions = {};
  let currentSceneLayouts = {};
  let latestPayload = null;

  const RING_CIRCUMFERENCE = 2 * Math.PI * 18; // 113.097

  function calculateRank(currentMmr) {
    const mmr = Math.max(0, Math.round(Number(currentMmr) || 0));
    if (mmr < 10) {
      return { tier: 0, tierName: 'unranked', displayName: 'Unranked', stars: 0, rankName: 'Unranked' };
    }
    if (mmr >= 5420) {
      return { tier: 8, tierName: 'immortal', displayName: 'Immortal', stars: 0, rankName: 'Immortal' };
    }
    const tiers = [
      { tier: 1, tierName: 'herald', displayName: 'Herald', steps: [10, 154, 308, 462, 616], max: 769 },
      { tier: 2, tierName: 'guardian', displayName: 'Guardian', steps: [770, 924, 1078, 1232, 1386], max: 1539 },
      { tier: 3, tierName: 'crusader', displayName: 'Crusader', steps: [1540, 1694, 1848, 2002, 2156], max: 2309 },
      { tier: 4, tierName: 'archon', displayName: 'Archon', steps: [2310, 2464, 2618, 2772, 2926], max: 3079 },
      { tier: 5, tierName: 'legend', displayName: 'Legend', steps: [3080, 3234, 3388, 3542, 3696], max: 3849 },
      { tier: 6, tierName: 'ancient', displayName: 'Ancient', steps: [3850, 4004, 4158, 4312, 4466], max: 4619 },
      { tier: 7, tierName: 'divine', displayName: 'Divine', steps: [4620, 4774, 4928, 5082, 5236], max: 5419 }
    ];
    for (const t of tiers) {
      if (mmr <= t.max) {
        let stars = 1;
        for (let i = 0; i < t.steps.length; i++) {
          if (mmr >= t.steps[i]) stars = i + 1;
        }
        return {
          tier: t.tier,
          tierName: t.tierName,
          displayName: t.displayName,
          stars,
          rankName: `${t.displayName} ${stars}`
        };
      }
    }
    return { tier: 1, tierName: 'herald', displayName: 'Herald', stars: 1, rankName: 'Herald 1' };
  }

  function buildRankSvg(rank) {
    if (!rank) return '';
    const tier = rank.tier ?? 0;
    const stars = rank.stars ?? 0;
    const rankName = rank.rankName || 'Rank';

    const themes = {
      0: { primary: '#64748b', secondary: '#334155', accent: '#94a3b8' },
      1: { primary: '#a87146', secondary: '#5c3a21', accent: '#d97706' },
      2: { primary: '#94a3b8', secondary: '#475569', accent: '#cbd5e1' },
      3: { primary: '#d97706', secondary: '#78350f', accent: '#f59e0b' },
      4: { primary: '#38bdf8', secondary: '#0369a1', accent: '#7dd3fc' },
      5: { primary: '#fbbf24', secondary: '#b45309', accent: '#fef08a' },
      6: { primary: '#c084fc', secondary: '#6b21a8', accent: '#f59e0b' },
      7: { primary: '#facc15', secondary: '#854d0e', accent: '#38bdf8' },
      8: { primary: '#ef4444', secondary: '#991b1b', accent: '#f59e0b' }
    };
    const t = themes[tier] || themes[0];
    const starCoords = [
      [],
      [{ x: 32, y: 10 }],
      [{ x: 26, y: 11 }, { x: 38, y: 11 }],
      [{ x: 21, y: 12 }, { x: 32, y: 9.5 }, { x: 43, y: 12 }],
      [{ x: 17, y: 13 }, { x: 27, y: 10.5 }, { x: 37, y: 10.5 }, { x: 47, y: 13 }],
      [{ x: 13, y: 14 }, { x: 22.5, y: 11.5 }, { x: 32, y: 9.5 }, { x: 41.5, y: 11.5 }, { x: 51, y: 14 }]
    ];
    const activeStars = starCoords[stars] || [];
    const starsMarkup = activeStars
      .map(
        (s) =>
          `<polygon points="${s.x},${s.y - 3.5} ${s.x + 1},${s.y - 1} ${s.x + 3.5},${s.y - 1} ${s.x + 1.5},${s.y + 0.8} ${s.x + 2.2},${s.y + 3.2} ${s.x},${s.y + 1.6} ${s.x - 2.2},${s.y + 3.2} ${s.x - 1.5},${s.y + 0.8} ${s.x - 3.5},${s.y - 1} ${s.x - 1},${s.y - 1}" fill="#fef08a" stroke="#ca8a04" stroke-width="0.5" filter="drop-shadow(0 0 2px rgba(254,240,138,0.9))" />`
      )
      .join('');

    return `
      <svg viewBox="0 0 64 64" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" aria-label="${rankName}">
        <defs>
          <linearGradient id="rankShieldGrad_${tier}" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="${t.primary}" />
            <stop offset="100%" stop-color="${t.secondary}" />
          </linearGradient>
          <linearGradient id="rankWingGrad_${tier}" x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="${t.accent}" />
            <stop offset="100%" stop-color="${t.secondary}" stop-opacity="0.8" />
          </linearGradient>
        </defs>
        <path d="M 12 28 C 10 22 14 16 20 18 C 16 23 18 29 23 33 C 18 33 13 31 12 28 Z" fill="url(#rankWingGrad_${tier})" opacity="0.85" />
        <path d="M 52 28 C 54 22 50 16 44 18 C 48 23 46 29 41 33 C 46 33 51 31 52 28 Z" fill="url(#rankWingGrad_${tier})" opacity="0.85" />
        <path d="M 8 36 C 7 30 11 25 18 27 C 14 32 17 38 22 41 C 16 41 9 39 8 36 Z" fill="url(#rankWingGrad_${tier})" opacity="0.7" />
        <path d="M 56 36 C 57 30 53 25 46 27 C 50 32 47 38 42 41 C 48 41 55 39 56 36 Z" fill="url(#rankWingGrad_${tier})" opacity="0.7" />
        <path d="M 32 17 L 46 23 L 42 43 L 32 55 L 22 43 L 18 23 Z" fill="url(#rankShieldGrad_${tier})" stroke="#0f172a" stroke-width="1.2" stroke-linejoin="round" />
        <path d="M 32 23 L 40 28 L 38 41 L 32 48 L 26 41 L 24 28 Z" fill="${t.secondary}" stroke="${t.accent}" stroke-width="0.8" opacity="0.9" />
        <polygon points="32,27 36,33 32,39 28,33" fill="${t.accent}" />
        <circle cx="32" cy="33" r="1.5" fill="#ffffff" opacity="0.85" />
        <line x1="32" y1="48" x2="32" y2="54" stroke="${t.accent}" stroke-width="1.2" stroke-linecap="round" />
        ${starsMarkup}
      </svg>
    `.trim();
  }

  function setVisible(el, visible) {
    if (!el) return;
    if (visible) {
      el.classList.remove('overlay-hidden');
    } else {
      el.classList.add('overlay-hidden');
    }
  }

  function getHeroSlotLeftPx(slotIndex) {
    const s = Math.min(9, Math.max(0, Number(slotIndex) || 0));
    if (s < 5) {
      return 550 + s * 64;
    }
    return 1104 + (s - 5) * 62;
  }

  function getActiveSceneWidgets(sceneName) {
    return SCENE_WIDGET_DEFS[sceneName] || DRAGGABLE_WIDGETS;
  }

  function resolveCurrentSceneKey(gsiState, isEditModeActive = false, manualScene = null) {
    if (isEditModeActive && manualScene) {
      return manualScene;
    }
    if (!gsiState || typeof gsiState !== 'object') {
      return 'main_menu';
    }
    const rawGs = gsiState.gameState || (gsiState.map && gsiState.map.game_state);
    const gs = rawGs ? String(rawGs).trim().toUpperCase() : '';
    const flags = gsiState.flags || {};

    if (gs === 'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD') {
      return 'drafting_phase';
    }
    if (gsiState.currentScene) {
      return gsiState.currentScene;
    }
    if (gsiState.scene) {
      return gsiState.scene;
    }
    if (flags.isMainMenu || gs === 'DOTA_GAMERULES_STATE_INIT' || gs === 'DOTA_GAMERULES_STATE_DISCONNECT') {
      return 'main_menu';
    }
    if (flags.isDraftPhase || gs === 'DOTA_GAMERULES_STATE_HERO_SELECTION') {
      return gsiState.ownHeroLocked ? 'draft_own_hero_locked' : 'drafting_phase';
    }
    if (flags.isStrategyPhase || gs === 'DOTA_GAMERULES_STATE_STRATEGY_TIME') {
      return 'in_game';
    }
    if (
      flags.isInGame ||
      flags.isPostGame ||
      gs === 'DOTA_GAMERULES_STATE_PRE_GAME' ||
      gs === 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' ||
      gs === 'DOTA_GAMERULES_STATE_POST_GAME'
    ) {
      return 'in_game';
    }
    return 'in_game';
  }

  function renderOverlay(payload) {
    if (!payload || !payload.config || !payload.gsiState) return;
    latestPayload = payload;
    const { config, gsiState } = payload;
    const flags = gsiState.flags || {};

    if (config.customPositions) {
      currentCustomPositions = config.customPositions;
    }
    if (config.sceneLayouts) {
      currentSceneLayouts = config.sceneLayouts;
    }

    // Determine current active scene
    const activeScene = resolveCurrentSceneKey(gsiState, isEditMode, manualSelectedScene);
    currentActiveScene = activeScene;

    // Retrieve scene widgets configuration for activeScene
    const activeSceneDef = SCENE_WIDGET_DEFS[activeScene] || [];
    const activeKeys = new Set(activeSceneDef.map((w) => w.key));
    const sceneLayout = (currentSceneLayouts && currentSceneLayouts[activeScene]) || (DEFAULT_SCENE_LAYOUTS && DEFAULT_SCENE_LAYOUTS[activeScene]) || {};
    const sceneWidgets = sceneLayout.widgets || {};

    // 1. Hide widgets that do not belong to activeScene
    DRAGGABLE_WIDGETS.forEach(({ key, id }) => {
      if (!activeKeys.has(key)) {
        const el = document.getElementById(id);
        if (el) {
          setVisible(el, false);
          if (el.classList) {
            el.classList.remove('edit-widget-active', 'is-selected', 'is-dragging', 'widget-hidden-dimmed');
          }
          const badge = el.querySelector ? el.querySelector('.widget-label-badge') : null;
          if (badge && typeof badge.remove === 'function') {
            badge.remove();
          }
        }
      }
    });

    const mmCfg = config.minimapBlocker || {};

    // 2. Position and size widgets defined for activeScene
    activeSceneDef.forEach(({ key, id, defaultX, defaultY, defaultWidth, defaultHeight, resizable }) => {
      const el = document.getElementById(id);
      if (!el || !el.style) return;

      const wData = sceneWidgets[key] || {};
      const customPos = (activeScene === 'in_game' || (activeScene === 'main_menu' && key === 'queueBlocker'))
        ? (currentCustomPositions && currentCustomPositions[key])
        : null;

      // Sizing
      let w = wData.width !== undefined ? wData.width : defaultWidth;
      let h = wData.height !== undefined ? wData.height : defaultHeight;

      if (key === 'minimapBlocker' && (!customPos || customPos.x === undefined || customPos.x === null)) {
        if (mmCfg.extraLarge) {
          w = 280;
          h = 280;
        }
      }

      if (resizable && w && h) {
        el.style.width = `${w}px`;
        el.style.height = `${h}px`;
      }

      // Positioning
      if (customPos && customPos.x !== null && customPos.x !== undefined && customPos.y !== null && customPos.y !== undefined) {
        el.style.left = `${customPos.x}px`;
        el.style.top = `${customPos.y}px`;
        el.style.right = 'auto';
        el.style.bottom = 'auto';
      } else if (key === 'minimapBlocker' && mmCfg.rightSide) {
        el.style.left = 'auto';
        el.style.right = `${mmCfg.customOffsetX || 0}px`;
        el.style.top = `${wData.y !== undefined ? wData.y : defaultY}px`;
        el.style.bottom = 'auto';
      } else if (key === 'roshanTimer' && mmCfg.rightSide) {
        const roshanOffset = (mmCfg.extraLarge ? 280 : 244) + 12 + (mmCfg.battlepassOffset ? 40 : 0);
        el.style.left = 'auto';
        el.style.right = `${roshanOffset}px`;
        el.style.top = `${wData.y !== undefined ? wData.y : defaultY}px`;
        el.style.bottom = 'auto';
      } else {
        const x = wData.x !== undefined ? wData.x : defaultX;
        const y = wData.y !== undefined ? wData.y : defaultY;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.style.right = 'auto';
        el.style.bottom = 'auto';
      }

      const isWidgetVisible = wData.visible !== undefined ? Boolean(wData.visible) : true;
      if (el.classList && typeof el.classList.toggle === 'function') {
        el.classList.toggle('widget-hidden-dimmed', isEditMode && !isWidgetVisible);
      }
    });

    // Update scene switcher tabs active state
    if (toolbarSceneTabsEl && toolbarSceneTabsEl.querySelectorAll) {
      const tabs = toolbarSceneTabsEl.querySelectorAll('.scene-tab-btn');
      tabs.forEach((tab) => {
        const s = tab.getAttribute('data-scene');
        if (tab.classList) tab.classList.toggle('active', s === activeScene);
      });
    }

    // Toggle Auto-Align Aegis button visibility
    if (toolbarBtnAlignAegis) {
      toolbarBtnAlignAegis.style.display = (isEditMode && activeScene === 'in_game') ? 'inline-flex' : 'none';
    }

    // ========================================================================
    // A. Top-Bar Stream MMR & Win/Loss Tracker / In-Game HUD Rank Widget
    // ========================================================================
    const mmrCfg = config.mmrTracker || {};
    const mmrWData = sceneWidgets.mmrTracker || {};
    const isMmrVisible = mmrWData.visible !== undefined
      ? Boolean(mmrWData.visible)
      : (activeScene === 'main_menu' ? (mmrCfg.showInMenu !== false) : (activeScene === 'in_game' ? (mmrCfg.showInGame !== false) : false));
    const showMmr = mmrCfg.enabled && isMmrVisible;
    const isMmrInScene = activeKeys.has('mmrTracker');

    setVisible(mmrTrackerEl, isEditMode ? isMmrInScene : (isMmrInScene && showMmr));
    if (showMmr || (isEditMode && isMmrInScene)) {
      const formattedMmr = Number(mmrCfg.currentMmr || 0).toLocaleString('en-US');
      const label = mmrCfg.label || '';
      const wins = mmrCfg.wins || 0;
      const losses = mmrCfg.losses || 0;

      // Opacity styling (80% default or configured value)
      const userOpacity = Number.isFinite(Number(mmrCfg.opacity)) ? Number(mmrCfg.opacity) : 80;
      if (mmrTrackerEl && mmrTrackerEl.style) {
        mmrTrackerEl.style.opacity = `${Math.min(1, Math.max(0.1, userOpacity / 100))}`;
      }

      const isBottomHud = mmrCfg.inGamePosition !== 'top_bar' && activeScene === 'in_game';
      if (isBottomHud) {
        if (mmrTrackerEl) mmrTrackerEl.classList.add('in-game-pos');
      } else {
        if (mmrTrackerEl) mmrTrackerEl.classList.remove('in-game-pos');
      }

      const textKey = `${isBottomHud ? 'bottom' : 'top'}|${label}|${wins}|${losses}|${formattedMmr}`;
      if (mmrTrackerTextEl && mmrTrackerTextEl._lastRenderKey !== textKey) {
        mmrTrackerTextEl._lastRenderKey = textKey;
        if (isBottomHud) {
          mmrTrackerTextEl.textContent = `${wins}W - ${losses}L   ${formattedMmr}`;
          if (typeof document !== 'undefined') {
            mmrTrackerTextEl.innerHTML = `<span class="mmr-record">${wins}<span class="mmr-win-text">W</span> - ${losses}<span class="mmr-loss-text">L</span></span><span class="mmr-val-highlight">${formattedMmr} MMR</span>`;
          }
        } else {
          mmrTrackerTextEl.textContent = `${label} | ${wins}W - ${losses}L | ${formattedMmr} MMR`;
          if (typeof document !== 'undefined') {
            mmrTrackerTextEl.innerHTML = `${label} | <span class="mmr-record">${wins}<span class="mmr-win-text">W</span> - ${losses}<span class="mmr-loss-text">L</span></span> | <span class="mmr-val-highlight">${formattedMmr} MMR</span>`;
          }
        }
      }

      // Rank Icon / Badge Widget
      if (rankBadgeWrapEl) {
        if (mmrCfg.showRankIcon !== false) {
          setVisible(rankBadgeWrapEl, true);
          const rank = mmrCfg.rank || calculateRank(mmrCfg.currentMmr);
          const rankKey = `${rank.tier}|${rank.stars}|${rank.rankName}`;
          if (rankBadgeSvgEl && rankBadgeSvgEl._lastRankKey !== rankKey) {
            rankBadgeSvgEl._lastRankKey = rankKey;
            rankBadgeSvgEl.innerHTML = rank.svg || buildRankSvg(rank);
          }
          if (rankBadgeImgEl) {
            const imgSrc = rank.image || rank.resolvedImage || null;
            if (imgSrc) {
              if (rankBadgeImgEl.getAttribute('data-loaded-src') !== imgSrc) {
                rankBadgeImgEl.src = imgSrc;
                rankBadgeImgEl.setAttribute('data-loaded-src', imgSrc);
              }
              setVisible(rankBadgeImgEl, true);
              if (rankBadgeSvgEl) setVisible(rankBadgeSvgEl, false);
            } else {
              setVisible(rankBadgeImgEl, false);
              rankBadgeImgEl.removeAttribute('data-loaded-src');
              if (rankBadgeSvgEl) setVisible(rankBadgeSvgEl, true);
            }
          }
        } else {
          setVisible(rankBadgeWrapEl, false);
        }
      }
    }

    // ========================================================================
    // B1. Aegis Timer & 10 Slot Timers
    // ========================================================================
    const timersCfg = config.timers || {};
    const aegis = gsiState.aegis || {};
    const showAegis = Boolean(
      timersCfg.aegisEnabled &&
      aegis.active &&
      (aegis.remainingSec === undefined || aegis.remainingSec > 0) &&
      flags.isInGame !== false
    );

    if (activeScene === 'in_game') {
      if (isEditMode) {
        setVisible(aegisAllSlotsEl, true);
        setVisible(aegisTimerEl, false);
        for (let i = 0; i < 10; i++) {
          const slotEl = document.getElementById(`aegis-slot-${i}`);
          const slotKey = `aegisSlot${i}`;
          const slotData = sceneWidgets[slotKey];
          if (slotEl && slotEl.style && slotData) {
            slotEl.style.left = `${slotData.x}px`;
            slotEl.style.top = `${slotData.y}px`;
          }
        }
      } else {
        setVisible(aegisAllSlotsEl, false);
        setVisible(aegisTimerEl, showAegis);
        if (showAegis) {
          const carrierSlot = aegis.carrierSlot ?? timersCfg.defaultHeroSlot ?? 0;
          const customSlotData = sceneWidgets[`aegisSlot${carrierSlot}`];
          const slotLeft = customSlotData && customSlotData.x !== undefined
            ? customSlotData.x
            : getHeroSlotLeftPx(carrierSlot);
          const slotTop = customSlotData && customSlotData.y !== undefined
            ? customSlotData.y
            : 44;

          aegisTimerEl.style.left = `${slotLeft}px`;
          aegisTimerEl.style.top = `${slotTop}px`;
          if (aegisTimeTextEl) {
            aegisTimeTextEl.textContent = aegis.formatted || '5:00';
          }
          if (aegisBarFillEl) {
            aegisBarFillEl.style.width = `${Math.min(100, Math.max(0, aegis.progressPct || 0))}%`;
          }
        }
      }
    } else {
      setVisible(aegisAllSlotsEl, false);
      setVisible(aegisTimerEl, false);
    }

    // ========================================================================
    // B2. Roshan Respawn Timer (Red 11:00->3:00, Yellow 3:00->0:00)
    // ========================================================================
    const roshan = gsiState.roshan || {};
    const showRoshan = Boolean(
      timersCfg.roshanEnabled &&
      roshan.active &&
      (roshan.remainingSec === undefined || roshan.remainingSec > 0) &&
      flags.isInGame !== false
    );
    if (activeScene === 'in_game') {
      const roshanWData = sceneWidgets.roshanTimer || {};
      const isRoshanVisible = roshanWData.visible !== undefined ? Boolean(roshanWData.visible) : true;
      setVisible(roshanTimerEl, isEditMode ? true : (showRoshan && isRoshanVisible));
      if (showRoshan || isEditMode) {
        const isYellow = roshan.color === 'yellow' || roshan.phase === 'window';
        roshanTimerEl.classList.toggle('roshan-yellow', isYellow);
        roshanTimerEl.classList.toggle('roshan-red', !isYellow);

        const eyeColor = isYellow ? '#facc15' : '#ef4444';
        if (roshanEyeLeftEl) roshanEyeLeftEl.setAttribute('fill', eyeColor);
        if (roshanEyeRightEl) roshanEyeRightEl.setAttribute('fill', eyeColor);

        if (roshanTimeTextEl) {
          roshanTimeTextEl.textContent = roshan.formatted || '11:00';
        }
        if (roshanPhaseLabelEl) {
          roshanPhaseLabelEl.textContent = isYellow ? 'MAY RESPAWN' : 'MIN RESPAWN';
        }
        if (roshanSubTextEl) {
          roshanSubTextEl.textContent = isYellow
            ? `Window: ${roshan.formatted}`
            : `Min: ${roshan.minFormatted || '8:00'}`;
        }

        if (roshanRingProgressEl) {
          const pct = Math.min(100, Math.max(0, Number(roshan.progressPct) || 0));
          const dashOffset = RING_CIRCUMFERENCE * (1 - pct / 100);
          roshanRingProgressEl.style.strokeDashoffset = `${dashOffset.toFixed(2)}`;
        }
      }
    } else {
      setVisible(roshanTimerEl, false);
    }

    // ========================================================================
    // C. Queue Blocker (Main Menu Anti-Sniping)
    // ========================================================================
    const qbCfg = config.queueBlocker || {};
    const curGs = gsiState.gameState || (gsiState.map && gsiState.map.game_state);
    const isWaitToLoad = curGs ? String(curGs).trim().toUpperCase() === 'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD' : false;
    if (activeScene === 'main_menu' && (!isWaitToLoad || isEditMode)) {
      const qbWData = sceneWidgets.queueBlocker || {};
      const isQbVisible = qbWData.visible !== undefined ? Boolean(qbWData.visible) : true;
      const showQueueBlocker = Boolean(qbCfg.enabled && isQbVisible && !isWaitToLoad);
      setVisible(queueBlockerEl, isEditMode ? true : showQueueBlocker);
      if (showQueueBlocker || isEditMode) {
        setVisible(queueFindingViewEl, Boolean(qbCfg.showFindingMatch));
        setVisible(queueSolidViewEl, !qbCfg.showFindingMatch);
        if (queueCustomTextEl) {
          queueCustomTextEl.textContent = String(qbCfg.customText || '').slice(0, 45);
        }
      }
    } else {
      setVisible(queueBlockerEl, false);
    }

    // ========================================================================
    // D. Hero Pick Blocker (Draft Phase Anti-Sniping & Independent Masks)
    // ========================================================================
    const hpbCfg = config.heroPickBlocker || {};
    const isDraftScene =
      activeScene === 'drafting_phase' ||
      activeScene === 'draft_own_hero_locked' ||
      isWaitToLoad;
    if (isDraftScene) {
      setVisible(heroPickBlockerEl, true);
      const maskMap = {
        draftRadiantSlots: draftRadiantSlotsEl,
        draftDireSlots: draftDireSlotsEl,
        draftMinimapMask: draftMinimapMaskEl,
        draftChooseHeroMask: draftChooseHeroMaskEl
      };
      for (const [key, el] of Object.entries(maskMap)) {
        if (el) {
          const maskData = sceneWidgets[key] || {};
          const maskVisible = maskData.visible !== undefined ? Boolean(maskData.visible) : true;
          setVisible(el, isEditMode ? true : (hpbCfg.enabled && maskVisible));
        }
      }

      const streamerSlot = hpbCfg.streamerSlot ?? 0;
      let revealedSlot = isWaitToLoad ? null : gsiState.revealedSlot;
      if (isEditMode) {
        revealedSlot = activeScene === 'draft_own_hero_locked' ? streamerSlot : null;
      }

      draftSlotEls.forEach((slotEl) => {
        const idx = Number(slotEl.getAttribute('data-slot'));
        const isRevealed = revealedSlot !== null && revealedSlot !== undefined && idx === revealedSlot;
        slotEl.classList.toggle('slot-revealed', isRevealed);
      });

      if (draftPhaseBadgeEl) {
        if (isWaitToLoad) {
          draftPhaseBadgeEl.textContent = 'CONNECTING — ALL PICKS HIDDEN';
        } else if (gsiState.banningPhase && !isEditMode) {
          draftPhaseBadgeEl.textContent = 'BANNING PHASE — ALL PICKS HIDDEN';
        } else if (revealedSlot !== null && revealedSlot !== undefined) {
          draftPhaseBadgeEl.textContent = `PICKING PHASE — SLOT ${revealedSlot + 1} REVEALED`;
        } else {
          draftPhaseBadgeEl.textContent = 'PICKING PHASE — ALL PICKS HIDDEN';
        }
      }
    } else {
      setVisible(heroPickBlockerEl, false);
    }

    // ========================================================================
    // E. Minimap Ward Blocker (In-Game Anti-Sniping)
    // ========================================================================
    if (activeScene === 'in_game') {
      const mmWData = sceneWidgets.minimapBlocker || {};
      const isMmVisible = mmWData.visible !== undefined ? Boolean(mmWData.visible) : true;
      const isMatchPlay = !flags.isStrategyPhase;
      const showMinimapBlocker = Boolean(mmCfg.enabled && isMmVisible && (isEditMode || isMatchPlay));
      setVisible(minimapBlockerEl, isEditMode ? true : showMinimapBlocker);
      if (showMinimapBlocker || isEditMode) {
        const intensity = Number.isFinite(Number(mmCfg.intensity)) ? Number(mmCfg.intensity) : 75;
        minimapBlockerEl.style.opacity = `${Math.min(1, Math.max(0, intensity / 100))}`;

        const isSimple = mmCfg.style === 'simple';
        const isComplex = mmCfg.style === 'complex';
        const isRealistic = !isSimple && !isComplex;

        setVisible(minimapSvgComplexEl, isComplex);
        setVisible(minimapSvgSimpleEl, isSimple);
        setVisible(minimapImageEl, isRealistic);
      }
    } else {
      setVisible(minimapBlockerEl, false);
    }

    updateBackdrop();

    if (isEditMode) {
      ensureEditModeContent();
      updateAllBadges();
    }
  }

  function clearNonCustomPositions(positions) {
    const posMap = positions || currentCustomPositions || {};
    ['mmrTracker', 'aegisTimer', 'roshanTimer', 'minimapBlocker', 'queueBlocker'].forEach((key) => {
      if (!posMap[key]) {
        const def = DRAGGABLE_WIDGETS.find((w) => w.key === key);
        if (!def) return;
        const el = document.getElementById(def.id);
        if (el && el.style) {
          el.style.left = '';
          el.style.top = '';
          el.style.right = '';
          el.style.bottom = '';
          if (key === 'roshanTimer') {
            el.style.left = '256px';
            el.style.bottom = '145px';
          }
        }
      }
    });
  }

  function applyCustomPositions(positions) {
    if (!positions || typeof positions !== 'object') return;
    DRAGGABLE_WIDGETS.forEach(({ key, id }) => {
      const el = document.getElementById(id);
      if (!el || !el.style) return;
      const pos = positions[key];
      if (pos && Number.isFinite(Number(pos.x)) && Number.isFinite(Number(pos.y))) {
        el.style.left = `${pos.x}px`;
        el.style.top = `${pos.y}px`;
        el.style.right = 'auto';
        el.style.bottom = 'auto';
      }
    });
  }

  function ensureEditModeContent() {
    if (aegisTimeTextEl && (!aegisTimeTextEl.textContent || aegisTimeTextEl.textContent.trim() === '')) {
      aegisTimeTextEl.textContent = '5:00';
    }
    if (roshanTimeTextEl && (!roshanTimeTextEl.textContent || roshanTimeTextEl.textContent.trim() === '')) {
      roshanTimeTextEl.textContent = '11:00';
    }
    if (queueCustomTextEl && (!queueCustomTextEl.textContent || queueCustomTextEl.textContent.trim() === '')) {
      queueCustomTextEl.textContent = 'Ranked match / All pick / SE Asia';
    }
    if (mmrTrackerTextEl && (!mmrTrackerTextEl.textContent || mmrTrackerTextEl.textContent.trim() === '')) {
      mmrTrackerTextEl.textContent = 'STREAM | 0W - 0L | 7,455 MMR';
    }
  }

  function getWidgetCoordinates(el, key) {
    const sceneWidgets = (currentSceneLayouts && currentSceneLayouts[currentActiveScene] && currentSceneLayouts[currentActiveScene].widgets) || {};
    if (el && el.style && el.style.right === 'auto' && el.style.left !== '' && el.style.left !== undefined) {
      const leftPx = parseFloat(el.style.left);
      const topPx = parseFloat(el.style.top);
      if (Number.isFinite(leftPx) && Number.isFinite(topPx)) {
        return { x: Math.round(leftPx), y: Math.round(topPx) };
      }
    }
    const customPos = (currentActiveScene === 'in_game' || (currentActiveScene === 'main_menu' && key === 'queueBlocker'))
      ? (currentCustomPositions && currentCustomPositions[key])
      : null;
    if (customPos && Number.isFinite(customPos.x) && Number.isFinite(customPos.y)) {
      return { x: Math.round(customPos.x), y: Math.round(customPos.y) };
    }
    if (sceneWidgets[key] && Number.isFinite(sceneWidgets[key].x) && Number.isFinite(sceneWidgets[key].y)) {
      return { x: Math.round(sceneWidgets[key].x), y: Math.round(sceneWidgets[key].y) };
    }
    if (el && viewport && typeof el.getBoundingClientRect === 'function' && typeof viewport.getBoundingClientRect === 'function') {
      const elRect = el.getBoundingClientRect();
      const vpRect = viewport.getBoundingClientRect();
      if (vpRect && vpRect.width > 0 && vpRect.height > 0) {
        return {
          x: Math.round((elRect.left - vpRect.left) * (1920 / vpRect.width)),
          y: Math.round((elRect.top - vpRect.top) * (1080 / vpRect.height))
        };
      }
    }
    const sceneDef = (SCENE_WIDGET_DEFS[currentActiveScene] || []).find((w) => w.key === key);
    if (sceneDef) return { x: sceneDef.defaultX, y: sceneDef.defaultY };
    const def = DRAGGABLE_WIDGETS.find((w) => w.key === key);
    return { x: def ? def.defaultX : 0, y: def ? def.defaultY : 0 };
  }

  function toggleWidgetVisibility(key) {
    if (!currentSceneLayouts[currentActiveScene]) {
      currentSceneLayouts[currentActiveScene] = {
        backdrop: SCENE_BACKDROPS[currentActiveScene] || '/images/sample_dota_scene.png',
        widgets: {}
      };
    }
    const sceneWidgets = currentSceneLayouts[currentActiveScene].widgets;
    if (!sceneWidgets[key]) {
      const def = (SCENE_WIDGET_DEFS[currentActiveScene] || []).find((w) => w.key === key) || DRAGGABLE_WIDGETS.find((w) => w.key === key);
      sceneWidgets[key] = {
        x: def ? def.defaultX : 0,
        y: def ? def.defaultY : 0,
        visible: false
      };
    } else {
      const currentVis = sceneWidgets[key].visible !== undefined ? Boolean(sceneWidgets[key].visible) : true;
      sceneWidgets[key].visible = !currentVis;
    }

    const isVis = sceneWidgets[key].visible;
    const patch = { widgets: { [key]: { visible: isVis } } };

    if (typeof fetch === 'function') {
      fetch(`/api/scenes/${currentActiveScene}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      }).catch(() => { });
    }

    if (socket && socket.connected) {
      socket.emit('scene:update', { scene: currentActiveScene, ...patch });
    }

    if (latestPayload) {
      if (!latestPayload.config) latestPayload.config = {};
      latestPayload.config.sceneLayouts = currentSceneLayouts;
      renderOverlay(latestPayload);
    } else {
      updateBadgeForWidget(key);
    }
  }

  function updateBadgeForWidget(key) {
    const def = DRAGGABLE_WIDGETS.find((w) => w.key === key);
    if (!def) return;
    const el = document.getElementById(def.id);
    if (!el) return;

    let badge = el.querySelector ? el.querySelector('.widget-label-badge') : null;
    if (!badge && typeof document !== 'undefined' && typeof document.createElement === 'function') {
      badge = document.createElement('span');
      badge.className = 'widget-label-badge';
      badge.id = `badge-${key}`;
      if (typeof el.appendChild === 'function') {
        el.appendChild(badge);
      }
    }

    // Ensure resize handle for resizable widgets
    if (def.resizable) {
      let handle = el.querySelector ? el.querySelector('.widget-resize-handle') : null;
      if (!handle && typeof document !== 'undefined' && typeof document.createElement === 'function') {
        handle = document.createElement('div');
        handle.className = 'widget-resize-handle';
        handle.addEventListener('pointerdown', (e) => onResizePointerDown(e, key, el));
        handle.addEventListener('mousedown', (e) => onResizePointerDown(e, key, el));
        if (typeof el.appendChild === 'function') {
          el.appendChild(handle);
        }
      }
    }

    const coords = getWidgetCoordinates(el, key);
    if (badge) {
      const sceneLayout = (currentSceneLayouts && currentSceneLayouts[currentActiveScene]) || (DEFAULT_SCENE_LAYOUTS && DEFAULT_SCENE_LAYOUTS[currentActiveScene]) || {};
      const sceneWidgets = sceneLayout.widgets || {};
      const isVisible = sceneWidgets[key] && sceneWidgets[key].visible !== undefined ? Boolean(sceneWidgets[key].visible) : true;
      badge.innerHTML = `${def.label} <span class="widget-badge-coords">(X: ${coords.x}, Y: ${coords.y})</span> <button type="button" class="widget-visibility-btn" title="${isVisible ? 'Hide widget in this scene' : 'Show widget in this scene'}">${isVisible ? '👁' : '🚫'}</button>`;

      const visBtn = badge.querySelector ? badge.querySelector('.widget-visibility-btn') : null;
      if (visBtn && visBtn.addEventListener) {
        visBtn.addEventListener('click', (e) => {
          if (e.stopPropagation) e.stopPropagation();
          toggleWidgetVisibility(key);
        });
      }

      if (badge.classList && typeof badge.classList.toggle === 'function') {
        badge.classList.toggle('badge-bottom', coords.y < 32);
        badge.classList.toggle('badge-right', coords.x > 1650);
      }
    }
  }

  function updateAllBadges() {
    const activeWidgets = getActiveSceneWidgets(currentActiveScene);
    activeWidgets.forEach(({ key }) => updateBadgeForWidget(key));
  }

  function selectWidget(key) {
    selectedWidgetKey = key;
    DRAGGABLE_WIDGETS.forEach(({ key: k, id }) => {
      const el = document.getElementById(id);
      if (!el || !el.classList) return;
      if (k === key) {
        el.classList.add('is-selected');
      } else {
        el.classList.remove('is-selected');
      }
    });
  }

  function updateBackdrop() {
    const showBackdrop = Boolean(isEditMode || isHudGuideVisible);
    if (viewport && viewport.classList) {
      viewport.classList.toggle('has-reference-backdrop', showBackdrop);
      viewport.classList.toggle('hud-guide-active', isHudGuideVisible);

      SCENE_DEFINITIONS.forEach((s) => {
        viewport.classList.remove(`scene-${s}`);
      });
      viewport.classList.add(`scene-${currentActiveScene}`);

      if (showBackdrop) {
        const bgUrl = SCENE_BACKDROPS[currentActiveScene] || '/images/sample_dota_scene.png';
        viewport.style.backgroundImage = `url('${bgUrl}')`;
      } else {
        viewport.style.backgroundImage = 'none';
      }
    }
  }

  function switchScene(sceneName, isManual = true) {
    if (activeDrag || activeResize) {
      onPointerUp();
    }
    if (!SCENE_BACKDROPS[sceneName]) return;
    currentActiveScene = sceneName;
    if (isManual) {
      manualSelectedScene = sceneName;
    }
    updateBackdrop();

    if (toolbarSceneTabsEl && toolbarSceneTabsEl.querySelectorAll) {
      const tabs = toolbarSceneTabsEl.querySelectorAll('.scene-tab-btn');
      tabs.forEach((tab) => {
        const s = tab.getAttribute('data-scene');
        if (tab.classList) tab.classList.toggle('active', s === sceneName);
      });
    }

    if (toolbarBtnAlignAegis) {
      toolbarBtnAlignAegis.style.display = (isEditMode && currentActiveScene === 'in_game') ? 'inline-flex' : 'none';
    }

    if (latestPayload) {
      renderOverlay(latestPayload);
    }
    if (isEditMode) {
      setEditMode(true);
    }

    if (isManual && typeof window !== 'undefined' && window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({ type: 'SCENE_CHANGED', scene: currentActiveScene }, '*');
      } catch (_) { }
    }
  }

  function setEditMode(active) {
    isEditMode = Boolean(active);
    if (viewport && viewport.classList) {
      if (isEditMode) {
        viewport.classList.add('edit-mode-active');
      } else {
        viewport.classList.remove('edit-mode-active');
      }
    }
    updateBackdrop();

    if (toolbarBtnEdit) {
      if (toolbarBtnEdit.classList) {
        toolbarBtnEdit.classList.toggle('toolbar-btn-active', isEditMode);
      }
      toolbarBtnEdit.textContent = isEditMode ? '✓ Done Editing' : '✏️ Edit Layout';
    }

    if (toolbarBtnAlignAegis) {
      toolbarBtnAlignAegis.style.display = (isEditMode && currentActiveScene === 'in_game') ? 'inline-flex' : 'none';
    }

    if (toolbarStatusText) {
      toolbarStatusText.textContent = isEditMode
        ? 'Drag widgets | Resize handles | Arrows: 1px'
        : 'Overlay Ready';
    }

    const activeSceneWidgets = getActiveSceneWidgets(currentActiveScene);
    const activeKeys = new Set(activeSceneWidgets.map((w) => w.key));

    DRAGGABLE_WIDGETS.forEach(({ key, id }) => {
      const el = document.getElementById(id);
      if (!el || !el.classList) return;
      if (isEditMode && activeKeys.has(key)) {
        el.classList.add('edit-widget-active');
        updateBadgeForWidget(key);
      } else {
        el.classList.remove('edit-widget-active', 'is-selected', 'is-dragging');
        const badge = el.querySelector ? el.querySelector('.widget-label-badge') : null;
        if (badge && typeof badge.remove === 'function') {
          badge.remove();
        }
      }
    });

    if (isEditMode) {
      ensureEditModeContent();
      if (!selectedWidgetKey) {
        selectWidget(activeSceneWidgets[0] ? activeSceneWidgets[0].key : 'mmrTracker');
      }
    } else if (latestPayload) {
      renderOverlay(latestPayload);
    }

    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({ type: 'EDIT_MODE_CHANGED', editMode: isEditMode }, '*');
      } catch (_) { }
    }
  }

  function toggleHudGuide(forceState) {
    isHudGuideVisible = forceState !== undefined ? Boolean(forceState) : !isHudGuideVisible;
    if (hudGuideEl) {
      setVisible(hudGuideEl, isHudGuideVisible);
    }
    if (toolbarBtnGuide) {
      if (toolbarBtnGuide.classList) {
        toolbarBtnGuide.classList.toggle('toolbar-btn-active', isHudGuideVisible);
      }
      toolbarBtnGuide.textContent = isHudGuideVisible ? '🗺️ HUD Guide: ON' : '🗺️ HUD Guide';
    }
    updateBackdrop();
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({ type: 'HUD_GUIDE_CHANGED', hudGuide: isHudGuideVisible }, '*');
      } catch (_) { }
    }
  }

  let saveTimer = null;
  function debouncedSavePosition(key, x, y) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveWidgetPosition(key, x, y);
    }, 150);
  }

  function saveWidgetPosition(key, x, y) {
    if (!currentSceneLayouts[currentActiveScene]) {
      currentSceneLayouts[currentActiveScene] = { backdrop: SCENE_BACKDROPS[currentActiveScene], widgets: {} };
    }
    const def = (SCENE_WIDGET_DEFS[currentActiveScene] || []).find((w) => w.key === key) || DRAGGABLE_WIDGETS.find((w) => w.key === key);
    const el = def ? document.getElementById(def.id) : null;
    const curW = el && el.offsetWidth ? el.offsetWidth : (def ? def.defaultWidth : 100);
    const curH = el && el.offsetHeight ? el.offsetHeight : (def ? def.defaultHeight : 40);

    if (!currentSceneLayouts[currentActiveScene].widgets[key]) {
      currentSceneLayouts[currentActiveScene].widgets[key] = { x, y, width: curW, height: curH, visible: true };
    } else {
      currentSceneLayouts[currentActiveScene].widgets[key].x = x;
      currentSceneLayouts[currentActiveScene].widgets[key].y = y;
      if (currentSceneLayouts[currentActiveScene].widgets[key].width === undefined) {
        currentSceneLayouts[currentActiveScene].widgets[key].width = curW;
      }
      if (currentSceneLayouts[currentActiveScene].widgets[key].height === undefined) {
        currentSceneLayouts[currentActiveScene].widgets[key].height = curH;
      }
    }

    // Only sync legacy customPositions for in_game widgets or main_menu queueBlocker
    const shouldSyncLegacy =
      (currentActiveScene === 'in_game' && ['mmrTracker', 'roshanTimer', 'minimapBlocker'].includes(key)) ||
      (currentActiveScene === 'main_menu' && key === 'queueBlocker');

    if (shouldSyncLegacy) {
      currentCustomPositions[key] = { x, y };
      const patch = { [key]: { x, y } };
      if (typeof fetch === 'function') {
        fetch('/api/positions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch)
        }).catch(() => { });
      }
      if (socket && socket.connected) {
        socket.emit('positions:update', patch);
      }
    }

    if (typeof fetch === 'function') {
      fetch(`/api/scenes/${currentActiveScene}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widgets: { [key]: { x, y } } })
      }).catch(() => { });
    }

    if (socket && socket.connected) {
      socket.emit('scene:update', { scene: currentActiveScene, widgets: { [key]: { x, y } } });
    }
  }

  function saveWidgetDimensions(key, width, height) {
    if (!currentSceneLayouts[currentActiveScene]) {
      currentSceneLayouts[currentActiveScene] = { backdrop: SCENE_BACKDROPS[currentActiveScene], widgets: {} };
    }
    const def = (SCENE_WIDGET_DEFS[currentActiveScene] || []).find((w) => w.key === key) || DRAGGABLE_WIDGETS.find((w) => w.key === key);
    const el = def ? document.getElementById(def.id) : null;
    const coords = el ? getWidgetCoordinates(el, key) : { x: def ? def.defaultX : 0, y: def ? def.defaultY : 0 };

    if (!currentSceneLayouts[currentActiveScene].widgets[key]) {
      currentSceneLayouts[currentActiveScene].widgets[key] = { x: coords.x, y: coords.y, width, height, visible: true };
    } else {
      currentSceneLayouts[currentActiveScene].widgets[key].width = width;
      currentSceneLayouts[currentActiveScene].widgets[key].height = height;
      if (currentSceneLayouts[currentActiveScene].widgets[key].x === undefined) {
        currentSceneLayouts[currentActiveScene].widgets[key].x = coords.x;
      }
      if (currentSceneLayouts[currentActiveScene].widgets[key].y === undefined) {
        currentSceneLayouts[currentActiveScene].widgets[key].y = coords.y;
      }
    }

    if (typeof fetch === 'function') {
      fetch(`/api/scenes/${currentActiveScene}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widgets: { [key]: { width, height } } })
      }).catch(() => { });
    }
    if (socket && socket.connected) {
      socket.emit('scene:update', { scene: currentActiveScene, widgets: { [key]: { width, height } } });
    }
  }

  function autoAlignAegisSlots() {
    if (!currentSceneLayouts || !currentSceneLayouts.in_game) {
      currentSceneLayouts.in_game = { backdrop: SCENE_BACKDROPS.in_game, widgets: {} };
    }
    const inGameWidgets = currentSceneLayouts.in_game.widgets;
    const s0 = inGameWidgets.aegisSlot0 || { x: 550, y: 44 };
    const s4 = inGameWidgets.aegisSlot4 || { x: 806, y: 44 };
    for (let i = 0; i < 5; i++) {
      const x = Math.round(s0.x + (i / 4) * (s4.x - s0.x));
      const y = s0.y;
      inGameWidgets[`aegisSlot${i}`] = { ...(inGameWidgets[`aegisSlot${i}`] || {}), x, y, width: 60, height: 46, visible: true };
      const el = document.getElementById(`aegis-slot-${i}`);
      if (el && el.style) {
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
      }
    }

    const s5 = inGameWidgets.aegisSlot5 || { x: 1104, y: 44 };
    const s9 = inGameWidgets.aegisSlot9 || { x: 1352, y: 44 };
    for (let i = 0; i < 5; i++) {
      const s = 5 + i;
      const x = Math.round(s5.x + (i / 4) * (s9.x - s5.x));
      const y = s5.y;
      inGameWidgets[`aegisSlot${s}`] = { ...(inGameWidgets[`aegisSlot${s}`] || {}), x, y, width: 60, height: 46, visible: true };
      const el = document.getElementById(`aegis-slot-${s}`);
      if (el && el.style) {
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
      }
    }

    if (toolbarStatusText) toolbarStatusText.textContent = 'Aegis slots auto-aligned & saved';
    if (socket && socket.connected) {
      socket.emit('scene:align-aegis');
    }
    if (typeof fetch === 'function') {
      fetch('/api/scenes/align-aegis', { method: 'POST' }).catch(() => { });
    }
    updateAllBadges();
  }

  function resetPositionsToDefault() {
    if (DEFAULT_SCENE_LAYOUTS && DEFAULT_SCENE_LAYOUTS[currentActiveScene]) {
      currentSceneLayouts[currentActiveScene] = JSON.parse(JSON.stringify(DEFAULT_SCENE_LAYOUTS[currentActiveScene]));
    }
    if (currentActiveScene === 'in_game') {
      currentCustomPositions.mmrTracker = null;
      currentCustomPositions.aegisTimer = null;
      currentCustomPositions.roshanTimer = null;
      currentCustomPositions.minimapBlocker = null;
    } else if (currentActiveScene === 'main_menu') {
      currentCustomPositions.queueBlocker = null;
    }

    if (overlayEditToolbarEl) {
      overlayEditToolbarEl.style.left = '';
      overlayEditToolbarEl.style.top = '';
      overlayEditToolbarEl.style.right = '';
      overlayEditToolbarEl.style.bottom = '';
      overlayEditToolbarEl.style.transform = '';
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('dotabuddy_toolbar_pos');
        }
      } catch (_) { }
      updateDockButtonLabel();
    }

    if (latestPayload) {
      if (!latestPayload.config) latestPayload.config = {};
      latestPayload.config.customPositions = currentCustomPositions;
      latestPayload.config.sceneLayouts = currentSceneLayouts;
      renderOverlay(latestPayload);
    }
    if (isEditMode) {
      updateAllBadges();
    }
    if (socket && socket.connected) {
      if (currentActiveScene === 'in_game' || currentActiveScene === 'main_menu') {
        socket.emit('positions:reset', {});
      }
      socket.emit('scene:reset', { scene: currentActiveScene });
    }
    if (typeof fetch === 'function') {
      if (currentActiveScene === 'in_game' || currentActiveScene === 'main_menu') {
        fetch('/api/positions/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        }).catch(() => { });
      }
      fetch('/api/scenes/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene: currentActiveScene })
      }).catch(() => { });
    }
  }

  // Keyboard Nudging Handler
  function handleNudgeKey(keyName, shiftKey) {
    if (!isEditMode || !selectedWidgetKey) return false;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(keyName)) return false;

    const def = DRAGGABLE_WIDGETS.find((w) => w.key === selectedWidgetKey);
    if (!def) return false;
    const el = document.getElementById(def.id);
    if (!el || !el.style) return false;

    const coords = getWidgetCoordinates(el, selectedWidgetKey);
    let { x, y } = coords;
    const step = shiftKey ? 10 : 1;
    const w = el.offsetWidth || def.defaultWidth || 100;
    const h = el.offsetHeight || def.defaultHeight || 40;

    if (keyName === 'ArrowUp') y = Math.max(0, y - step);
    else if (keyName === 'ArrowDown') y = Math.min(1080 - h, y + step);
    else if (keyName === 'ArrowLeft') x = Math.max(0, x - step);
    else if (keyName === 'ArrowRight') x = Math.min(1920 - w, x + step);

    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';

    currentCustomPositions[selectedWidgetKey] = { x, y };

    let badge = el.querySelector ? el.querySelector('.widget-label-badge') : null;
    if (badge) {
      badge.innerHTML = `${def.label} <span class="widget-badge-coords">(X: ${x}, Y: ${y})</span>`;
      if (badge.classList && typeof badge.classList.toggle === 'function') {
        badge.classList.toggle('badge-bottom', y < 32);
        badge.classList.toggle('badge-right', x > 1650);
      }
    }

    debouncedSavePosition(selectedWidgetKey, x, y);
    return true;
  }

  // Toolbar Draggable & Docking Logic
  let toolbarActiveDrag = null;
  let suppressToolbarClick = false;

  function clampToolbarCoordinates(x, y, width, height) {
    const rawX = Number(x);
    const rawY = Number(y);
    const validX = Number.isFinite(rawX) ? rawX : 0;
    const validY = Number.isFinite(rawY) ? rawY : 0;
    const w = width || (overlayEditToolbarEl && overlayEditToolbarEl.offsetWidth) || 780;
    const h = height || (overlayEditToolbarEl && overlayEditToolbarEl.offsetHeight) || 38;
    const maxX = Math.max(0, 1920 - w);
    const maxY = Math.max(0, 1080 - h);
    const clampedX = Math.round(Math.max(0, Math.min(maxX, validX)));
    const clampedY = Math.round(Math.max(0, Math.min(maxY, validY)));
    return { x: clampedX, y: clampedY };
  }

  function getToolbarCoordinates() {
    if (!overlayEditToolbarEl) return { x: 570, y: 10 };
    const leftStyle = parseFloat(overlayEditToolbarEl.style.left);
    const topStyle = parseFloat(overlayEditToolbarEl.style.top);
    if (Number.isFinite(leftStyle) && Number.isFinite(topStyle)) {
      return { x: leftStyle, y: topStyle };
    }
    const vpRect = viewport && viewport.getBoundingClientRect ? viewport.getBoundingClientRect() : null;
    const tbRect = overlayEditToolbarEl.getBoundingClientRect ? overlayEditToolbarEl.getBoundingClientRect() : null;
    if (vpRect && tbRect && vpRect.width > 0 && vpRect.height > 0) {
      const scaleX = vpRect.width / 1920;
      const scaleY = vpRect.height / 1080;
      const x = Math.round((tbRect.left - vpRect.left) / scaleX);
      const y = Math.round((tbRect.top - vpRect.top) / scaleY);
      const w = overlayEditToolbarEl.offsetWidth || Math.round(tbRect.width / scaleX) || 780;
      const h = overlayEditToolbarEl.offsetHeight || Math.round(tbRect.height / scaleY) || 38;
      return clampToolbarCoordinates(x, y, w, h);
    }
    if (typeof overlayEditToolbarEl.offsetLeft === 'number' && typeof overlayEditToolbarEl.offsetTop === 'number') {
      return clampToolbarCoordinates(overlayEditToolbarEl.offsetLeft, overlayEditToolbarEl.offsetTop);
    }
    return { x: 570, y: 10 };
  }

  function updateDockButtonLabel() {
    if (!toolbarBtnDock) return;
    const coords = getToolbarCoordinates();
    const isBottom = coords.y > 540;
    toolbarBtnDock.textContent = isBottom ? '⬆ Dock to Top' : '⬇ Dock to Bottom';
    toolbarBtnDock.title = isBottom ? 'Dock toolbar to Top' : 'Dock toolbar to Bottom';
  }

  function setToolbarPosition(x, y, shouldSave = false) {
    if (!overlayEditToolbarEl) return;
    const clamped = clampToolbarCoordinates(x, y);
    overlayEditToolbarEl.style.left = `${clamped.x}px`;
    overlayEditToolbarEl.style.top = `${clamped.y}px`;
    overlayEditToolbarEl.style.right = 'auto';
    overlayEditToolbarEl.style.bottom = 'auto';
    overlayEditToolbarEl.style.transform = 'none';
    updateDockButtonLabel();
    if (shouldSave) {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('dotabuddy_toolbar_pos', JSON.stringify(clamped));
        }
      } catch (_) { }
    }
  }

  function toggleToolbarDock() {
    if (!overlayEditToolbarEl) return;
    const coords = getToolbarCoordinates();
    const width = (overlayEditToolbarEl.offsetWidth && overlayEditToolbarEl.offsetWidth > 50) ? overlayEditToolbarEl.offsetWidth : 780;
    const height = (overlayEditToolbarEl.offsetHeight && overlayEditToolbarEl.offsetHeight > 10) ? overlayEditToolbarEl.offsetHeight : 38;
    const isCurrentlyBottom = coords.y > 540;
    const targetY = isCurrentlyBottom ? 10 : Math.max(0, 1080 - height - 12);
    const currentX = Number.isFinite(coords.x) ? coords.x : 570;
    const targetX = Math.round(Math.max(0, Math.min(1920 - width, currentX)));
    setToolbarPosition(targetX, targetY);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('dotabuddy_toolbar_pos', JSON.stringify({ x: targetX, y: targetY }));
      }
    } catch (_) { }
  }

  function onToolbarPointerDown(e) {
    if (!overlayEditToolbarEl) return;
    if (e.button !== undefined && e.button !== 0) return;
    // If clicked on an interactive control (button, input, select, link), don't initiate toolbar drag
    if (e.target && typeof e.target.closest === 'function' && e.target.closest('button, a, input, select')) {
      return;
    }
    if (e.stopPropagation) e.stopPropagation();

    const vpRect = viewport && viewport.getBoundingClientRect ? viewport.getBoundingClientRect() : { width: 1920, height: 1080, left: 0, top: 0 };
    const scaleX = (vpRect && vpRect.width ? vpRect.width / 1920 : 1) || 1;
    const scaleY = (vpRect && vpRect.height ? vpRect.height / 1080 : 1) || 1;

    const currentCoords = getToolbarCoordinates();
    const width = (overlayEditToolbarEl.offsetWidth && overlayEditToolbarEl.offsetWidth > 50) ? overlayEditToolbarEl.offsetWidth : 780;
    const height = (overlayEditToolbarEl.offsetHeight && overlayEditToolbarEl.offsetHeight > 10) ? overlayEditToolbarEl.offsetHeight : 38;

    if (overlayEditToolbarEl.setPointerCapture && e.pointerId !== undefined) {
      try {
        overlayEditToolbarEl.setPointerCapture(e.pointerId);
      } catch (_) { }
    }

    toolbarActiveDrag = {
      pointerId: e.pointerId,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      initialX: currentCoords.x,
      initialY: currentCoords.y,
      width,
      height,
      scaleX,
      scaleY,
      hasMoved: false
    };

    if (overlayEditToolbarEl.classList && typeof overlayEditToolbarEl.classList.add === 'function') {
      overlayEditToolbarEl.classList.add('is-dragging');
    }
    if (typeof document !== 'undefined' && document.body && document.body.classList && typeof document.body.classList.add === 'function') {
      document.body.classList.add('toolbar-dragging-active');
    }
  }

  // Pointer Drag & Drop Handlers
  let activeDrag = null;
  let activeResize = null;

  function onResizePointerDown(e, key, el) {
    if (!isEditMode) return;
    if (e.stopPropagation) e.stopPropagation();
    if (e.preventDefault) e.preventDefault();

    const vpRect = viewport && viewport.getBoundingClientRect ? viewport.getBoundingClientRect() : { width: 1920, height: 1080 };
    const scaleX = (vpRect && vpRect.width ? vpRect.width / 1920 : 1) || 1;
    const scaleY = (vpRect && vpRect.height ? vpRect.height / 1080 : 1) || 1;

    activeResize = {
      key,
      el,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startWidth: el.offsetWidth || 100,
      startHeight: el.offsetHeight || 50,
      scaleX,
      scaleY
    };
  }

  function onPointerDown(e, key) {
    if (!isEditMode) return;
    if (e.button !== undefined && e.button !== 0) return;
    if (e.stopPropagation) e.stopPropagation();

    selectWidget(key);

    const def = DRAGGABLE_WIDGETS.find((w) => w.key === key);
    if (!def) return;
    const el = document.getElementById(def.id);
    if (!el || !viewport) return;

    if (el.setPointerCapture && e.pointerId !== undefined) {
      try {
        el.setPointerCapture(e.pointerId);
      } catch (_) { }
    }

    const startCoords = getWidgetCoordinates(el, key);
    const vpRect = viewport.getBoundingClientRect ? viewport.getBoundingClientRect() : { width: 1920, height: 1080 };
    const scaleX = (vpRect && vpRect.width ? vpRect.width / 1920 : 1) || 1;
    const scaleY = (vpRect && vpRect.height ? vpRect.height / 1080 : 1) || 1;

    activeDrag = {
      key,
      el,
      label: def.label,
      pointerId: e.pointerId,
      hasMoved: false,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      initialCanvasX: startCoords.x,
      initialCanvasY: startCoords.y,
      scaleX,
      scaleY,
      width: el.offsetWidth || def.defaultWidth || 100,
      height: el.offsetHeight || def.defaultHeight || 40
    };

    if (el.classList && typeof el.classList.add === 'function') {
      el.classList.add('is-dragging');
    }
  }

  function onPointerMove(e) {
    if (toolbarActiveDrag) {
      if (e.preventDefault) e.preventDefault();
      const { startPointerX, startPointerY, initialX, initialY, scaleX, scaleY, width, height } = toolbarActiveDrag;
      const deltaPointerX = e.clientX - startPointerX;
      const deltaPointerY = e.clientY - startPointerY;
      if (Math.abs(deltaPointerX) > 2 || Math.abs(deltaPointerY) > 2) {
        toolbarActiveDrag.hasMoved = true;
      }
      const deltaCanvasX = deltaPointerX / scaleX;
      const deltaCanvasY = deltaPointerY / scaleY;

      const clamped = clampToolbarCoordinates(initialX + deltaCanvasX, initialY + deltaCanvasY, width, height);

      if (overlayEditToolbarEl) {
        overlayEditToolbarEl.style.left = `${clamped.x}px`;
        overlayEditToolbarEl.style.top = `${clamped.y}px`;
        overlayEditToolbarEl.style.right = 'auto';
        overlayEditToolbarEl.style.bottom = 'auto';
        overlayEditToolbarEl.style.transform = 'none';
      }
      updateDockButtonLabel();
      return;
    }

    if (activeResize) {
      if (e.preventDefault) e.preventDefault();
      const { key, el, startPointerX, startPointerY, startWidth, startHeight, scaleX, scaleY } = activeResize;
      const currentCoords = getWidgetCoordinates(el, key);
      const deltaW = (e.clientX - startPointerX) / scaleX;
      const deltaH = (e.clientY - startPointerY) / scaleY;
      const maxW = Math.max(30, 1920 - currentCoords.x);
      const maxH = Math.max(20, 1080 - currentCoords.y);
      const newW = Math.max(30, Math.min(maxW, Math.round(startWidth + deltaW)));
      const newH = Math.max(20, Math.min(maxH, Math.round(startHeight + deltaH)));
      el.style.width = `${newW}px`;
      el.style.height = `${newH}px`;
      return;
    }

    if (!activeDrag) return;
    if (e.preventDefault) e.preventDefault();

    activeDrag.hasMoved = true;
    const { key, el, label, startPointerX, startPointerY, initialCanvasX, initialCanvasY, scaleX, scaleY, width, height } = activeDrag;

    const deltaCanvasX = (e.clientX - startPointerX) / scaleX;
    const deltaCanvasY = (e.clientY - startPointerY) / scaleY;

    const newX = Math.round(Math.max(0, Math.min(1920 - width, initialCanvasX + deltaCanvasX)));
    const newY = Math.round(Math.max(0, Math.min(1080 - height, initialCanvasY + deltaCanvasY)));

    el.style.left = `${newX}px`;
    el.style.top = `${newY}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';

    const shouldSyncLegacy =
      (currentActiveScene === 'in_game' && ['mmrTracker', 'roshanTimer', 'minimapBlocker'].includes(key)) ||
      (currentActiveScene === 'main_menu' && key === 'queueBlocker');
    if (shouldSyncLegacy) {
      currentCustomPositions[key] = { x: newX, y: newY };
    }

    let badge = el.querySelector ? el.querySelector('.widget-label-badge') : null;
    if (badge) {
      badge.innerHTML = `${label} <span class="widget-badge-coords">(X: ${newX}, Y: ${newY})</span>`;
      if (badge.classList && typeof badge.classList.toggle === 'function') {
        badge.classList.toggle('badge-bottom', newY < 32);
        badge.classList.toggle('badge-right', newX > 1650);
      }
    }
  }

  function onPointerUp(e) {
    if (toolbarActiveDrag) {
      const { pointerId, hasMoved } = toolbarActiveDrag;
      if (overlayEditToolbarEl) {
        if (overlayEditToolbarEl.releasePointerCapture && pointerId !== undefined) {
          try {
            overlayEditToolbarEl.releasePointerCapture(pointerId);
          } catch (_) { }
        }
        if (overlayEditToolbarEl.classList && typeof overlayEditToolbarEl.classList.remove === 'function') {
          overlayEditToolbarEl.classList.remove('is-dragging');
        }
      }
      if (typeof document !== 'undefined' && document.body && document.body.classList && typeof document.body.classList.remove === 'function') {
        document.body.classList.remove('toolbar-dragging-active');
      }
      toolbarActiveDrag = null;
      if (hasMoved) {
        suppressToolbarClick = true;
        setTimeout(() => {
          suppressToolbarClick = false;
        }, 120);

        const finalCoords = getToolbarCoordinates();
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('dotabuddy_toolbar_pos', JSON.stringify(finalCoords));
          }
        } catch (_) { }
      }
      updateDockButtonLabel();
      return;
    }

    if (activeResize) {
      const { key, el } = activeResize;
      const width = el.offsetWidth || 100;
      const height = el.offsetHeight || 50;
      activeResize = null;
      saveWidgetDimensions(key, width, height);
      return;
    }

    if (!activeDrag) return;
    const { key, el, pointerId, hasMoved } = activeDrag;
    if (el && el.releasePointerCapture && pointerId !== undefined) {
      try {
        el.releasePointerCapture(pointerId);
      } catch (_) { }
    }
    if (el && el.classList && typeof el.classList.remove === 'function') {
      el.classList.remove('is-dragging');
    }
    const finalCoords = getWidgetCoordinates(el, key);
    activeDrag = null;
    if (hasMoved || (currentCustomPositions[key] && Number.isFinite(currentCustomPositions[key].x))) {
      saveWidgetPosition(key, finalCoords.x, finalCoords.y);
    }
  }

  // Bind widget drag events
  DRAGGABLE_WIDGETS.forEach(({ key, id }) => {
    const el = document.getElementById(id);
    if (!el || !el.addEventListener) return;
    if (typeof window !== 'undefined' && 'PointerEvent' in window) {
      el.addEventListener('pointerdown', (e) => onPointerDown(e, key));
    } else {
      el.addEventListener('mousedown', (e) => onPointerDown(e, key));
    }
  });

  // Global window listeners for drag movement & keyboard nudging
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('keydown', (e) => {
      if (handleNudgeKey(e.key, e.shiftKey)) {
        if (e.preventDefault) e.preventDefault();
      }
    });
    if ('PointerEvent' in window) {
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    } else {
      window.addEventListener('mousemove', onPointerMove);
      window.addEventListener('mouseup', onPointerUp);
    }
  }

  // Floating toolbar drag listener
  if (overlayEditToolbarEl && overlayEditToolbarEl.addEventListener) {
    if (typeof window !== 'undefined' && 'PointerEvent' in window) {
      overlayEditToolbarEl.addEventListener('pointerdown', onToolbarPointerDown);
    } else {
      overlayEditToolbarEl.addEventListener('mousedown', onToolbarPointerDown);
    }

    // Suppress accidental click events on toolbar buttons after dragging
    overlayEditToolbarEl.addEventListener(
      'click',
      (e) => {
        if (suppressToolbarClick) {
          if (e.stopPropagation) e.stopPropagation();
          if (e.preventDefault) e.preventDefault();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          suppressToolbarClick = false;
        }
      },
      true
    );
  }

  // Floating toolbar buttons
  if (toolbarBtnEdit) {
    toolbarBtnEdit.addEventListener('click', () => setEditMode(!isEditMode));
  }
  if (toolbarBtnGuide) {
    toolbarBtnGuide.addEventListener('click', () => toggleHudGuide());
  }
  if (toolbarBtnReset) {
    toolbarBtnReset.addEventListener('click', () => resetPositionsToDefault());
  }
  if (toolbarBtnDock) {
    toolbarBtnDock.addEventListener('click', () => toggleToolbarDock());
  }
  if (toolbarBtnAlignAegis) {
    toolbarBtnAlignAegis.addEventListener('click', () => autoAlignAegisSlots());
  }

  // Restore saved toolbar position from localStorage if available
  try {
    if (typeof localStorage !== 'undefined') {
      const savedPos = localStorage.getItem('dotabuddy_toolbar_pos');
      if (savedPos) {
        const parsed = JSON.parse(savedPos);
        if (parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
          setToolbarPosition(parsed.x, parsed.y);
        }
      }
    }
  } catch (_) { }
  updateDockButtonLabel();

  // Scene tabs in floating toolbar
  if (toolbarSceneTabsEl && toolbarSceneTabsEl.querySelectorAll) {
    const btns = toolbarSceneTabsEl.querySelectorAll('.scene-tab-btn');
    btns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetScene = btn.getAttribute('data-scene');
        if (targetScene) switchScene(targetScene, true);
      });
    });
  }

  // Expose global methods for Dashboard iframe communication
  if (typeof window !== 'undefined') {
    window.setEditMode = setEditMode;
    window.toggleEditMode = () => setEditMode(!isEditMode);
    window.resetWidgetPositions = resetPositionsToDefault;
    window.toggleHudGuide = toggleHudGuide;
    window.toggleToolbarDock = toggleToolbarDock;
    window.setToolbarPosition = setToolbarPosition;
    window.getToolbarCoordinates = getToolbarCoordinates;
    window.nudgeSelectedWidget = handleNudgeKey;
    window.switchScene = (s) => switchScene(s, true);
    window.setScene = (s) => switchScene(s, true);
    window.autoAlignAegisSlots = autoAlignAegisSlots;
    window.toggleWidgetVisibility = toggleWidgetVisibility;
    window.renderOverlay = renderOverlay;
    window.handleStateUpdate = renderOverlay;
    window.resolveCurrentSceneKey = resolveCurrentSceneKey;
    window.SCENE_DEFINITIONS = SCENE_DEFINITIONS;
    window.SCENE_BACKDROPS = SCENE_BACKDROPS;
    window.SCENE_WIDGET_DEFS = SCENE_WIDGET_DEFS;

    if (window.addEventListener) {
      window.addEventListener('message', (ev) => {
        if (!ev || !ev.data || typeof ev.data !== 'object') return;
        if (ev.data.type === 'SET_EDIT_MODE') {
          setEditMode(Boolean(ev.data.editMode));
        } else if (ev.data.type === 'RESET_POSITIONS') {
          resetPositionsToDefault();
        } else if (ev.data.type === 'TOGGLE_HUD_GUIDE') {
          toggleHudGuide(ev.data.visible);
        } else if (ev.data.type === 'DOCK_TOOLBAR') {
          toggleToolbarDock();
        } else if (ev.data.type === 'SET_TOOLBAR_POS') {
          if (ev.data.x !== undefined && ev.data.y !== undefined) {
            setToolbarPosition(ev.data.x, ev.data.y);
          }
        } else if (ev.data.type === 'KEY_NUDGE') {
          handleNudgeKey(ev.data.key, ev.data.shiftKey);
        } else if (ev.data.type === 'POINTER_UP') {
          onPointerUp();
        } else if (ev.data.type === 'SET_SCENE') {
          switchScene(ev.data.scene, false);
        } else if (ev.data.type === 'ALIGN_AEGIS') {
          autoAlignAegisSlots();
        } else if (ev.data.type === 'TOGGLE_WIDGET_VISIBILITY') {
          if (ev.data.widgetKey) toggleWidgetVisibility(ev.data.widgetKey);
        }
      });
    }

    // Check ?edit=1 or ?guide=1 query params
    if (window.location && window.location.search) {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('edit') === '1' || params.get('edit') === 'true') {
          setEditMode(true);
        }
        if (params.get('guide') === '1' || params.get('guide') === 'true' || params.get('hud_guide') === '1' || params.get('hud_guide') === 'true') {
          toggleHudGuide(true);
        }
      } catch (_) { }
    }
  }

  updateBackdrop();

  // Initial HTTP fetch so state renders immediately even before WebSocket handshake completes
  if (typeof fetch === 'function') {
    fetch('/api/state')
      .then((r) => r.json())
      .then((data) => renderOverlay(data))
      .catch(() => { });
  }

  // Connect Socket.IO
  const socket = typeof io === 'function' ? io() : null;
  if (socket) {
    socket.on('init', (payload) => renderOverlay(payload));
    socket.on('state:update', (payload) => renderOverlay(payload));
    socket.on('positions:update', (positions) => {
      currentCustomPositions = positions || {};
      clearNonCustomPositions(currentCustomPositions);
      applyCustomPositions(currentCustomPositions);
      if (isEditMode) updateAllBadges();
    });
    socket.on('positions:reset', (positions) => {
      currentCustomPositions = positions || {};
      clearNonCustomPositions(currentCustomPositions);
      applyCustomPositions(currentCustomPositions);
      if (isEditMode) updateAllBadges();
    });
    socket.on('scenes:update', (scenes) => {
      currentSceneLayouts = scenes || {};
      if (latestPayload && latestPayload.config) {
        latestPayload.config.sceneLayouts = currentSceneLayouts;
      }
      if (latestPayload) {
        renderOverlay(latestPayload);
      }
    });
  }
})();
