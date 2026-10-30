(function () {
  const socket = typeof io === 'function' ? io() : null;

  // Header & Status Elements
  const gsiStatusDot = document.getElementById('gsi-status-dot');
  const gsiStatusText = document.getElementById('gsi-status-text');
  const gsiGameStateBadge = document.getElementById('gsi-gamestate-badge');
  const gsiFriendlyStatus = document.getElementById('gsi-friendly-status');
  const gsiFriendlyPhase = document.getElementById('gsi-friendly-phase');
  const obsUrlCode = document.getElementById('obs-url-code');
  const btnCopyObsUrl = document.getElementById('btn-copy-obs-url');
  const simToast = document.getElementById('sim-toast');

  if (obsUrlCode) {
    obsUrlCode.textContent = `${window.location.origin}/overlay`;
  }

  // A. MMR Tracker Controls
  const mmrEnabled = document.getElementById('mmr-enabled');
  const mmrLabel = document.getElementById('mmr-label');
  const mmrStarting = document.getElementById('mmr-starting');
  const mmrCurrent = document.getElementById('mmr-current');
  const mmrStep = document.getElementById('mmr-step');
  const mmrWins = document.getElementById('mmr-wins');
  const mmrLosses = document.getElementById('mmr-losses');
  const mmrShowMenu = document.getElementById('mmr-show-menu');
  const mmrShowIngame = document.getElementById('mmr-show-ingame');
  const mmrAutoGsi = document.getElementById('mmr-auto-gsi');
  const dashMmrPreview = document.getElementById('dash-mmr-preview');
  const dashMmrPreviewBox = document.getElementById('dash-mmr-preview-box');
  const dashRankName = document.getElementById('dash-rank-name');
  const dashRankBracket = document.getElementById('dash-rank-bracket');
  const dashRankBadge = document.getElementById('dash-rank-badge');
  const mmrOpacity = document.getElementById('mmr-opacity');
  const mmrOpacityVal = document.getElementById('mmr-opacity-val');
  const mmrPosition = document.getElementById('mmr-position');
  const btnMmrWin = document.getElementById('btn-mmr-win');
  const btnMmrLoss = document.getElementById('btn-mmr-loss');
  const btnMmrReset = document.getElementById('btn-mmr-reset');

  // B. Roshan & Aegis Controls
  const timersAegisEnabled = document.getElementById('timers-aegis-enabled');
  const timersRoshanEnabled = document.getElementById('timers-roshan-enabled');
  const timersHeroSlot = document.getElementById('timers-hero-slot');
  const dashAegisStatus = document.getElementById('dash-aegis-status');
  const dashRoshanStatus = document.getElementById('dash-roshan-status');
  const btnStartAegis = document.getElementById('btn-start-aegis');
  const btnStopAegis = document.getElementById('btn-stop-aegis');
  const btnStartRoshan = document.getElementById('btn-start-roshan');
  const btnYellowRoshan = document.getElementById('btn-yellow-roshan');
  const btnStopRoshan = document.getElementById('btn-stop-roshan');

  // C. Queue Blocker Controls
  const qbEnabled = document.getElementById('qb-enabled');
  const qbShowFinding = document.getElementById('qb-show-finding');
  const qbCustomText = document.getElementById('qb-custom-text');
  const qbCharCount = document.getElementById('qb-char-count');

  // D. Hero Pick Blocker Controls
  const hpbEnabled = document.getElementById('hpb-enabled');
  const hpbTopSlots = document.getElementById('hpb-top-slots');
  const hpbMinimap = document.getElementById('hpb-minimap');
  const hpbChooseBox = document.getElementById('hpb-choose-box');
  const hpbRevealOwn = document.getElementById('hpb-reveal-own');
  const hpbStreamerSlot = document.getElementById('hpb-streamer-slot');

  // E. Minimap Blocker Controls
  const mmEnabled = document.getElementById('mm-enabled');
  const mmStyle = document.getElementById('mm-style');
  const mmIntensity = document.getElementById('mm-intensity');
  const mmIntensityVal = document.getElementById('mm-intensity-val');
  const mmExtralarge = document.getElementById('mm-extralarge');
  const mmRightside = document.getElementById('mm-rightside');
  const mmBpOffset = document.getElementById('mm-bp-offset');

  // F. GSI Installer Controls
  const gsiDotaPath = document.getElementById('gsi-dota-path');
  const btnInstallGsi = document.getElementById('btn-install-gsi');
  const gsiInstallResult = document.getElementById('gsi-install-result');
  const gsiCfgPreview = document.getElementById('gsi-cfg-preview');
  const gsiCfgStatusBadge = document.getElementById('gsi-cfg-status-badge');

  function showToast(msg) {
    if (!simToast) return;
    simToast.textContent = msg;
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      simToast.textContent = '';
    }, 3000);
  }

  let configDebounceTimer = null;
  function debouncedPushConfigUpdate(patch, delay = 120) {
    clearTimeout(configDebounceTimer);
    configDebounceTimer = setTimeout(() => {
      pushConfigUpdate(patch);
    }, delay);
  }

  function pushConfigUpdate(patch) {
    clearTimeout(configDebounceTimer);
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    })
      .then((r) => r.json())
      .then((res) => {
        if (res && res.config) {
          syncDashboardUI({
            config: res.config,
            gsiState: res.gsiState,
            gsiConfigStatus: res.gsiConfigStatus
          });
        }
      })
      .catch(() => {
        if (socket && socket.connected) {
          socket.emit('config:update', patch);
        }
      });
  }

  function triggerSimulation(mode, options = {}, toastMsg = '') {
    if (toastMsg) showToast(toastMsg);
    fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, ...options })
    })
      .then((r) => r.json())
      .then((payload) => syncDashboardUI(payload))
      .catch(() => {});
  }

  function syncDashboardUI(payload) {
    if (!payload) return;
    const { config, gsiState, gsiConfigStatus } = payload;

    if (config) {
      const m = config.mmrTracker || {};
      if (document.activeElement !== mmrLabel) mmrLabel.value = m.label || 'STREAM';
      if (document.activeElement !== mmrStarting) mmrStarting.value = m.startingMmr ?? 7455;
      if (document.activeElement !== mmrCurrent) mmrCurrent.value = m.currentMmr ?? 7455;
      if (document.activeElement !== mmrStep) mmrStep.value = m.mmrStep ?? 25;
      if (document.activeElement !== mmrWins) mmrWins.value = m.wins ?? 0;
      if (document.activeElement !== mmrLosses) mmrLosses.value = m.losses ?? 0;
      mmrEnabled.checked = Boolean(m.enabled);
      mmrShowMenu.checked = m.showInMenu !== false;
      mmrShowIngame.checked = m.showInGame !== false;
      mmrAutoGsi.checked = m.autoTrackGsi !== false;

      if (mmrOpacity && document.activeElement !== mmrOpacity) {
        mmrOpacity.value = m.opacity ?? 80;
      }
      if (mmrOpacityVal) {
        mmrOpacityVal.textContent = `${m.opacity ?? 80}%`;
      }
      if (dashMmrPreviewBox) {
        dashMmrPreviewBox.style.opacity = `${(m.opacity ?? 80) / 100}`;
      }
      if (mmrPosition && document.activeElement !== mmrPosition) {
        mmrPosition.value = m.inGamePosition || 'bottom_hud';
      }

      const formattedMmr = Number(m.currentMmr || 0).toLocaleString('en-US');
      const mmrHtmlKey = `${m.label || 'STREAM'}|${m.wins || 0}|${m.losses || 0}|${formattedMmr}`;
      if (dashMmrPreview && dashMmrPreview._lastHtmlKey !== mmrHtmlKey) {
        dashMmrPreview._lastHtmlKey = mmrHtmlKey;
        dashMmrPreview.textContent = `${m.label || 'STREAM'} | ${m.wins || 0}W - ${m.losses || 0}L | ${formattedMmr} MMR`;
        if (typeof document !== 'undefined') {
          dashMmrPreview.innerHTML = `${m.label || 'STREAM'} | <span class="font-bold text-slate-100">${m.wins || 0}<span class="text-emerald-400 font-bold">W</span></span> - <span class="font-bold text-slate-100">${m.losses || 0}<span class="text-rose-400 font-bold">L</span></span> | <span class="font-bold text-white">${formattedMmr}</span> MMR`;
        }
      }

      const rank = m.rank || calculateRank(m.currentMmr);
      if (rank) {
        if (dashRankName && dashRankName.textContent !== rank.rankName) {
          dashRankName.textContent = rank.rankName;
        }
        if (dashRankBracket) {
          const bracketText = rank.bracketMin !== undefined
            ? `(${rank.bracketMin.toLocaleString()} – ${rank.bracketMax ? rank.bracketMax.toLocaleString() : '5,420+'} MMR)`
            : '';
          if (dashRankBracket.textContent !== bracketText) {
            dashRankBracket.textContent = bracketText;
          }
        }
        const rankKey = `${rank.rankName}|${rank.image || ''}|${rank.svg || ''}`;
        if (dashRankBadge && dashRankBadge._lastRankKey !== rankKey) {
          dashRankBadge._lastRankKey = rankKey;
          if (rank.image) {
            dashRankBadge.innerHTML = `<img src="${rank.image}" class="w-full h-full object-contain" alt="Rank Medal" />`;
          } else {
            dashRankBadge.innerHTML = rank.svg || buildMiniRankSvg(rank);
          }
        }
        const catalogCountEl = document.getElementById('rank-catalog-count');
        if (catalogCountEl) {
          catalogCountEl.textContent = rank.image
            ? `Custom PNG Active (${rank.image})`
            : 'SVG Medal Fallback Active';
        }
      }

      const t = config.timers || {};
      timersAegisEnabled.checked = Boolean(t.aegisEnabled);
      timersRoshanEnabled.checked = Boolean(t.roshanEnabled);
      if (document.activeElement !== timersHeroSlot) {
        timersHeroSlot.value = String(t.defaultHeroSlot ?? 0);
      }

      const qb = config.queueBlocker || {};
      qbEnabled.checked = Boolean(qb.enabled);
      qbShowFinding.checked = Boolean(qb.showFindingMatch);
      if (document.activeElement !== qbCustomText) {
        qbCustomText.value = qb.customText ?? '';
      }
      qbCharCount.textContent = `${(qbCustomText.value || '').length}/45`;

      const hpb = config.heroPickBlocker || {};
      hpbEnabled.checked = Boolean(hpb.enabled);
      hpbTopSlots.checked = hpb.blockTopSlots !== false;
      hpbMinimap.checked = hpb.blockMinimapPreview !== false;
      hpbChooseBox.checked = hpb.blockChooseHeroBox !== false;
      hpbRevealOwn.checked = hpb.revealOwnHero !== false;
      if (document.activeElement !== hpbStreamerSlot) {
        hpbStreamerSlot.value = String(hpb.streamerSlot ?? 0);
      }

      const mm = config.minimapBlocker || {};
      mmEnabled.checked = Boolean(mm.enabled);
      if (document.activeElement !== mmStyle) {
        mmStyle.value = mm.style || 'realistic';
      }
      if (document.activeElement !== mmIntensity) {
        mmIntensity.value = mm.intensity ?? 75;
      }
      if (mmIntensityVal) {
        mmIntensityVal.textContent = `${mm.intensity ?? 75}%`;
      }
      mmExtralarge.checked = Boolean(mm.extraLarge);
      mmRightside.checked = Boolean(mm.rightSide);
      mmBpOffset.checked = Boolean(mm.battlepassOffset);

      if (config.gsi && gsiDotaPath && document.activeElement !== gsiDotaPath) {
        gsiDotaPath.value = config.gsi.dotaPath || '';
      }
    }

    if (gsiState) {
      gsiGameStateBadge.textContent = gsiState.gameState || 'DOTA_GAMERULES_STATE_INIT';
      if (gsiFriendlyStatus) {
        if (gsiState.simulationMode) {
          gsiFriendlyStatus.textContent = 'Simulation Active';
          gsiFriendlyStatus.className = 'font-extrabold text-indigo-400 tracking-wide text-[12px]';
        } else if (gsiState.connected) {
          gsiFriendlyStatus.textContent = 'Dota 2 Connected';
          gsiFriendlyStatus.className = 'font-extrabold text-emerald-400 tracking-wide text-[12px]';
        } else {
          gsiFriendlyStatus.textContent = 'Waiting for Dota 2';
          gsiFriendlyStatus.className = 'font-extrabold text-amber-300 tracking-wide text-[12px]';
        }
      }
      if (gsiFriendlyPhase) {
        const stateMap = {
          'DOTA_GAMERULES_STATE_INIT': 'Main Menu',
          'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD': 'Connecting Players',
          'DOTA_GAMERULES_STATE_HERO_SELECTION': 'Drafting Heroes',
          'DOTA_GAMERULES_STATE_STRATEGY_TIME': 'Strategy Phase',
          'DOTA_GAMERULES_STATE_PRE_GAME': 'Pre-Game Horn',
          'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS': 'Match In Progress',
          'DOTA_GAMERULES_STATE_POST_GAME': 'Post-Game Summary',
          'DOTA_GAMERULES_STATE_DISCONNECT': 'Disconnected'
        };
        gsiFriendlyPhase.textContent = stateMap[gsiState.gameState] || (gsiState.gameState ? gsiState.gameState.replace('DOTA_GAMERULES_STATE_', '').replace(/_/g, ' ') : 'Main Menu');
      }

      if (gsiState.simulationMode) {
        gsiStatusDot.className = 'w-2.5 h-2.5 rounded-full bg-indigo-400';
        gsiStatusText.textContent = 'SIMULATION ACTIVE';
      } else if (gsiState.connected) {
        gsiStatusDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400';
        gsiStatusText.textContent = 'GSI LIVE';
      } else {
        gsiStatusDot.className = 'w-2.5 h-2.5 rounded-full bg-amber-400';
        gsiStatusText.textContent = 'WAITING FOR DOTA 2 GSI';
      }

      // Timer statuses
      if (gsiState.aegis && gsiState.aegis.active) {
        dashAegisStatus.textContent = `ACTIVE (${gsiState.aegis.formatted}) — Slot ${Number(gsiState.aegis.carrierSlot) + 1}`;
        dashAegisStatus.className = 'text-xs font-mono font-bold text-amber-400';
      } else {
        dashAegisStatus.textContent = 'INACTIVE';
        dashAegisStatus.className = 'text-xs font-mono text-slate-400';
      }

      if (gsiState.roshan && gsiState.roshan.active) {
        const isYellow = gsiState.roshan.color === 'yellow';
        dashRoshanStatus.textContent = isYellow
          ? `YELLOW WINDOW (${gsiState.roshan.formatted})`
          : `RED MINIMUM (${gsiState.roshan.formatted})`;
        dashRoshanStatus.className = isYellow
          ? 'text-xs font-mono font-bold text-yellow-300'
          : 'text-xs font-mono font-bold text-rose-400';
      } else {
        dashRoshanStatus.textContent = 'INACTIVE';
        dashRoshanStatus.className = 'text-xs font-mono text-slate-400';
      }
    }

    if (gsiConfigStatus) {
      if (gsiConfigStatus.content && gsiCfgPreview) {
        gsiCfgPreview.textContent = gsiConfigStatus.content;
      }
      if (gsiConfigStatus.installed) {
        if (gsiCfgStatusBadge) {
          gsiCfgStatusBadge.textContent = '✓ CFG INSTALLED';
          gsiCfgStatusBadge.className =
            'px-2 py-0.5 text-[11px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded';
        }
        if (gsiInstallResult) {
          gsiInstallResult.classList.remove('hidden');
          gsiInstallResult.textContent = `✓ Installed ${gsiConfigStatus.filename} to: ${gsiConfigStatus.targetFile} (Restart Dota 2 once if it was already open)`;
        }
      } else {
        if (gsiCfgStatusBadge) {
          gsiCfgStatusBadge.textContent = 'NOT INSTALLED';
          gsiCfgStatusBadge.className =
            'px-2 py-0.5 text-[11px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded';
        }
        if (gsiInstallResult) {
          gsiInstallResult.classList.add('hidden');
          gsiInstallResult.textContent = '';
        }
      }
    }
  }

  function calculateRank(currentMmr) {
    const mmr = Math.max(0, Math.round(Number(currentMmr) || 0));
    if (mmr < 10) return { tier: 0, tierName: 'unranked', displayName: 'Unranked', stars: 0, rankName: 'Unranked' };
    if (mmr >= 5420) return { tier: 8, tierName: 'immortal', displayName: 'Immortal', stars: 0, rankName: 'Immortal' };
    const tiers = [
      { tier: 1, displayName: 'Herald', steps: [10, 154, 308, 462, 616], max: 769 },
      { tier: 2, displayName: 'Guardian', steps: [770, 924, 1078, 1232, 1386], max: 1539 },
      { tier: 3, displayName: 'Crusader', steps: [1540, 1694, 1848, 2002, 2156], max: 2309 },
      { tier: 4, displayName: 'Archon', steps: [2310, 2464, 2618, 2772, 2926], max: 3079 },
      { tier: 5, displayName: 'Legend', steps: [3080, 3234, 3388, 3542, 3696], max: 3849 },
      { tier: 6, displayName: 'Ancient', steps: [3850, 4004, 4158, 4312, 4466], max: 4619 },
      { tier: 7, displayName: 'Divine', steps: [4620, 4774, 4928, 5082, 5236], max: 5419 }
    ];
    for (const t of tiers) {
      if (mmr <= t.max) {
        let stars = 1;
        for (let i = 0; i < t.steps.length; i++) {
          if (mmr >= t.steps[i]) stars = i + 1;
        }
        return { tier: t.tier, stars, rankName: `${t.displayName} ${stars}` };
      }
    }
    return { tier: 1, stars: 1, rankName: 'Herald 1' };
  }

  function buildMiniRankSvg(rank) {
    if (!rank) return '';
    const tier = rank.tier ?? 0;
    const themes = {
      0: '#64748b',
      1: '#a87146',
      2: '#94a3b8',
      3: '#d97706',
      4: '#38bdf8',
      5: '#fbbf24',
      6: '#c084fc',
      7: '#facc15',
      8: '#ef4444'
    };
    const color = themes[tier] || '#64748b';
    return `<svg class="w-full h-full" viewBox="0 0 24 24" fill="none"><path d="M12 2L4 6V12C4 17 8 21 12 22C16 21 20 17 20 12V6L12 2Z" fill="${color}" fill-opacity="0.85" stroke="#ffffff" stroke-width="1.2"/><polygon points="12,7 13.5,10.5 17,11 14.5,13.5 15,17 12,15 9,17 9.5,13.5 7,11 10.5,10.5" fill="#fef08a"/></svg>`;
  }

  // Wire up A. MMR Tracker Events
  function sendMmrConfig(ev) {
    if (
      ev &&
      ev.type === 'input' &&
      ev.target &&
      ev.target.type === 'number' &&
      ev.target.value.trim() === ''
    ) {
      return;
    }

    if (
      ev &&
      ev.target === mmrStarting &&
      mmrStarting.value.trim() !== '' &&
      Number(mmrWins.value) === 0 &&
      Number(mmrLosses.value) === 0
    ) {
      mmrCurrent.value = mmrStarting.value;
    }

    const patch = {
      enabled: mmrEnabled.checked,
      label: mmrLabel.value,
      showInMenu: mmrShowMenu.checked,
      showInGame: mmrShowIngame.checked,
      autoTrackGsi: mmrAutoGsi.checked
    };
    if (mmrStarting.value.trim() !== '') patch.startingMmr = Number(mmrStarting.value);
    if (mmrCurrent.value.trim() !== '') patch.currentMmr = Number(mmrCurrent.value);
    if (mmrStep.value.trim() !== '') patch.mmrStep = Number(mmrStep.value);
    if (mmrWins.value.trim() !== '') patch.wins = Number(mmrWins.value);
    if (mmrLosses.value.trim() !== '') patch.losses = Number(mmrLosses.value);
    if (mmrOpacity && mmrOpacity.value.trim() !== '') {
      patch.opacity = Number(mmrOpacity.value);
      if (mmrOpacityVal) mmrOpacityVal.textContent = `${patch.opacity}%`;
      if (dashMmrPreviewBox) dashMmrPreviewBox.style.opacity = `${patch.opacity / 100}`;
    }
    if (mmrPosition && mmrPosition.value) patch.inGamePosition = mmrPosition.value;

    if (ev && ev.type === 'input') {
      debouncedPushConfigUpdate({ mmrTracker: patch });
    } else {
      pushConfigUpdate({ mmrTracker: patch });
    }
  }

  [mmrEnabled, mmrLabel, mmrStarting, mmrCurrent, mmrStep, mmrWins, mmrLosses, mmrShowMenu, mmrShowIngame, mmrAutoGsi, mmrOpacity, mmrPosition].forEach((el) => {
    if (!el) return;
    el.addEventListener('change', sendMmrConfig);
    if (el.type === 'text' || el.type === 'number' || el.type === 'range') {
      el.addEventListener('input', sendMmrConfig);
    }
  });

  btnMmrWin.addEventListener('click', () => {
    fetch('/api/mmr/win', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      .then((r) => r.json())
      .then(syncDashboardUI);
  });

  btnMmrLoss.addEventListener('click', () => {
    fetch('/api/mmr/loss', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      .then((r) => r.json())
      .then(syncDashboardUI);
  });

  btnMmrReset.addEventListener('click', () => {
    fetch('/api/mmr/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startingMmr: Number(mmrStarting.value) })
    })
      .then((r) => r.json())
      .then(syncDashboardUI);
  });

  // Wire up B. Timers Events
  function sendTimersConfig() {
    pushConfigUpdate({
      timers: {
        aegisEnabled: timersAegisEnabled.checked,
        roshanEnabled: timersRoshanEnabled.checked,
        defaultHeroSlot: Number(timersHeroSlot.value)
      }
    });
  }

  [timersAegisEnabled, timersRoshanEnabled, timersHeroSlot].forEach((el) => {
    if (el) el.addEventListener('change', sendTimersConfig);
  });

  btnStartAegis.addEventListener('click', () => {
    triggerSimulation('aegis', { slot: Number(timersHeroSlot.value) }, 'Aegis 5:00 countdown started');
  });
  btnStopAegis.addEventListener('click', () => {
    triggerSimulation('stop_aegis', {}, 'Aegis timer stopped');
  });
  btnStartRoshan.addEventListener('click', () => {
    triggerSimulation('roshan', { phase: 'red' }, 'Roshan 11:00 timer started (RED minimum window)');
  });
  btnYellowRoshan.addEventListener('click', () => {
    triggerSimulation('roshan', { phase: 'yellow' }, 'Roshan fast-forwarded to YELLOW respawn window (<3:00)');
  });
  btnStopRoshan.addEventListener('click', () => {
    triggerSimulation('stop_roshan', {}, 'Roshan timer stopped');
  });

  // Keyboard hotkeys for fallback manual Aegis (Alt+A) and Roshan (Alt+R / Alt+Y) triggers
  window.addEventListener('keydown', (ev) => {
    const tag = ev.target && ev.target.tagName ? ev.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (!ev.altKey) return;
    const key = (ev.key || '').toLowerCase();
    if (key === 'a') {
      ev.preventDefault();
      triggerSimulation('aegis', { slot: Number(timersHeroSlot.value) }, 'Hotkey [Alt+A]: Aegis 5:00 countdown started');
    } else if (key === 'r') {
      ev.preventDefault();
      triggerSimulation('roshan', { phase: 'red' }, 'Hotkey [Alt+R]: Roshan 11:00 timer started');
    } else if (key === 'y') {
      ev.preventDefault();
      triggerSimulation('roshan', { phase: 'yellow' }, 'Hotkey [Alt+Y]: Roshan Yellow Window (<3:00)');
    }
  });

  // Wire up C. Queue Blocker Events
  function sendQueueBlockerConfig(ev) {
    const clamped = (qbCustomText.value || '').slice(0, 45);
    qbCharCount.textContent = `${clamped.length}/45`;
    const patch = {
      queueBlocker: {
        enabled: qbEnabled.checked,
        showFindingMatch: qbShowFinding.checked,
        customText: clamped
      }
    };
    if (ev && ev.type === 'input') {
      debouncedPushConfigUpdate(patch);
    } else {
      pushConfigUpdate(patch);
    }
  }

  [qbEnabled, qbShowFinding].forEach((el) => {
    if (el) el.addEventListener('change', sendQueueBlockerConfig);
  });
  if (qbCustomText) {
    qbCustomText.addEventListener('input', sendQueueBlockerConfig);
  }

  // Wire up D. Hero Pick Blocker Events
  function sendHeroPickBlockerConfig() {
    pushConfigUpdate({
      heroPickBlocker: {
        enabled: hpbEnabled.checked,
        blockTopSlots: hpbTopSlots.checked,
        blockMinimapPreview: hpbMinimap.checked,
        blockChooseHeroBox: hpbChooseBox.checked,
        revealOwnHero: hpbRevealOwn.checked,
        streamerSlot: Number(hpbStreamerSlot.value)
      }
    });
  }

  [hpbEnabled, hpbTopSlots, hpbMinimap, hpbChooseBox, hpbRevealOwn, hpbStreamerSlot].forEach((el) => {
    if (el) el.addEventListener('change', sendHeroPickBlockerConfig);
  });

  // Wire up E. Minimap Blocker Events
  function sendMinimapBlockerConfig(ev) {
    mmIntensityVal.textContent = `${mmIntensity.value}%`;
    const patch = {
      minimapBlocker: {
        enabled: mmEnabled.checked,
        style: mmStyle.value,
        intensity: Number(mmIntensity.value),
        extraLarge: mmExtralarge.checked,
        rightSide: mmRightside.checked,
        battlepassOffset: mmBpOffset.checked
      }
    };
    if (ev && ev.type === 'input') {
      debouncedPushConfigUpdate(patch);
    } else {
      pushConfigUpdate(patch);
    }
  }

  [mmEnabled, mmStyle, mmExtralarge, mmRightside, mmBpOffset].forEach((el) => {
    if (el) el.addEventListener('change', sendMinimapBlockerConfig);
  });
  if (mmIntensity) {
    mmIntensity.addEventListener('input', sendMinimapBlockerConfig);
    mmIntensity.addEventListener('change', sendMinimapBlockerConfig);
  }

  // Wire up Diagnostics / Simulation Bar Buttons
  document.getElementById('sim-main-menu').addEventListener('click', () => {
    triggerSimulation('main_menu', {}, 'Simulated Main Menu (Queue Blocker active)');
  });
  const simWaitLoadBtn = document.getElementById('sim-wait-load');
  if (simWaitLoadBtn) {
    simWaitLoadBtn.addEventListener('click', () => {
      triggerSimulation('wait_for_players_to_load', {}, 'Simulated Players Connecting (Draft Blocker active, Queue Blocker hidden)');
    });
  }
  document.getElementById('sim-draft').addEventListener('click', () => {
    triggerSimulation('draft', { banningPhase: true, ownHeroLocked: false }, 'Simulated Draft Phase — Banning (All 10 slots hidden)');
  });
  document.getElementById('sim-draft-reveal').addEventListener('click', () => {
    triggerSimulation(
      'draft',
      { banningPhase: false, ownHeroLocked: true, streamerSlot: Number(hpbStreamerSlot.value) },
      `Simulated Draft Phase — Streamer Slot ${Number(hpbStreamerSlot.value) + 1} Revealed`
    );
  });
  document.getElementById('sim-strategy').addEventListener('click', () => {
    triggerSimulation('strategy', {}, 'Simulated Strategy Time (Draft Blocker auto-cleared)');
  });
  document.getElementById('sim-in-game').addEventListener('click', () => {
    triggerSimulation('in_game', {}, 'Simulated In-Game (Minimap Ward Blocker active)');
  });
  document.getElementById('sim-aegis').addEventListener('click', () => {
    triggerSimulation('aegis', { slot: Number(timersHeroSlot.value) }, 'Triggered Aegis 5:00 Timer');
  });
  document.getElementById('sim-roshan').addEventListener('click', () => {
    triggerSimulation('roshan', { phase: 'red' }, 'Triggered Roshan Death (11:00 Red Window)');
  });
  document.getElementById('sim-roshan-yellow').addEventListener('click', () => {
    triggerSimulation('roshan', { phase: 'yellow' }, 'Simulated Roshan Yellow Window (<3:00 left)');
  });
  document.getElementById('sim-win').addEventListener('click', () => {
    triggerSimulation('match_win', {}, 'Simulated Match Win via GSI (+MMR)');
  });
  document.getElementById('sim-loss').addEventListener('click', () => {
    triggerSimulation('match_loss', {}, 'Simulated Match Loss via GSI (-MMR)');
  });

  // Wire up GSI Installer Button
  btnInstallGsi.addEventListener('click', () => {
    fetch('/api/gsi/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dotaPath: gsiDotaPath.value.trim() })
    })
      .then((r) => r.json())
      .then((res) => {
        if (res && res.success) {
          if (gsiCfgStatusBadge) {
            gsiCfgStatusBadge.textContent = '✓ CFG INSTALLED';
            gsiCfgStatusBadge.className =
              'px-2 py-0.5 text-[11px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded';
          }
          gsiInstallResult.classList.remove('hidden');
          gsiInstallResult.textContent = `✓ Installed ${res.filename} to: ${res.targetFile} (Restart Dota 2 once if it was already open)`;
          if (res.content && gsiCfgPreview) {
            gsiCfgPreview.textContent = res.content;
          }
          showToast('GSI config generated & installed!');
        }
      })
      .catch(() => {});
  });

  // Copy OBS URL button
  if (btnCopyObsUrl) {
    btnCopyObsUrl.addEventListener('click', () => {
      const url = `${window.location.origin}/overlay`;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url);
      }
      btnCopyObsUrl.textContent = 'Copied!';
      setTimeout(() => {
        btnCopyObsUrl.textContent = 'Copy URL';
      }, 1500);
    });
  }

  // Drag-and-Drop Layout Editor Controls
  const btnEditLayout = document.getElementById('btn-edit-layout');
  const btnResetPositions = document.getElementById('btn-reset-positions');
  const btnToggleHudGuide = document.getElementById('btn-toggle-hud-guide');
  const overlayPreviewIframe = document.getElementById('overlay-preview-iframe');
  const layoutEditorHint = document.getElementById('layout-editor-hint');

  let isDashboardEditMode = false;
  let isDashboardHudGuide = false;
  if (overlayPreviewIframe && overlayPreviewIframe.style) {
    overlayPreviewIframe.style.pointerEvents = 'none';
  }

  function sendIframeMessage(msg) {
    if (!overlayPreviewIframe) return;
    try {
      if (overlayPreviewIframe.contentWindow) {
        if (msg.type === 'SET_EDIT_MODE' && typeof overlayPreviewIframe.contentWindow.setEditMode === 'function') {
          overlayPreviewIframe.contentWindow.setEditMode(msg.editMode);
        } else if (msg.type === 'RESET_POSITIONS' && typeof overlayPreviewIframe.contentWindow.resetWidgetPositions === 'function') {
          overlayPreviewIframe.contentWindow.resetWidgetPositions();
        } else if (msg.type === 'TOGGLE_HUD_GUIDE' && typeof overlayPreviewIframe.contentWindow.toggleHudGuide === 'function') {
          overlayPreviewIframe.contentWindow.toggleHudGuide(msg.visible);
        } else if (msg.type === 'KEY_NUDGE' && typeof overlayPreviewIframe.contentWindow.nudgeSelectedWidget === 'function') {
          overlayPreviewIframe.contentWindow.nudgeSelectedWidget(msg.key, msg.shiftKey);
        } else if (msg.type === 'SET_SCENE' && typeof overlayPreviewIframe.contentWindow.setScene === 'function') {
          overlayPreviewIframe.contentWindow.setScene(msg.scene);
        } else if (msg.type === 'ALIGN_AEGIS' && typeof overlayPreviewIframe.contentWindow.autoAlignAegisSlots === 'function') {
          overlayPreviewIframe.contentWindow.autoAlignAegisSlots();
        } else if (msg.type === 'TOGGLE_WIDGET_VISIBILITY' && typeof overlayPreviewIframe.contentWindow.toggleWidgetVisibility === 'function') {
          overlayPreviewIframe.contentWindow.toggleWidgetVisibility(msg.widgetKey);
        } else {
          overlayPreviewIframe.contentWindow.postMessage(msg, '*');
        }
      }
    } catch (_) {
      try {
        overlayPreviewIframe.contentWindow.postMessage(msg, '*');
      } catch (err) {}
    }
  }

  if (btnEditLayout) {
    btnEditLayout.addEventListener('click', () => {
      isDashboardEditMode = !isDashboardEditMode;
      btnEditLayout.className = isDashboardEditMode
        ? 'btn btn-primary !py-1 !px-2.5 !text-xs font-medium'
        : 'btn btn-amber !py-1 !px-2.5 !text-xs font-medium';
      btnEditLayout.innerHTML = isDashboardEditMode
        ? '<span>✓ Exit Edit</span>'
        : '<span>Edit Layout</span>';
      if (overlayPreviewIframe) {
        overlayPreviewIframe.style.pointerEvents = isDashboardEditMode ? 'auto' : 'none';
      }
      if (layoutEditorHint) {
        layoutEditorHint.className = isDashboardEditMode
          ? 'text-xs text-amber-300 font-medium inline-block'
          : 'text-xs text-slate-500 hidden sm:inline-block';
      }
      sendIframeMessage({ type: 'SET_EDIT_MODE', editMode: isDashboardEditMode });
      showToast(
        isDashboardEditMode
          ? 'Layout Editor Active: Drag widgets or use Arrow keys to nudge (Shift+Arrow = 10px)'
          : 'Layout Editor closed'
      );
    });
  }

  if (btnResetPositions) {
    btnResetPositions.addEventListener('click', () => {
      fetch('/api/positions/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
        .then((r) => r.json())
        .then(() => {
          sendIframeMessage({ type: 'RESET_POSITIONS' });
          showToast('Widget positions reset to defaults');
        })
        .catch(() => {});
    });
  }

  if (btnToggleHudGuide) {
    btnToggleHudGuide.addEventListener('click', () => {
      isDashboardHudGuide = !isDashboardHudGuide;
      btnToggleHudGuide.textContent = isDashboardHudGuide ? 'HUD Guide: ON' : 'HUD Guide: OFF';
      btnToggleHudGuide.className = isDashboardHudGuide
        ? 'btn btn-primary !py-1 !px-2.5 !text-xs font-medium'
        : 'btn btn-slate !py-1 !px-2.5 !text-xs';
      sendIframeMessage({ type: 'TOGGLE_HUD_GUIDE', visible: isDashboardHudGuide });
    });
  }

  // Dashboard Scene Switcher Tabs
  const dashSceneTabs = document.querySelectorAll ? document.querySelectorAll('.dash-scene-tab') : [];
  const dashBtnAlignAegis = document.getElementById('dash-btn-align-aegis');

  function updateDashboardSceneTabs(activeScene) {
    if (!dashSceneTabs || !dashSceneTabs.forEach) return;
    dashSceneTabs.forEach((tab) => {
      const s = tab.getAttribute('data-scene');
      if (s === activeScene) {
        tab.className = 'dash-scene-tab active';
      } else {
        tab.className = 'dash-scene-tab';
      }
    });
    if (dashBtnAlignAegis) {
      dashBtnAlignAegis.style.display = activeScene === 'in_game' ? 'inline-flex' : 'none';
    }
  }

  if (dashSceneTabs && dashSceneTabs.forEach) {
    dashSceneTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const scene = tab.getAttribute('data-scene');
        if (scene) {
          updateDashboardSceneTabs(scene);
          sendIframeMessage({ type: 'SET_SCENE', scene });
        }
      });
    });
  }

  if (dashBtnAlignAegis) {
    dashBtnAlignAegis.addEventListener('click', () => {
      sendIframeMessage({ type: 'ALIGN_AEGIS' });
      fetch('/api/scenes/align-aegis', { method: 'POST' })
        .then(() => showToast('Aegis 10 slots auto-aligned!'))
        .catch(() => {});
    });
  }

  if (overlayPreviewIframe) {
    overlayPreviewIframe.addEventListener('load', () => {
      if (isDashboardEditMode) {
        sendIframeMessage({ type: 'SET_EDIT_MODE', editMode: true });
      }
      if (isDashboardHudGuide) {
        sendIframeMessage({ type: 'TOGGLE_HUD_GUIDE', visible: true });
      }
    });
  }

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('message', (ev) => {
      if (!ev || !ev.data || typeof ev.data !== 'object') return;
      if (ev.data.type === 'EDIT_MODE_CHANGED') {
        const active = Boolean(ev.data.editMode);
        if (active !== isDashboardEditMode && btnEditLayout) {
          isDashboardEditMode = active;
          if (overlayPreviewIframe) {
            overlayPreviewIframe.style.pointerEvents = isDashboardEditMode ? 'auto' : 'none';
          }
          btnEditLayout.className = isDashboardEditMode
            ? 'btn btn-primary !py-1 !px-2.5 !text-xs font-medium'
            : 'btn btn-amber !py-1 !px-2.5 !text-xs font-medium';
          btnEditLayout.innerHTML = isDashboardEditMode
            ? '<span>✓ Exit Edit</span>'
            : '<span>Edit Layout</span>';
          if (layoutEditorHint) {
            layoutEditorHint.className = isDashboardEditMode
              ? 'text-xs text-amber-300 font-medium inline-block'
              : 'text-xs text-slate-500 hidden sm:inline-block';
          }
        }
      } else if (ev.data.type === 'HUD_GUIDE_CHANGED') {
        const active = Boolean(ev.data.hudGuide !== undefined ? ev.data.hudGuide : ev.data.visible);
        if (active !== isDashboardHudGuide && btnToggleHudGuide) {
          isDashboardHudGuide = active;
          btnToggleHudGuide.textContent = isDashboardHudGuide ? 'HUD Guide: ON' : 'HUD Guide: OFF';
          btnToggleHudGuide.className = isDashboardHudGuide
            ? 'btn btn-primary !py-1 !px-2.5 !text-xs font-medium'
            : 'btn btn-slate !py-1 !px-2.5 !text-xs';
        }
      } else if (ev.data.type === 'SCENE_CHANGED') {
        if (ev.data.scene) {
          updateDashboardSceneTabs(ev.data.scene);
        }
      }
    });

    window.addEventListener('pointerup', () => {
      if (isDashboardEditMode) sendIframeMessage({ type: 'POINTER_UP' });
    });
    window.addEventListener('mouseup', () => {
      if (isDashboardEditMode) sendIframeMessage({ type: 'POINTER_UP' });
    });
  }

  window.addEventListener('keydown', (ev) => {
    if (!isDashboardEditMode) return;
    const tag = ev.target && ev.target.tagName ? ev.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.key)) {
      ev.preventDefault();
      sendIframeMessage({ type: 'KEY_NUDGE', key: ev.key, shiftKey: ev.shiftKey });
    }
  });

  // Initial state fetch
  fetch('/api/state')
    .then((r) => r.json())
    .then((payload) => syncDashboardUI(payload))
    .catch(() => {});

  // Real-time Socket.IO updates
  if (socket) {
    socket.on('init', (payload) => syncDashboardUI(payload));
    socket.on('state:update', (payload) => syncDashboardUI(payload));
  }
})();
