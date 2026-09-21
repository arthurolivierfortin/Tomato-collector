<#
.SYNOPSIS
  Ouvre la fenêtre de terminal filmée pendant une prise `--agent cli`, et y lance le vrai
  Claude Code interactif.

.DESCRIPTION
  Ce script tourne *dans* la fenêtre à filmer. Il :

  1. pose un titre stable, le temps que le pilote trouve la fenêtre ;
  2. fixe la grille du terminal (`mode con`, défaut 110 x 32) et place la fenêtre ;
  3. écrit le rectangle de la fenêtre, en **pixels physiques**, dans `-RectFile` : c'est la
     poignée de main. `record.ts` attend ce fichier, puis lance `ffmpeg -f gdigrab -i desktop`
     sur cette zone. Les bornes viennent de `DwmGetWindowAttribute` (cadre étendu), qui exclut
     la bordure de redimensionnement invisible de Windows 11 ;
  4. efface l'écran, pour que la capture ne montre que Claude Code ;
  5. lance `claude` avec les arguments du fichier JSON `-ArgsFile`, splattés un par un : aucun
     échappement de ligne de commande n'est à faire, et le prompt système de 15 ko passe tel quel.

  Rien d'autre n'est tapé dans cette fenêtre : le premier message de la session est le message de
  réveil, passé en argument à `claude` par `record.ts`.

  `MAX_MCP_OUTPUT_TOKENS` est relevé comme côté SDK (trois PNG de vues dépassent le défaut) et
  `CLAUDECODE` est retiré, sans quoi un `claude` lancé depuis une session Claude Code ne démarre
  pas (leçon de C:\Meastro\llm-provider\...\ClaudeCodeLLMProvider.cs).

.EXAMPLE
  powershell -NoProfile -NoExit -ExecutionPolicy Bypass -File scripts/video/claude-window.ps1 `
    -Title "Claude Code - Tomato Collector" -ArgsFile data/video/cli/args.json -RectFile data/video/cli/window.json
#>
param(
  [Parameter(Mandatory = $true)][string]$ArgsFile,
  [Parameter(Mandatory = $true)][string]$RectFile,
  [string]$Title = 'Claude Code - Tomato Collector',
  [int]$Cols = 110,
  [int]$Rows = 32,
  [int]$X = 20,
  [int]$Y = 20,
  [string]$WorkDir = '',
  [string]$MaxMcpOutputTokens = '400000'
)

$ErrorActionPreference = 'Stop'

$Host.UI.RawUI.WindowTitle = $Title
mode con: cols=$Cols lines=$Rows

Add-Type -Namespace TomatoWin -Name Api -MemberDefinition @'
[StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
[DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int t, bool repaint);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int size);
'@

# Sans ceci, GetWindowRect rend des coordonnées logiques ; gdigrab, lui, parle en pixels physiques.
# L'écran de la machine est à 250 % : l'écart serait de plus de mille pixels.
[void][TomatoWin.Api]::SetProcessDPIAware()

# La fenêtre appartient à l'hôte de console (Windows Terminal), pas à ce processus PowerShell :
# on la retrouve par son titre, qui vient d'être posé.
$handle = [IntPtr]::Zero
for ($i = 0; $i -lt 80 -and $handle -eq [IntPtr]::Zero; $i++) {
  $found = @(Get-Process | Where-Object { $_.MainWindowTitle -eq $Title })
  if ($found.Count -gt 0) { $handle = $found[0].MainWindowHandle } else { Start-Sleep -Milliseconds 100 }
}

if ($handle -ne [IntPtr]::Zero) {
  $r = New-Object TomatoWin.Api+RECT
  [void][TomatoWin.Api]::GetWindowRect($handle, [ref]$r)
  # Taille inchangée : c'est `mode con` qui décide combien de colonnes et de lignes tiennent.
  [void][TomatoWin.Api]::MoveWindow($handle, $X, $Y, ($r.Right - $r.Left), ($r.Bottom - $r.Top), $true)
  Start-Sleep -Milliseconds 400
  [void][TomatoWin.Api]::SetForegroundWindow($handle)

  # DWMWA_EXTENDED_FRAME_BOUNDS = 9 : le cadre visible, sans la bordure de saisie invisible.
  $frame = New-Object TomatoWin.Api+RECT
  $dwm = [TomatoWin.Api]::DwmGetWindowAttribute($handle, 9, [ref]$frame, 16)
  [void][TomatoWin.Api]::GetWindowRect($handle, [ref]$r)
  $use = if ($dwm -eq 0) { $frame } else { $r }
  $rect = @{
    title  = $Title
    handle = [int64]$handle
    x      = $use.Left
    y      = $use.Top
    w      = ($use.Right - $use.Left)
    h      = ($use.Bottom - $use.Top)
  }
} else {
  $rect = @{ title = $Title; handle = 0; x = 0; y = 0; w = 0; h = 0; error = 'fenêtre introuvable par son titre' }
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $RectFile) | Out-Null
($rect | ConvertTo-Json -Compress) | Set-Content -Encoding UTF8 -Path $RectFile

if ($WorkDir -ne '') { Set-Location $WorkDir }

$env:MAX_MCP_OUTPUT_TOKENS = $MaxMcpOutputTokens
# Un `claude` lancé depuis une session Claude Code hérite de CLAUDECODE et refuse de démarrer.
Remove-Item Env:CLAUDECODE -ErrorAction SilentlyContinue

# Le pilote a besoin de voir la fenêtre placée avant d'ouvrir ffmpeg ; il attend RectFile.
Start-Sleep -Milliseconds 600
Clear-Host

$claudeArgs = Get-Content -Raw -Encoding UTF8 $ArgsFile | ConvertFrom-Json
& claude @claudeArgs
