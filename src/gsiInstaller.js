const fs = require('fs');
const path = require('path');

const CFG_FILENAME = 'gamestate_integration_localoverlay.cfg';

function generateGsiConfigContent(port = 3000) {
  const numPort =
    port !== null && port !== undefined && port !== '' && typeof port !== 'boolean'
      ? Number(port)
      : NaN;
  const safePort = Number.isFinite(numPort) && numPort > 0 && numPort <= 65535 ? Math.round(numPort) : 3000;
  return `"DotaBuddy Local Stream Overlay Configuration"
{
    "uri"               "http://127.0.0.1:${safePort}/gsi"
    "timeout"           "5.0"
    "buffer"            "0.1"
    "throttle"          "0.1"
    "heartbeat"         "10.0"
    "data"
    {
        "buildings"     "1"
        "provider"      "1"
        "map"           "1"
        "player"        "1"
        "hero"          "1"
        "abilities"     "1"
        "items"         "1"
        "draft"         "1"
        "wearables"     "1"
        "minimap"       "1"
        "roshan"        "1"
        "events"        "1"
    }
}
`;
}

function getCandidateDotaPaths() {
  const candidates = [];
  const envProgramFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const envProgramFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const home = process.env.USERPROFILE || process.env.HOME || '';

  const steamRoots = [
    path.join(envProgramFilesX86, 'Steam'),
    path.join(envProgramFiles, 'Steam'),
    'C:\\Steam',
    'D:\\Steam',
    'D:\\SteamLibrary',
    'E:\\Steam',
    'E:\\SteamLibrary',
    'F:\\SteamLibrary',
    home ? path.join(home, '.steam', 'steam') : '',
    home ? path.join(home, '.local', 'share', 'Steam') : '',
    home ? path.join(home, 'Library', 'Application Support', 'Steam') : ''
  ].filter(Boolean);

  for (const root of steamRoots) {
    // Check libraryfolders.vdf if present
    const vdfPath = path.join(root, 'steamapps', 'libraryfolders.vdf');
    if (fs.existsSync(vdfPath)) {
      try {
        const vdfText = fs.readFileSync(vdfPath, 'utf8');
        const matches = [...vdfText.matchAll(/"path"\s+"([^"]+)"/g)];
        for (const match of matches) {
          const libPath = match[1].replace(/\\\\/g, '\\');
          candidates.push(path.join(libPath, 'steamapps', 'common', 'dota 2 beta'));
        }
      } catch (_) {
        // ignore read error
      }
    }
    candidates.push(path.join(root, 'steamapps', 'common', 'dota 2 beta'));
  }

  return [...new Set(candidates)];
}

function detectDotaInstallation() {
  const candidates = getCandidateDotaPaths();
  for (const candidate of candidates) {
    const gameDotaDir = path.join(candidate, 'game', 'dota');
    if (fs.existsSync(gameDotaDir) || fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function resolveGsiDirectory(customPath) {
  if (customPath && String(customPath).trim()) {
    const cleaned = path.normalize(String(customPath).trim());
    const lower = cleaned.toLowerCase();

    if (lower.endsWith('gamestate_integration')) {
      return cleaned;
    }
    if (lower.endsWith(path.join('game', 'dota', 'cfg'))) {
      return path.join(cleaned, 'gamestate_integration');
    }
    if (lower.endsWith(path.join('game', 'dota'))) {
      return path.join(cleaned, 'cfg', 'gamestate_integration');
    }
    if (lower.endsWith('dota 2 beta')) {
      return path.join(cleaned, 'game', 'dota', 'cfg', 'gamestate_integration');
    }
    if (lower.endsWith('steamapps')) {
      return path.join(cleaned, 'common', 'dota 2 beta', 'game', 'dota', 'cfg', 'gamestate_integration');
    }
    if (lower.endsWith('steam')) {
      return path.join(cleaned, 'steamapps', 'common', 'dota 2 beta', 'game', 'dota', 'cfg', 'gamestate_integration');
    }
    // Check if 'game/dota' exists inside cleaned
    if (fs.existsSync(path.join(cleaned, 'game', 'dota'))) {
      return path.join(cleaned, 'game', 'dota', 'cfg', 'gamestate_integration');
    }
    if (fs.existsSync(path.join(cleaned, 'steamapps', 'common', 'dota 2 beta'))) {
      return path.join(cleaned, 'steamapps', 'common', 'dota 2 beta', 'game', 'dota', 'cfg', 'gamestate_integration');
    }
    // Otherwise treat cleaned as a Dota 2 root or direct target directory
    return path.join(cleaned, 'game', 'dota', 'cfg', 'gamestate_integration');
  }

  const detected = detectDotaInstallation();
  if (detected) {
    return path.join(detected, 'game', 'dota', 'cfg', 'gamestate_integration');
  }

  // Fallback local path mirroring Steam directory structure when Dota 2 is not installed on this machine
  return path.join(
    __dirname,
    '..',
    'Steam',
    'steamapps',
    'common',
    'dota 2 beta',
    'game',
    'dota',
    'cfg',
    'gamestate_integration'
  );
}

function installGsiConfig({ customPath = '', port = 3000 } = {}) {
  const content = generateGsiConfigContent(port);
  const targetDir = resolveGsiDirectory(customPath);
  const targetFile = path.join(targetDir, CFG_FILENAME);

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(targetFile, content, 'utf8');

  // Also write a convenient local copy in the project root
  const localCopyPath = path.join(__dirname, '..', CFG_FILENAME);
  try {
    fs.writeFileSync(localCopyPath, content, 'utf8');
  } catch (_) {
    // ignore if read-only
  }

  const autoDetectedDota = detectDotaInstallation();

  return {
    success: true,
    filename: CFG_FILENAME,
    targetDir,
    targetFile,
    localCopyPath,
    autoDetected: Boolean(!customPath && autoDetectedDota),
    content
  };
}

function getGsiConfigStatus({ customPath = '', port = 3000 } = {}) {
  const cleanedCustom = customPath && String(customPath).trim() ? String(customPath).trim() : '';
  const autoDetectedDota = detectDotaInstallation();
  const targetDir = resolveGsiDirectory(cleanedCustom);
  const targetFile = path.join(targetDir, CFG_FILENAME);
  const installed = fs.existsSync(targetFile);

  return {
    installed,
    filename: CFG_FILENAME,
    targetDir,
    targetFile,
    autoDetected: Boolean(!cleanedCustom && autoDetectedDota),
    dotaDetected: Boolean(cleanedCustom || autoDetectedDota),
    content: generateGsiConfigContent(port)
  };
}

module.exports = {
  CFG_FILENAME,
  generateGsiConfigContent,
  detectDotaInstallation,
  resolveGsiDirectory,
  installGsiConfig,
  getGsiConfigStatus
};

