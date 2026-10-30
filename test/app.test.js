const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { ConfigManager } = require('../src/configManager');
const { GsiStateEngine, normalizeSlot } = require('../src/gsiStateEngine');
const { installGsiConfig, CFG_FILENAME } = require('../src/gsiInstaller');
const { createAppServer, startServer } = require('../server');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dotabuddy-test-'));
}

test('ConfigManager persists settings, clamps values, and tracks MMR/W-L across restarts', () => {
  const tmpDir = createTempDir();
  const cfgPath = path.join(tmpDir, 'config.json');

  const cm1 = new ConfigManager(cfgPath);
  assert.equal(cm1.get().mmrTracker.startingMmr, 7455);
  assert.equal(cm1.get().mmrTracker.currentMmr, 7455);
  assert.equal(cm1.get().mmrTracker.mmrStep, 25);

  // Update settings & verify 45-char clamping on queueBlocker.customText and 0..100 on intensity
  const longText = 'Ranked match / All pick / SE Asia / Extra Characters Beyond Limit';
  cm1.update({
    mmrTracker: { startingMmr: 8000, currentMmr: 8000, mmrStep: 30 },
    queueBlocker: { customText: longText },
    minimapBlocker: { intensity: 150, extraLarge: true, rightSide: true, style: 'simple' }
  });

  cm1.recordWin(); // 8000 + 30 = 8030, 1W
  cm1.recordWin(); // 8030 + 30 = 8060, 2W
  cm1.recordLoss(); // 8060 - 30 = 8030, 1L

  // Reload from disk in a new ConfigManager instance to verify persistence
  const cm2 = new ConfigManager(cfgPath);
  const loaded = cm2.get();
  assert.equal(loaded.mmrTracker.currentMmr, 8030);
  assert.equal(loaded.mmrTracker.wins, 2);
  assert.equal(loaded.mmrTracker.losses, 1);
  assert.equal(loaded.queueBlocker.customText.length, 45);
  assert.equal(loaded.queueBlocker.customText, longText.slice(0, 45));
  assert.equal(loaded.minimapBlocker.intensity, 100);
  assert.equal(loaded.minimapBlocker.extraLarge, true);
  assert.equal(loaded.minimapBlocker.rightSide, true);
  assert.equal(loaded.minimapBlocker.style, 'simple');

  // Reset session
  const afterReset = cm2.resetSession(7455);
  assert.equal(afterReset.mmrTracker.currentMmr, 7455);
  assert.equal(afterReset.mmrTracker.wins, 0);
  assert.equal(afterReset.mmrTracker.losses, 0);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('GsiStateEngine detects Main Menu, Draft Phase (with Smart Reveal & Strategy auto-hide), and In-Game states', () => {
  const tmpDir = createTempDir();
  const cm = new ConfigManager(path.join(tmpDir, 'config.json'));
  const engine = new GsiStateEngine(cm);

  // 1. Main menu state
  let snap = engine.processGsiPayload({ map: { game_state: 'DOTA_GAMERULES_STATE_INIT' } });
  assert.equal(snap.flags.isMainMenu, true);
  assert.equal(snap.flags.isDraftPhase, false);
  assert.equal(snap.flags.isInGame, false);

  // 2. Hero Selection — Banning Phase (All 10 slots covered, revealedSlot === null)
  snap = engine.processGsiPayload({
    map: { game_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION' },
    player: { team_name: 'dire', player_slot: 129 }, // Dire slot 6 (index 6)
    draft: { pick: false },
    hero: { id: 0 }
  });
  assert.equal(snap.flags.isMainMenu, false);
  assert.equal(snap.flags.isDraftPhase, true);
  assert.equal(snap.banningPhase, true);
  assert.equal(snap.revealedSlot, null);

  // 3. Hero Selection — Banning ends & streamer locks hero (Smart Reveal reveals slot 6 only)
  snap = engine.processGsiPayload({
    map: { game_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION' },
    player: { team_name: 'dire', player_slot: 129 },
    draft: { pick: true },
    hero: { id: 44, name: 'npc_dota_hero_phantom_assassin' }
  });
  assert.equal(snap.flags.isDraftPhase, true);
  assert.equal(snap.banningPhase, false);
  assert.equal(snap.ownHeroLocked, true);
  assert.equal(snap.revealedSlot, 6);

  // 4. Strategy Time — Hero Pick Blocker MUST automatically disappear
  snap = engine.processGsiPayload({
    map: { game_state: 'DOTA_GAMERULES_STATE_STRATEGY_TIME' }
  });
  assert.equal(snap.flags.isDraftPhase, false);
  assert.equal(snap.flags.isStrategyPhase, true);
  assert.equal(snap.revealedSlot, null);

  // 5. Pre-Game & Game In Progress — Minimap Blocker active
  snap = engine.processGsiPayload({
    map: { game_state: 'DOTA_GAMERULES_STATE_PRE_GAME' }
  });
  assert.equal(snap.flags.isInGame, true);

  snap = engine.processGsiPayload({
    map: { game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' }
  });
  assert.equal(snap.flags.isInGame, true);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('GsiStateEngine handles Aegis 5:00 countdown and Roshan 11:00 Red -> 3:00 Yellow respawn transition', () => {
  const tmpDir = createTempDir();
  const cm = new ConfigManager(path.join(tmpDir, 'config.json'));
  const engine = new GsiStateEngine(cm);
  const t0 = 1_700_000_000_000;

  // Trigger Aegis via inventory pickup
  let snap = engine.processGsiPayload(
    {
      map: { game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' },
      player: { team_name: 'radiant', player_slot: 2 },
      items: { slot0: { name: 'item_aegis' } }
    },
    t0
  );
  assert.equal(snap.aegis.active, true);
  assert.equal(snap.aegis.carrierSlot, 2);
  assert.equal(snap.aegis.remainingSec, 300);
  assert.equal(snap.aegis.formatted, '5:00');

  // Check Aegis after 120 seconds (3:00 remaining)
  snap = engine.getSnapshot(t0 + 120_000);
  assert.equal(snap.aegis.active, true);
  assert.equal(snap.aegis.remainingSec, 180);
  assert.equal(snap.aegis.formatted, '3:00');

  // Trigger Roshan Death via GSI event
  snap = engine.processGsiPayload(
    {
      map: { game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' },
      events: [{ event_type: 'roshan_killed', game_time: 1500 }]
    },
    t0
  );
  assert.equal(snap.roshan.active, true);
  assert.equal(snap.roshan.remainingSec, 660);
  assert.equal(snap.roshan.formatted, '11:00');
  assert.equal(snap.roshan.color, 'red');
  assert.equal(snap.roshan.phase, 'minimum');

  // At 7m 59s elapsed (479s elapsed -> 181s / 3:01 remaining): still RED minimum window
  snap = engine.getSnapshot(t0 + 479_000);
  assert.equal(snap.roshan.active, true);
  assert.equal(snap.roshan.remainingSec, 181);
  assert.equal(snap.roshan.formatted, '3:01');
  assert.equal(snap.roshan.color, 'red');
  assert.equal(snap.roshan.phase, 'minimum');

  // At 8m 00s elapsed (480s elapsed -> 180s / 3:00 remaining): transitions to YELLOW window
  snap = engine.getSnapshot(t0 + 480_000);
  assert.equal(snap.roshan.active, true);
  assert.equal(snap.roshan.remainingSec, 180);
  assert.equal(snap.roshan.formatted, '3:00');
  assert.equal(snap.roshan.color, 'yellow');
  assert.equal(snap.roshan.phase, 'window');

  // At 10m 00s elapsed (600s elapsed -> 60s / 1:00 remaining): still YELLOW window
  snap = engine.getSnapshot(t0 + 600_000);
  assert.equal(snap.roshan.active, true);
  assert.equal(snap.roshan.remainingSec, 60);
  assert.equal(snap.roshan.formatted, '1:00');
  assert.equal(snap.roshan.color, 'yellow');

  // At 11m 01s elapsed (661s elapsed): Roshan timer expires automatically
  snap = engine.getSnapshot(t0 + 661_000);
  assert.equal(snap.roshan.active, false);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('GsiStateEngine auto-detects match win/loss via GSI with matchId deduplication', () => {
  const tmpDir = createTempDir();
  const cm = new ConfigManager(path.join(tmpDir, 'config.json'));
  const engine = new GsiStateEngine(cm);

  // Match 1: Player on radiant, radiant wins -> +1W, +25 MMR (7455 -> 7480)
  engine.processGsiPayload({
    map: {
      game_state: 'DOTA_GAMERULES_STATE_POST_GAME',
      win_team: 'radiant',
      matchid: '7999000111'
    },
    player: {
      team_name: 'radiant'
    }
  });
  assert.equal(cm.get().mmrTracker.wins, 1);
  assert.equal(cm.get().mmrTracker.losses, 0);
  assert.equal(cm.get().mmrTracker.currentMmr, 7480);

  // Duplicate packet for the same match 7999000111 must NOT increment again
  engine.processGsiPayload({
    map: {
      game_state: 'DOTA_GAMERULES_STATE_POST_GAME',
      win_team: 'radiant',
      matchid: '7999000111'
    },
    player: {
      team_name: 'radiant'
    }
  });
  assert.equal(cm.get().mmrTracker.wins, 1);
  assert.equal(cm.get().mmrTracker.currentMmr, 7480);

  // Transition to new game and then lose Match 2
  engine.processGsiPayload({
    map: { game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS', matchid: '7999000222' },
    player: { team_name: 'dire' }
  });
  engine.processGsiPayload({
    map: {
      game_state: 'DOTA_GAMERULES_STATE_POST_GAME',
      win_team: 'radiant',
      matchid: '7999000222'
    },
    player: {
      team_name: 'dire'
    }
  });
  assert.equal(cm.get().mmrTracker.wins, 1);
  assert.equal(cm.get().mmrTracker.losses, 1);
  assert.equal(cm.get().mmrTracker.currentMmr, 7455);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('GSI Config Installer generates gamestate_integration_localoverlay.cfg in Dota 2 cfg directory', () => {
  const tmpDir = createTempDir();
  const fakeSteamRoot = path.join(tmpDir, 'Steam');

  const res = installGsiConfig({ customPath: fakeSteamRoot, port: 3000 });
  assert.equal(res.success, true);
  assert.equal(res.filename, CFG_FILENAME);
  assert.ok(
    res.targetFile.endsWith(
      path.join('Steam', 'steamapps', 'common', 'dota 2 beta', 'game', 'dota', 'cfg', 'gamestate_integration', CFG_FILENAME)
    )
  );
  assert.ok(fs.existsSync(res.targetFile));

  const content = fs.readFileSync(res.targetFile, 'utf8');
  assert.ok(content.includes('"http://127.0.0.1:3000/gsi"'));
  assert.ok(content.includes('"map"'));
  assert.ok(content.includes('"player"'));
  assert.ok(content.includes('"items"'));
  assert.ok(content.includes('"draft"'));
  assert.ok(content.includes('"events"'));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('HTTP Server & REST Endpoints serve /dashboard, /overlay, /gsi, and /api/simulate', async () => {
  const tmpDir = createTempDir();
  const cfgPath = path.join(tmpDir, 'config.json');
  const { server, tickInterval } = createAppServer({ configPath: cfgPath, port: 0 });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Check /dashboard view
    const dashRes = await fetch(`${baseUrl}/dashboard`);
    assert.equal(dashRes.status, 200);
    const dashHtml = await dashRes.text();
    assert.ok(dashHtml.includes('DotaBuddy Pro'));
    assert.ok(dashHtml.includes('Simulate Main Menu'));
    assert.ok(dashHtml.includes('Generate &amp; Install GSI Config'));

    // 2. Check /overlay view
    const overlayRes = await fetch(`${baseUrl}/overlay`);
    assert.equal(overlayRes.status, 200);
    const overlayHtml = await overlayRes.text();
    assert.ok(overlayHtml.includes('id="mmr-tracker"'));
    assert.ok(overlayHtml.includes('id="aegis-timer"'));
    assert.ok(overlayHtml.includes('id="roshan-timer"'));
    assert.ok(overlayHtml.includes('id="queue-blocker"'));
    assert.ok(overlayHtml.includes('id="hero-pick-blocker"'));
    assert.ok(overlayHtml.includes('id="minimap-blocker"'));

    // 3. Test POST /gsi
    const gsiRes = await fetch(`${baseUrl}/gsi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        map: { game_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION' },
        player: { team_name: 'radiant', player_slot: 0 },
        draft: { pick: false }
      })
    });
    assert.equal(gsiRes.status, 200);
    const gsiData = await gsiRes.json();
    assert.equal(gsiData.gsiState.flags.isDraftPhase, true);

    // 4. Test POST /api/simulate for Roshan Yellow Window
    const simRes = await fetch(`${baseUrl}/api/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'roshan', phase: 'yellow' })
    });
    assert.equal(simRes.status, 200);
    const simData = await simRes.json();
    assert.equal(simData.gsiState.roshan.active, true);
    assert.equal(simData.gsiState.roshan.color, 'yellow');

    // 5. Test live config slot sync while Aegis and simulated Draft are active
    await fetch(`${baseUrl}/api/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'aegis', slot: 0 })
    });
    const cfgUpdateRes = await fetch(`${baseUrl}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timers: { defaultHeroSlot: 7 },
        heroPickBlocker: { streamerSlot: 8 }
      })
    });
    const cfgUpdateData = await cfgUpdateRes.json();
    assert.equal(cfgUpdateData.gsiState.aegis.carrierSlot, 7);
    assert.equal(cfgUpdateData.gsiState.playerSlot, 8);
  } finally {
    clearInterval(tickInterval);
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Regression: null/empty coercion, stale matchId across games, draft ownHeroLocked leak, Roshan re-trigger, and post-game timer stop', () => {
  const tmpDir = createTempDir();
  const cfgPath = path.join(tmpDir, 'config.json');
  const cm = new ConfigManager(cfgPath);

  // 1. Verify null / empty string / boolean do not coerce to 0 in normalizeSlot, ConfigManager, or generateGsiConfigContent
  assert.equal(normalizeSlot(null, 5), 5);
  assert.equal(normalizeSlot('', 6), 6);
  assert.equal(normalizeSlot(false, 4), 4);
  assert.equal(normalizeSlot(130, 0), 7);

  cm.update({
    mmrTracker: { startingMmr: null, mmrStep: '' },
    minimapBlocker: { intensity: null }
  });
  assert.equal(cm.get().mmrTracker.startingMmr, 7455);
  assert.equal(cm.get().mmrTracker.mmrStep, 25);
  assert.equal(cm.get().minimapBlocker.intensity, 75);

  cm.recordWin(null);
  assert.equal(cm.get().mmrTracker.currentMmr, 7480);
  cm.resetSession(null);
  assert.equal(cm.get().mmrTracker.startingMmr, 7455);
  assert.equal(cm.get().mmrTracker.currentMmr, 7455);

  const { generateGsiConfigContent } = require('../src/gsiInstaller');
  assert.ok(generateGsiConfigContent(null).includes('http://127.0.0.1:3000/gsi'));
  assert.ok(generateGsiConfigContent(0).includes('http://127.0.0.1:3000/gsi'));

  // 2. Verify consecutive matches where Match 1 has a matchid and Match 2 has matchid: '0'
  const engine = new GsiStateEngine(cm);
  engine.processGsiPayload({
    map: { game_state: 'DOTA_GAMERULES_STATE_POST_GAME', win_team: 'radiant', matchid: '1001' },
    player: { team_name: 'radiant' }
  });
  assert.equal(cm.get().mmrTracker.wins, 1);

  engine.processGsiPayload({ map: { game_state: 'DOTA_GAMERULES_STATE_INIT' } });
  engine.processGsiPayload({
    map: { game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS', matchid: '0' },
    player: { team_name: 'radiant' },
    hero: { id: 1, name: 'npc_dota_hero_antimage' }
  });
  engine.processGsiPayload({
    map: { game_state: 'DOTA_GAMERULES_STATE_POST_GAME', win_team: 'radiant', matchid: '0' },
    player: { team_name: 'radiant' }
  });
  assert.equal(cm.get().mmrTracker.wins, 2);

  // 3. Verify Hero Pick Blocker does not leak ownHeroLocked=true from previous match when hero:{id:0}
  engine.processGsiPayload({ map: { game_state: 'DOTA_GAMERULES_STATE_INIT' } });
  let snap = engine.processGsiPayload({
    map: { game_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION' }
  });
  assert.equal(snap.banningPhase, true);
  assert.equal(snap.ownHeroLocked, false);
  assert.equal(snap.revealedSlot, null);

  snap = engine.processGsiPayload({
    map: { game_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION' },
    draft: { pick: true },
    hero: { id: 0 }
  });
  assert.equal(snap.banningPhase, false);
  assert.equal(snap.ownHeroLocked, false);
  assert.equal(snap.revealedSlot, null);

  // 4. Verify Roshan timer does NOT reset when roshan_killed event is followed by map.roshan_state='respawn_base'
  const t0 = 1_700_000_000_000;
  engine.processGsiPayload(
    {
      map: { game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' },
      events: [{ event_type: 'roshan_killed', game_time: 2000 }]
    },
    t0
  );
  snap = engine.processGsiPayload(
    {
      map: { game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS', roshan_state: 'respawn_base' },
      items: { slot0: { name: 'item_aegis' } }
    },
    t0 + 30_000
  );
  assert.equal(snap.roshan.active, true);
  assert.equal(snap.roshan.remainingSec, 630);
  assert.equal(snap.roshan.formatted, '10:30');
  assert.equal(snap.aegis.active, true);

  // 5. Verify Aegis & Roshan timers stop on POST_GAME even when autoTrackGsi is false
  cm.update({ mmrTracker: { autoTrackGsi: false } });
  snap = engine.processGsiPayload(
    {
      map: { game_state: 'DOTA_GAMERULES_STATE_POST_GAME', win_team: 'radiant' }
    },
    t0 + 60_000
  );
  assert.equal(snap.aegis.active, false);
  assert.equal(snap.roshan.active, false);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('Overlay Frontend Script (overlay.js) accurately updates DOM coordinates, visibility, and classes across all 5 features', () => {
  const vm = require('node:vm');
  const overlayScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'overlay.js'), 'utf8');

  function makeEl(id, attrs = {}) {
    const classes = new Set(attrs.classes || []);
    return {
      id,
      style: {},
      textContent: '',
      attrs: { ...attrs },
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)),
        remove: (...c) => c.forEach((x) => classes.delete(x)),
        toggle: (c, force) => {
          const shouldAdd = force !== undefined ? Boolean(force) : !classes.has(c);
          if (shouldAdd) classes.add(c);
          else classes.delete(c);
        },
        contains: (c) => classes.has(c)
      },
      getAttribute: (k) => attrs[k],
      setAttribute: (k, v) => {
        attrs[k] = v;
      }
    };
  }

  const elements = {};
  [
    'overlay-viewport',
    'mmr-tracker',
    'mmr-tracker-text',
    'aegis-timer',
    'aegis-time-text',
    'aegis-bar-fill',
    'roshan-timer',
    'roshan-ring-progress',
    'roshan-phase-label',
    'roshan-time-text',
    'roshan-sub-text',
    'roshan-eye-left',
    'roshan-eye-right',
    'queue-blocker',
    'queue-finding-view',
    'queue-solid-view',
    'queue-custom-text',
    'hero-pick-blocker',
    'draft-radiant-slots',
    'draft-dire-slots',
    'draft-minimap-mask',
    'draft-choose-hero-mask',
    'draft-phase-status-badge',
    'minimap-blocker',
    'minimap-svg-complex',
    'minimap-svg-simple'
  ].forEach((id) => {
    elements[id] = makeEl(id);
  });

  const draftSlots = Array.from({ length: 10 }, (_, i) => makeEl(`slot-${i}`, { 'data-slot': String(i) }));

  let socketHandlers = {};
  const sandbox = {
    window: {
      innerWidth: 1920,
      innerHeight: 1080,
      addEventListener: () => {}
    },
    document: {
      getElementById: (id) => elements[id] || null,
      querySelectorAll: (sel) => (sel === '.draft-slot' ? draftSlots : [])
    },
    fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
    io: () => ({
      on: (event, cb) => {
        socketHandlers[event] = cb;
      }
    }),
    Math,
    Number,
    String,
    Boolean,
    Array
  };

  vm.runInNewContext(overlayScript, sandbox);

  const tmpDir = createTempDir();
  const cm = new ConfigManager(path.join(tmpDir, 'config.json'));
  const engine = new GsiStateEngine(cm);

  // 1. Main menu state -> Queue blocker visible, Draft/Minimap hidden
  let gsiState = engine.simulateState('main_menu');
  socketHandlers['state:update']({ config: cm.get(), gsiState });
  assert.equal(elements['queue-blocker'].classList.contains('overlay-hidden'), false);
  assert.equal(elements['hero-pick-blocker'].classList.contains('overlay-hidden'), true);
  assert.equal(elements['minimap-blocker'].classList.contains('overlay-hidden'), true);
  assert.equal(elements['mmr-tracker-text'].textContent, 'STREAM | 0W - 0L | 7,455 MMR');

  // 2. Draft state with Smart Reveal on slot 3 -> Draft blocker visible, only slot 3 has .slot-revealed
  gsiState = engine.simulateState('draft', { banningPhase: false, ownHeroLocked: true, streamerSlot: 3 });
  socketHandlers['state:update']({ config: cm.get(), gsiState });
  assert.equal(elements['queue-blocker'].classList.contains('overlay-hidden'), true);
  assert.equal(elements['hero-pick-blocker'].classList.contains('overlay-hidden'), false);
  assert.equal(draftSlots[3].classList.contains('slot-revealed'), true);
  assert.equal(draftSlots[0].classList.contains('slot-revealed'), false);

  // 3. In-game with extraLarge + rightSide minimap + Aegis on slot 5 + Roshan Yellow
  cm.update({ minimapBlocker: { extraLarge: true, rightSide: true, style: 'simple', intensity: 80 } });
  engine.simulateState('in_game');
  engine.simulateState('aegis', { slot: 5 });
  gsiState = engine.simulateState('roshan', { phase: 'yellow' });
  socketHandlers['state:update']({ config: cm.get(), gsiState });

  assert.equal(elements['minimap-blocker'].classList.contains('overlay-hidden'), false);
  assert.equal(elements['minimap-blocker'].style.width, '280px');
  assert.equal(elements['minimap-blocker'].style.right, '0px');
  assert.equal(elements['minimap-blocker'].style.opacity, '0.8');
  assert.equal(elements['minimap-svg-simple'].classList.contains('overlay-hidden'), false);
  assert.equal(elements['minimap-svg-complex'].classList.contains('overlay-hidden'), true);

  assert.equal(elements['aegis-timer'].classList.contains('overlay-hidden'), false);
  assert.equal(elements['aegis-timer'].style.left, '1104px');
  assert.equal(elements['roshan-timer'].classList.contains('overlay-hidden'), false);
  assert.equal(elements['roshan-timer'].classList.contains('roshan-yellow'), true);
  assert.equal(elements['roshan-timer'].style.right, '292px');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('startServer handles EADDRINUSE by replacing an existing DotaBuddy instance, securing /api/shutdown, handling hung TCP sockets, and reclaiming fallback ports', async () => {
  const http = require('node:http');
  const net = require('node:net');
  const tmpDir = createTempDir();
  const cfgPath = path.join(tmpDir, 'config.json');

  // 1. Start first DotaBuddy instance on an ephemeral port, verify /api/shutdown blocks browser/unauthenticated POSTs, then replace it via startServer
  const inst1 = await startServer({ configPath: cfgPath, port: 0, silent: true });
  const targetPort = inst1.port;
  assert.ok(targetPort > 0);

  // Missing X-DotaBuddy-Shutdown header must be rejected with 403
  const noHeaderShutdown = await fetch(`http://127.0.0.1:${targetPort}/api/shutdown`, {
    method: 'POST'
  });
  assert.equal(noHeaderShutdown.status, 403);

  // Browser Origin header must be rejected with 403 even if header is present
  const browserOriginShutdown = await fetch(`http://127.0.0.1:${targetPort}/api/shutdown`, {
    method: 'POST',
    headers: {
      'X-DotaBuddy-Shutdown': 'dotabuddy-overlay',
      Origin: 'https://evil.example.com'
    }
  });
  assert.equal(browserOriginShutdown.status, 403);

  const inst2 = await startServer({ configPath: cfgPath, port: targetPort, silent: true });
  assert.equal(inst2.port, targetPort);

  const stateRes = await fetch(`http://127.0.0.1:${targetPort}/api/state`);
  assert.equal(stateRes.status, 200);
  await inst2.closeServer();

  // 2. Occupy preferred port with a non-DotaBuddy HTTP server, verify fallback to next port, AND verify a second startServer reclaims that fallback port instead of leaking to port+2
  const foreignServer = http.createServer((req, res) => {
    res.writeHead(404);
    res.end('Not DotaBuddy');
  });
  await new Promise((resolve) => foreignServer.listen(0, resolve));
  const occupiedPort = foreignServer.address().port;

  const inst3 = await startServer({
    configPath: cfgPath,
    port: occupiedPort,
    maxPortRetries: 5,
    silent: true
  });
  try {
    assert.ok(inst3.port > occupiedPort);
    const fallbackPort = inst3.port;
    const fallbackRes = await fetch(`http://127.0.0.1:${fallbackPort}/api/state`);
    assert.equal(fallbackRes.status, 200);

    // Starting another DotaBuddy targeting occupiedPort should skip occupiedPort and reclaim fallbackPort from inst3
    const inst4 = await startServer({
      configPath: cfgPath,
      port: occupiedPort,
      maxPortRetries: 5,
      silent: true
    });
    assert.equal(inst4.port, fallbackPort);
    await inst4.closeServer();

    // 3. When maxPortRetries is 0 and port is occupied by a non-DotaBuddy server, rejects with EADDRINUSE
    await assert.rejects(
      () =>
        startServer({
          configPath: cfgPath,
          port: occupiedPort,
          maxPortRetries: 0,
          silent: true
        }),
      (err) => err && err.code === 'EADDRINUSE'
    );
  } finally {
    await inst3.closeServer();
    await new Promise((resolve) => foreignServer.close(resolve));
  }

  // 4. Raw TCP server that accepts connections and trickles bytes without finishing HTTP response triggers hard timeout and falls back cleanly
  const hungSockets = new Set();
  const rawTcpServer = net.createServer((socket) => {
    hungSockets.add(socket);
    socket.write('HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\n');
    const interval = setInterval(() => {
      if (!socket.destroyed) socket.write('.');
    }, 200);
    socket.on('close', () => {
      clearInterval(interval);
      hungSockets.delete(socket);
    });
    socket.on('error', () => {
      clearInterval(interval);
      hungSockets.delete(socket);
    });
  });
  await new Promise((resolve) => rawTcpServer.listen(0, resolve));
  const hungPort = rawTcpServer.address().port;

  const inst5 = await startServer({
    configPath: cfgPath,
    port: hungPort,
    maxPortRetries: 3,
    silent: true
  });
  try {
    assert.ok(inst5.port > hungPort);
  } finally {
    await inst5.closeServer();
    for (const s of hungSockets) s.destroy();
    await new Promise((resolve) => rawTcpServer.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Automation improvements: Aegis pickup auto-starts Roshan, All Pick Smart Reveal without draft.pick, playerSlot reset on menu, and startup GSI auto-install', async () => {
  const tmpDir = createTempDir();
  const cfgPath = path.join(tmpDir, 'config.json');
  const fakeDotaRoot = path.join(tmpDir, 'dota 2 beta');
  const cm = new ConfigManager(cfgPath);
  cm.update({
    heroPickBlocker: { streamerSlot: 4, revealOwnHero: true },
    gsi: { dotaPath: fakeDotaRoot }
  });

  const engine = new GsiStateEngine(cm);
  const t0 = 1_700_000_000_000;

  // 1. All Pick Hero Selection where Valve omits draft.pick: locking hero (hero.id > 0) automatically clears banningPhase and reveals streamer's slot
  let snap = engine.processGsiPayload(
    {
      map: { game_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION' },
      player: { team_name: 'dire', player_slot: 131 }, // Dire slot 8
      hero: { id: 0, name: '' }
    },
    t0
  );
  assert.equal(snap.banningPhase, true);
  assert.equal(snap.ownHeroLocked, false);
  assert.equal(snap.revealedSlot, null);

  snap = engine.processGsiPayload(
    {
      map: { game_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION' },
      player: { team_name: 'dire', player_slot: 131 },
      hero: { id: 8, name: 'npc_dota_hero_juggernaut' }
    },
    t0 + 10_000
  );
  assert.equal(snap.banningPhase, false);
  assert.equal(snap.ownHeroLocked, true);
  assert.equal(snap.playerSlot, 8);
  assert.equal(snap.revealedSlot, 8);

  // Verify partial GSI update during HERO_SELECTION (e.g. draft:{pick:false} without hero) retains ownHeroLocked & banningPhase=false
  snap = engine.processGsiPayload(
    {
      map: { game_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION' },
      draft: { pick: false, activeteam: 2 }
    },
    t0 + 12_000
  );
  assert.equal(snap.banningPhase, false);
  assert.equal(snap.ownHeroLocked, true);
  assert.equal(snap.revealedSlot, 8);

  // Also test teamDraft.pickX_id > 0 without draft.pick, and verify main menu ignores stale player_slot
  engine.processGsiPayload(
    {
      map: { game_state: 'DOTA_GAMERULES_STATE_INIT' },
      player: { team_name: 'dire', player_slot: 131 }
    },
    t0 + 15_000
  );
  // Returning to main menu resets playerSlot to null even if stale player_slot was in the INIT packet
  assert.equal(engine.getSnapshot(t0 + 15_000).playerSlot, 4);

  // Multiple streamerSlot config updates while playerSlot is null (non-simulated) must all take effect
  cm.update({ heroPickBlocker: { streamerSlot: 6 } });
  engine.syncConfigChange({ heroPickBlocker: { streamerSlot: 6 } });
  assert.equal(engine.getSnapshot(t0 + 16_000).playerSlot, 6);
  cm.update({ heroPickBlocker: { streamerSlot: 4 } });
  engine.syncConfigChange({ heroPickBlocker: { streamerSlot: 4 } });
  assert.equal(engine.getSnapshot(t0 + 17_000).playerSlot, 4);

  snap = engine.processGsiPayload(
    {
      map: { game_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION' },
      draft: { team2: { pick4_id: 74, pick4_class: 'npc_dota_hero_invoker' } }
    },
    t0 + 20_000
  );
  assert.equal(snap.banningPhase, false);
  assert.equal(snap.ownHeroLocked, true);
  assert.equal(snap.revealedSlot, 4);

  // 2. Picking up item_aegis in standard matchmaking (where roshan state is omitted) auto-starts BOTH Aegis (5:00) and Roshan (11:00) timers
  snap = engine.processGsiPayload(
    {
      map: { game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' },
      player: { team_name: 'radiant', player_slot: 1 },
      items: { slot0: { name: 'item_aegis' } }
    },
    t0 + 100_000
  );
  assert.equal(snap.aegis.active, true);
  assert.equal(snap.aegis.carrierSlot, 1);
  assert.equal(snap.aegis.remainingSec, 300);
  assert.equal(snap.roshan.active, true);
  assert.equal(snap.roshan.remainingSec, 660);
  assert.equal(snap.roshan.color, 'red');

  // Consuming/dropping Aegis stops Aegis timer but keeps Roshan respawn timer running
  snap = engine.processGsiPayload(
    {
      map: { game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' },
      items: { slot0: { name: 'item_blink' } }
    },
    t0 + 220_000
  );
  assert.equal(snap.aegis.active, false);
  assert.equal(snap.roshan.active, true);
  assert.equal(snap.roshan.remainingSec, 540);

  // 3. Startup Zero-Click GSI Auto-Install, /api/state gsiConfigStatus, and clearing dotaPath via /api/gsi/install
  const inst = await startServer({
    configPath: cfgPath,
    port: 0,
    silent: true,
    autoInstallGsi: true
  });
  try {
    assert.ok(inst.gsiAutoInstallResult);
    assert.equal(inst.gsiAutoInstallResult.success, true);
    assert.ok(fs.existsSync(inst.gsiAutoInstallResult.targetFile));

    const stateRes = await fetch(`http://127.0.0.1:${inst.port}/api/state`);
    assert.equal(stateRes.status, 200);
    const stateData = await stateRes.json();
    assert.ok(stateData.gsiConfigStatus);
    assert.equal(stateData.gsiConfigStatus.installed, true);
    assert.equal(stateData.gsiConfigStatus.targetFile, inst.gsiAutoInstallResult.targetFile);

    // Clearing dotaPath back to empty string via POST /api/gsi/install updates config.gsi.dotaPath to ''
    const clearRes = await fetch(`http://127.0.0.1:${inst.port}/api/gsi/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dotaPath: '' })
    });
    assert.equal(clearRes.status, 200);
    const afterClearState = await (await fetch(`http://127.0.0.1:${inst.port}/api/state`)).json();
    assert.equal(afterClearState.config.gsi.dotaPath, '');
  } finally {
    await inst.closeServer();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Dashboard Frontend Script (dashboard.js) updates GSI CFG status badge, install result banner, and live/simulation indicators', () => {
  const vm = require('node:vm');
  const dashScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard.js'), 'utf8');

  function makeEl(id, initialClasses = []) {
    const classes = new Set(initialClasses);
    const listeners = {};
    return {
      id,
      value: '',
      checked: false,
      textContent: '',
      className: initialClasses.join(' '),
      type: 'text',
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)),
        remove: (...c) => c.forEach((x) => classes.delete(x)),
        contains: (c) => classes.has(c)
      },
      addEventListener: (ev, cb) => {
        listeners[ev] = cb;
      },
      trigger: (ev, arg = {}) => {
        if (listeners[ev]) listeners[ev](arg);
      }
    };
  }

  const ids = [
    'gsi-status-dot',
    'gsi-status-text',
    'gsi-gamestate-badge',
    'obs-url-code',
    'btn-copy-obs-url',
    'sim-toast',
    'mmr-enabled',
    'mmr-label',
    'mmr-starting',
    'mmr-current',
    'mmr-step',
    'mmr-wins',
    'mmr-losses',
    'mmr-show-menu',
    'mmr-show-ingame',
    'mmr-auto-gsi',
    'dash-mmr-preview',
    'btn-mmr-win',
    'btn-mmr-loss',
    'btn-mmr-reset',
    'timers-aegis-enabled',
    'timers-roshan-enabled',
    'timers-hero-slot',
    'dash-aegis-status',
    'dash-roshan-status',
    'btn-start-aegis',
    'btn-stop-aegis',
    'btn-start-roshan',
    'btn-yellow-roshan',
    'btn-stop-roshan',
    'qb-enabled',
    'qb-show-finding',
    'qb-custom-text',
    'qb-char-count',
    'hpb-enabled',
    'hpb-top-slots',
    'hpb-minimap',
    'hpb-choose-box',
    'hpb-reveal-own',
    'hpb-streamer-slot',
    'mm-enabled',
    'mm-style',
    'mm-intensity',
    'mm-intensity-val',
    'mm-extralarge',
    'mm-rightside',
    'mm-bp-offset',
    'gsi-dota-path',
    'btn-install-gsi',
    'gsi-install-result',
    'gsi-cfg-preview',
    'gsi-cfg-status-badge',
    'sim-main-menu',
    'sim-wait-load',
    'sim-draft',
    'sim-draft-reveal',
    'sim-strategy',
    'sim-in-game',
    'sim-aegis',
    'sim-roshan',
    'sim-roshan-yellow',
    'sim-win',
    'sim-loss'
  ];

  const elements = {};
  ids.forEach((id) => {
    elements[id] = makeEl(id, id === 'gsi-install-result' ? ['hidden'] : []);
  });

  const socketHandlers = {};
  const sandbox = {
    window: {
      location: { origin: 'http://localhost:3000' },
      addEventListener: () => {}
    },
    document: {
      activeElement: null,
      getElementById: (id) => elements[id] || null
    },
    navigator: { clipboard: { writeText: () => {} } },
    fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
    io: () => ({
      connected: true,
      on: (ev, cb) => {
        socketHandlers[ev] = cb;
      },
      emit: () => {}
    }),
    setTimeout: () => 1,
    clearTimeout: () => {},
    Number,
    String,
    Boolean
  };

  vm.runInNewContext(dashScript, sandbox);

  const tmpDir = createTempDir();
  const cm = new ConfigManager(path.join(tmpDir, 'config.json'));
  const engine = new GsiStateEngine(cm);

  // 1. Installed GSI config + live GSI packet -> ✓ CFG INSTALLED, banner visible, GSI LIVE
  const liveSnap = engine.processGsiPayload({
    map: { game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' },
    player: { team_name: 'radiant', player_slot: 2 },
    items: { slot0: { name: 'item_aegis' } }
  });
  socketHandlers['state:update']({
    config: cm.get(),
    gsiState: liveSnap,
    gsiConfigStatus: {
      installed: true,
      filename: CFG_FILENAME,
      targetFile: 'C:\\Steam\\steamapps\\common\\dota 2 beta\\game\\dota\\cfg\\gamestate_integration\\' + CFG_FILENAME,
      content: '"DotaBuddy Local Stream Overlay Configuration"'
    }
  });

  assert.equal(elements['gsi-status-text'].textContent, 'GSI LIVE');
  assert.equal(elements['gsi-cfg-status-badge'].textContent, '✓ CFG INSTALLED');
  assert.equal(elements['gsi-install-result'].classList.contains('hidden'), false);
  assert.ok(elements['gsi-install-result'].textContent.includes('Restart Dota 2 once if it was already open'));
  assert.ok(elements['dash-aegis-status'].textContent.includes('ACTIVE (5:00) — Slot 3'));
  assert.ok(elements['dash-roshan-status'].textContent.includes('RED MINIMUM (11:00)'));

  // 2. Uninstalled GSI config -> NOT INSTALLED and result banner hidden
  socketHandlers['state:update']({
    config: cm.get(),
    gsiState: liveSnap,
    gsiConfigStatus: {
      installed: false,
      filename: CFG_FILENAME,
      targetFile: 'C:\\missing\\' + CFG_FILENAME,
      content: '"DotaBuddy Local Stream Overlay Configuration"'
    }
  });
  assert.equal(elements['gsi-cfg-status-badge'].textContent, 'NOT INSTALLED');
  assert.equal(elements['gsi-install-result'].classList.contains('hidden'), true);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('Minimalist DotaBod UI design & Real-Time Demo Hero / Live GSI synchronization for Aegis & Roshan timers', async () => {
  const tmpDir = createTempDir();
  const cfgPath = path.join(tmpDir, 'config.json');
  const cm = new ConfigManager(cfgPath);
  const engine = new GsiStateEngine(cm);
  const t0 = 1_700_000_000_000;

  // 1. Verify minimalist transparent overlay HTML & CSS (no rectangle box or MIN RESPAWN clutter)
  const overlayHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'overlay.html'), 'utf8');
  const overlayCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'overlay.css'), 'utf8');
  assert.ok(!overlayHtml.includes('MIN RESPAWN'), 'Roshan widget must not contain MIN RESPAWN text');
  assert.ok(!overlayHtml.includes('id="roshan-phase-label"'), 'Redundant Roshan phase label must be removed');
  assert.ok(!overlayHtml.includes('id="roshan-sub-text"'), 'Redundant Roshan sub text must be removed');
  assert.ok(!overlayHtml.includes('class="aegis-bar-track"'), 'Aegis widget must only have icon and timer below');
  assert.ok(overlayCss.includes('background: transparent !important;'));
  assert.ok(overlayCss.includes('font-weight: 400;'));

  // 2. Dashboard Simulation -> Live Demo Hero GSI transition clears simulated Aegis & Roshan immediately
  engine.simulateState('in_game', {}, t0);
  engine.simulateState('aegis', { slot: 0 }, t0 + 1_000);
  let snap = engine.simulateState('roshan', { phase: 'red' }, t0 + 4_000);
  assert.equal(snap.aegis.active, true);
  assert.equal(snap.roshan.active, true);
  assert.equal(snap.simulationMode, true);

  // Live GSI packet from Demo Hero mode (no Aegis in inventory, Roshan alive) must clear both widgets
  snap = engine.processGsiPayload(
    {
      map: {
        name: 'hero_demo_main',
        game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
        clock_time: 305,
        game_time: 305
      },
      player: { team_name: 'radiant', player_slot: 0 },
      hero: { id: 21, name: 'npc_dota_hero_windrunner', level: 1 },
      items: { slot0: { name: 'empty' }, slot1: { name: 'empty' } }
    },
    t0 + 120_000
  );
  assert.equal(snap.simulationMode, false);
  assert.equal(snap.aegis.active, false);
  assert.equal(snap.roshan.active, false);

  // 3. Picking up Aegis in Demo Hero mode starts both timers; removing/expiring Aegis in Demo Hero clears both
  snap = engine.processGsiPayload(
    {
      map: {
        name: 'hero_demo_main',
        game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
        clock_time: 310
      },
      items: { slot0: { name: 'item_aegis' } }
    },
    t0 + 125_000
  );
  assert.equal(snap.aegis.active, true);
  assert.equal(snap.roshan.active, true);

  snap = engine.processGsiPayload(
    {
      map: {
        name: 'hero_demo_main',
        game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
        clock_time: 320
      },
      items: { slot0: { name: 'empty' } }
    },
    t0 + 135_000
  );
  assert.equal(snap.aegis.active, false);
  assert.equal(snap.roshan.active, false);

  // 4. In standard map, Demo Hero RESET (level drop or hero switch or clock rewind) clears Roshan & Aegis
  snap = engine.processGsiPayload(
    {
      map: {
        name: 'start',
        game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
        clock_time: 600
      },
      hero: { id: 21, name: 'npc_dota_hero_windrunner', level: 15 },
      items: { slot0: { name: 'item_aegis' } }
    },
    t0 + 200_000
  );
  assert.equal(snap.aegis.active, true);
  assert.equal(snap.roshan.active, true);

  // Clicking "Change My Hero" in Demo Hero mode (hero.id changes mid-game) clears both
  snap = engine.processGsiPayload(
    {
      map: {
        name: 'start',
        game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
        clock_time: 605
      },
      hero: { id: 1, name: 'npc_dota_hero_antimage', level: 15 }
    },
    t0 + 205_000
  );
  assert.equal(snap.aegis.active, false);
  assert.equal(snap.roshan.active, false);

  // Re-trigger and test in-game clock fast-forward (-ff / host_timescale) expiring Aegis & Roshan
  snap = engine.processGsiPayload(
    {
      map: {
        name: 'start',
        game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
        clock_time: 700
      },
      items: { slot0: { name: 'item_aegis' } }
    },
    t0 + 210_000
  );
  assert.equal(snap.aegis.active, true);
  assert.equal(snap.roshan.active, true);

  // Fast-forward clock_time by 305s (700 -> 1005) while wall clock only advances 2s: Aegis expires!
  snap = engine.processGsiPayload(
    {
      map: {
        name: 'start',
        game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
        clock_time: 1005
      }
    },
    t0 + 212_000
  );
  assert.equal(snap.aegis.active, false);
  assert.equal(snap.roshan.active, true);

  // Roshan health > 0 in GSI payload immediately stops Roshan timer even if lastRoshanAlive was out of sync
  engine.lastRoshanAlive = true;
  snap = engine.processGsiPayload(
    {
      map: {
        name: 'start',
        game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
        clock_time: 1010
      },
      roshan: { health: 6000, max_health: 6000 }
    },
    t0 + 215_000
  );
  assert.equal(snap.roshan.active, false);

  // 5. Regression: Manual stopAegis() or 5:00 expiration tick while item_aegis is still in a buffered GSI packet must NOT restart Aegis
  snap = engine.processGsiPayload(
    {
      map: {
        name: 'hero_demo_main',
        game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
        clock_time: 1100
      },
      items: { slot0: { name: 'item_aegis' } }
    },
    t0 + 220_000
  );
  assert.equal(snap.aegis.active, true);
  assert.equal(snap.roshan.active, true);

  // User clicks manual Reset (stopAegis) while item_aegis is still in hero's inventory
  engine.stopAegis(t0 + 225_000);
  snap = engine.processGsiPayload(
    {
      map: {
        name: 'hero_demo_main',
        game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
        clock_time: 1105
      },
      items: { slot0: { name: 'item_aegis' } }
    },
    t0 + 225_100
  );
  assert.equal(snap.aegis.active, false, 'Manual stopAegis must not be undone by next GSI packet with same item_aegis');

  // When item_aegis is later removed in Demo Hero, inferred Roshan timer also clears even though aegis.active was already false
  snap = engine.processGsiPayload(
    {
      map: {
        name: 'hero_demo_main',
        game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
        clock_time: 1110
      },
      items: { slot0: { name: 'empty' } }
    },
    t0 + 230_000
  );
  assert.equal(snap.roshan.active, false, 'Inferred Roshan in Demo Hero must clear when Aegis leaves inventory even if Aegis was already inactive');

  // 6. Regression: Triggering Roshan/Aegis before map.clock_time is known must NOT falsely expire when first map.clock_time: 720 arrives
  const engine2 = new GsiStateEngine(cm);
  engine2.processGsiPayload(
    {
      map: { game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' },
      events: [{ event_type: 'roshan_killed', game_time: 720 }],
      items: { slot0: { name: 'item_aegis' } }
    },
    t0
  );
  snap = engine2.processGsiPayload(
    {
      map: { game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS', clock_time: 721 },
      items: { slot0: { name: 'item_aegis' } }
    },
    t0 + 1_000
  );
  assert.equal(snap.aegis.active, true);
  assert.equal(snap.aegis.remainingSec, 299);
  assert.equal(snap.roshan.active, true);
  assert.equal(snap.roshan.remainingSec, 659);

  // 7. Regression: Hero death (hero.alive === false) immediately clears active Aegis, and new Aegis pickup during Roshan yellow window resets Roshan to 11:00
  snap = engine2.processGsiPayload(
    {
      map: { game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS', clock_time: 750 },
      hero: { id: 21, name: 'npc_dota_hero_windrunner', alive: false, respawn_seconds: 25 }
    },
    t0 + 30_000
  );
  assert.equal(snap.aegis.active, false, 'Dead hero cannot hold active Aegis');
  assert.equal(snap.roshan.active, true);

  // Advance 500s into Roshan yellow spawn window (500s elapsed >= 480s minSec), then pick up a new Aegis
  snap = engine2.processGsiPayload(
    {
      map: { game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS', clock_time: 1221 },
      hero: { id: 21, name: 'npc_dota_hero_windrunner', alive: true, respawn_seconds: 0 },
      items: { slot0: { name: 'item_aegis' } }
    },
    t0 + 500_000
  );
  assert.equal(snap.aegis.active, true);
  assert.equal(snap.aegis.remainingSec, 300);
  assert.equal(snap.roshan.active, true);
  assert.equal(snap.roshan.remainingSec, 660, 'New Aegis pickup during Roshan spawn window must reset Roshan to 11:00');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('Rank Tier System accurately maps MMR to brackets, generates SVG medals, and resolves candidate image filenames', () => {
  const {
    getRankFromMmr,
    getRankImageCandidates,
    getRankImagePath,
    generateRankSvg,
    sanitizeMmr
  } = require('../src/configManager');

  // 1. Edge cases & boundaries
  assert.equal(sanitizeMmr(null), 0);
  assert.equal(sanitizeMmr(undefined), 0);
  assert.equal(sanitizeMmr(-100), 0);
  assert.equal(sanitizeMmr('abc'), 0);
  assert.equal(sanitizeMmr('3700'), 3700);

  // Unranked: 0 - 9
  assert.equal(getRankFromMmr(0).rankName, 'Unranked');
  assert.equal(getRankFromMmr(0).tier, 0);
  assert.equal(getRankFromMmr(0).stars, 0);
  assert.equal(getRankFromMmr(9).rankName, 'Unranked');

  // Herald 1–5: 10 – 769 (tier 1: 10, tier 2: 154, tier 3: 308, tier 4: 462, tier 5: 616)
  assert.equal(getRankFromMmr(10).rankName, 'Herald 1');
  assert.equal(getRankFromMmr(10).stars, 1);
  assert.equal(getRankFromMmr(153).rankName, 'Herald 1');
  assert.equal(getRankFromMmr(154).rankName, 'Herald 2');
  assert.equal(getRankFromMmr(307).rankName, 'Herald 2');
  assert.equal(getRankFromMmr(308).rankName, 'Herald 3');
  assert.equal(getRankFromMmr(462).rankName, 'Herald 4');
  assert.equal(getRankFromMmr(616).rankName, 'Herald 5');
  assert.equal(getRankFromMmr(769).rankName, 'Herald 5');

  // Guardian 1–5: 770 – 1539 (tier 1: 770, tier 2: 924, tier 3: 1078, tier 4: 1232, tier 5: 1386)
  assert.equal(getRankFromMmr(770).rankName, 'Guardian 1');
  assert.equal(getRankFromMmr(924).rankName, 'Guardian 2');
  assert.equal(getRankFromMmr(1078).rankName, 'Guardian 3');
  assert.equal(getRankFromMmr(1232).rankName, 'Guardian 4');
  assert.equal(getRankFromMmr(1386).rankName, 'Guardian 5');
  assert.equal(getRankFromMmr(1539).rankName, 'Guardian 5');

  // Crusader 1–5: 1540 – 2309 (tier 1: 1540, tier 2: 1694, tier 3: 1848, tier 4: 2002, tier 5: 2156)
  assert.equal(getRankFromMmr(1540).rankName, 'Crusader 1');
  assert.equal(getRankFromMmr(1694).rankName, 'Crusader 2');
  assert.equal(getRankFromMmr(1848).rankName, 'Crusader 3');
  assert.equal(getRankFromMmr(2002).rankName, 'Crusader 4');
  assert.equal(getRankFromMmr(2156).rankName, 'Crusader 5');
  assert.equal(getRankFromMmr(2309).rankName, 'Crusader 5');

  // Archon 1–5: 2310 – 3079 (tier 1: 2310, tier 2: 2464, tier 3: 2618, tier 4: 2772, tier 5: 2926)
  assert.equal(getRankFromMmr(2310).rankName, 'Archon 1');
  assert.equal(getRankFromMmr(2464).rankName, 'Archon 2');
  assert.equal(getRankFromMmr(2618).rankName, 'Archon 3');
  assert.equal(getRankFromMmr(2772).rankName, 'Archon 4');
  assert.equal(getRankFromMmr(2926).rankName, 'Archon 5');
  assert.equal(getRankFromMmr(3079).rankName, 'Archon 5');

  // Legend 1–5: 3080 – 3849 (tier 1: 3080, tier 2: 3234, tier 3: 3388, tier 4: 3542, tier 5: 3696)
  assert.equal(getRankFromMmr(3080).rankName, 'Legend 1');
  assert.equal(getRankFromMmr(3234).rankName, 'Legend 2');
  assert.equal(getRankFromMmr(3388).rankName, 'Legend 3');
  assert.equal(getRankFromMmr(3542).rankName, 'Legend 4');
  assert.equal(getRankFromMmr(3696).rankName, 'Legend 5');
  assert.equal(getRankFromMmr(3700).rankName, 'Legend 5');
  assert.equal(getRankFromMmr(3849).rankName, 'Legend 5');

  // Ancient 1–5: 3850 – 4619 (tier 1: 3850, tier 2: 4004, tier 3: 4158, tier 4: 4312, tier 5: 4466)
  assert.equal(getRankFromMmr(3850).rankName, 'Ancient 1');
  assert.equal(getRankFromMmr(4004).rankName, 'Ancient 2');
  assert.equal(getRankFromMmr(4158).rankName, 'Ancient 3');
  assert.equal(getRankFromMmr(4312).rankName, 'Ancient 4');
  assert.equal(getRankFromMmr(4466).rankName, 'Ancient 5');
  assert.equal(getRankFromMmr(4619).rankName, 'Ancient 5');

  // Divine 1–5: 4620 – 5419 (tier 1: 4620, tier 2: 4774, tier 3: 4928, tier 4: 5082, tier 5: 5236)
  assert.equal(getRankFromMmr(4620).rankName, 'Divine 1');
  assert.equal(getRankFromMmr(4774).rankName, 'Divine 2');
  assert.equal(getRankFromMmr(4928).rankName, 'Divine 3');
  assert.equal(getRankFromMmr(5082).rankName, 'Divine 4');
  assert.equal(getRankFromMmr(5236).rankName, 'Divine 5');
  assert.equal(getRankFromMmr(5419).rankName, 'Divine 5');

  // Immortal: 5420+
  assert.equal(getRankFromMmr(5420).rankName, 'Immortal');
  assert.equal(getRankFromMmr(5420).tier, 8);
  assert.equal(getRankFromMmr(5420).stars, 0);
  assert.equal(getRankFromMmr(7455).rankName, 'Immortal');
  assert.equal(getRankFromMmr(12000).rankName, 'Immortal');

  // 2. Candidate image list structure
  const legend5 = getRankFromMmr(3700);
  assert.ok(legend5.imageCandidates.includes('/images/ranks/rank_legend_5.png'));
  assert.ok(legend5.imageCandidates.includes('/images/legend_5.png'));
  assert.ok(legend5.imageCandidates.includes('/images/tier_5_5.png'));

  // 3. SVG Medal Generation
  const svg5 = generateRankSvg(legend5);
  assert.ok(svg5.includes('<svg class="dota-rank-svg"'));
  assert.ok(svg5.includes('aria-label="Legend 5"'));
  // 5 stars polygon elements
  const starMatches = (svg5.match(/<polygon/g) || []).length;
  assert.ok(starMatches >= 5, 'Must generate stars for 5-star rank');

  // 4. Image path resolver on disk
  const tmpPublic = createTempDir();
  const tmpRanks = path.join(tmpPublic, 'images', 'ranks');
  fs.mkdirSync(tmpRanks, { recursive: true });
  fs.writeFileSync(path.join(tmpRanks, 'legend_5.png'), 'fake-png-content');

  const resolved = getRankImagePath(legend5, tmpPublic);
  assert.equal(resolved, '/images/ranks/legend_5.png');

  // 5. Intelligent filename identification & flexible image resolver
  const { identifyRankFromFilename, getAllRankBrackets, getRankCatalog } = require('../src/configManager');
  assert.equal(identifyRankFromFilename('ancient_5.png').rankName, 'Ancient 5');
  assert.equal(identifyRankFromFilename('65.png').rankName, 'Ancient 5');
  assert.equal(identifyRankFromFilename('rank_icon_65.png').rankName, 'Ancient 5');
  assert.equal(identifyRankFromFilename('Herald 1.png').rankName, 'Herald 1');
  assert.equal(identifyRankFromFilename('11.png').rankName, 'Herald 1');
  assert.equal(identifyRankFromFilename('immortal.png').rankName, 'Immortal');
  assert.equal(identifyRankFromFilename('80.png').rankName, 'Immortal');
  assert.equal(identifyRankFromFilename('unranked.png').rankName, 'Unranked');
  assert.equal(identifyRankFromFilename('map_overlay.png'), null);

  // Dynamic matching without hardcoded candidate exact string match
  fs.writeFileSync(path.join(tmpPublic, 'images', '65.png'), 'fake-65-png');
  const ancient5 = getRankFromMmr(4500);
  const resolved65 = getRankImagePath(ancient5, tmpPublic);
  assert.equal(resolved65, '/images/65.png');

  // 6. Complete rank brackets list (1 unranked + 35 standard + 1 immortal = 37 brackets)
  const allBrackets = getAllRankBrackets();
  assert.equal(allBrackets.length, 37);
  assert.equal(allBrackets[0].rankName, 'Unranked');
  assert.equal(allBrackets[36].rankName, 'Immortal');

  const catalog = getRankCatalog(tmpPublic);
  assert.equal(catalog.length, 37);
  const catAncient5 = catalog.find((c) => c.rankName === 'Ancient 5');
  assert.equal(catAncient5.hasImage, true);
  assert.equal(catAncient5.image, '/images/65.png');

  fs.rmSync(tmpPublic, { recursive: true, force: true });
});

test('REST Endpoint /api/rank returns calculated rank info and checks image resolution', async () => {
  const tmpDir = createTempDir();
  const cfgPath = path.join(tmpDir, 'config.json');

  const serverInst = await startServer({ configPath: cfgPath, port: 0, silent: true });
  const port = serverInst.port;

  // 1. Default MMR (7455 -> Immortal)
  let res = await fetch(`http://127.0.0.1:${port}/api/rank`);
  assert.equal(res.status, 200);
  let json = await res.json();
  assert.equal(json.rankName, 'Immortal');
  assert.equal(json.tier, 8);
  assert.equal(json.stars, 0);

  // 2. Query param ?mmr=3700 -> Legend 5
  res = await fetch(`http://127.0.0.1:${port}/api/rank?mmr=3700`);
  assert.equal(res.status, 200);
  json = await res.json();
  assert.equal(json.rankName, 'Legend 5');
  assert.equal(json.tier, 5);
  assert.equal(json.stars, 5);
  assert.equal(json.bracketMin, 3696);
  assert.equal(json.bracketMax, 3849);

  // 3. Query param ?mmr=10 -> Herald 1
  res = await fetch(`http://127.0.0.1:${port}/api/rank?mmr=10`);
  assert.equal(res.status, 200);
  json = await res.json();
  assert.equal(json.rankName, 'Herald 1');
  assert.equal(json.stars, 1);

  // 4. GET /api/ranks catalog endpoint
  res = await fetch(`http://127.0.0.1:${port}/api/ranks`);
  assert.equal(res.status, 200);
  json = await res.json();
  assert.equal(json.status, 'ok');
  assert.equal(json.totalBrackets, 37);
  assert.ok(Array.isArray(json.brackets));

  await serverInst.closeServer();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('Overlay HTML & CSS includes 80% opacity, bottom HUD in-game positioning, colored W/L styles, and realistic minimap image', () => {
  const overlayHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'overlay.html'), 'utf8');
  const overlayCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'overlay.css'), 'utf8');
  const overlayJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'overlay.js'), 'utf8');
  const { DEFAULT_CONFIG } = require('../src/configManager');

  // 1. Overlay HTML has realistic map image
  assert.ok(overlayHtml.includes('id="minimap-image"'), 'overlay.html must include minimap-image img element');
  assert.ok(overlayHtml.includes('src="/images/map_overlay.png"'), 'minimap-image must reference /images/map_overlay.png');
  assert.ok(overlayHtml.includes('id="rank-badge-wrap"'), 'overlay.html must include rank-badge-wrap');

  // 2. Overlay CSS styling
  assert.ok(overlayCss.includes('.mmr-win-text'), 'CSS must define green .mmr-win-text');
  assert.ok(overlayCss.includes('#4ade80'), 'CSS must style win text with vibrant emerald/green #4ade80');
  assert.ok(overlayCss.includes('.mmr-loss-text'), 'CSS must define red .mmr-loss-text');
  assert.ok(overlayCss.includes('#f87171'), 'CSS must style loss text with coral/red #f87171');
  assert.ok(overlayCss.includes('#mmr-tracker.in-game-pos'), 'CSS must define in-game HUD positioning');
  assert.ok(overlayCss.includes('bottom: 28px;'), 'in-game position must be positioned near bottom HUD');
  assert.ok(overlayCss.includes('left: 1115px;'), 'in-game position must sit to the left of the quickbuy bar');
  assert.ok(overlayCss.includes('.minimap-img'), 'CSS must include styling for realistic minimap image');

  // 3. Default minimap style is realistic
  assert.equal(DEFAULT_CONFIG.minimapBlocker.style, 'realistic', 'Default minimap style must be realistic');

  // 4. Overlay JS respects inGamePosition setting and avoids 404 image cascading
  assert.ok(overlayJs.includes('mmrCfg.inGamePosition !== \'top_bar\''), 'overlay.js must check inGamePosition setting');
  assert.ok(!overlayJs.includes('tryNext()'), 'overlay.js must not perform blind 404 candidate cascading');
});

test('Drag-and-Drop Layout Editor: customPositions persistence in configManager, REST API endpoints, and overlay DOM positioning', async () => {
  const tmpDir = createTempDir();
  const cfgPath = path.join(tmpDir, 'config.json');

  // 1. ConfigManager customPositions sanitization, persistence, and reset
  const cm1 = new ConfigManager(cfgPath);
  assert.ok(cm1.get().customPositions, 'ConfigManager must include customPositions in get()');
  assert.equal(cm1.get().customPositions.mmrTracker, null);
  assert.equal(cm1.get().customPositions.aegisTimer, null);

  // Update with custom positions including string coercion and float rounding
  const testPositions = {
    mmrTracker: { x: '1115.4', y: 995 },
    aegisTimer: { x: 550, y: 44.2 },
    roshanTimer: { x: 256, y: 880 },
    minimapBlocker: { x: 0, y: 836 },
    queueBlocker: { x: 1552, y: 980 }
  };
  cm1.updatePositions(testPositions);

  const updatedPositions = cm1.get().customPositions;
  assert.deepEqual(updatedPositions.mmrTracker, { x: 1115, y: 995 });
  assert.deepEqual(updatedPositions.aegisTimer, { x: 550, y: 44 });
  assert.deepEqual(updatedPositions.roshanTimer, { x: 256, y: 880 });
  assert.deepEqual(updatedPositions.minimapBlocker, { x: 0, y: 836 });
  assert.deepEqual(updatedPositions.queueBlocker, { x: 1552, y: 980 });

  // Coordinate boundary clamping test (negative -> 0, >1920/1080 -> 1920/1080)
  cm1.updatePositions({
    roshanTimer: { x: -150, y: 3500 }
  });
  assert.deepEqual(cm1.get().customPositions.roshanTimer, { x: 0, y: 1080 });

  // Restore roshanTimer for persistence test
  cm1.updatePositions({ roshanTimer: { x: 256, y: 880 } });

  // Verify persistence across restart
  const cm2 = new ConfigManager(cfgPath);
  assert.deepEqual(cm2.get().customPositions.roshanTimer, { x: 256, y: 880 });

  // Reset positions to default (null)
  cm2.resetPositions();
  assert.equal(cm2.get().customPositions.mmrTracker, null);
  assert.equal(cm2.get().customPositions.roshanTimer, null);

  // 2. HTTP Server REST Endpoints: GET, POST, PUT /api/positions and POST /api/positions/reset
  const serverInst = await startServer({ configPath: cfgPath, port: 0, silent: true, autoInstallGsi: false });
  const port = serverInst.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // GET /api/positions initially empty/null
    let res = await fetch(`${baseUrl}/api/positions`);
    assert.equal(res.status, 200);
    let json = await res.json();
    assert.equal(json.status, 'ok');
    assert.equal(json.customPositions.mmrTracker, null);

    // POST /api/positions
    res = await fetch(`${baseUrl}/api/positions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mmrTracker: { x: 1115, y: 995 },
        aegisTimer: { x: 550, y: 44 }
      })
    });
    assert.equal(res.status, 200);
    json = await res.json();
    assert.equal(json.status, 'ok');
    assert.deepEqual(json.customPositions.mmrTracker, { x: 1115, y: 995 });
    assert.deepEqual(json.customPositions.aegisTimer, { x: 550, y: 44 });

    // PUT /api/positions updates additional widget
    res = await fetch(`${baseUrl}/api/positions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roshanTimer: { x: 300, y: 850 }
      })
    });
    assert.equal(res.status, 200);
    json = await res.json();
    assert.deepEqual(json.customPositions.roshanTimer, { x: 300, y: 850 });
    assert.deepEqual(json.customPositions.mmrTracker, { x: 1115, y: 995 });

    // GET /api/config includes customPositions
    const cfgRes = await fetch(`${baseUrl}/api/config`);
    const cfgJson = await cfgRes.json();
    assert.deepEqual(cfgJson.customPositions.roshanTimer, { x: 300, y: 850 });

    // POST /api/positions/reset
    res = await fetch(`${baseUrl}/api/positions/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(res.status, 200);
    json = await res.json();
    assert.equal(json.status, 'ok');
    assert.equal(json.customPositions.roshanTimer, null);

    // 3. HTML and CSS structure validation for Layout Editor and HUD Guide
    const overlayHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'overlay.html'), 'utf8');
    const overlayCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'overlay.css'), 'utf8');
    const dashHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');

    assert.ok(overlayHtml.includes('id="hud-guide"'), 'overlay.html must include HUD guide container');
    assert.ok(overlayHtml.includes('id="overlay-edit-toolbar"'), 'overlay.html must include floating edit toolbar');
    assert.ok(overlayHtml.includes('id="toolbar-drag-handle"'), 'overlay.html must include toolbar drag handle');
    assert.ok(overlayHtml.includes('id="toolbar-btn-dock"'), 'overlay.html must include toolbar dock button');
    assert.ok(overlayHtml.includes('id="toolbar-btn-edit"'), 'overlay.html must include edit toggle button');
    assert.ok(overlayHtml.includes('id="toolbar-btn-guide"'), 'overlay.html must include HUD guide button');
    assert.ok(overlayHtml.includes('id="toolbar-btn-reset"'), 'overlay.html must include reset defaults button');

    assert.ok(dashHtml.includes('id="btn-edit-layout"'), 'dashboard.html must include btn-edit-layout');
    assert.ok(dashHtml.includes('id="btn-reset-positions"'), 'dashboard.html must include btn-reset-positions');
    assert.ok(dashHtml.includes('id="btn-toggle-hud-guide"'), 'dashboard.html must include btn-toggle-hud-guide');

    assert.ok(overlayCss.includes('#overlay-viewport.edit-mode-active'), 'overlay.css must include edit-mode-active rules');
    assert.ok(overlayCss.includes('.edit-widget-active'), 'overlay.css must include .edit-widget-active rules');
    assert.ok(overlayCss.includes('.widget-label-badge'), 'overlay.css must include .widget-label-badge rules');
    assert.ok(overlayCss.includes('.hud-guide'), 'overlay.css must include .hud-guide rules');
    assert.ok(overlayCss.includes('cursor: grab'), 'overlay.css must include grab cursor for toolbar');
    assert.ok(overlayCss.includes('.toolbar-brand'), 'overlay.css must include toolbar-brand styles');
    assert.ok(overlayCss.includes('is-dragging') && overlayCss.includes('pointer-events: none'), 'overlay.css must suppress pointer events on toolbar buttons during dragging');

    // 4. Test overlay.js behavior in VM sandbox for positioning, edit mode, and keyboard nudging
    const vm = require('node:vm');
    const overlayScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'overlay.js'), 'utf8');

    function makeMockEl(id) {
      const classes = new Set();
      const style = {};
      const children = [];
      return {
        id,
        style,
        textContent: '',
        innerHTML: '',
        offsetWidth: 100,
        offsetHeight: 40,
        classList: {
          add: (...c) => c.forEach((x) => classes.add(x)),
          remove: (...c) => c.forEach((x) => classes.delete(x)),
          toggle: (c, force) => {
            const shouldAdd = force !== undefined ? Boolean(force) : !classes.has(c);
            if (shouldAdd) classes.add(c);
            else classes.delete(c);
          },
          contains: (c) => classes.has(c)
        },
        getAttribute: () => null,
        setAttribute: () => {},
        removeAttribute: () => {},
        querySelector: (sel) => children.find((ch) => ch.className && ch.className.includes(sel.replace('.', ''))),
        appendChild: (child) => children.push(child),
        getBoundingClientRect: () => ({ left: 100, top: 200, width: 100, height: 40 }),
        addEventListener: () => {}
      };
    }

    const mockElements = {};
    [
      'overlay-viewport',
      'mmr-tracker',
      'mmr-tracker-text',
      'aegis-timer',
      'aegis-time-text',
      'aegis-bar-fill',
      'roshan-timer',
      'roshan-ring-progress',
      'roshan-phase-label',
      'roshan-time-text',
      'roshan-sub-text',
      'roshan-eye-left',
      'roshan-eye-right',
      'queue-blocker',
      'queue-finding-view',
      'queue-solid-view',
      'queue-custom-text',
      'hero-pick-blocker',
      'draft-radiant-slots',
      'draft-dire-slots',
      'draft-minimap-mask',
      'draft-choose-hero-mask',
      'draft-phase-status-badge',
      'minimap-blocker',
      'minimap-svg-complex',
      'minimap-svg-simple',
      'minimap-image',
      'rank-badge-wrap',
      'rank-badge-img',
      'rank-badge-svg',
      'hud-guide',
      'overlay-edit-toolbar',
      'toolbar-drag-handle',
      'toolbar-btn-dock',
      'toolbar-btn-edit',
      'toolbar-btn-guide',
      'toolbar-btn-reset',
      'toolbar-status-text'
    ].forEach((id) => {
      mockElements[id] = makeMockEl(id);
    });

    const windowListeners = {};
    const sandboxWindow = {
      innerWidth: 1920,
      innerHeight: 1080,
      addEventListener: (evt, cb) => {
        windowListeners[evt] = cb;
      },
      location: { search: '?edit=1' }
    };

    let vmSocketHandlers = {};
    const vmSandbox = {
      window: sandboxWindow,
      document: {
        getElementById: (id) => mockElements[id] || null,
        querySelectorAll: () => [],
        createElement: (tag) => makeMockEl(`created-${tag}`)
      },
      fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
      io: () => ({
        on: (ev, fn) => {
          vmSocketHandlers[ev] = fn;
        },
        emit: () => {}
      }),
      URLSearchParams,
      Math,
      Number,
      String,
      Boolean,
      Array,
      parseFloat,
      clearTimeout: () => {},
      setTimeout: (fn) => fn()
    };

    vm.runInNewContext(overlayScript, vmSandbox);

    // Initial load with ?edit=1 must activate edit mode automatically
    assert.equal(mockElements['overlay-viewport'].classList.contains('edit-mode-active'), true);
    assert.equal(mockElements['mmr-tracker'].classList.contains('edit-widget-active'), true);

    // Deliver state payload with customPositions
    const engine = new GsiStateEngine(cm1);
    const gsiState = engine.simulateState('in_game');
    const mockPayload = {
      config: {
        ...cm1.get(),
        customPositions: {
          mmrTracker: { x: 1200, y: 950 },
          roshanTimer: { x: 400, y: 700 }
        }
      },
      gsiState
    };

    vmSocketHandlers['state:update'](mockPayload);

    // Verify left, top, right: auto, bottom: auto positioning
    assert.equal(mockElements['mmr-tracker'].style.left, '1200px');
    assert.equal(mockElements['mmr-tracker'].style.top, '950px');
    assert.equal(mockElements['mmr-tracker'].style.right, 'auto');
    assert.equal(mockElements['mmr-tracker'].style.bottom, 'auto');

    assert.equal(mockElements['roshan-timer'].style.left, '400px');
    assert.equal(mockElements['roshan-timer'].style.top, '700px');
    assert.equal(mockElements['roshan-timer'].style.right, 'auto');
    assert.equal(mockElements['roshan-timer'].style.bottom, 'auto');

    // Test Arrow key nudging: 1px normal, 10px with Shift
    sandboxWindow.setEditMode(true);
    // Select roshanTimer
    mockElements['roshan-timer'].style.left = '400px';
    mockElements['roshan-timer'].style.top = '700px';
    sandboxWindow.nudgeSelectedWidget('ArrowRight', false); // +1px on selected mmrTracker (1200 -> 1201)
    assert.equal(mockElements['mmr-tracker'].style.left, '1201px');

    sandboxWindow.nudgeSelectedWidget('ArrowDown', true); // +10px on mmrTracker (950 -> 960)
    assert.equal(mockElements['mmr-tracker'].style.top, '960px');

    // Test boundary clamping on nudging (cannot go below 0)
    mockElements['mmr-tracker'].style.left = '2px';
    mockElements['mmr-tracker'].style.top = '5px';
    mockElements['mmr-tracker'].style.right = 'auto';
    mockElements['mmr-tracker'].style.bottom = 'auto';
    sandboxWindow.nudgeSelectedWidget('ArrowLeft', true); // -10px, clamped to 0
    assert.equal(mockElements['mmr-tracker'].style.left, '0px');
    sandboxWindow.nudgeSelectedWidget('ArrowUp', true); // -10px, clamped to 0
    assert.equal(mockElements['mmr-tracker'].style.top, '0px');

    // Test positions:reset and positions:update null clears custom coordinates back to defaults
    vmSocketHandlers['positions:reset']({ mmrTracker: null, roshanTimer: null });
    assert.equal(mockElements['mmr-tracker'].style.left, '');
    assert.equal(mockElements['mmr-tracker'].style.top, '');
    assert.equal(mockElements['mmr-tracker'].style.right, '');
    assert.equal(mockElements['mmr-tracker'].style.bottom, '');
    assert.equal(mockElements['roshan-timer'].style.top, ''); // custom top: 700px cleared
    assert.equal(mockElements['roshan-timer'].style.left, '256px'); // restored to default minimap offset
    assert.equal(mockElements['roshan-timer'].style.bottom, '145px'); // restored to default bottom offset

    // 5. Draggable toolbar & Docking snap functionality
    assert.ok(typeof sandboxWindow.toggleToolbarDock === 'function', 'sandboxWindow must expose toggleToolbarDock');
    assert.ok(typeof sandboxWindow.setToolbarPosition === 'function', 'sandboxWindow must expose setToolbarPosition');

    // Bounds clamping
    sandboxWindow.setToolbarPosition(-100, -50);
    assert.equal(mockElements['overlay-edit-toolbar'].style.left, '0px');
    assert.equal(mockElements['overlay-edit-toolbar'].style.top, '0px');

    sandboxWindow.setToolbarPosition(2500, 1500);
    assert.equal(mockElements['overlay-edit-toolbar'].style.left, `${1920 - (mockElements['overlay-edit-toolbar'].offsetWidth || 780)}px`);
    assert.equal(mockElements['overlay-edit-toolbar'].style.top, `${1080 - (mockElements['overlay-edit-toolbar'].offsetHeight || 38)}px`);

    // Robustness: NaN and undefined values clamp safely to 0px
    sandboxWindow.setToolbarPosition(NaN, undefined);
    assert.equal(mockElements['overlay-edit-toolbar'].style.left, '0px');
    assert.equal(mockElements['overlay-edit-toolbar'].style.top, '0px');

    // Quick dock toggle between bottom and top
    sandboxWindow.setToolbarPosition(500, 10);
    sandboxWindow.toggleToolbarDock();
    const toolbarTop = parseInt(mockElements['overlay-edit-toolbar'].style.top, 10);
    assert.ok(toolbarTop > 540, 'Toolbar must dock to bottom');
    assert.ok(mockElements['toolbar-btn-dock'].textContent.includes('Top'), 'Dock button should prompt to dock to Top');

    sandboxWindow.toggleToolbarDock();
    assert.equal(mockElements['overlay-edit-toolbar'].style.top, '10px');
    assert.ok(mockElements['toolbar-btn-dock'].textContent.includes('Bottom'), 'Dock button should prompt to dock to Bottom');
  } finally {
    await serverInst.closeServer();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('HUD Guide & Reference Backdrop: sample_dota_scene.png is applied in Edit Mode and HUD Guide toggle across fullscreen overlay and Live Overlay Monitor iframe, but remains transparent during live stream', async () => {
  // 1. Verify sample_dota_scene.png exists on disk, is served statically, and has 1920x1080 dimensions
  const sampleImagePath = path.join(__dirname, '..', 'public', 'images', 'sample_dota_scene.png');
  assert.ok(fs.existsSync(sampleImagePath), 'sample_dota_scene.png must exist in public/images/');
  const imgBuffer = fs.readFileSync(sampleImagePath);
  assert.equal(imgBuffer.readUInt32BE(16), 1920, 'sample_dota_scene.png width must be 1920');
  assert.equal(imgBuffer.readUInt32BE(20), 1080, 'sample_dota_scene.png height must be 1080');

  // 2. HTML and CSS structure validation
  const overlayHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'overlay.html'), 'utf8');
  const overlayCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'overlay.css'), 'utf8');
  const dashHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');

  assert.ok(overlayHtml.includes('id="overlay-hud-guide"'), 'overlay.html must include overlay-hud-guide element');
  assert.ok(overlayHtml.includes('id="hud-guide"'), 'overlay.html must include hud-guide element');
  assert.ok(overlayCss.includes("url('/images/sample_dota_scene.png')"), 'overlay.css must reference sample_dota_scene.png');
  assert.ok(overlayCss.includes('#overlay-viewport.edit-mode-active'), 'overlay.css must style edit-mode-active on viewport');
  assert.ok(overlayCss.includes('#overlay-viewport.hud-guide-active'), 'overlay.css must style hud-guide-active on viewport');
  assert.ok(dashHtml.includes('id="overlay-preview-iframe"'), 'dashboard.html must include overlay-preview-iframe');

  // 3. VM simulation of overlay.js behavior for backdrop toggling
  const vm = require('node:vm');
  const overlayScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'overlay.js'), 'utf8');

  function makeMockEl(id) {
    const classes = new Set();
    return {
      id,
      style: {},
      textContent: '',
      innerHTML: '',
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)),
        remove: (...c) => c.forEach((x) => classes.delete(x)),
        toggle: (c, force) => {
          const shouldAdd = force !== undefined ? Boolean(force) : !classes.has(c);
          if (shouldAdd) classes.add(c);
          else classes.delete(c);
        },
        contains: (c) => classes.has(c)
      },
      getAttribute: () => null,
      setAttribute: () => {},
      removeAttribute: () => {},
      querySelector: () => null,
      addEventListener: () => {}
    };
  }

  const mockEls = {};
  [
    'overlay-viewport',
    'mmr-tracker',
    'mmr-tracker-text',
    'aegis-timer',
    'roshan-timer',
    'queue-blocker',
    'hero-pick-blocker',
    'minimap-blocker',
    'hud-guide',
    'overlay-hud-guide',
    'overlay-edit-toolbar',
    'toolbar-drag-handle',
    'toolbar-btn-dock',
    'toolbar-btn-edit',
    'toolbar-btn-guide',
    'toolbar-btn-reset',
    'toolbar-status-text'
  ].forEach((id) => {
    mockEls[id] = makeMockEl(id);
  });

  const postedMessages = [];
  const mockParent = {
    postMessage: (msg) => postedMessages.push(msg)
  };

  const sandboxWin = {
    innerWidth: 1920,
    innerHeight: 1080,
    addEventListener: () => {},
    location: { search: '' },
    parent: mockParent
  };

  const sandbox = {
    window: sandboxWin,
    document: {
      getElementById: (id) => mockEls[id] || null,
      querySelectorAll: () => [],
      createElement: (tag) => makeMockEl(`mock-${tag}`)
    },
    fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
    io: () => ({ on: () => {}, emit: () => {} }),
    URLSearchParams,
    Math,
    Number,
    String,
    Boolean,
    Array,
    parseFloat,
    clearTimeout: () => {},
    setTimeout: (fn) => fn()
  };

  vm.runInNewContext(overlayScript, sandbox);

  // Initial state: not in edit mode, hud guide off -> transparent (no backdrop classes)
  assert.equal(mockEls['overlay-viewport'].classList.contains('edit-mode-active'), false);
  assert.equal(mockEls['overlay-viewport'].classList.contains('has-reference-backdrop'), false);
  assert.equal(mockEls['overlay-viewport'].classList.contains('hud-guide-active'), false);

  // Enter Edit Mode -> reference backdrop active on viewport
  sandboxWin.setEditMode(true);
  assert.equal(mockEls['overlay-viewport'].classList.contains('edit-mode-active'), true);
  assert.equal(mockEls['overlay-viewport'].classList.contains('has-reference-backdrop'), true);

  // Toggle HUD Guide ON -> hud-guide-active and unhides guide element
  sandboxWin.toggleHudGuide(true);
  assert.equal(mockEls['overlay-viewport'].classList.contains('hud-guide-active'), true);
  assert.equal(mockEls['hud-guide'].classList.contains('overlay-hidden'), false);

  // Exit Edit Mode but keep HUD Guide ON -> still has reference backdrop
  sandboxWin.setEditMode(false);
  assert.equal(mockEls['overlay-viewport'].classList.contains('edit-mode-active'), false);
  assert.equal(mockEls['overlay-viewport'].classList.contains('has-reference-backdrop'), true);
  assert.equal(mockEls['overlay-viewport'].classList.contains('hud-guide-active'), true);

  // Turn off HUD Guide -> backdrop cleared completely, live OBS stream is transparent
  sandboxWin.toggleHudGuide(false);
  assert.equal(mockEls['overlay-viewport'].classList.contains('has-reference-backdrop'), false);
  assert.equal(mockEls['overlay-viewport'].classList.contains('hud-guide-active'), false);
  assert.equal(mockEls['hud-guide'].classList.contains('overlay-hidden'), true);

  // Verify postMessage communication with dashboard parent window
  assert.ok(postedMessages.some((m) => m.type === 'EDIT_MODE_CHANGED' && m.editMode === true), 'must notify parent of edit mode on');
  assert.ok(postedMessages.some((m) => m.type === 'EDIT_MODE_CHANGED' && m.editMode === false), 'must notify parent of edit mode off');
  assert.ok(postedMessages.some((m) => m.type === 'HUD_GUIDE_CHANGED' && m.hudGuide === true), 'must notify parent of hud guide on');
  assert.ok(postedMessages.some((m) => m.type === 'HUD_GUIDE_CHANGED' && m.hudGuide === false), 'must notify parent of hud guide off');
});

test('Multi-Scene Layout Editor: independent scenes, 10 Aegis slot timers, drafting masks, auto-align, REST endpoints, and bottom HUD styling', async () => {
  const tmpDir = createTempDir();
  const cfgPath = path.join(tmpDir, 'config.json');

  try {
    // 1. Scene image files exist and are 1920x1080
    const sceneFiles = [
      'sample_dota_scene_main_menu.png',
      'sample_dota_scene_drafting_phase.png',
      'sample_dota_scene_draft_own_hero_locked.png',
      'sample_dota_scene_strategy_time.png',
      'sample_dota_scene_in_game.png'
    ];
    for (const f of sceneFiles) {
      const p = path.join(__dirname, '..', 'public', 'images', f);
      assert.ok(fs.existsSync(p), `Image ${f} must exist in public/images/`);
      const buf = fs.readFileSync(p);
      assert.equal(buf.readUInt32BE(16), 1920, `${f} width must be 1920`);
      assert.equal(buf.readUInt32BE(20), 1080, `${f} height must be 1080`);
    }

    // 2. ConfigManager sceneLayouts management & Aegis slot auto-align
    const cm = new ConfigManager(cfgPath);
    const initialConfig = cm.get();
    assert.ok(initialConfig.sceneLayouts, 'config must contain sceneLayouts');
    const scenes = ['main_menu', 'drafting_phase', 'draft_own_hero_locked', 'in_game'];
    for (const s of scenes) {
      assert.ok(initialConfig.sceneLayouts[s], `sceneLayouts must define ${s}`);
      assert.ok(initialConfig.sceneLayouts[s].widgets, `${s} must have widgets`);
    }

    // in_game must define all 10 Aegis slots aegisSlot0..aegisSlot9
    for (let i = 0; i < 10; i++) {
      const k = `aegisSlot${i}`;
      const slot = initialConfig.sceneLayouts.in_game.widgets[k];
      assert.ok(slot, `in_game must define ${k}`);
      assert.equal(typeof slot.x, 'number');
      assert.equal(typeof slot.y, 'number');
      assert.equal(typeof slot.width, 'number');
      assert.equal(typeof slot.height, 'number');
      assert.equal(typeof slot.visible, 'boolean');
    }

    // Drafting masks exist on drafting scenes
    for (const s of ['drafting_phase', 'draft_own_hero_locked']) {
      const w = initialConfig.sceneLayouts[s].widgets;
      assert.ok(w.draftRadiantSlots, `${s} must have draftRadiantSlots`);
      assert.ok(w.draftDireSlots, `${s} must have draftDireSlots`);
      assert.ok(w.draftMinimapMask, `${s} must have draftMinimapMask`);
      assert.ok(w.draftChooseHeroMask, `${s} must have draftChooseHeroMask`);
    }

    // Test updateSceneLayout & clamping
    cm.updateSceneLayout('in_game', {
      mmrTracker: { x: 1300, y: 920, width: 220, height: 75, visible: true },
      aegisSlot3: { x: 800, y: 70, width: 60, height: 46, visible: true }
    });
    assert.equal(cm.get().sceneLayouts.in_game.widgets.mmrTracker.x, 1300);
    assert.equal(cm.get().sceneLayouts.in_game.widgets.mmrTracker.y, 920);
    assert.equal(cm.get().sceneLayouts.in_game.widgets.aegisSlot3.x, 800);

    // Test autoAlignAegisSlots
    const aligned = cm.autoAlignAegisSlots();
    assert.ok(aligned);
    assert.ok(aligned.sceneLayouts.in_game.widgets);
    const inGameWidgets = aligned.sceneLayouts.in_game.widgets;
    // Slots 0..4 must be ordered left-to-right
    for (let i = 0; i < 4; i++) {
      assert.ok(
        inGameWidgets[`aegisSlot${i + 1}`].x > inGameWidgets[`aegisSlot${i}`].x,
        `Slot ${i + 1} x must be greater than slot ${i} x`
      );
    }
    // Slots 5..9 must be ordered left-to-right
    for (let i = 5; i < 9; i++) {
      assert.ok(
        inGameWidgets[`aegisSlot${i + 1}`].x > inGameWidgets[`aegisSlot${i}`].x,
        `Slot ${i + 1} x must be greater than slot ${i} x`
      );
    }

    // Test resetSceneLayout
    cm.resetSceneLayout('in_game');
    const resetConfig = cm.get();
    assert.equal(resetConfig.sceneLayouts.in_game.widgets.mmrTracker.x, 1115);
    assert.equal(resetConfig.sceneLayouts.in_game.widgets.mmrTracker.y, 995);

    // 3. GsiStateEngine scene mapping & Post-Game layout retention
    const engine = new GsiStateEngine(cm);
    assert.equal(engine.simulateState('main_menu').scene, 'main_menu');
    assert.equal(engine.getSnapshot().currentScene, 'main_menu');

    assert.equal(engine.simulateState('draft_phase').scene, 'drafting_phase');
    assert.equal(engine.getSnapshot().currentScene, 'drafting_phase');

    assert.equal(engine.simulateState('own_hero_locked').scene, 'draft_own_hero_locked');
    assert.equal(engine.getSnapshot().currentScene, 'draft_own_hero_locked');

    // Strategy time unmasks draft blocker and transitions scene to in_game
    const stratSnap = engine.simulateState('strategy_time');
    assert.equal(stratSnap.scene, 'in_game');
    assert.equal(engine.getSnapshot().currentScene, 'in_game');
    assert.equal(engine.getSnapshot().flags.isStrategyPhase, true);

    assert.equal(engine.simulateState('in_game').scene, 'in_game');
    assert.equal(engine.getSnapshot().currentScene, 'in_game');

    // Post-game match summary keeps in_game layout until disconnect back to menu
    engine.processGsiPayload({
      map: {
        game_state: 'DOTA_GAMERULES_STATE_POST_GAME',
        matchid: '7891234567',
        clock_time: 2500,
        game_time: 2500
      }
    });
    assert.equal(engine.getSnapshot().currentScene, 'in_game', 'POST_GAME must retain in_game scene');

    // Disconnect transitions to main_menu
    engine.processGsiPayload({
      map: {
        game_state: 'DOTA_GAMERULES_STATE_DISCONNECT'
      }
    });
    assert.equal(engine.getSnapshot().currentScene, 'main_menu', 'DISCONNECT must transition to main_menu');

    // 4. REST Endpoints for scene layouts & Aegis alignment
    const serverInst = await startServer({ configPath: cfgPath, port: 0, silent: true, autoInstallGsi: false });
    try {
      const port = serverInst.port;

      // GET /api/scenes
      const resScenes = await fetch(`http://127.0.0.1:${port}/api/scenes`);
      assert.equal(resScenes.status, 200);
      const jsonScenes = await resScenes.json();
      assert.equal(Object.keys(jsonScenes.scenes).length, 4);
      assert.deepEqual(Object.keys(jsonScenes.scenes).sort(), ['draft_own_hero_locked', 'drafting_phase', 'in_game', 'main_menu']);

      // PUT /api/scenes/in_game
      const resUpdate = await fetch(`http://127.0.0.1:${port}/api/scenes/in_game`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roshanTimer: { x: 450, y: 720, width: 220, height: 60, visible: true }
        })
      });
      assert.equal(resUpdate.status, 200);
      const jsonUpdate = await resUpdate.json();
      assert.equal(jsonUpdate.layout.widgets.roshanTimer.x, 450);

      // POST /api/scenes/align-aegis
      const resAlign = await fetch(`http://127.0.0.1:${port}/api/scenes/align-aegis`, {
        method: 'POST'
      });
      assert.equal(resAlign.status, 200);
      const jsonAlign = await resAlign.json();
      assert.ok(jsonAlign.sceneLayouts.in_game.widgets.aegisSlot0);
      assert.equal(jsonAlign.sceneLayouts.in_game.widgets.aegisSlot0.x, 550);

      // POST /api/scenes/reset
      const resReset = await fetch(`http://127.0.0.1:${port}/api/scenes/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene: 'in_game' })
      });
      assert.equal(resReset.status, 200);
    } finally {
      await serverInst.closeServer();
    }

    // 5. CSS validation for Bottom HUD & Scene tabs & 10 Aegis slot styling
    const overlayCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'overlay.css'), 'utf8');
    // Transparent bottom HUD
    assert.ok(overlayCss.includes('#mmr-tracker.in-game-pos'));
    assert.ok(overlayCss.includes('background: transparent !important;'));
    assert.ok(overlayCss.includes('border: none !important;'));
    assert.ok(overlayCss.includes('box-shadow: none !important;'));
    // Bold, bigger W/L font
    assert.ok(overlayCss.includes('font-weight: 800'));
    assert.ok(overlayCss.includes('font-size: 16px'));
    assert.ok(overlayCss.includes('#4ade80'));
    assert.ok(overlayCss.includes('#f87171'));
    // Centered rank medal above text row
    assert.ok(overlayCss.includes('#mmr-tracker.in-game-pos .rank-badge-wrap'));
    assert.ok(overlayCss.includes('margin: 0 auto 2px auto;'));
    // Scene backdrop classes
    assert.ok(overlayCss.includes('#overlay-viewport.scene-main_menu'));
    assert.ok(overlayCss.includes('#overlay-viewport.scene-drafting_phase'));
    assert.ok(overlayCss.includes('#overlay-viewport.scene-draft_own_hero_locked'));
    assert.ok(overlayCss.includes('#overlay-viewport.scene-in_game'));
    // Responsive drafting cards layout
    assert.ok(overlayCss.includes('.draft-team-row'));
    assert.ok(overlayCss.includes('.draft-slot'));
    assert.ok(overlayCss.includes('flex: 1 1 0'));
    // Aegis slot styling
    assert.ok(overlayCss.includes('.aegis-slot-item'));
    assert.ok(overlayCss.includes('#aegis-all-slots'));

    // 6. Overlay Frontend Script (overlay.js) in VM
    const vm = require('node:vm');
    const overlayScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'overlay.js'), 'utf8');

    function createMockElement(id) {
      const classes = new Set();
      const children = [];
      const dataset = {};
      return {
        id,
        style: {},
        textContent: '',
        innerHTML: '',
        dataset,
        children,
        classList: {
          add: (...c) => c.forEach((x) => classes.add(x)),
          remove: (...c) => c.forEach((x) => classes.delete(x)),
          toggle: (c, force) => {
            const shouldAdd = force !== undefined ? Boolean(force) : !classes.has(c);
            if (shouldAdd) classes.add(c);
            else classes.delete(c);
          },
          contains: (c) => classes.has(c)
        },
        getAttribute: (k) => dataset[k] || null,
        setAttribute: (k, v) => { dataset[k] = v; },
        removeAttribute: (k) => { delete dataset[k]; },
        querySelector: () => null,
        querySelectorAll: () => [],
        appendChild: (child) => children.push(child),
        addEventListener: () => {}
      };
    }

    const testMockEls = {};
    [
      'overlay-viewport',
      'mmr-tracker',
      'mmr-tracker-text',
      'mmr-tracker-in-game',
      'aegis-timer',
      'aegis-all-slots',
      'roshan-timer',
      'queue-blocker',
      'hero-pick-blocker',
      'minimap-blocker',
      'mask-radiant-top',
      'mask-dire-top',
      'mask-minimap-preview',
      'mask-hero-picker',
      'hud-guide',
      'overlay-hud-guide',
      'overlay-edit-toolbar',
      'toolbar-drag-handle',
      'toolbar-scene-tabs',
      'toolbar-btn-align-aegis',
      'toolbar-btn-dock',
      'toolbar-btn-edit',
      'toolbar-btn-guide',
      'toolbar-btn-reset',
      'toolbar-status-text'
    ].forEach((id) => {
      testMockEls[id] = createMockElement(id);
    });

    for (let i = 0; i < 10; i++) {
      const slotEl = createMockElement(`aegis-slot-${i}`);
      testMockEls[`aegis-slot-${i}`] = slotEl;
      testMockEls['aegis-all-slots'].appendChild(slotEl);
    }

    const overlayHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'overlay.html'), 'utf8');
    for (let i = 0; i < 10; i++) {
      assert.ok(overlayHtml.includes(`id="aegis-slot-${i}"`), `overlay.html must include aegis-slot-${i}`);
    }

    const postedEvents = [];
    const testWindow = {
      innerWidth: 1920,
      innerHeight: 1080,
      addEventListener: () => {},
      location: { search: '?edit=1' },
      parent: {
        postMessage: (m) => postedEvents.push(m)
      }
    };

    const vmContext = {
      window: testWindow,
      document: {
        getElementById: (id) => testMockEls[id] || null,
        querySelectorAll: () => [],
        createElement: (tag) => createMockElement(`mock-${tag}`)
      },
      fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
      io: () => ({ on: () => {}, emit: () => {} }),
      URLSearchParams,
      Math,
      Number,
      String,
      Boolean,
      Array,
      parseFloat,
      clearTimeout: () => {},
      setTimeout: (fn) => fn()
    };

    vm.runInNewContext(overlayScript, vmContext);

    // Verify 10 Aegis slots rendered in aegis-all-slots container
    assert.equal(testMockEls['aegis-all-slots'].children.length, 10, 'Must render 10 Aegis slots');

    // Switch scene to drafting_phase
    testWindow.setScene('drafting_phase');
    assert.ok(testMockEls['overlay-viewport'].classList.contains('scene-drafting_phase'));
    assert.ok(postedEvents.some((m) => m.type === 'SCENE_CHANGED' && m.scene === 'drafting_phase'));

    // Switch scene back to in_game
    testWindow.setScene('in_game');
    assert.ok(testMockEls['overlay-viewport'].classList.contains('scene-in_game'));

    // In edit mode in in_game scene: all 10 slots are positioned according to layout
    const editPayload = {
      config: cm.get(),
      gsiState: {
        flags: { isInGame: true },
        scene: 'in_game',
        currentScene: 'in_game'
      }
    };
    testWindow.handleStateUpdate(editPayload);
    assert.equal(testMockEls['aegis-slot-3'].style.left, '742px');
    assert.equal(testMockEls['aegis-slot-3'].style.top, '44px');

    // Turn off edit mode to simulate live gameplay: aegis carrier in slot 3 positions aegis-timer
    testWindow.setEditMode(false);
    const livePayload = {
      config: cm.get(),
      gsiState: {
        flags: { isInGame: true },
        scene: 'in_game',
        currentScene: 'in_game',
        aegis: {
          active: true,
          remainingSec: 295,
          formatted: '04:55',
          carrierSlot: 3
        }
      }
    };
    testWindow.handleStateUpdate(livePayload);
    // Slot 3 in default config is at x: 742, y: 44
    assert.equal(testMockEls['aegis-timer'].style.left, '742px');
    assert.equal(testMockEls['aegis-timer'].style.top, '44px');

    // 7. Widget visibility toggling in overlay: dim in edit mode, hidden in live
    testWindow.setEditMode(true);
    testWindow.toggleWidgetVisibility('mmrTracker');
    assert.equal(testMockEls['mmr-tracker'].classList.contains('widget-hidden-dimmed'), true, 'Toggled-off widget must be dimmed in edit mode');
    testWindow.setEditMode(false);
    assert.equal(testMockEls['mmr-tracker'].classList.contains('overlay-hidden'), true, 'Toggled-off widget must be hidden in live mode');

    // 8. Auto-align Aegis helper in overlay.js
    testWindow.setEditMode(true);
    testWindow.setScene('in_game');
    testWindow.autoAlignAegisSlots();
    assert.equal(testMockEls['aegis-slot-0'].style.left, '550px');
    assert.equal(testMockEls['aegis-slot-4'].style.left, '806px');
    assert.equal(testMockEls['aegis-slot-5'].style.left, '1104px');
    assert.equal(testMockEls['aegis-slot-9'].style.left, '1352px');

    // 9. Scene position isolation: moving mmrTracker in drafting_phase must NOT corrupt in_game mmrTracker
    testWindow.setScene('drafting_phase');
    testWindow.nudgeSelectedWidget('ArrowRight', true); // shift+right = +10px
    const inGameLayout = cm.get().sceneLayouts.in_game.widgets.mmrTracker;
    assert.equal(inGameLayout.x, 1115, 'in_game mmrTracker x must remain untouched at 1115');
    assert.equal(inGameLayout.y, 995, 'in_game mmrTracker y must remain untouched at 995');

    // 10. Verify 4 scenes exported in overlay.js
    assert.deepEqual(Array.from(testWindow.SCENE_DEFINITIONS), ['main_menu', 'drafting_phase', 'draft_own_hero_locked', 'in_game']);

    // 11. Strategy phase unmasking: in live strategy time, hero-pick-blocker, minimap-blocker, and queue-blocker are all hidden
    testWindow.setEditMode(false);
    testWindow.handleStateUpdate({
      config: cm.get(),
      gsiState: {
        flags: { isStrategyPhase: true, isDraftPhase: false, isInGame: false },
        scene: 'in_game',
        currentScene: 'in_game'
      }
    });
    assert.ok(testMockEls['hero-pick-blocker'].classList.contains('overlay-hidden'), 'hero-pick-blocker must be hidden in strategy phase');
    assert.ok(testMockEls['minimap-blocker'].classList.contains('overlay-hidden'), 'minimap-blocker must be hidden in strategy phase');
    assert.ok(testMockEls['queue-blocker'].classList.contains('overlay-hidden'), 'queue-blocker must be hidden in strategy phase');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Responsive Draft & Hero Locked Card Resizing and Strategy Phase Unmasking (Issue 1, 2, 3)', () => {
  const tmpDir = createTempDir();
  try {
    const cfgPath = path.join(tmpDir, 'config.json');
    const cm = new ConfigManager(cfgPath);

    // 1. Verify 4 scenes in ConfigManager and no strategy_time
    const cfg = cm.get();
    const sceneKeys = Object.keys(cfg.sceneLayouts).sort();
    assert.deepEqual(sceneKeys, ['draft_own_hero_locked', 'drafting_phase', 'in_game', 'main_menu']);
    assert.equal(cfg.sceneLayouts.strategy_time, undefined);

    // 2. Verify HTML and CSS files do not contain strategy_time scene tabs
    const overlayHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'overlay.html'), 'utf8');
    const dashboardHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');
    const overlayCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'overlay.css'), 'utf8');

    assert.ok(!overlayHtml.includes('data-scene="strategy_time"'), 'overlay.html must not include strategy_time tab');
    assert.ok(!dashboardHtml.includes('data-scene="strategy_time"'), 'dashboard.html must not include strategy_time tab');
    assert.ok(!overlayCss.includes('#overlay-viewport.scene-strategy_time'), 'overlay.css must not include scene-strategy_time rules');

    // 3. Verify CSS responsive flex distribution rules for .draft-team-row and .draft-slot
    assert.ok(overlayCss.includes('.draft-team-row'), 'overlay.css must style .draft-team-row');
    assert.ok(overlayCss.includes('display: flex !important;'), 'draft-team-row must have flex display');
    assert.ok(overlayCss.includes('flex-direction: row !important;'), 'draft-team-row must have row flex-direction');
    assert.ok(overlayCss.includes('.draft-slot'), 'overlay.css must style .draft-slot');
    assert.ok(overlayCss.includes('flex: 1 1 0 !important;'), 'draft-slot must expand equally with flex: 1 1 0');
    assert.ok(overlayCss.includes('width: 100%;'), 'draft-slot must fill width');
    assert.ok(overlayCss.includes('height: 100%;'), 'draft-slot must fill height');
    assert.ok(overlayCss.includes('user-select: none;'), 'draft cards must have user-select: none to avoid selection glitch');
    assert.ok(overlayCss.includes('justify-content: space-between !important;'), 'draft-team-row must have space-between distribution');

    // 4. Update stretched dimensions in drafting_phase and draft_own_hero_locked
    cm.updateSceneLayout('drafting_phase', {
      draftRadiantSlots: { x: 420, y: 0, width: 620, height: 95, visible: true },
      draftDireSlots: { x: 1080, y: 0, width: 615, height: 95, visible: true }
    });
    cm.updateSceneLayout('draft_own_hero_locked', {
      draftRadiantSlots: { x: 410, y: 0, width: 640, height: 100, visible: true },
      draftDireSlots: { x: 1070, y: 0, width: 635, height: 100, visible: true }
    });

    const updatedCfg = cm.get();
    assert.equal(updatedCfg.sceneLayouts.drafting_phase.widgets.draftRadiantSlots.width, 620);
    assert.equal(updatedCfg.sceneLayouts.drafting_phase.widgets.draftRadiantSlots.height, 95);
    assert.equal(updatedCfg.sceneLayouts.draft_own_hero_locked.widgets.draftRadiantSlots.width, 640);
    assert.equal(updatedCfg.sceneLayouts.draft_own_hero_locked.widgets.draftRadiantSlots.height, 100);

    // 5. Test GsiStateEngine strategy phase behavior
    const engine = new GsiStateEngine(cm);
    const snap = engine.processGsiPayload({
      map: { game_state: 'DOTA_GAMERULES_STATE_STRATEGY_TIME', clock_time: 0 }
    });
    assert.equal(snap.currentScene, 'in_game');
    assert.equal(snap.scene, 'in_game');
    assert.equal(snap.flags.isStrategyPhase, true);
    assert.equal(snap.flags.isDraftPhase, false);
    assert.equal(snap.flags.isInGame, false);
    assert.equal(snap.revealedSlot, null);

    // 6. Test VM rendering for stretched slots and strategy unmasking
    const vm = require('node:vm');
    const overlayScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'overlay.js'), 'utf8');

    function createMockElement(id) {
      const classes = new Set();
      const children = [];
      const dataset = {};
      const attrs = {};
      return {
        id,
        style: {},
        textContent: '',
        innerHTML: '',
        dataset,
        children,
        classList: {
          add: (...c) => c.forEach((x) => classes.add(x)),
          remove: (...c) => c.forEach((x) => classes.delete(x)),
          toggle: (c, force) => {
            const shouldAdd = force !== undefined ? Boolean(force) : !classes.has(c);
            if (shouldAdd) classes.add(c);
            else classes.delete(c);
          },
          contains: (c) => classes.has(c)
        },
        getAttribute: (k) => attrs[k] || dataset[k] || null,
        setAttribute: (k, v) => { attrs[k] = v; },
        removeAttribute: (k) => { delete attrs[k]; delete dataset[k]; },
        querySelector: () => null,
        querySelectorAll: () => [],
        appendChild: (child) => children.push(child),
        addEventListener: () => {}
      };
    }

    const testMockEls = {};
    [
      'overlay-viewport', 'mmr-tracker', 'mmr-tracker-text', 'mmr-tracker-in-game',
      'aegis-timer', 'aegis-all-slots', 'roshan-timer', 'queue-blocker',
      'hero-pick-blocker', 'minimap-blocker', 'draft-radiant-slots', 'draft-dire-slots',
      'draft-minimap-mask', 'draft-choose-hero-mask', 'hud-guide', 'overlay-hud-guide',
      'overlay-edit-toolbar', 'toolbar-drag-handle', 'toolbar-scene-tabs',
      'toolbar-btn-align-aegis', 'toolbar-btn-dock', 'toolbar-btn-edit',
      'toolbar-btn-guide', 'toolbar-btn-reset', 'toolbar-status-text'
    ].forEach((id) => {
      testMockEls[id] = createMockElement(id);
    });

    const draftSlots = [];
    for (let i = 0; i < 10; i++) {
      const slot = createMockElement(`draft-slot-${i}`);
      slot.setAttribute('data-slot', String(i));
      draftSlots.push(slot);
      if (i < 5) testMockEls['draft-radiant-slots'].appendChild(slot);
      else testMockEls['draft-dire-slots'].appendChild(slot);
    }

    const testWindow = {
      innerWidth: 1920,
      innerHeight: 1080,
      addEventListener: () => {},
      location: { search: '' },
      parent: { postMessage: () => {} }
    };

    const vmContext = {
      window: testWindow,
      document: {
        getElementById: (id) => testMockEls[id] || null,
        querySelectorAll: (selector) => {
          if (selector === '.draft-slot') return draftSlots;
          return [];
        },
        createElement: (tag) => createMockElement(`mock-${tag}`)
      },
      fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
      io: () => ({ on: () => {}, emit: () => {} }),
      URLSearchParams,
      Math,
      Number,
      String,
      Boolean,
      Array,
      parseFloat,
      clearTimeout: () => {},
      setTimeout: (fn) => fn()
    };

    vm.runInNewContext(overlayScript, vmContext);

    // Verify stretched sizes apply in drafting_phase
    testWindow.handleStateUpdate({
      config: updatedCfg,
      gsiState: {
        flags: { isDraftPhase: true, isStrategyPhase: false, isInGame: false },
        scene: 'drafting_phase',
        currentScene: 'drafting_phase',
        ownHeroLocked: false,
        revealedSlot: null
      }
    });

    assert.equal(testMockEls['draft-radiant-slots'].style.width, '620px');
    assert.equal(testMockEls['draft-radiant-slots'].style.height, '95px');
    assert.equal(testMockEls['draft-dire-slots'].style.width, '615px');
    assert.equal(testMockEls['draft-dire-slots'].style.height, '95px');
    assert.ok(!testMockEls['hero-pick-blocker'].classList.contains('overlay-hidden'));

    // Verify stretched sizes apply in draft_own_hero_locked
    testWindow.handleStateUpdate({
      config: updatedCfg,
      gsiState: {
        flags: { isDraftPhase: true, isStrategyPhase: false, isInGame: false },
        scene: 'draft_own_hero_locked',
        currentScene: 'draft_own_hero_locked',
        ownHeroLocked: true,
        revealedSlot: 0
      }
    });

    assert.equal(testMockEls['draft-radiant-slots'].style.width, '640px');
    assert.equal(testMockEls['draft-radiant-slots'].style.height, '100px');
    assert.equal(testMockEls['draft-dire-slots'].style.width, '635px');
    assert.equal(testMockEls['draft-dire-slots'].style.height, '100px');
    assert.ok(draftSlots[0].classList.contains('slot-revealed'));
    assert.ok(!draftSlots[1].classList.contains('slot-revealed'));

    // Verify complete unmasking during strategy phase
    testWindow.handleStateUpdate({
      config: updatedCfg,
      gsiState: {
        flags: { isDraftPhase: false, isStrategyPhase: true, isInGame: false },
        scene: 'in_game',
        currentScene: 'in_game'
      }
    });

    assert.ok(testMockEls['hero-pick-blocker'].classList.contains('overlay-hidden'), 'hero-pick-blocker hidden in strategy phase');
    assert.ok(testMockEls['minimap-blocker'].classList.contains('overlay-hidden'), 'minimap-blocker hidden in strategy phase');
    assert.ok(testMockEls['queue-blocker'].classList.contains('overlay-hidden'), 'queue-blocker hidden in strategy phase');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('WAIT_FOR_PLAYERS_TO_LOAD state activates drafting_phase scene, masks draft slots, hides queue blocker, and exposes resolveCurrentSceneKey', async () => {
  const tmpDir = createTempDir();
  try {
    const cm = new ConfigManager(path.join(tmpDir, 'config.json'));
    const engine = new GsiStateEngine(cm);

    // 1. GsiStateEngine handles WAIT_FOR_PLAYERS_TO_LOAD
    const snap = engine.processGsiPayload({
      map: { game_state: 'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD' },
      player: { team_name: 'radiant', player_slot: 2 }
    });

    assert.equal(snap.gameState, 'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD');
    assert.equal(snap.flags.isMainMenu, false, 'isMainMenu must be false during WAIT_FOR_PLAYERS_TO_LOAD');
    assert.equal(snap.flags.isDraftPhase, true, 'isDraftPhase must be true during WAIT_FOR_PLAYERS_TO_LOAD');
    assert.equal(snap.flags.isInGame, false);
    assert.equal(snap.flags.isStrategyPhase, false);
    assert.equal(snap.currentScene, 'drafting_phase', 'currentScene must be drafting_phase');
    assert.equal(snap.scene, 'drafting_phase', 'scene must be drafting_phase');
    assert.equal(snap.banningPhase, true, 'banningPhase must be true during connect/loading');
    assert.equal(snap.ownHeroLocked, false);
    assert.equal(snap.revealedSlot, null, 'revealedSlot must be null during WAIT_FOR_PLAYERS_TO_LOAD to mask all players');
    assert.equal(snap.aegis.active, false);
    assert.equal(snap.roshan.active, false);

    // 1b. Verify matchId persists from WAIT_FOR_PLAYERS_TO_LOAD into HERO_SELECTION when omitted in later packets
    const matchSnap = engine.processGsiPayload({
      map: { game_state: 'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD', matchid: '7999123456' },
      player: { team_name: 'radiant', player_slot: 2 }
    });
    assert.equal(matchSnap.matchId, '7999123456', 'matchId must be set in WAIT_FOR_PLAYERS_TO_LOAD');
    const heroSelectSnap = engine.processGsiPayload({
      map: { game_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION' }
    });
    assert.equal(heroSelectSnap.matchId, '7999123456', 'matchId must persist into HERO_SELECTION without being wiped');

    // 2. Simulation modes: loading / wait_for_players_to_load / aliases
    const simSnap = engine.simulateState('wait_for_players_to_load');
    assert.equal(simSnap.gameState, 'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD');
    assert.equal(simSnap.flags.isMainMenu, false);
    assert.equal(simSnap.flags.isDraftPhase, true);
    assert.equal(simSnap.currentScene, 'drafting_phase');

    const simSnap2 = engine.simulateState('loading');
    assert.equal(simSnap2.gameState, 'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD');
    assert.equal(simSnap2.currentScene, 'drafting_phase');

    const simSnap3 = engine.simulateState('wait_for_players');
    assert.equal(simSnap3.currentScene, 'drafting_phase');

    const simSnap4 = engine.simulateState('connecting');
    assert.equal(simSnap4.currentScene, 'drafting_phase');

    // 3. overlay.js DOM verification in VM
    const vm = require('node:vm');
    const overlayScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'overlay.js'), 'utf8');

    function createMockElement(id) {
      const classes = new Set();
      const children = [];
      const attrs = {};
      return {
        id,
        style: {},
        textContent: '',
        innerHTML: '',
        children,
        classList: {
          add: (...c) => c.forEach((x) => classes.add(x)),
          remove: (...c) => c.forEach((x) => classes.delete(x)),
          toggle: (c, force) => {
            const shouldAdd = force !== undefined ? Boolean(force) : !classes.has(c);
            if (shouldAdd) classes.add(c);
            else classes.delete(c);
          },
          contains: (c) => classes.has(c)
        },
        getAttribute: (k) => attrs[k] || null,
        setAttribute: (k, v) => { attrs[k] = v; },
        removeAttribute: (k) => { delete attrs[k]; },
        querySelector: () => null,
        querySelectorAll: () => [],
        appendChild: (child) => children.push(child),
        addEventListener: () => {}
      };
    }

    const testMockEls = {};
    [
      'overlay-viewport', 'mmr-tracker', 'mmr-tracker-text', 'mmr-tracker-in-game',
      'aegis-timer', 'aegis-all-slots', 'roshan-timer', 'queue-blocker',
      'queue-finding-view', 'queue-solid-view', 'queue-custom-text',
      'hero-pick-blocker', 'minimap-blocker', 'draft-radiant-slots', 'draft-dire-slots',
      'draft-minimap-mask', 'draft-choose-hero-mask', 'draft-phase-status-badge',
      'hud-guide', 'overlay-hud-guide', 'overlay-edit-toolbar', 'toolbar-drag-handle',
      'toolbar-scene-tabs', 'toolbar-btn-align-aegis', 'toolbar-btn-dock', 'toolbar-btn-edit',
      'toolbar-btn-guide', 'toolbar-btn-reset', 'toolbar-status-text'
    ].forEach((id) => {
      testMockEls[id] = createMockElement(id);
    });

    const draftSlots = [];
    for (let i = 0; i < 10; i++) {
      const slot = createMockElement(`draft-slot-${i}`);
      slot.setAttribute('data-slot', String(i));
      draftSlots.push(slot);
      if (i < 5) testMockEls['draft-radiant-slots'].appendChild(slot);
      else testMockEls['draft-dire-slots'].appendChild(slot);
    }

    const testWindow = {
      innerWidth: 1920,
      innerHeight: 1080,
      addEventListener: () => {},
      location: { search: '' },
      parent: { postMessage: () => {} }
    };

    const vmContext = {
      window: testWindow,
      document: {
        getElementById: (id) => testMockEls[id] || null,
        querySelectorAll: (selector) => {
          if (selector === '.draft-slot') return draftSlots;
          return [];
        },
        createElement: (tag) => createMockElement(`mock-${tag}`)
      },
      fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
      io: () => ({ on: () => {}, emit: () => {} }),
      URLSearchParams,
      Math,
      Number,
      String,
      Boolean,
      Array,
      parseFloat,
      clearTimeout: () => {},
      setTimeout: (fn) => fn()
    };

    vm.runInNewContext(overlayScript, vmContext);

    // Test resolveCurrentSceneKey export and direct function behavior (both snapshot and raw GSI payload formats)
    assert.equal(typeof testWindow.resolveCurrentSceneKey, 'function');
    assert.equal(testWindow.resolveCurrentSceneKey({ gameState: 'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD' }), 'drafting_phase');
    assert.equal(testWindow.resolveCurrentSceneKey({ map: { game_state: 'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD' } }), 'drafting_phase', 'raw GSI payload must map to drafting_phase');
    assert.equal(testWindow.resolveCurrentSceneKey({ gameState: '  dota_gamerules_state_wait_for_players_to_load  ' }), 'drafting_phase', 'lowercase trimmed gameState must map to drafting_phase');
    assert.equal(testWindow.resolveCurrentSceneKey({ map: { game_state: 'DOTA_GAMERULES_STATE_INIT' } }), 'main_menu', 'raw GSI INIT must map to main_menu');
    assert.equal(testWindow.resolveCurrentSceneKey({ gameState: 'DOTA_GAMERULES_STATE_INIT' }), 'main_menu');
    assert.equal(testWindow.resolveCurrentSceneKey({ gameState: 'DOTA_GAMERULES_STATE_HERO_SELECTION' }), 'drafting_phase');
    assert.equal(testWindow.resolveCurrentSceneKey({ gameState: 'DOTA_GAMERULES_STATE_HERO_SELECTION', ownHeroLocked: true }), 'draft_own_hero_locked');

    // Test rendering overlay when WAIT_FOR_PLAYERS_TO_LOAD arrives
    testWindow.handleStateUpdate({
      config: cm.get(),
      gsiState: snap
    });

    // Viewport scene class
    assert.ok(testMockEls['overlay-viewport'].classList.contains('scene-drafting_phase'), 'Viewport must have scene-drafting_phase');
    assert.ok(!testMockEls['overlay-viewport'].classList.contains('scene-main_menu'), 'Viewport must NOT have scene-main_menu');

    // Hero Pick Blocker MUST be visible
    assert.ok(!testMockEls['hero-pick-blocker'].classList.contains('overlay-hidden'), 'hero-pick-blocker must be visible');
    assert.ok(!testMockEls['draft-radiant-slots'].classList.contains('overlay-hidden'), 'draft-radiant-slots must be visible');
    assert.ok(!testMockEls['draft-dire-slots'].classList.contains('overlay-hidden'), 'draft-dire-slots must be visible');
    assert.ok(!testMockEls['draft-minimap-mask'].classList.contains('overlay-hidden'), 'draft-minimap-mask must be visible');
    assert.ok(!testMockEls['draft-choose-hero-mask'].classList.contains('overlay-hidden'), 'draft-choose-hero-mask must be visible');

    // Queue blocker MUST be strictly hidden during live stream
    assert.ok(testMockEls['queue-blocker'].classList.contains('overlay-hidden'), 'queue-blocker must be hidden during WAIT_FOR_PLAYERS_TO_LOAD');

    // In-game minimap blocker MUST be strictly hidden
    assert.ok(testMockEls['minimap-blocker'].classList.contains('overlay-hidden'), 'minimap-blocker must be hidden during WAIT_FOR_PLAYERS_TO_LOAD');

    // All pick slots must remain masked (no slot-revealed)
    draftSlots.forEach((slot, idx) => {
      assert.ok(!slot.classList.contains('slot-revealed'), `Slot ${idx} must not be revealed during WAIT_FOR_PLAYERS_TO_LOAD`);
    });

    // 4. REST Endpoints E2E
    const serverInst = await startServer({
      port: 0,
      configPath: path.join(tmpDir, 'server-config.json'),
      silent: true,
      autoInstallGsi: false
    });
    try {
      const port = serverInst.port;
      const gsiRes = await fetch(`http://127.0.0.1:${port}/gsi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          map: { game_state: 'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD' },
          player: { team_name: 'dire', player_slot: 128 }
        })
      });
      const gsiJson = await gsiRes.json();
      assert.equal(gsiJson.gsiState.gameState, 'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD');
      assert.equal(gsiJson.gsiState.flags.isDraftPhase, true);
      assert.equal(gsiJson.gsiState.flags.isMainMenu, false);
      assert.equal(gsiJson.gsiState.currentScene, 'drafting_phase');

      const sceneRes = await fetch(`http://127.0.0.1:${port}/api/scenes`);
      const sceneJson = await sceneRes.json();
      assert.equal(sceneJson.currentScene, 'drafting_phase');
    } finally {
      await serverInst.closeServer();
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});




