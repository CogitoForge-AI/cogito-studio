param(
    [string]$RepoOwner = "Nexo-Agent",
    [string]$RepoName = "nexo",
    [string]$Version = "latest",
    [switch]$Silent
)

$ErrorActionPreference = "Stop"

function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Fail {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
    exit 1
}

function Assert-Windows10OrLater {
    if ($env:OS -ne "Windows_NT") {
        Write-Fail "This installer only supports Windows."
    }

    $version = [System.Environment]::OSVersion.Version
    if ($version.Major -lt 10) {
        Write-Fail "Windows 10 or later is required. Detected: $($version.ToString())"
    }
}

function Assert-AdminIfSilent {
    param([bool]$IsSilent)
    if (-not $IsSilent) {
        return
    }

    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    $isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

    if (-not $isAdmin) {
        Write-Fail "Silent mode requires running PowerShell as Administrator."
    }
}

function Get-ReleasePayload {
    param(
        [string]$Owner,
        [string]$Name,
        [string]$TargetVersion
    )

    $apiBase = "https://api.github.com/repos/$Owner/$Name"
    if ($TargetVersion -eq "latest") {
        $url = "$apiBase/releases?per_page=1"
    } else {
        $url = "$apiBase/releases/tags/$TargetVersion"
    }

    Write-Info "Fetching release metadata from $Owner/$Name..."
    $response = Invoke-RestMethod -Method Get -Uri $url
    if ($response -is [System.Array]) {
        return $response[0]
    }
    return $response
}

function Get-AssetByName {
    param(
        [object]$Release,
        [string]$AssetName
    )
    return $Release.assets | Where-Object { $_.name -eq $AssetName } | Select-Object -First 1
}

function Install-Msi {
    param(
        [string]$MsiPath,
        [bool]$IsSilent
    )
    if ($IsSilent) {
        Write-Info "Installing MSI silently..."
        $args = @("/i", "`"$MsiPath`"", "/qn", "/norestart")
        $proc = Start-Process -FilePath "msiexec.exe" -ArgumentList $args -Wait -PassThru
        if ($proc.ExitCode -ne 0) {
            Write-Fail "MSI install failed with exit code $($proc.ExitCode)."
        }
        return
    }

    Write-Info "Launching MSI installer..."
    Start-Process -FilePath "msiexec.exe" -ArgumentList @("/i", "`"$MsiPath`"") -Wait
}

function Install-Exe {
    param(
        [string]$ExePath,
        [bool]$IsSilent
    )
    if ($IsSilent) {
        Write-Info "Installing EXE silently..."
        $proc = Start-Process -FilePath $ExePath -ArgumentList @("/S") -Wait -PassThru
        if ($proc.ExitCode -ne 0) {
            Write-Fail "EXE install failed with exit code $($proc.ExitCode)."
        }
        return
    }

    Write-Info "Launching EXE installer..."
    Start-Process -FilePath $ExePath -Wait
}

Assert-Windows10OrLater
Assert-AdminIfSilent -IsSilent:$Silent.IsPresent

$arch = $env:PROCESSOR_ARCHITECTURE
if ($arch -notin @("AMD64", "x86_64")) {
    Write-Fail "Currently only x64 Windows is supported. Detected architecture: $arch"
}

$release = Get-ReleasePayload -Owner $RepoOwner -Name $RepoName -TargetVersion $Version
if (-not $release -or -not $release.tag_name) {
    Write-Fail "Could not resolve release metadata."
}

$resolvedVersion = $release.tag_name
Write-Info "Using release: $resolvedVersion"

$msiName = "Nexo_${resolvedVersion}_x64_en-US.msi"
$exeName = "Nexo_${resolvedVersion}_x64-setup.exe"

$asset = Get-AssetByName -Release $release -AssetName $msiName
$installerType = "msi"
if (-not $asset) {
    $asset = Get-AssetByName -Release $release -AssetName $exeName
    $installerType = "exe"
}

if (-not $asset) {
    Write-Fail "Could not find Windows installer asset in release '$resolvedVersion'."
}

$tempDir = Join-Path $env:TEMP ("nexo-installer-" + [guid]::NewGuid().ToString("N"))
New-Item -Path $tempDir -ItemType Directory | Out-Null
$installerPath = Join-Path $tempDir $asset.name

Write-Info "Downloading: $($asset.browser_download_url)"
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $installerPath

if ($installerType -eq "msi") {
    Install-Msi -MsiPath $installerPath -IsSilent:$Silent.IsPresent
} else {
    Install-Exe -ExePath $installerPath -IsSilent:$Silent.IsPresent
}

Write-Info "Install complete. You can launch Nexo from Start Menu."
