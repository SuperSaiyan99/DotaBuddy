param(
    [string]$DotaPath = "",
    [int]$Port = 3000
)

$ErrorActionPreference = "Stop"

$cfgContent = @"
"DotaBuddy Local Stream Overlay Configuration"
{
    "uri"               "http://127.0.0.1:$Port/gsi"
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
"@

$candidates = @(
    "C:\Program Files (x86)\Steam\steamapps\common\dota 2 beta",
    "C:\Program Files\Steam\steamapps\common\dota 2 beta",
    "D:\Steam\steamapps\common\dota 2 beta",
    "D:\SteamLibrary\steamapps\common\dota 2 beta",
    "E:\SteamLibrary\steamapps\common\dota 2 beta"
)

$resolvedBase = $DotaPath
if ([string]::IsNullOrWhiteSpace($resolvedBase)) {
    foreach ($c in $candidates) {
        if (Test-Path $c) {
            $resolvedBase = $c
            break
        }
    }
}

if ([string]::IsNullOrWhiteSpace($resolvedBase)) {
    $targetDir = Join-Path $PSScriptRoot "Steam\steamapps\common\dota 2 beta\game\dota\cfg\gamestate_integration"
} else {
    $trimmed = $resolvedBase.TrimEnd('\', '/')
    $lower = $trimmed.ToLower()
    if ($lower.EndsWith("gamestate_integration")) {
        $targetDir = $trimmed
    } elseif ($lower.EndsWith("game\dota\cfg") -or $lower.EndsWith("game/dota/cfg")) {
        $targetDir = Join-Path $trimmed "gamestate_integration"
    } elseif ($lower.EndsWith("game\dota") -or $lower.EndsWith("game/dota")) {
        $targetDir = Join-Path $trimmed "cfg\gamestate_integration"
    } elseif ($lower.EndsWith("dota 2 beta")) {
        $targetDir = Join-Path $trimmed "game\dota\cfg\gamestate_integration"
    } elseif ($lower.EndsWith("steamapps")) {
        $targetDir = Join-Path $trimmed "common\dota 2 beta\game\dota\cfg\gamestate_integration"
    } elseif ($lower.EndsWith("steam")) {
        $targetDir = Join-Path $trimmed "steamapps\common\dota 2 beta\game\dota\cfg\gamestate_integration"
    } else {
        $targetDir = Join-Path $trimmed "game\dota\cfg\gamestate_integration"
    }
}

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
$targetFile = Join-Path $targetDir "gamestate_integration_localoverlay.cfg"
Set-Content -Path $targetFile -Value $cfgContent -Encoding UTF8

$localFile = Join-Path $PSScriptRoot "gamestate_integration_localoverlay.cfg"
Set-Content -Path $localFile -Value $cfgContent -Encoding UTF8

Write-Host "Installed Dota 2 GSI config to: $targetFile" -ForegroundColor Green
