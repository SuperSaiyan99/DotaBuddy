const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const {
  ConfigManager,
  getRankFromMmr,
  getRankImagePath,
  generateRankSvg,
  getAllRankBrackets,
  getRankCatalog
} = require('./src/configManager');
const { GsiStateEngine } = require('./src/gsiStateEngine');
const {
  installGsiConfig,
  generateGsiConfigContent,
  detectDotaInstallation,
  getGsiConfigStatus,
  CFG_FILENAME
} = require('./src/gsiInstaller');

function createAppServer({ configPath, port = process.env.PORT || 3000, exitOnShutdown = false } = {}) {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PUT']
    }
  });

  const configManager = new ConfigManager(configPath);
  const gsiEngine = new GsiStateEngine(configManager, () => {
    broadcastFullState();
  });

  function getActivePort() {
    const addr = server.address();
    return addr && typeof addr === 'object' && addr.port ? addr.port : port || 3000;
  }

  let cachedGsiStatus = null;
  let cachedGsiCustomPath = null;
  let cachedGsiPort = null;
  let cachedGsiTime = 0;

  function getCachedGsiConfigStatus(customPath, targetPort) {
    const now = Date.now();
    if (
      cachedGsiStatus &&
      cachedGsiCustomPath === customPath &&
      cachedGsiPort === targetPort &&
      now - cachedGsiTime < 5000
    ) {
      return cachedGsiStatus;
    }
    cachedGsiStatus = getGsiConfigStatus({ customPath, port: targetPort });
    cachedGsiCustomPath = customPath;
    cachedGsiPort = targetPort;
    cachedGsiTime = now;
    return cachedGsiStatus;
  }

  function getPayload() {
    const cfg = configManager.get();
    return {
      config: cfg,
      gsiState: gsiEngine.getSnapshot(),
      gsiConfigStatus: getCachedGsiConfigStatus(
        cfg.gsi && cfg.gsi.dotaPath ? cfg.gsi.dotaPath : '',
        getActivePort()
      )
    };
  }

  function broadcastFullState() {
    const payload = getPayload();
    io.emit('state:update', payload);
    io.emit('config:update', payload.config);
    if (payload.config && payload.config.customPositions) {
      io.emit('positions:update', payload.config.customPositions);
    }
    if (payload.config && payload.config.sceneLayouts) {
      io.emit('scenes:update', payload.config.sceneLayouts);
    }
  }

  // Periodic tick while Aegis or Roshan timers are active (including the expiration tick)
  let hadActiveTimersOnLastTick = false;
  const tickInterval = setInterval(() => {
    const wasActiveBeforeSnap = Boolean(
      (gsiEngine.state.aegis && gsiEngine.state.aegis.active) ||
        (gsiEngine.state.roshan && gsiEngine.state.roshan.active)
    );
    const snap = gsiEngine.getSnapshot();
    const isActiveNow = Boolean(snap.aegis.active || snap.roshan.active);
    if (wasActiveBeforeSnap || isActiveNow || hadActiveTimersOnLastTick) {
      hadActiveTimersOnLastTick = isActiveNow;
      const cfg = configManager.get();
      io.emit('state:update', {
        config: cfg,
        gsiState: snap,
        gsiConfigStatus: getCachedGsiConfigStatus(
          cfg.gsi && cfg.gsi.dotaPath ? cfg.gsi.dotaPath : '',
          getActivePort()
        )
      });
    }
  }, 500);
  if (typeof tickInterval.unref === 'function') {
    tickInterval.unref();
  }

  let closingPromise = null;
  function closeServer() {
    if (closingPromise) return closingPromise;
    clearInterval(tickInterval);
    closingPromise = new Promise((resolve) => {
      const wasListening = server.listening;
      io.close(() => {
        if (typeof server.closeAllConnections === 'function') {
          server.closeAllConnections();
        }
        if (wasListening && server.listening) {
          server.close(() => resolve());
        } else {
          resolve();
        }
      });
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
    });
    return closingPromise;
  }

  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, 'public')));

  // Frontend Views
  app.get('/', (req, res) => {
    res.redirect('/dashboard');
  });

  app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
  });

  app.get('/overlay', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
  });

  // Dota 2 Official Game State Integration Endpoint
  app.post('/gsi', (req, res) => {
    const gsiState = gsiEngine.processGsiPayload(req.body || {});
    res.status(200).json({
      status: 'ok',
      gsiState,
      config: configManager.get()
    });
  });

  // REST API for Dashboard & Diagnostics
  app.get('/api/state', (req, res) => {
    res.json(getPayload());
  });

  app.get('/api/config', (req, res) => {
    res.json(configManager.get());
  });

  app.get('/api/rank', (req, res) => {
    const rawMmr = req.query && req.query.mmr !== undefined
      ? req.query.mmr
      : configManager.get().mmrTracker.currentMmr;
    const rankInfo = getRankFromMmr(rawMmr);
    const resolvedImage = getRankImagePath(rankInfo, path.join(__dirname, 'public'));
    const svg = generateRankSvg(rankInfo);
    res.json({
      ...rankInfo,
      resolvedImage,
      image: resolvedImage,
      svg
    });
  });

  app.get('/api/ranks', (req, res) => {
    const catalog = getRankCatalog(path.join(__dirname, 'public'));
    res.json({
      status: 'ok',
      totalBrackets: catalog.length,
      brackets: catalog
    });
  });

  function handleConfigUpdate(req, res) {
    const patch = req.body || {};
    if (patch.gsi) cachedGsiStatus = null;
    const updated = configManager.update(patch);
    gsiEngine.syncConfigChange(patch);
    broadcastFullState();
    res.json({
      status: 'ok',
      config: updated,
      gsiState: gsiEngine.getSnapshot(),
      gsiConfigStatus: getCachedGsiConfigStatus(
        updated.gsi && updated.gsi.dotaPath ? updated.gsi.dotaPath : '',
        getActivePort()
      )
    });
  }

  app.post('/api/config', handleConfigUpdate);
  app.put('/api/config', handleConfigUpdate);

  app.get('/api/positions', (req, res) => {
    res.json({
      status: 'ok',
      customPositions: configManager.get().customPositions
    });
  });

  function handlePositionsUpdate(req, res) {
    const positions = req.body && req.body.customPositions ? req.body.customPositions : (req.body || {});
    const updated = configManager.updatePositions(positions);
    broadcastFullState();
    res.json({
      status: 'ok',
      customPositions: updated.customPositions,
      config: updated
    });
  }

  app.post('/api/positions', handlePositionsUpdate);
  app.put('/api/positions', handlePositionsUpdate);

  app.post('/api/positions/reset', (req, res) => {
    const explicit = req.body && Boolean(req.body.toCoordinates);
    const updated = configManager.resetPositions(explicit);
    io.emit('positions:reset', updated.customPositions);
    broadcastFullState();
    res.json({
      status: 'ok',
      customPositions: updated.customPositions,
      config: updated
    });
  });

  // REST API for Multi-Scene Layouts
  app.get('/api/scenes', (req, res) => {
    const snap = gsiEngine.getSnapshot();
    res.json({
      status: 'ok',
      scenes: configManager.get().sceneLayouts,
      sceneLayouts: configManager.get().sceneLayouts,
      currentScene: snap.currentScene || 'main_menu'
    });
  });

  function handleSceneUpdate(req, res) {
    const scene = req.params.scene;
    const widgets = req.body && req.body.widgets ? req.body.widgets : req.body;
    const updated = configManager.updateSceneLayout(scene, widgets || {});
    broadcastFullState();
    res.json({
      status: 'ok',
      scene,
      layout: updated.sceneLayouts[scene],
      sceneLayouts: updated.sceneLayouts,
      config: updated
    });
  }

  app.post('/api/scenes/:scene', handleSceneUpdate);
  app.put('/api/scenes/:scene', handleSceneUpdate);

  app.post('/api/scenes/reset', (req, res) => {
    const scene = req.body && req.body.scene ? req.body.scene : null;
    const updated = configManager.resetSceneLayout(scene);
    broadcastFullState();
    res.json({
      status: 'ok',
      sceneLayouts: updated.sceneLayouts,
      config: updated
    });
  });

  app.post('/api/scenes/align-aegis', (req, res) => {
    const updated = configManager.autoAlignAegisSlots();
    broadcastFullState();
    res.json({
      status: 'ok',
      sceneLayouts: updated.sceneLayouts,
      config: updated
    });
  });

  app.post('/api/mmr/win', (req, res) => {
    const delta = req.body && req.body.delta !== undefined ? req.body.delta : undefined;
    configManager.recordWin(delta);
    broadcastFullState();
    res.json(getPayload());
  });

  app.post('/api/mmr/loss', (req, res) => {
    const delta = req.body && req.body.delta !== undefined ? req.body.delta : undefined;
    configManager.recordLoss(delta);
    broadcastFullState();
    res.json(getPayload());
  });

  app.post('/api/mmr/reset', (req, res) => {
    const startingMmr = req.body && req.body.startingMmr !== undefined ? req.body.startingMmr : undefined;
    configManager.resetSession(startingMmr);
    broadcastFullState();
    res.json(getPayload());
  });

  app.post('/api/simulate', (req, res) => {
    const { mode, ...options } = req.body || {};
    if (mode === 'stop_aegis') {
      gsiEngine.stopAegis();
    } else if (mode === 'stop_roshan') {
      gsiEngine.stopRoshan();
    } else {
      gsiEngine.simulateState(mode, options);
    }
    res.json(getPayload());
  });

  app.post('/api/gsi/install', (req, res) => {
    const currentCfg = configManager.get();
    const customPath =
      req.body && req.body.dotaPath !== undefined
        ? String(req.body.dotaPath).trim()
        : currentCfg.gsi.dotaPath;

    if (req.body && req.body.dotaPath !== undefined) {
      configManager.update({ gsi: { dotaPath: customPath } });
    } else if (customPath) {
      configManager.update({ gsi: { dotaPath: customPath } });
    }

    const activePort = server.address() ? server.address().port : port;
    const result = installGsiConfig({ customPath, port: activePort || 3000 });
    cachedGsiStatus = null;
    broadcastFullState();
    res.json(result);
  });

  app.get('/api/gsi/download', (req, res) => {
    const activePort = server.address() ? server.address().port : port;
    const content = generateGsiConfigContent(activePort || 3000);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${CFG_FILENAME}"`);
    res.send(content);
  });

  app.post('/api/shutdown', (req, res) => {
    const remote = req.socket && req.socket.remoteAddress;
    const isLoopback =
      !remote ||
      remote === '127.0.0.1' ||
      remote === '::1' ||
      remote === '::ffff:127.0.0.1';
    const hasControlHeader = req.headers['x-dotabuddy-shutdown'] === 'dotabuddy-overlay';
    const hasBrowserOrigin = Boolean(req.headers.origin) || req.headers['sec-fetch-site'] === 'cross-site';
    if (!isLoopback || !hasControlHeader || hasBrowserOrigin) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.on('finish', () => {
      setImmediate(() => {
        closeServer().then(() => {
          if (exitOnShutdown) {
            process.exit(0);
          }
        });
      });
    });
    res.json({ status: 'shutting_down', service: 'dotabuddy-overlay' });
  });

  // Socket.IO Real-Time Synchronization
  io.on('connection', (socket) => {
    socket.emit('state:update', getPayload());

    socket.on('config:update', (patch) => {
      configManager.update(patch || {});
      gsiEngine.syncConfigChange(patch || {});
      broadcastFullState();
    });

    socket.on('positions:update', (positions) => {
      configManager.updatePositions(positions || {});
      broadcastFullState();
    });

    socket.on('positions:reset', (opts = {}) => {
      const updated = configManager.resetPositions(opts && Boolean(opts.toCoordinates));
      io.emit('positions:reset', updated.customPositions);
      broadcastFullState();
    });

    socket.on('scene:update', (data = {}) => {
      const { scene, widgets } = data;
      configManager.updateSceneLayout(scene, widgets || {});
      broadcastFullState();
    });

    socket.on('scenes:update', (layouts = {}) => {
      configManager.updateSceneLayouts(layouts);
      broadcastFullState();
    });

    socket.on('scene:reset', (data = {}) => {
      configManager.resetSceneLayout(data && data.scene ? data.scene : null);
      broadcastFullState();
    });

    socket.on('scene:align-aegis', () => {
      configManager.autoAlignAegisSlots();
      broadcastFullState();
    });

    socket.on('mmr:win', (data = {}) => {
      configManager.recordWin(data.delta);
      broadcastFullState();
    });

    socket.on('mmr:loss', (data = {}) => {
      configManager.recordLoss(data.delta);
      broadcastFullState();
    });

    socket.on('mmr:reset', (data = {}) => {
      configManager.resetSession(data.startingMmr);
      broadcastFullState();
    });

    socket.on('simulate', (data = {}) => {
      const { mode, ...options } = data;
      if (mode === 'stop_aegis') {
        gsiEngine.stopAegis();
      } else if (mode === 'stop_roshan') {
        gsiEngine.stopRoshan();
      } else {
        gsiEngine.simulateState(mode, options);
      }
    });

    socket.on('timer:aegis:start', (opts = {}) => {
      gsiEngine.triggerAegis(opts);
    });

    socket.on('timer:aegis:stop', () => {
      gsiEngine.stopAegis();
    });

    socket.on('timer:roshan:start', (opts = {}) => {
      gsiEngine.triggerRoshan(opts);
    });

    socket.on('timer:roshan:stop', () => {
      gsiEngine.stopRoshan();
    });
  });

  return {
    app,
    server,
    io,
    configManager,
    gsiEngine,
    tickInterval,
    closeServer
  };
}

