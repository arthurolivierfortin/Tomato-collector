<#
.SYNOPSIS
  Ouvre la fenêtre de terminal filmée pendant une prise, et y lance le serveur.

.DESCRIPTION
  La vidéo de démo doit montrer une vraie session Claude Code, pas seulement un panneau du
  dashboard. `record.ts --terminal "<titre>"` filme une fenêtre par son titre avec ffmpeg/gdigrab :
  ce script ouvre cette fenêtre, lui donne un titre stable, la dimensionne (960x620, elle tient
  dans un écran de 1536x960 et n'est donc jamais rognée), la place en haut à gauche, et y lance
  `npm run start -w @tomato/server` avec TOMATO_LOG_STREAM=on — c'est cette variable qui fait
  défiler le flux du SDK (init, text, tool_use, tool_result, result) dans la console.

.EXAMPLE
  ./scripts/video/terminal.ps1 -McpPort 7471 -WsPort 7472 -WakePort 7473 -Agent off
#>
param(
  [string]$Title = 'Tomato server',
  [int]$McpPort = 7331,
  [int]$WsPort = 7332,
  [int]$WakePort = 7333,
  [ValidateSet('on', 'off')][string]$Agent = 'on',
  [int]$Cols = 118,
  [int]$Rows = 34,
  [int]$X = 24,
  [int]$Y = 24,
  [int]$Width = 960,
  [int]$Height = 620
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

# `mode con` fixe la taille en caractères ; MoveWindow fixe la taille en pixels. Les deux, sinon la
# fenêtre est soit trop petite pour le flux, soit plus grande que ce que gdigrab peut cadrer.
$inner = @"
`$Host.UI.RawUI.WindowTitle = '$Title'
mode con: cols=$Cols lines=$Rows
Set-Location '$repo'
`$env:TOMATO_LOG_STREAM = 'on'
`$env:TOMATO_MCP_PORT = '$McpPort'
`$env:TOMATO_WS_PORT = '$WsPort'
`$env:TOMATO_WAKE_PORT = '$WakePort'
`$env:TOMATO_AGENT = '$Agent'
npm run start -w '@tomato/server'
"@

$proc = Start-Process powershell -PassThru -ArgumentList '-NoExit', '-NoProfile', '-Command', $inner

Add-Type -Namespace Win -Name Api -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int t, bool repaint);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
'@

# La poignée de fenêtre n'existe pas à la milliseconde où le processus démarre.
for ($i = 0; $i -lt 50 -and $proc.MainWindowHandle -eq 0; $i++) {
  Start-Sleep -Milliseconds 100
  $proc.Refresh()
}
if ($proc.MainWindowHandle -ne 0) {
  [void][Win.Api]::MoveWindow($proc.MainWindowHandle, $X, $Y, $Width, $Height, $true)
  [void][Win.Api]::SetForegroundWindow($proc.MainWindowHandle)
}

Write-Output "fenetre '$Title' (pid $($proc.Id)) : $($Width)x$Height en ($X, $Y), serveur agent=$Agent, flux console on"
Write-Output "filmer avec : npm run video:record -- --terminal `"$Title`" ..."
