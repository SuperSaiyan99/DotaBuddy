#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { installGsiConfig } = require('./src/gsiInstaller');

function parseArgs(argv) {
  let customPath = '';
  let port = 3000;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === '--path' || arg === '-p') && argv[i + 1]) {
      customPath = argv[++i];
    } else if (arg.startsWith('--path=')) {
      customPath = arg.slice('--path='.length);
    } else if (arg === '--port' && argv[i + 1]) {
      port = Number(argv[++i]) || 3000;
    } else if (!arg.startsWith('-') && !customPath) {
      customPath = arg;
    }
  }

  // Also check config.json if customPath wasn't passed on CLI
  if (!customPath) {
    const cfgPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(cfgPath)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        if (cfg && cfg.gsi && cfg.gsi.dotaPath) {
          customPath = cfg.gsi.dotaPath;
        }
      } catch (_) {
        // ignore
      }
    }
  }

  return { customPath, port };
}

if (require.main === module) {
  const { customPath, port } = parseArgs(process.argv);
  const result = installGsiConfig({ customPath, port });
  console.log('====================================================');
  console.log(' DotaBuddy - Dota 2 GSI Config Installer');
  console.log('====================================================');
  console.log(`Status      : SUCCESS`);
  console.log(`Config File : ${result.filename}`);
  console.log(`Installed To: ${result.targetFile}`);
  console.log(`Local Copy  : ${result.localCopyPath}`);
  console.log('----------------------------------------------------');
  console.log('Next step: Add "-gamestateintegration" to Dota 2 Launch Options in Steam.');
}

module.exports = { parseArgs };