function tryListenOnce(server, port, host) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      server.removeListener('error', onError);
      server.removeListener('listening', onListening);
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const onListening = () => {
      cleanup();
      const addr = server.address();
      resolve(addr && typeof addr === 'object' ? addr.port : port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    try {
      if (host) {
        server.listen(port, host);
      } else {
        server.listen(port);
      }
    } catch (syncErr) {
      cleanup();
      reject(syncErr);
    }
  });
}

function requestExistingInstanceShutdown(port, host) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      resolve(result);
    };

    const targetHost = host === '::1' ? '::1' : '127.0.0.1';
    const req = http.request(
      {
        hostname: targetHost,
        port,
        path: '/api/shutdown',
        method: 'POST',
        agent: false,
        headers: {
          'X-DotaBuddy-Shutdown': 'dotabuddy-overlay',
          Connection: 'close'
        },
        timeout: 800
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
          if (body.length > 4096) {
            req.destroy();
            finish(false);
          }
        });
        res.on('error', () => finish(false));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            finish(res.statusCode === 200 && parsed && parsed.service === 'dotabuddy-overlay');
          } catch (_) {
            finish(false);
          }
        });
      }
    );

    const hardTimer = setTimeout(() => {
      req.destroy();
      finish(false);
    }, 800);
    if (typeof hardTimer.unref === 'function') {
      hardTimer.unref();
    }

    req.on('error', () => finish(false));
    req.on('timeout', () => {
      req.destroy();
      finish(false);
    });
    req.end();
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startServer({
  configPath,
  port = process.env.PORT,
  host,
  maxPortRetries = 10,
  exitOnShutdown = false,
  silent = false,
  autoInstallGsi = !silent
} = {}) {
  const isExplicitZero = port === 0 || port === '0';
  const numericPort =
    port === null || port === undefined || String(port).trim() === '' || typeof port === 'boolean'
      ? NaN
      : Number(port);
  const preferredPort = isExplicitZero
    ? 0
    : Number.isInteger(numericPort) && numericPort > 0 && numericPort <= 65535
      ? numericPort
      : 3000;
  const instance = createAppServer({ configPath, port: preferredPort || 3000, exitOnShutdown });
  const { server } = instance;

  let currentPort = preferredPort;
  let boundPort = null;

  for (let attempt = 0; attempt <= maxPortRetries; attempt++) {
    try {
      boundPort = await tryListenOnce(server, currentPort, host);
      break;
    } catch (err) {
      if (err && err.code === 'EADDRINUSE') {
        if (currentPort > 0) {
          const stoppedPrevious = await requestExistingInstanceShutdown(currentPort, host);
          if (stoppedPrevious) {
            if (!silent) {
              console.log(`[DotaBuddy] Stopped previous DotaBuddy instance on port ${currentPort}; reclaiming port...`);
            }
            let reclaimed = false;
            for (let retry = 0; retry < 10; retry++) {
              await delay(100);
              try {
                boundPort = await tryListenOnce(server, currentPort, host);
                reclaimed = true;
                break;
              } catch (retryErr) {
                if (!retryErr || retryErr.code !== 'EADDRINUSE') {
                  throw retryErr;
                }
              }
            }
            if (reclaimed) {
              break;
            }
          }
        }

        const nextPort = currentPort + 1;
        if (attempt < maxPortRetries && currentPort > 0 && nextPort <= 65535) {
          if (!silent) {
            console.warn(
              `[DotaBuddy] Port ${currentPort} is already in use; falling back to port ${nextPort}...`
            );
          }
          currentPort = nextPort;
          continue;
        }
      }
      await instance.closeServer();
      throw err;
    }
  }

  server.on('error', (err) => {
    if (!silent) {
      console.error('[DotaBuddy] Server error:', err.message);
    }
  });

  let gsiAutoInstallResult = null;
  if (autoInstallGsi) {
    try {
      const currentCfg = instance.configManager.get();
      const customPath =
        currentCfg.gsi && currentCfg.gsi.dotaPath ? String(currentCfg.gsi.dotaPath).trim() : '';
      const detectedDota = detectDotaInstallation();
      if (customPath || detectedDota) {
        gsiAutoInstallResult = installGsiConfig({ customPath, port: boundPort || 3000 });
      }
    } catch (gsiErr) {
      if (!silent) {
        console.warn('[DotaBuddy] Auto-install GSI config skipped:', gsiErr.message);
      }
    }
  }

  if (!silent) {
    console.log('====================================================');
    console.log(` DotaBuddy Overlay Server running on port ${boundPort}`);
    console.log(` Control Dashboard : http://localhost:${boundPort}/dashboard`);
    console.log(` OBS Overlay URL   : http://localhost:${boundPort}/overlay`);
    console.log(` GSI POST Endpoint : http://127.0.0.1:${boundPort}/gsi`);
    if (gsiAutoInstallResult && gsiAutoInstallResult.success) {
      console.log(` GSI Config Ready  : ${gsiAutoInstallResult.targetFile}`);
    }
    console.log('====================================================');
  }

  return { ...instance, port: boundPort, gsiAutoInstallResult };
}

if (require.main === module) {
  startServer({ exitOnShutdown: true }).catch((err) => {
    console.error('[DotaBuddy] Failed to start server:', err.message);
    process.exit(1);
  });
}

module.exports = { createAppServer, startServer };
