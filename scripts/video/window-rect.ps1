<#
.SYNOPSIS
  Trouve la fenetre de l'agent headless visible par son titre, et rend son rectangle en pixels
  physiques. Peut aussi la mettre au-dessus de tout, ou la fermer.

.DESCRIPTION
  `record.ts` filme cette fenetre avec `ffmpeg -f gdigrab -i desktop -offset_x/-offset_y
  -video_size`, c'est-a-dire une zone de l'ecran. Deux raisons a ce detour, toutes deux mesurees
  sur cette machine :

  - `gdigrab -i title=<titre>` trouve bien la fenetre de Windows Terminal, mais ne ramene que du
    noir : elle se dessine en DirectX, et un BitBlt sur son contexte ne rend rien ;
  - une zone de l'ecran se donne en pixels PHYSIQUES. L'ecran est a 250 %, donc sans
    `SetProcessDPIAware` les coordonnees seraient fausses de plus de mille pixels.

  La fenetre est cherchee par enumeration des fenetres de premier plan, et surtout pas par
  `Get-Process | Where MainWindowTitle` : un seul processus Windows Terminal heberge plusieurs
  fenetres, et `MainWindowTitle` n'en rend qu'une (mesure : rectangle 0x0, capture impossible).

  Rien n'est ecrit dans la fenetre : ce script ne fait que la regarder.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/video/window-rect.ps1 `
    -Title "Claude Code headless" -Topmost
#>
param(
  [Parameter(Mandatory = $true)][string]$Title,
  # Poignee deja connue : on ne cherche plus par le titre, que Claude Code reprend au demarrage.
  [long]$Handle = 0,
  [switch]$Topmost,
  [switch]$Close
)

$ErrorActionPreference = 'Stop'

Add-Type -Namespace TomatoRect -Name Api -MemberDefinition @'
[StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
public delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
[DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr l);
[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int t, uint flags);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
[DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int size);
'@

[void][TomatoRect.Api]::SetProcessDPIAware()

$script:wanted = $Title
$script:found = if ($Handle -ne 0) { [IntPtr]$Handle } else { [IntPtr]::Zero }
$cb = [TomatoRect.Api+EnumWindowsProc] {
  param($h, $l)
  if ([TomatoRect.Api]::IsWindowVisible($h)) {
    $sb = New-Object System.Text.StringBuilder 512
    [void][TomatoRect.Api]::GetWindowText($h, $sb, 512)
    if ($sb.ToString() -eq $script:wanted) { $script:found = $h; return $false }
  }
  return $true
}
if ($Handle -eq 0) { [void][TomatoRect.Api]::EnumWindows($cb, [IntPtr]::Zero) }
$handle = $script:found

if ($handle -eq [IntPtr]::Zero) {
  $out = @{ title = $Title; handle = 0; x = 0; y = 0; w = 0; h = 0; error = 'window not found by title' }
  [Console]::Out.Write(($out | ConvertTo-Json -Compress))
  exit 0
}

if ($Close) {
  # WM_CLOSE : la fenetre se ferme comme si on avait clique sur la croix.
  [void][TomatoRect.Api]::PostMessage($handle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
  [Console]::Out.Write((@{ title = $Title; handle = [int64]$handle; closed = $true; x = 0; y = 0; w = 0; h = 0 } | ConvertTo-Json -Compress))
  exit 0
}

if ($Topmost) {
  # SW_SHOW = 5, HWND_TOPMOST = -1, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE = 0x0013.
  [void][TomatoRect.Api]::ShowWindow($handle, 5)
  [void][TomatoRect.Api]::SetWindowPos($handle, [IntPtr](-1), 0, 0, 0, 0, 0x0013)
  [void][TomatoRect.Api]::SetForegroundWindow($handle)
  Start-Sleep -Milliseconds 300
}

# DWMWA_EXTENDED_FRAME_BOUNDS = 9 : le cadre visible, sans la bordure de saisie invisible de
# Windows 11. C'est la zone utile de la fenetre, celle qu'il faut filmer.
$frame = New-Object TomatoRect.Api+RECT
$dwm = [TomatoRect.Api]::DwmGetWindowAttribute($handle, 9, [ref]$frame, 16)
$rect = New-Object TomatoRect.Api+RECT
[void][TomatoRect.Api]::GetWindowRect($handle, [ref]$rect)
$use = if ($dwm -eq 0) { $frame } else { $rect }

$out = @{
  title  = $Title
  handle = [int64]$handle
  x      = $use.Left
  y      = $use.Top
  w      = ($use.Right - $use.Left)
  h      = ($use.Bottom - $use.Top)
}
[Console]::Out.Write(($out | ConvertTo-Json -Compress))
