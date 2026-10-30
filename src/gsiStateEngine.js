function isNumericValue(val) {
  if (val === null || val === undefined || val === '' || typeof val === 'boolean' || Array.isArray(val)) {
    return false;
  }
  if (typeof val === 'string' && val.trim() === '') {
    return false;
  }
  return Number.isFinite(Number(val));
}

function normalizeSlot(rawSlot, defaultSlot = 0) {
  const fallback = isNumericValue(defaultSlot)
    ? Math.min(9, Math.max(0, Math.round(Number(defaultSlot))))
    : 0;
  if (!isNumericValue(rawSlot)) return fallback;
  const n = Math.round(Number(rawSlot));
  // Dota 2 player_slot is 0..4 for Radiant and 128..132 for Dire
  if (n >= 128 && n <= 132) return n - 123; // maps 128->5, 132->9
  if (n >= 0 && n <= 9) return n;
  return fallback;
}

function formatDuration(totalSeconds) {
  const sec = Math.max(0, Math.ceil(totalSeconds));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function hasAegisInItems(items) {
  if (!items || typeof items !== 'object') return false;
  for (const val of Object.values(items)) {
    if (!val || typeof val !== 'object') continue;
    if (val.name === 'item_aegis') return true;
    // Support nested team/player item structures (e.g. spectator GSI)
    for (const inner of Object.values(val)) {
      if (inner && typeof inner === 'object') {
        if (inner.name === 'item_aegis') return true;
        for (const deep of Object.values(inner)) {
          if (deep && typeof deep === 'object' && deep.name === 'item_aegis') {
            return true;
          }
        }
      }
    }
  }
  return false;
}

function hasInventorySlots(items) {
  if (!items || typeof items !== 'object') return false;
  const keys = Object.keys(items);
  return keys.length > 0;
}

class GsiStateEngine {
  constructor(configManager, onStateChange = () => {}) {
    this.configManager = configManager;
    this.onStateChange = onStateChange;

    this.state = {
      connected: false,
      lastPacketAt: null,
      simulationMode: false,
      gameState: 'DOTA_GAMERULES_STATE_INIT',
      mapName: '',
      isDemoHero: false,
      clockTime: 0,
      clockTimeKnown: false,
      gameTime: 0,
      matchId: null,
      playerTeam: null, // 'radiant' | 'dire' | null
      winTeam: null,
      playerSlot: null,
      heroId: 0,
      heroName: '',
      heroLevel: 0,
      banningPhase: true,
      ownHeroLocked: false,
      aegis: {
        active: false,
        startedAtMs: null,
        startedAtClockTime: null,
        durationSec: 300,
        carrierSlot: null,
        simulated: false
      },
      roshan: {
        active: false,
        startedAtMs: null,
        startedAtClockTime: null,
        minSec: 480,
        maxSec: 660,
        simulated: false,
        inferredFromAegis: false
      }
    };

    this.hadAegisInInventory = false;
    this.lastAegisTriggerMs = null;
    this.lastRoshanAlive = true;
    this.processedEventKeys = new Set();
    this.currentMatchRecorded = false;
  }

  syncConfigChange(patch = {}) {
    if (!patch || typeof patch !== 'object') return;
    const cfg = this.configManager.get();

    if (patch.timers && typeof patch.timers === 'object') {
      if (patch.timers.defaultHeroSlot !== undefined && this.state.aegis.active) {
        this.state.aegis.carrierSlot = normalizeSlot(cfg.timers.defaultHeroSlot, 0);
      }
      if (patch.timers.aegisDurationSec !== undefined && this.state.aegis.active) {
        this.state.aegis.durationSec = cfg.timers.aegisDurationSec;
      }
      if (
        (patch.timers.roshanMinSec !== undefined || patch.timers.roshanMaxSec !== undefined) &&
        this.state.roshan.active
      ) {
        this.state.roshan.minSec = cfg.timers.roshanMinSec;
        this.state.roshan.maxSec = cfg.timers.roshanMaxSec;
      }
    }

    if (
      patch.heroPickBlocker &&
      typeof patch.heroPickBlocker === 'object' &&
      patch.heroPickBlocker.streamerSlot !== undefined
    ) {
      if (this.state.simulationMode) {
        this.state.playerSlot = normalizeSlot(cfg.heroPickBlocker.streamerSlot, 0);
      }
    }
  }

  processGsiPayload(payload = {}, nowMs = Date.now()) {
    if (!payload || typeof payload !== 'object') {
      return this.getSnapshot(nowMs);
    }

    const cfg = this.configManager.get();
    const wasSimulated = Boolean(this.state.simulationMode);
    const isSimulated = Boolean(payload._simulated);

    this.state.connected = true;
    this.state.lastPacketAt = nowMs;
    this.state.simulationMode = isSimulated;

    // When transitioning from Dashboard Simulation Mode to Live Dota 2 GSI packets,
    // clear any simulated Aegis/Roshan timers so live game state takes over immediately.
    if (!isSimulated && (wasSimulated || this.state.aegis.simulated || this.state.roshan.simulated)) {
      if (wasSimulated || this.state.aegis.simulated) {
        this._stopAegisInternal();
        this.hadAegisInInventory = false;
      }
      if (wasSimulated || this.state.roshan.simulated) {
        this._stopRoshanInternal();
      }
      if (wasSimulated) {
        this.state.clockTimeKnown = false;
      }
    }

    const map = payload.map && typeof payload.map === 'object' ? payload.map : null;
    const player = payload.player && typeof payload.player === 'object' ? payload.player : null;
    const hero = payload.hero && typeof payload.hero === 'object' ? payload.hero : null;
    const items = payload.items && typeof payload.items === 'object' ? payload.items : null;
    const draft = payload.draft && typeof payload.draft === 'object' ? payload.draft : null;
    const roshanObj = payload.roshan && typeof payload.roshan === 'object' ? payload.roshan : null;
    const events = Array.isArray(payload.events) ? payload.events : [];

    const prevGameState = this.state.gameState;
    let rawGameState = 'DOTA_GAMERULES_STATE_INIT';
    if (map && map.game_state) {
      rawGameState = String(map.game_state).trim();
    } else if (map && map.win_team && ['radiant', 'dire'].includes(String(map.win_team).toLowerCase().trim())) {
      rawGameState = 'DOTA_GAMERULES_STATE_POST_GAME';
    } else if (!map && draft && Object.keys(draft).length > 0) {
      rawGameState = 'DOTA_GAMERULES_STATE_HERO_SELECTION';
    } else if (
      !map &&
      (items || events.length > 0 || roshanObj) &&
      (prevGameState === 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' ||
        prevGameState === 'DOTA_GAMERULES_STATE_PRE_GAME')
    ) {
      rawGameState = prevGameState;
    }
    this.state.gameState = rawGameState;

    if (map) {
      if (typeof map.name === 'string') {
        this.state.mapName = map.name.trim();
      }
      const lowerMap = String(this.state.mapName || '').toLowerCase();
      const lowerCustom = String(map.customgamename || '').toLowerCase();
      this.state.isDemoHero =
        lowerMap.includes('demo') ||
        lowerCustom.includes('demo');
    }

    // Reset per-match state when entering main menu, loading, or transitioning from post-game/menu into a new match
    const isMainMenuState =
      rawGameState === 'DOTA_GAMERULES_STATE_INIT' ||
      rawGameState === 'DOTA_GAMERULES_STATE_DISCONNECT';
    const isMenuOrLoad =
      isMainMenuState ||
      rawGameState === 'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD';
    const isActiveMatchPhase =
      rawGameState === 'DOTA_GAMERULES_STATE_PRE_GAME' ||
      rawGameState === 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS';

    const isEnteringNewMatchFromEnd =
      (prevGameState === 'DOTA_GAMERULES_STATE_POST_GAME' ||
        prevGameState === 'DOTA_GAMERULES_STATE_INIT' ||
        prevGameState === 'DOTA_GAMERULES_STATE_DISCONNECT') &&
      rawGameState !== prevGameState &&
      rawGameState !== 'DOTA_GAMERULES_STATE_POST_GAME';

    if (isMenuOrLoad || isEnteringNewMatchFromEnd || !isActiveMatchPhase) {
      this._stopAegisInternal();
      this._stopRoshanInternal();
      this.hadAegisInInventory = false;
    }

    if (isMenuOrLoad || isEnteringNewMatchFromEnd) {
      this.currentMatchRecorded = false;
      this.hadAegisInInventory = false;
      this.lastAegisTriggerMs = null;
      this.lastRoshanAlive = true;
      this.processedEventKeys.clear();
      this.state.matchId = null;
      this.state.winTeam = null;
      this.state.clockTime = 0;
      this.state.clockTimeKnown = false;
      this.state.gameTime = 0;
      this.state.heroLevel = 0;
      if (isMenuOrLoad) {
        this.state.playerSlot = null;
        this.state.heroId = 0;
        this.state.heroName = '';
        this.state.ownHeroLocked = false;
        this.state.banningPhase = true;
      }
    }

    if (
      rawGameState === 'DOTA_GAMERULES_STATE_HERO_SELECTION' &&
      prevGameState !== 'DOTA_GAMERULES_STATE_HERO_SELECTION'
    ) {
      this._stopAegisInternal();
      this._stopRoshanInternal();
      this.currentMatchRecorded = false;
      this.hadAegisInInventory = false;
      this.lastAegisTriggerMs = null;
      this.lastRoshanAlive = true;
      this.state.clockTimeKnown = false;
      this.state.banningPhase = true;
      this.state.ownHeroLocked = false;
      this.state.heroId = 0;
      this.state.heroName = '';
      this.state.heroLevel = 0;
    }

    if (isActiveMatchPhase) {
      this.currentMatchRecorded = false;
    }

    // Detect Demo Hero reset / match restart via clock rewind or mid-game hero switch / level reset
    if (map) {
      const prevClock = this.state.clockTime;
      const prevClockKnown = this.state.clockTimeKnown;
      const prevGame = this.state.gameTime;
      if (isNumericValue(map.clock_time)) {
        const nextClock = Number(map.clock_time);
        if (isActiveMatchPhase && prevClockKnown && prevClock > 5 && nextClock < prevClock - 5) {
          this._stopAegisInternal();
          this._stopRoshanInternal();
          this.hadAegisInInventory = false;
          this.processedEventKeys.clear();
        }
        this.state.clockTime = nextClock;
        this.state.clockTimeKnown = true;
      }
      if (isNumericValue(map.game_time)) {
        const nextGame = Number(map.game_time);
        if (isActiveMatchPhase && prevGame > 5 && nextGame < prevGame - 5) {
          this._stopAegisInternal();
          this._stopRoshanInternal();
          this.hadAegisInInventory = false;
          this.processedEventKeys.clear();
        }
        this.state.gameTime = nextGame;
      }
      if (map.matchid !== undefined && map.matchid !== null) {
        const mId = String(map.matchid).trim();
        const nextMatchId = mId !== '' && mId !== '0' ? mId : null;
        if (this.state.matchId && nextMatchId && this.state.matchId !== nextMatchId) {
          this._stopAegisInternal();
          this._stopRoshanInternal();
          this.hadAegisInInventory = false;
          this.processedEventKeys.clear();
        }
        this.state.matchId = nextMatchId;
      }
      this.state.winTeam = map.win_team ? String(map.win_team).toLowerCase().trim() : null;
    } else if (isMenuOrLoad) {
      this.state.winTeam = null;
    }

    // Sync active timers with in-game clock_time if game time was fast-forwarded (e.g. Demo Hero -ff / host_timescale)
    if (isActiveMatchPhase && map && isNumericValue(map.clock_time)) {
      const currentClock = Number(map.clock_time);
      if (this.state.aegis.active && this.state.aegis.startedAtMs !== null) {
        if (!isNumericValue(this.state.aegis.startedAtClockTime)) {
          const wallElapsed = Math.max(0, (nowMs - this.state.aegis.startedAtMs) / 1000);
          this.state.aegis.startedAtClockTime = currentClock - wallElapsed;
        } else {
          const clockElapsed = currentClock - Number(this.state.aegis.startedAtClockTime);
          const wallElapsed = (nowMs - this.state.aegis.startedAtMs) / 1000;
          if (clockElapsed > wallElapsed + 1) {
            this.state.aegis.startedAtMs = nowMs - clockElapsed * 1000;
          }
          if (clockElapsed >= (this.state.aegis.durationSec || 300)) {
            this._stopAegisInternal();
            if (!hasAegisInItems(items)) {
              this.hadAegisInInventory = false;
            }
          }
        }
      }
      if (this.state.roshan.active && this.state.roshan.startedAtMs !== null) {
        if (!isNumericValue(this.state.roshan.startedAtClockTime)) {
          const wallElapsed = Math.max(0, (nowMs - this.state.roshan.startedAtMs) / 1000);
          this.state.roshan.startedAtClockTime = currentClock - wallElapsed;
        } else {
          const clockElapsed = currentClock - Number(this.state.roshan.startedAtClockTime);
          const wallElapsed = (nowMs - this.state.roshan.startedAtMs) / 1000;
          if (clockElapsed > wallElapsed + 1) {
            this.state.roshan.startedAtMs = nowMs - clockElapsed * 1000;
          }
          if (clockElapsed >= (this.state.roshan.maxSec || 660)) {
            this._stopRoshanInternal();
          }
        }
      }
    }

    if (isActiveMatchPhase && hero) {
      if (isNumericValue(hero.id)) {
        const nextHeroId = Number(hero.id);
        if (this.state.heroId > 0 && nextHeroId > 0 && nextHeroId !== this.state.heroId) {
          // Hero switched mid-session (e.g. Demo Hero "Change My Hero")
          this._stopAegisInternal();
          this._stopRoshanInternal();
          this.hadAegisInInventory = false;
        }
      }
      if (isNumericValue(hero.level)) {
        const nextLevel = Number(hero.level);
        if (this.state.heroLevel > 1 && nextLevel > 0 && nextLevel < this.state.heroLevel) {
          // Hero level dropped (e.g. Demo Hero "Reset" button)
          this._stopAegisInternal();
          this._stopRoshanInternal();
          this.hadAegisInInventory = false;
        }
        this.state.heroLevel = nextLevel;
      }
      // If hero is dead (alive === false or respawn_seconds > 0), player cannot still be holding an active Aegis
      const isHeroDead =
        hero.alive === false ||
        (isNumericValue(hero.respawn_seconds) && Number(hero.respawn_seconds) > 0);
      if (isHeroDead && this.state.aegis.active) {
        this._stopAegisInternal();
        this.hadAegisInInventory = false;
      }
    }

    if (player) {
      if (player.team_name) {
        const team = String(player.team_name).toLowerCase().trim();
        if (team === 'radiant' || team === 'dire') {
          this.state.playerTeam = team;
        }
      }
      if (
        !isMainMenuState &&
        player.player_slot !== undefined &&
        player.player_slot !== null
      ) {
        this.state.playerSlot = normalizeSlot(player.player_slot, cfg.heroPickBlocker.streamerSlot);
      }
    }

    const activePlayerSlot = normalizeSlot(this.state.playerSlot, cfg.heroPickBlocker.streamerSlot);

    // Draft / Hero Selection state detection
    if (rawGameState === 'DOTA_GAMERULES_STATE_HERO_SELECTION') {
      if (typeof payload.banningPhase === 'boolean') {
        this.state.banningPhase = payload.banningPhase;
      } else if (draft && Object.keys(draft).length > 0) {
        // In Dota 2 GSI, draft.pick is false during banning phase and true during picking phase
        if (typeof draft.pick === 'boolean') {
          this.state.banningPhase = !draft.pick;
        } else if (typeof draft.banning === 'boolean') {
          this.state.banningPhase = draft.banning;
        }
      }

      const hasHeroSelected = Boolean(hero && isNumericValue(hero.id) && Number(hero.id) > 0);
      if (hasHeroSelected) {
        this.state.heroId = Number(hero.id);
        this.state.heroName = String(hero.name || '');
        this.state.ownHeroLocked = true;
      } else if (typeof payload.ownHeroLocked === 'boolean') {
        this.state.ownHeroLocked = payload.ownHeroLocked;
        if (!payload.ownHeroLocked) {
          this.state.heroId = 0;
          this.state.heroName = '';
        }
      } else if (draft) {
        // Check if player's slot pick_id > 0 in draft object
        const slotIdx = activePlayerSlot % 5;
        const teamKey = activePlayerSlot < 5 ? 'team2' : 'team3';
        const teamDraft = draft[teamKey];
        if (teamDraft && isNumericValue(teamDraft[`pick${slotIdx}_id`]) && Number(teamDraft[`pick${slotIdx}_id`]) > 0) {
          this.state.heroId = Number(teamDraft[`pick${slotIdx}_id`]);
          this.state.heroName = String(teamDraft[`pick${slotIdx}_class`] || '');
          this.state.ownHeroLocked = true;
        } else if (
          (hero && isNumericValue(hero.id) && Number(hero.id) === 0) ||
          (teamDraft && isNumericValue(teamDraft[`pick${slotIdx}_id`]) && Number(teamDraft[`pick${slotIdx}_id`]) === 0)
        ) {
          this.state.heroId = 0;
          this.state.heroName = '';
          this.state.ownHeroLocked = false;
        }
      } else if (hero && isNumericValue(hero.id) && Number(hero.id) === 0) {
        this.state.heroId = 0;
        this.state.heroName = '';
        this.state.ownHeroLocked = false;
      }

      if (this.state.ownHeroLocked && payload.banningPhase !== true) {
        this.state.banningPhase = false;
      }
    } else if (rawGameState === 'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD') {
      this.state.banningPhase = true;
      this.state.ownHeroLocked = false;
      this.state.heroId = 0;
      this.state.heroName = '';
    } else {
      this.state.banningPhase = false;
      if (hero && isNumericValue(hero.id) && Number(hero.id) > 0) {
        this.state.heroId = Number(hero.id);
        this.state.heroName = String(hero.name || '');
        this.state.ownHeroLocked = true;
      }
    }

    // Detect Roshan state from map.roshan_state or payload.roshan
    let rawRoshanState =
      (map && map.roshan_state) ||
      (roshanObj && (roshanObj.state || roshanObj.roshan_state)) ||
      null;

    if (!rawRoshanState && roshanObj) {
      if (typeof roshanObj.alive === 'boolean') {
        rawRoshanState = roshanObj.alive ? 'alive' : 'dead';
      } else if (roshanObj.alive === 1 || roshanObj.alive === 0) {
        rawRoshanState = roshanObj.alive === 1 ? 'alive' : 'dead';
      } else if (isNumericValue(roshanObj.health)) {
        const hp = Number(roshanObj.health);
        if (hp > 0) {
          rawRoshanState = 'alive';
        } else if (isNumericValue(roshanObj.max_health) && Number(roshanObj.max_health) > 0) {
          rawRoshanState = 'dead';
        }
      }
    }

    const rStateNormalized = rawRoshanState ? String(rawRoshanState).toLowerCase().trim() : null;
    const isRoshanExplicitlyDead =
      rStateNormalized === 'respawn_base' ||
      rStateNormalized === 'respawn_variable' ||
      rStateNormalized === 'dead';
    const isRoshanExplicitlyAlive = rStateNormalized === 'alive';

    // Detect Aegis via inventory items (rising-edge pickup starts Aegis & Roshan; absence clears active Aegis)
    if (isActiveMatchPhase && items && hasInventorySlots(items)) {
      const hasAegisNow = hasAegisInItems(items);
      const isNewAegisAfterExpiration =
        !this.state.aegis.active &&
        this.lastAegisTriggerMs !== null &&
        nowMs - this.lastAegisTriggerMs >= ((this.state.aegis.durationSec || 300) + 5) * 1000;
      if (hasAegisNow && (!this.hadAegisInInventory || isNewAegisAfterExpiration)) {
        this._triggerAegisInternal({ slot: activePlayerSlot, nowMs, simulated: isSimulated });
        const roshanElapsedSec =
          this.state.roshan.active && this.state.roshan.startedAtMs !== null
            ? (nowMs - this.state.roshan.startedAtMs) / 1000
            : 0;
        const isOldRoshanInSpawnWindow =
          this.state.roshan.active && roshanElapsedSec >= (this.state.roshan.minSec || 480);
        if (!this.state.roshan.active || isOldRoshanInSpawnWindow) {
          this._triggerRoshanInternal({
            nowMs,
            simulated: isSimulated,
            inferredFromAegis: !isRoshanExplicitlyDead
          });
        }
      } else if (!hasAegisNow) {
        if (this.state.aegis.active) {
          this._stopAegisInternal();
        }
        // In Demo Hero sandbox mode, if Roshan was only auto-inferred from Aegis pickup and is not dead in GSI, clear Roshan too
        if (this.state.isDemoHero && this.state.roshan.active && this.state.roshan.inferredFromAegis && !isRoshanExplicitlyDead) {
          this._stopRoshanInternal();
        }
      }
      this.hadAegisInInventory = hasAegisNow;
    }

    if (isActiveMatchPhase && rStateNormalized) {
      if (isRoshanExplicitlyDead) {
        if (this.lastRoshanAlive || !this.state.roshan.active) {
          this._triggerRoshanInternal({ nowMs, simulated: isSimulated, inferredFromAegis: false });
        } else {
          this.state.roshan.inferredFromAegis = false;
        }
        // If GSI indicates variable respawn window (<= 3:00 remaining), ensure timer is in yellow window
        if (rStateNormalized === 'respawn_variable' && this.state.roshan.active && this.state.roshan.startedAtMs !== null) {
          const minSec = this.state.roshan.minSec || 480;
          const elapsedSec = (nowMs - this.state.roshan.startedAtMs) / 1000;
          if (elapsedSec < minSec) {
            this.state.roshan.startedAtMs = nowMs - minSec * 1000;
          }
        }
        this.lastRoshanAlive = false;
      } else if (isRoshanExplicitlyAlive) {
        if (this.state.roshan.active || !this.lastRoshanAlive) {
          this._stopRoshanInternal();
        }
        this.lastRoshanAlive = true;
      }
    }

    // Detect Aegis and Roshan via GSI events log
    if (isActiveMatchPhase) {
      for (const ev of events) {
        if (!ev || typeof ev !== 'object') continue;
        const type = String(ev.event_type || '').toLowerCase().trim();
        const evTime = ev.game_time !== undefined ? ev.game_time : nowMs;
        const evKey = `${type}:${evTime}`;
        if (this.processedEventKeys.has(evKey)) continue;

        if (type === 'aegis_picked_up' || type === 'aegis_stolen') {
          this.processedEventKeys.add(evKey);
          const slot =
            ev.player_id !== undefined && ev.player_id !== null
              ? normalizeSlot(ev.player_id, activePlayerSlot)
              : activePlayerSlot;
          this._triggerAegisInternal({ slot, nowMs, simulated: isSimulated });
          if (!this.state.roshan.active) {
            this._triggerRoshanInternal({ nowMs, simulated: isSimulated, inferredFromAegis: true });
          }
        } else if (
          type === 'aegis_denied' ||
          type === 'aegis_expired' ||
          type === 'aegis_consumed' ||
          type === 'aegis_reincarnate'
        ) {
          this.processedEventKeys.add(evKey);
          this._stopAegisInternal();
          if (!hasAegisInItems(items)) {
            this.hadAegisInInventory = false;
          }
        } else if (type === 'roshan_killed') {
          this.processedEventKeys.add(evKey);
          this._triggerRoshanInternal({ nowMs, simulated: isSimulated, inferredFromAegis: false });
        } else if (
          type === 'roshan_respawn' ||
          type === 'roshan_spawn' ||
          type === 'roshan_alive'
        ) {
          this.processedEventKeys.add(evKey);
          this._stopRoshanInternal();
        }
      }
    }

    // Detect match conclusion: stop in-game timers unconditionally and auto-update MMR & W/L if enabled
    const winTeam = this.state.winTeam;
    const playerTeam = this.state.playerTeam;
    const isGameEnded =
      rawGameState === 'DOTA_GAMERULES_STATE_POST_GAME' ||
      winTeam === 'radiant' ||
      winTeam === 'dire';

    if (isGameEnded) {
      this._stopAegisInternal();
      this._stopRoshanInternal();
      this.hadAegisInInventory = false;
    }

    if (
      cfg.mmrTracker.autoTrackGsi &&
      (winTeam === 'radiant' || winTeam === 'dire') &&
      (playerTeam === 'radiant' || playerTeam === 'dire')
    ) {
      const matchId = this.state.matchId;
      const alreadyRecordedById = Boolean(matchId && cfg.gsi.lastRecordedMatchId === matchId);
      const alreadyRecordedInSession = this.currentMatchRecorded;

      if (!alreadyRecordedById && !alreadyRecordedInSession) {
        this.currentMatchRecorded = true;
        if (matchId) {
          this.configManager.update({ gsi: { lastRecordedMatchId: matchId } });
        }
        if (winTeam === playerTeam) {
          this.configManager.recordWin();
        } else {
          this.configManager.recordLoss();
        }
      }
    }

    const snap = this.getSnapshot(nowMs);
    this.onStateChange(snap);
    return snap;
  }

  _triggerAegisInternal({ slot, durationSec, simulated = false, nowMs = Date.now() } = {}) {
    const cfg = this.configManager.get();
    const resolvedSlot =
      slot !== undefined && slot !== null
        ? normalizeSlot(slot, cfg.timers.defaultHeroSlot)
        : normalizeSlot(this.state.playerSlot, cfg.timers.defaultHeroSlot);
    this.lastAegisTriggerMs = nowMs;
    this.state.aegis = {
      active: true,
      startedAtMs: nowMs,
      startedAtClockTime:
        this.state.clockTimeKnown && isNumericValue(this.state.clockTime)
          ? Number(this.state.clockTime)
          : null,
      durationSec: isNumericValue(durationSec)
        ? Math.max(1, Number(durationSec))
        : cfg.timers.aegisDurationSec,
      carrierSlot: resolvedSlot,
      simulated: Boolean(simulated)
    };
  }

  triggerAegis(opts = {}) {
    const nowMs = opts.nowMs !== undefined ? opts.nowMs : Date.now();
    this._triggerAegisInternal({ ...opts, nowMs });
    const snap = this.getSnapshot(nowMs);
    this.onStateChange(snap);
    return snap;
  }

  _stopAegisInternal() {
    this.state.aegis.active = false;
    this.state.aegis.startedAtMs = null;
    this.state.aegis.startedAtClockTime = null;
    this.state.aegis.simulated = false;
  }

  stopAegis(nowMs = Date.now()) {
    this._stopAegisInternal();
    const snap = this.getSnapshot(nowMs);
    this.onStateChange(snap);
    return snap;
  }

  _triggerRoshanInternal({ elapsedSec = 0, simulated = false, inferredFromAegis = false, nowMs = Date.now() } = {}) {
    const cfg = this.configManager.get();
    const offsetSec = Math.max(0, Number(elapsedSec) || 0);
    const offsetMs = offsetSec * 1000;
    this.lastRoshanAlive = false;
    this.state.roshan = {
      active: true,
      startedAtMs: nowMs - offsetMs,
      startedAtClockTime:
        this.state.clockTimeKnown && isNumericValue(this.state.clockTime)
          ? Number(this.state.clockTime) - offsetSec
          : null,
      minSec: cfg.timers.roshanMinSec || 480,
      maxSec: cfg.timers.roshanMaxSec || 660,
      simulated: Boolean(simulated),
      inferredFromAegis: Boolean(inferredFromAegis)
    };
  }

  triggerRoshan(opts = {}) {
    const nowMs = opts.nowMs !== undefined ? opts.nowMs : Date.now();
    this._triggerRoshanInternal({ ...opts, nowMs });
    const snap = this.getSnapshot(nowMs);
    this.onStateChange(snap);
    return snap;
  }

  _stopRoshanInternal() {
    this.state.roshan.active = false;
    this.state.roshan.startedAtMs = null;
    this.state.roshan.startedAtClockTime = null;
    this.state.roshan.simulated = false;
    this.state.roshan.inferredFromAegis = false;
    this.lastRoshanAlive = true;
  }

  stopRoshan(nowMs = Date.now()) {
    this._stopRoshanInternal();
    const snap = this.getSnapshot(nowMs);
    this.onStateChange(snap);
    return snap;
  }

  simulateState(mode, options = {}, nowMs = Date.now()) {
    const cfg = this.configManager.get();
    switch (mode) {
      case 'main_menu':
        this._stopAegisInternal();
        this._stopRoshanInternal();
        return this.processGsiPayload(
          {
            _simulated: true,
            map: {
              game_state: 'DOTA_GAMERULES_STATE_INIT',
              clock_time: 0
            },
            player: {
              team_name: 'radiant',
              player_slot: cfg.heroPickBlocker.streamerSlot
            }
          },
          nowMs
        );

      case 'loading':
      case 'wait_for_players_to_load':
      case 'wait_for_players':
      case 'connecting':
      case 'players_loading':
        this._stopAegisInternal();
        this._stopRoshanInternal();
        return this.processGsiPayload(
          {
            _simulated: true,
            map: {
              game_state: 'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD',
              clock_time: 0
            },
            player: {
              team_name: 'radiant',
              player_slot:
                options.streamerSlot !== undefined
                  ? options.streamerSlot
                  : cfg.heroPickBlocker.streamerSlot
            }
          },
          nowMs
        );

      case 'draft':
      case 'draft_phase':
      case 'drafting_phase':
        this._stopAegisInternal();
        this._stopRoshanInternal();
        return this.processGsiPayload(
          {
            _simulated: true,
            map: {
              game_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION',
              clock_time: 0
            },
            player: {
              team_name: 'radiant',
              player_slot:
                options.streamerSlot !== undefined
                  ? options.streamerSlot
                  : cfg.heroPickBlocker.streamerSlot
            },
            draft: {
              pick: options.banningPhase === true ? false : Boolean(options.ownHeroLocked)
            },
            banningPhase: options.banningPhase !== undefined ? Boolean(options.banningPhase) : true,
            ownHeroLocked: Boolean(options.ownHeroLocked),
            hero: options.ownHeroLocked
              ? { id: 1, name: 'npc_dota_hero_antimage' }
              : { id: 0, name: '' }
          },
          nowMs
        );

      case 'draft_own_hero_locked':
      case 'own_hero_locked':
        this._stopAegisInternal();
        this._stopRoshanInternal();
        return this.processGsiPayload(
          {
            _simulated: true,
            map: {
              game_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION',
              clock_time: 0
            },
            player: {
              team_name: 'radiant',
              player_slot:
                options.streamerSlot !== undefined
                  ? options.streamerSlot
                  : cfg.heroPickBlocker.streamerSlot
            },
            draft: {
              pick: true
            },
            banningPhase: false,
            ownHeroLocked: true,
            hero: { id: 1, name: 'npc_dota_hero_antimage' }
          },
          nowMs
        );

      case 'strategy':
      case 'strategy_time':
        return this.processGsiPayload(
          {
            _simulated: true,
            map: {
              game_state: 'DOTA_GAMERULES_STATE_STRATEGY_TIME',
              clock_time: 0
            },
            player: {
              team_name: 'radiant',
              player_slot: cfg.heroPickBlocker.streamerSlot

            }
          },
          nowMs
        );

      case 'in_game':
        return this.processGsiPayload(
          {
            _simulated: true,
            map: {
              game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
              clock_time: 745,
              game_time: 835
            },
            player: {
              team_name: 'radiant',
              player_slot: cfg.heroPickBlocker.streamerSlot
            },
            hero: {
              id: 1,
              name: 'npc_dota_hero_antimage'
            }
          },
          nowMs
        );

      case 'aegis':
        // Ensure we are in-game when simulating Aegis so the HUD overlay is visible
        if (
          this.state.gameState !== 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' &&
          this.state.gameState !== 'DOTA_GAMERULES_STATE_PRE_GAME'
        ) {
          this.state.gameState = 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS';
        }
        this.state.connected = true;
        this.state.simulationMode = true;
        return this.triggerAegis({
          slot: options.slot !== undefined ? options.slot : cfg.timers.defaultHeroSlot,
          simulated: true,
          nowMs
        });

      case 'roshan':
        if (
          this.state.gameState !== 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' &&
          this.state.gameState !== 'DOTA_GAMERULES_STATE_PRE_GAME'
        ) {
          this.state.gameState = 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS';
        }
        this.state.connected = true;
        this.state.simulationMode = true;
        return this.triggerRoshan({
          elapsedSec: options.phase === 'yellow' ? 485 : (Number(options.elapsedSec) || 0),
          simulated: true,
          nowMs
        });

      case 'match_win':
      case 'match_loss': {
        const winTeam = mode === 'match_win' ? 'radiant' : 'dire';
        return this.processGsiPayload(
          {
            _simulated: true,
            map: {
              game_state: 'DOTA_GAMERULES_STATE_POST_GAME',
              win_team: winTeam,
              matchid: `sim_${nowMs}_${Math.random().toString(36).slice(2, 7)}`
            },
            player: {
              team_name: 'radiant',
              player_slot: cfg.heroPickBlocker.streamerSlot
            }
          },
          nowMs
        );
      }

      default:
        return this.getSnapshot(nowMs);
    }
  }

  getSnapshot(nowMs = Date.now()) {
    const cfg = this.configManager.get();
    const gs = this.state.gameState || 'DOTA_GAMERULES_STATE_INIT';

    const isMainMenu =
      gs === 'DOTA_GAMERULES_STATE_INIT' ||
      gs === 'DOTA_GAMERULES_STATE_DISCONNECT' ||
      !gs;
    const isDraftPhase =
      gs === 'DOTA_GAMERULES_STATE_HERO_SELECTION' ||
      gs === 'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD';
    const isStrategyPhase = gs === 'DOTA_GAMERULES_STATE_STRATEGY_TIME';
    const isInGame =
      gs === 'DOTA_GAMERULES_STATE_PRE_GAME' ||
      gs === 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS';
    const isPostGame = gs === 'DOTA_GAMERULES_STATE_POST_GAME';

    const resolvedCarrierSlot = normalizeSlot(
      this.state.aegis.carrierSlot,
      cfg.timers.defaultHeroSlot
    );

    // Compute Aegis timer state
    let aegisSnap = {
      active: false,
      remainingSec: 0,
      durationSec: cfg.timers.aegisDurationSec || 300,
      formatted: '5:00',
      progressPct: 0,
      carrierSlot: resolvedCarrierSlot
    };

    if (this.state.aegis.active && this.state.aegis.startedAtMs !== null) {
      const elapsedSec = (nowMs - this.state.aegis.startedAtMs) / 1000;
      const totalSec = this.state.aegis.durationSec || 300;
      const remainingSec = Math.max(0, totalSec - elapsedSec);
      if (remainingSec <= 0) {
        this._stopAegisInternal();
      } else {
        aegisSnap = {
          active: true,
          remainingSec: Math.ceil(remainingSec),
          durationSec: totalSec,
          formatted: formatDuration(remainingSec),
          progressPct: Math.min(100, Math.max(0, (remainingSec / totalSec) * 100)),
          carrierSlot: resolvedCarrierSlot
        };
      }
    }

    // Compute Roshan timer state
    const roshanMinSec = this.state.roshan.minSec || 480; // 8:00
    const roshanMaxSec = this.state.roshan.maxSec || 660; // 11:00
    const randomWindowSec = Math.max(1, roshanMaxSec - roshanMinSec); // 180s (3:00)

    let roshanSnap = {
      active: false,
      elapsedSec: 0,
      remainingSec: 0,
      minRemainingSec: 0,
      maxSec: roshanMaxSec,
      minSec: roshanMinSec,
      formatted: '11:00',
      minFormatted: '8:00',
      progressPct: 0,
      phase: 'minimum', // 'minimum' (0:00-8:00 elapsed, RED) | 'window' (8:00-11:00 elapsed, YELLOW)
      color: 'red' // 'red' | 'yellow'
    };

    if (this.state.roshan.active && this.state.roshan.startedAtMs !== null) {
      const elapsedSec = Math.max(0, (nowMs - this.state.roshan.startedAtMs) / 1000);
      const remainingSec = Math.max(0, roshanMaxSec - elapsedSec);
      if (remainingSec <= 0) {
        this._stopRoshanInternal();
      } else {
        const isYellowWindow = remainingSec <= randomWindowSec; // <= 180s (3:00) remaining
        const minRemainingSec = Math.max(0, roshanMinSec - elapsedSec);
        roshanSnap = {
          active: true,
          elapsedSec: Math.floor(elapsedSec),
          remainingSec: Math.ceil(remainingSec),
          minRemainingSec: Math.ceil(minRemainingSec),
          maxSec: roshanMaxSec,
          minSec: roshanMinSec,
          formatted: formatDuration(remainingSec),
          minFormatted: formatDuration(minRemainingSec),
          progressPct: Math.min(100, Math.max(0, (remainingSec / roshanMaxSec) * 100)),
          phase: isYellowWindow ? 'window' : 'minimum',
          color: isYellowWindow ? 'yellow' : 'red'
        };
      }
    }

    const effectivePlayerSlot = normalizeSlot(
      this.state.playerSlot,
      cfg.heroPickBlocker.streamerSlot
    );

    const isWaitToLoad = gs === 'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD';

    // Compute Hero Pick Blocker per-slot visibility (slots 0..9)
    const revealedSlot =
      isDraftPhase &&
      !isWaitToLoad &&
      !this.state.banningPhase &&
      cfg.heroPickBlocker.revealOwnHero &&
      this.state.ownHeroLocked
        ? effectivePlayerSlot
        : null;

    // Multi-scene layout scene detection
    let currentScene = 'main_menu';
    if (isMainMenu) {
      currentScene = 'main_menu';
    } else if (isDraftPhase) {
      currentScene = (!isWaitToLoad && this.state.ownHeroLocked) ? 'draft_own_hero_locked' : 'drafting_phase';
    } else if (isStrategyPhase || isInGame || isPostGame) {
      currentScene = 'in_game';
    }

    return {
      connected: this.state.connected,
      lastPacketAt: this.state.lastPacketAt,
      simulationMode: this.state.simulationMode,
      gameState: gs,
      currentScene,
      scene: currentScene,
      clockTime: this.state.clockTime,
      gameTime: this.state.gameTime,
      matchId: this.state.matchId,
      playerTeam: this.state.playerTeam,
      winTeam: this.state.winTeam,
      playerSlot: effectivePlayerSlot,
      heroId: this.state.heroId,
      heroName: this.state.heroName,
      banningPhase: this.state.banningPhase,
      ownHeroLocked: this.state.ownHeroLocked,
      revealedSlot,
      flags: {
        isMainMenu,
        isDraftPhase,
        isStrategyPhase,
        isInGame,
        isPostGame
      },
      aegis: aegisSnap,
      roshan: roshanSnap
    };
  }
}

module.exports = {
  GsiStateEngine,
  normalizeSlot,
  formatDuration
};
