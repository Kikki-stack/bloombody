$workspacePath = 'C:\Users\holop\Fitness App'
$nodeExe = 'C:\Program Files\nodejs\node.exe'
$codeExe = 'C:\Users\holop\AppData\Local\Programs\Microsoft VS Code\Code.exe'

function Get-FreePort {
  param(
    [int]$StartPort = 3000,
    [int]$EndPort = 3010
  )

  $listeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
  $usedPorts = @($listeners | ForEach-Object { $_.Port })

  for ($port = $StartPort; $port -le $EndPort; $port++) {
    if ($usedPorts -notcontains $port) {
      return $port
    }
  }

  throw "No free port was found between $StartPort and $EndPort."
}

function Open-CopilotChat {
  try {
    $shell = New-Object -ComObject WScript.Shell

    for ($attempt = 0; $attempt -lt 12; $attempt++) {
      if ($shell.AppActivate('Visual Studio Code')) {
        Start-Sleep -Milliseconds 600
        $shell.SendKeys('^%i')
        return $true
      }

      Start-Sleep -Milliseconds 500
    }
  } catch {
    return $false
  }

  return $false
}

Clear-Host
Write-Host '======================================' -ForegroundColor Green
Write-Host ' FitLife Launcher' -ForegroundColor Green
Write-Host '======================================' -ForegroundColor Green
Write-Host ''
Write-Host '1. Run website'
Write-Host '2. Open project in VS Code + Chat'
Write-Host ''

$choice = Read-Host 'Type 1 or 2 and press Enter'

switch ($choice) {
  '1' {
    if (-not (Test-Path $nodeExe)) {
      Write-Host ''
      Write-Host 'Node.js was not found at the expected location:' -ForegroundColor Red
      Write-Host $nodeExe -ForegroundColor Red
      Read-Host 'Press Enter to close'
      exit 1
    }

    try {
      $port = Get-FreePort
      $serverCommand = "Set-Location '$workspacePath'; `$env:PORT=$port; & '$nodeExe' '.\server.js'"

      Start-Process powershell -ArgumentList @(
        '-NoExit',
        '-ExecutionPolicy', 'Bypass',
        '-Command', $serverCommand
      ) | Out-Null

      Start-Sleep -Seconds 2
      Start-Process "http://localhost:$port" | Out-Null

      Write-Host ''
      Write-Host "FitLife is starting on http://localhost:$port" -ForegroundColor Green
      Write-Host 'A new terminal window was opened for the server.' -ForegroundColor DarkGray
    } catch {
      Write-Host ''
      Write-Host $_.Exception.Message -ForegroundColor Red
    }

    Read-Host 'Press Enter to close this launcher'
  }
  '2' {
    if (-not (Test-Path $codeExe)) {
      Write-Host ''
      Write-Host 'VS Code was not found at the expected location:' -ForegroundColor Red
      Write-Host $codeExe -ForegroundColor Red
      Read-Host 'Press Enter to close'
      exit 1
    }

    Start-Process $codeExe -ArgumentList @($workspacePath) | Out-Null
    $chatOpened = Open-CopilotChat

    Write-Host ''
    Write-Host 'VS Code is opening your FitLife project.' -ForegroundColor Green

    if (-not $chatOpened) {
      Write-Host 'If Copilot Chat does not open automatically, press Ctrl+Alt+I inside VS Code.' -ForegroundColor Yellow
    }

    Read-Host 'Press Enter to close this launcher'
  }
  default {
    Write-Host ''
    Write-Host 'Invalid choice. Please run the launcher again and choose 1 or 2.' -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
  }
}