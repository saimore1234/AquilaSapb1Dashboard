<#
.SYNOPSIS
  Build, back up, deploy, verify and (if needed) roll back the Aquila SAP B1 Business Hub on a Windows Server running IIS.

.DESCRIPTION
  Actions
    Deploy    Build the frontend, publish the backend, ask for confirmation, back up what is deployed, copy the new version, check health.
    Rollback  Restore the most recent (or a named) backup of Frontend + Backend and check health.
    Verify    Only run the health / routing checks.
    Status    List the backups and show what is deployed.

  Safety
    * Nothing is changed on the server until you type DEPLOY (or ROLLBACK). -DryRun builds into a temp folder and changes nothing.
    * It NEVER deletes or overwrites: SQL / database files, the Logs folder, the Keys folder (Data Protection keys), the Backups folder,
      appsettings.Production.json, or the application-pool environment variables that hold the secrets (set with scripts\Set-AquilaSecrets.ps1).
    * Every step is checked; on the first error the script stops and reports it. With -AutoRollback a failed post-deploy check restores the previous version.
    * A full transcript is written to <Root>\Logs\deploy\.

  Requirements on the machine that runs it: PowerShell 5.1+, .NET 8 SDK, Node.js 18+ and npm. IIS is only needed unless -SkipIIS is used.

.EXAMPLE
  .\DEPLOYMENT_POWERSHELL_SCRIPT.ps1 -DryRun
.EXAMPLE
  .\DEPLOYMENT_POWERSHELL_SCRIPT.ps1 -Action Deploy -PublicUrl https://dashboard.companydomain.com
.EXAMPLE
  .\DEPLOYMENT_POWERSHELL_SCRIPT.ps1 -Action Rollback
.EXAMPLE
  .\DEPLOYMENT_POWERSHELL_SCRIPT.ps1 -Action Rollback -BackupName 20261103-221500
#>
[CmdletBinding()]
param(
    [ValidateSet('Deploy', 'Rollback', 'Verify', 'Status')] [string]$Action = 'Deploy',
    # The SAPB1WebPortal source folder (contains backend\ and frontend\). Default: two levels above this script.
    [string]$SourceRoot = '',
    [string]$TargetRoot = 'D:\AquilaDashboard',
    [string]$PublicUrl = '',                      # e.g. https://dashboard.companydomain.com ; empty = skip the public-URL checks
    [int]$ApiPort = 5010,
    [string]$ApiPool = 'AquilaApi',
    [string]$BackupName = '',                     # Rollback: folder name under Backups (default: newest)
    [int]$KeepBackups = 10,
    [switch]$DryRun,                              # build + validate only, change nothing on the server
    [switch]$SkipFrontendBuild,                   # reuse frontend\sap-b1-web\dist as it is
    [switch]$SkipPrintWorker,                     # do not build SAPB1.PrintWorker (Crystal Reports helper behind the Print button)
    [switch]$SkipIIS,                             # no IIS calls (testing, or hosting the API some other way)
    [switch]$SkipHealthCheck,
    [switch]$AutoRollback,                        # restore the previous version automatically if the post-deploy checks fail
    [switch]$SkipCertCheck,                       # accept a self-signed certificate in the HTTPS checks (test servers only)
    [switch]$Force                                # do not ask for the typed confirmation (unattended use)
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $SourceRoot) { $SourceRoot = (Resolve-Path (Join-Path $ScriptDir '..\..')).Path }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
if ($SkipCertCheck) { [Net.ServicePointManager]::ServerCertificateValidationCallback = { $true } }

$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$FrontendDir = Join-Path $TargetRoot 'Frontend'
$BackendDir = Join-Path $TargetRoot 'Backend'
$BackupsDir = Join-Path $TargetRoot 'Backups'
$LogsDir = Join-Path $TargetRoot 'Logs'
$KeysDir = Join-Path $TargetRoot 'Keys'
$TemplatesDir = Join-Path $ScriptDir 'templates'
# Files in the Backend folder that belong to the server, not to the release: never overwritten or deleted by a deploy / rollback.
$KeepFiles = @('appsettings.Production.json', 'app_offline.htm', '*.mdf', '*.ldf', '*.ndf', '*.bak', '*.trn')

# ------------------------------------------------------------------ helpers
function Info([string]$m) { Write-Host $m }
function Ok([string]$m) { Write-Host "  [ OK ] $m" -ForegroundColor Green }
function Warn([string]$m) { Write-Host "  [WARN] $m" -ForegroundColor Yellow }
function Fail([string]$m) { throw $m }
function Section([string]$m) { Write-Host "`n== $m ==" -ForegroundColor Cyan }

function Require-Tool([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { Fail "'$Name' was not found in PATH. Install it and open a new PowerShell window." }
}

function Invoke-Native([string]$What, [scriptblock]$Command) {
    & $Command
    if ($LASTEXITCODE -ne 0) { Fail "$What failed (exit code $LASTEXITCODE)." }
}

# robocopy: 0-7 = success, >= 8 = failure
function Copy-Tree([string]$From, [string]$To, [string[]]$ExcludeDirs = @(), [string[]]$ExcludeFiles = @(), [switch]$Mirror) {
    if (-not (Test-Path $From)) { Fail "Source folder missing: $From" }
    New-Item -ItemType Directory -Path $To -Force | Out-Null
    $rc = @($From, $To, $(if ($Mirror) { '/MIR' } else { '/E' }), '/R:2', '/W:2', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')
    if ($ExcludeDirs.Count)  { $rc += '/XD'; $rc += $ExcludeDirs }
    if ($ExcludeFiles.Count) { $rc += '/XF'; $rc += $ExcludeFiles }
    & robocopy @rc | Out-Null
    if ($LASTEXITCODE -ge 8) { Fail "robocopy failed copying $From -> $To (exit code $LASTEXITCODE)." }
    $global:LASTEXITCODE = 0
}

function Confirm-Typed([string]$Word, [string]$Message) {
    if ($Force) { Warn "-Force given: skipping the '$Word' confirmation."; return }
    Write-Host "`n$Message" -ForegroundColor Yellow
    $answer = Read-Host "Type $Word to continue, anything else cancels"
    if ($answer -cne $Word) { Fail 'Cancelled. Nothing was changed.' }
}

function Invoke-Http([string]$Url, [int]$TimeoutSec = 20) {
    $req = [Net.HttpWebRequest]::Create($Url)
    $req.Timeout = $TimeoutSec * 1000; $req.AllowAutoRedirect = $false; $req.UserAgent = 'AquilaDeployCheck/1.0'
    try { $resp = $req.GetResponse() } catch [Net.WebException] { if ($null -eq $_.Exception.Response) { return [pscustomobject]@{ Status = 0; Type = ''; Body = $_.Exception.Message }; } $resp = $_.Exception.Response }
    try {
        $reader = New-Object IO.StreamReader($resp.GetResponseStream())
        $body = $reader.ReadToEnd(); $reader.Close()
        [pscustomobject]@{ Status = [int]$resp.StatusCode; Type = [string]$resp.ContentType; Body = $body }
    } finally { $resp.Close() }
}

function Test-Check([string]$Name, [bool]$Pass, [string]$Detail = '') {
    if ($Pass) { Ok "$Name $Detail" } else { Write-Host "  [FAIL] $Name $Detail" -ForegroundColor Red }
    return $Pass
}

function Wait-ApiHealthy {
    $url = "http://127.0.0.1:$ApiPort/api/health"
    for ($i = 1; $i -le 30; $i++) {
        $r = Invoke-Http $url 5
        if ($r.Status -eq 200 -and $r.Body -match '"status"\s*:\s*"healthy"') { return $true }
        Start-Sleep -Seconds 2
    }
    return $false
}

function Invoke-Verify {
    Section 'Verification'
    $all = $true
    $r = Invoke-Http "http://127.0.0.1:$ApiPort/api/health"
    $all = (Test-Check 'API health (direct, loopback)' ($r.Status -eq 200 -and $r.Body -match 'healthy') "-> HTTP $($r.Status)") -and $all
    $r = Invoke-Http "http://127.0.0.1:$ApiPort/api/health/ready"
    $all = (Test-Check 'API ready (portal database reachable)' ($r.Status -eq 200) "-> HTTP $($r.Status)") -and $all
    if ($PublicUrl) {
        $base = $PublicUrl.TrimEnd('/')
        $r = Invoke-Http "$base/"
        $all = (Test-Check 'Frontend loads' ($r.Status -eq 200 -and $r.Body -match 'id="root"') "-> HTTP $($r.Status)") -and $all
        foreach ($route in '/sales', '/sales/dashboard', '/sales/reports/payment-due', '/sales/reports/lost-customers', '/sales/reports/unpaid-invoices', '/sales/reports/total-outstanding') {
            $r = Invoke-Http "$base$route"
            $all = (Test-Check "SPA route $route (direct open / refresh)" ($r.Status -eq 200 -and $r.Body -match 'id="root"') "-> HTTP $($r.Status)") -and $all
        }
        $r = Invoke-Http "$base/api/health"
        $all = (Test-Check 'API through the site (/api/health is JSON, not index.html)' ($r.Status -eq 200 -and $r.Type -match 'json' -and $r.Body -match 'healthy') "-> HTTP $($r.Status) $($r.Type)") -and $all
        $r = Invoke-Http "$base/api/sales/reports/payment-due"
        $all = (Test-Check 'Protected API route requires login (401, routed to the API)' ($r.Status -eq 401) "-> HTTP $($r.Status)") -and $all
        $r = Invoke-Http "$base/swagger/v1/swagger.json"
        $all = (Test-Check 'Swagger is not exposed in production' ($r.Status -ne 200 -or $r.Body -notmatch '"openapi"') "-> HTTP $($r.Status)") -and $all
    } else { Warn 'No -PublicUrl given: frontend / proxy checks skipped.' }
    return $all
}

function Set-AppOffline([bool]$Offline) {
    $f = Join-Path $BackendDir 'app_offline.htm'
    if ($Offline) {
        Set-Content -Path $f -Value '<html><body><h3>The Aquila dashboard is being updated. Please try again in a minute.</h3></body></html>' -Encoding UTF8
        Start-Sleep -Seconds 4   # let ASP.NET Core Module stop the app and release the files
    } elseif (Test-Path $f) { Remove-Item $f -Force }
}

function Get-Backups { if (Test-Path $BackupsDir) { Get-ChildItem $BackupsDir -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'manifest.json') } | Sort-Object Name -Descending } else { @() } }

function Test-TargetLayout {
    foreach ($d in $TargetRoot, $FrontendDir, $BackendDir, $LogsDir, $BackupsDir) {
        if (-not (Test-Path $d)) { Fail "Missing folder: $d. Run scripts\Setup-IIS.ps1 first (it creates the structure)." }
    }
}

function Prune-Backups {
    $old = Get-Backups | Select-Object -Skip $KeepBackups
    foreach ($b in $old) { if ($b.Name -match '^(\d{8}-\d{6}|pre-rollback-\d{8}-\d{6})$') { Remove-Item $b.FullName -Recurse -Force; Info "  pruned old backup $($b.Name)" } }
}

function New-Backup([string]$Name) {
    $dest = Join-Path $BackupsDir $Name
    Copy-Tree $FrontendDir (Join-Path $dest 'Frontend')
    Copy-Tree $BackendDir (Join-Path $dest 'Backend') -ExcludeDirs @('logs') -ExcludeFiles @('app_offline.htm')
    $commit = ''
    try { $commit = (& git -C $SourceRoot rev-parse --short HEAD 2>$null) } catch { }
    @{ created = (Get-Date).ToString('o'); by = "$env:USERDOMAIN\$env:USERNAME"; sourceCommit = "$commit"; host = $env:COMPUTERNAME } | ConvertTo-Json | Set-Content (Join-Path $dest 'manifest.json') -Encoding UTF8
    return $dest
}

function Restore-Backup([string]$Dir) {
    if (-not (Test-Path (Join-Path $Dir 'Frontend\index.html'))) { Fail "Backup is incomplete (Frontend\index.html missing): $Dir" }
    if (-not (Test-Path (Join-Path $Dir 'Backend\SAPB1.Api.dll'))) { Fail "Backup is incomplete (Backend\SAPB1.Api.dll missing): $Dir" }
    if (-not $SkipIIS) { Set-AppOffline $true }
    try {
        Copy-Tree (Join-Path $Dir 'Frontend') $FrontendDir -Mirror
        Copy-Tree (Join-Path $Dir 'Backend') $BackendDir -Mirror -ExcludeDirs @('logs') -ExcludeFiles $KeepFiles
    } finally { if (-not $SkipIIS) { Set-AppOffline $false } }
}

# ------------------------------------------------------------------ transcript
$transcript = $null
if (-not $DryRun -and (Test-Path (Join-Path $LogsDir 'deploy'))) { $transcript = Join-Path $LogsDir "deploy\deploy-$Stamp.log"; Start-Transcript -Path $transcript | Out-Null }
$exit = 0
try {
    Write-Host "Aquila deployment  |  action: $Action  |  target: $TargetRoot  |  $(if ($DryRun) { 'DRY RUN (no server changes)' } else { 'LIVE' })" -ForegroundColor White

    # ============================================================== STATUS
    if ($Action -eq 'Status') {
        Test-TargetLayout
        Section 'Deployed'
        Info "  Frontend index.html : $(if (Test-Path (Join-Path $FrontendDir 'index.html')) { (Get-Item (Join-Path $FrontendDir 'index.html')).LastWriteTime } else { 'not deployed' })"
        Info "  Backend dll         : $(if (Test-Path (Join-Path $BackendDir 'SAPB1.Api.dll')) { (Get-Item (Join-Path $BackendDir 'SAPB1.Api.dll')).LastWriteTime } else { 'not deployed' })"
        Section 'Backups (newest first)'
        Get-Backups | ForEach-Object { $m = Get-Content (Join-Path $_.FullName 'manifest.json') -Raw | ConvertFrom-Json; Info ("  {0}   commit {1}   by {2}" -f $_.Name, $m.sourceCommit, $m.by) }
        return
    }

    # ============================================================== VERIFY
    if ($Action -eq 'Verify') { if (-not (Invoke-Verify)) { Fail 'One or more checks failed.' }; return }

    # ============================================================== ROLLBACK
    if ($Action -eq 'Rollback') {
        Test-TargetLayout
        $target = if ($BackupName) { Get-Backups | Where-Object Name -eq $BackupName | Select-Object -First 1 } else { Get-Backups | Select-Object -First 1 }
        if (-not $target) { Fail "No backup found$(if ($BackupName) { " named '$BackupName'" }) in $BackupsDir. Run -Action Status to list them." }
        Section "Rollback to $($target.Name)"
        if ($DryRun) { Ok "Would restore $($target.FullName) over $FrontendDir and $BackendDir."; return }
        Confirm-Typed 'ROLLBACK' "This replaces the deployed Frontend and Backend with the backup '$($target.Name)'. The current version is saved first as pre-rollback-$Stamp. Logs, Keys, appsettings.Production.json and the stored secrets are not touched."
        $safety = New-Backup "pre-rollback-$Stamp"; Ok "Current version saved to $safety"
        Restore-Backup $target.FullName; Ok 'Backup restored'
        if (-not $SkipHealthCheck) {
            if (-not (Wait-ApiHealthy)) { Fail "The API did not become healthy after the rollback. See $LogsDir\api and the troubleshooting guide." }
            if (-not (Invoke-Verify)) { Fail 'Rollback copied the files but a check failed (see above).' }
        }
        Ok 'Rollback complete.'
        return
    }

    # ============================================================== DEPLOY
    Section '1. Validate'
    foreach ($p in @("$SourceRoot\frontend\sap-b1-web\package.json", "$SourceRoot\backend\SAPB1.Api\SAPB1.Api.csproj", "$TemplatesDir\backend.web.config.template")) {
        if (-not (Test-Path $p)) { Fail "Required file not found: $p (check -SourceRoot)." }
    }
    Require-Tool dotnet; Require-Tool node; Require-Tool npm
    $sdk = (& dotnet --version); if ([version]($sdk -replace '-.*$', '') -lt [version]'8.0') { Fail ".NET SDK 8 or newer is required (found $sdk)." }
    Ok "dotnet $sdk, node $(& node --version), npm $(& npm --version)"
    if ($DryRun) { $Staging = Join-Path ([IO.Path]::GetTempPath()) "aquila-staging-$Stamp" }
    else { Test-TargetLayout; $Staging = Join-Path $TargetRoot "Deployment\staging\$Stamp" }
    New-Item -ItemType Directory -Path $Staging -Force | Out-Null
    Ok "Target layout OK; staging folder $Staging"
    if (-not $DryRun -and -not $SkipIIS) {
        if (-not (Test-Path "$env:windir\System32\inetsrv\w3wp.exe")) { Fail 'IIS is not installed on this machine (use -SkipIIS only if the API is hosted another way).' }
        if (-not (Test-Path "${env:ProgramFiles}\IIS\Asp.Net Core Module\V2\aspnetcorev2.dll")) { Fail 'The ASP.NET Core Hosting Bundle is not installed (see IIS_CONFIGURATION_GUIDE.md).' }
    }

    Section '2. Build frontend'
    $feDir = "$SourceRoot\frontend\sap-b1-web"
    $dist = Join-Path $feDir 'dist'
    if (-not $SkipFrontendBuild) {
        # The web build must call the relative /api path, never a tunnel or an absolute address.
        $effective = @(); foreach ($f in '.env', '.env.production', '.env.production.local', '.env.local') { $p = Join-Path $feDir $f; if (Test-Path $p) { $effective += (Select-String -Path $p -Pattern '^\s*VITE_API_BASE_URL\s*=\s*(.*)$' | ForEach-Object { $_.Matches[0].Groups[1].Value.Trim() }) } }
        if ($env:VITE_API_BASE_URL) { $effective += $env:VITE_API_BASE_URL }
        $bad = $effective | Where-Object { $_ -and $_ -ne '/api' }
        if ($bad) { Fail "VITE_API_BASE_URL is set to '$($bad -join ', ')'. The IIS build must use the relative '/api' (remove or change it in the .env files / environment)." }
        Push-Location $feDir
        try {
            if (Test-Path 'package-lock.json') { Invoke-Native 'npm ci' { npm ci --no-audit --no-fund } } else { Invoke-Native 'npm install' { npm install --no-audit --no-fund } }
            Invoke-Native 'npm run build' { npm run build }
        } finally { Pop-Location }
    } else { Warn 'Skipping the frontend build (-SkipFrontendBuild): using the existing dist folder.' }
    foreach ($p in 'index.html', 'web.config') { if (-not (Test-Path (Join-Path $dist $p))) { Fail "Frontend build output is missing $p in $dist." } }
    if (-not (Get-ChildItem (Join-Path $dist 'assets') -Filter *.js -ErrorAction SilentlyContinue)) { Fail "Frontend build output has no JavaScript in $dist\assets." }
    if (Select-String -Path (Join-Path $dist 'index.html') -Pattern 'trycloudflare|localhost:|vercel\.app' -Quiet) { Fail 'index.html references a tunnel / localhost / vercel address.' }
    Copy-Tree $dist (Join-Path $Staging 'Frontend')
    Ok "Frontend built: $((Get-ChildItem (Join-Path $Staging 'Frontend') -Recurse -File | Measure-Object).Count) files"

    Section '3. Publish backend'
    $beOut = Join-Path $Staging 'Backend'
    Invoke-Native 'dotnet publish' { dotnet publish "$SourceRoot\backend\SAPB1.Api\SAPB1.Api.csproj" -c Release -o $beOut --nologo -v quiet }
    if (-not (Test-Path (Join-Path $beOut 'SAPB1.Api.dll'))) { Fail 'dotnet publish did not produce SAPB1.Api.dll.' }
    (Get-Content "$TemplatesDir\backend.web.config.template" -Raw).Replace('{{ROOT}}', $TargetRoot.TrimEnd('\')) | Set-Content (Join-Path $beOut 'web.config') -Encoding UTF8
    Get-ChildItem $beOut -Filter 'appsettings.Development.json' -ErrorAction SilentlyContinue | Remove-Item -Force
    Ok "Backend published: $((Get-ChildItem $beOut -Recurse -File | Measure-Object).Count) files (web.config from template)"

    if (-not $SkipPrintWorker) {
        $pw = "$SourceRoot\backend\SAPB1.PrintWorker\SAPB1.PrintWorker.csproj"
        $crystal = 'C:\Windows\Microsoft.NET\assembly\GAC_MSIL\CrystalDecisions.CrystalReports.Engine'
        if ((Test-Path $pw) -and (Test-Path $crystal)) {
            Invoke-Native 'print worker build' { dotnet build $pw -c Release -o (Join-Path $beOut 'PrintWorker') --nologo -v quiet }
            Ok 'Print worker built (SAP Crystal Reports runtime 13 must be installed on the server).'
        } else { Warn 'SAP Crystal Reports runtime not found on this machine: the print worker was NOT built; the invoice/order Print button will not work until it is deployed (see SERVER_DEPLOYMENT_GUIDE.md).' }
    }

    if ($DryRun) {
        Section 'Dry run finished'
        Ok "Everything built and validated. Staged output: $Staging"
        Info '  No server folders, IIS settings or secrets were touched. Run again without -DryRun to deploy.'
        return
    }

    Section '4. Confirm'
    Confirm-Typed 'DEPLOY' "About to deploy to $TargetRoot ($(if ($PublicUrl) { $PublicUrl } else { 'no public URL given' })). The current Frontend and Backend are backed up first. Users see a short 'updating' page while the API restarts."

    Section '5. Back up the current version'
    $backup = $null
    if ((Test-Path (Join-Path $FrontendDir 'index.html')) -or (Test-Path (Join-Path $BackendDir 'SAPB1.Api.dll'))) {
        $backup = New-Backup $Stamp; Ok "Backed up to $backup"
    } else { Warn 'Nothing deployed yet: first deployment, no backup to make.' }

    Section '6. Deploy'
    if (-not $SkipIIS) { Set-AppOffline $true }
    try {
        # /MIR makes the folders identical to the new build; the exclusions keep everything that belongs to the server, not to the release.
        Copy-Tree (Join-Path $Staging 'Backend') $BackendDir -Mirror -ExcludeDirs @('logs') -ExcludeFiles $KeepFiles
        Copy-Tree (Join-Path $Staging 'Frontend') $FrontendDir -Mirror
    } catch { if (-not $SkipIIS) { Set-AppOffline $false }; throw }
    if (-not (Test-Path (Join-Path $BackendDir 'appsettings.Production.json'))) { Warn "No appsettings.Production.json in ${BackendDir}: copy templates\appsettings.Production.json.template there and edit it." }
    if (-not $SkipIIS) { Set-AppOffline $false; Ok 'API restarted (app_offline.htm removed)' }
    Ok 'Frontend and backend copied'

    Section '7. Health checks'
    $healthy = $true
    if (-not $SkipHealthCheck) {
        if (-not (Wait-ApiHealthy)) { $healthy = $false; Write-Host "  [FAIL] The API did not report healthy on http://127.0.0.1:$ApiPort/api/health within 60 s." -ForegroundColor Red }
        else { $healthy = Invoke-Verify }
    } else { Warn 'Health checks skipped (-SkipHealthCheck).' }

    if (-not $healthy) {
        if ($AutoRollback -and $backup) {
            Write-Host "`nChecks failed: rolling back to $(Split-Path $backup -Leaf) (-AutoRollback)." -ForegroundColor Yellow
            Restore-Backup $backup
            if (Wait-ApiHealthy) { Ok 'Previous version restored and healthy.' } else { Write-Host '  [FAIL] Previous version restored but the API is still not healthy: see the troubleshooting guide.' -ForegroundColor Red }
            $exit = 2
        } else {
            Write-Host "`nDeployment finished but the checks FAILED. To go back:  .\DEPLOYMENT_POWERSHELL_SCRIPT.ps1 -Action Rollback" -ForegroundColor Red
            $exit = 2
        }
    } else {
        Prune-Backups
        Remove-Item $Staging -Recurse -Force -ErrorAction SilentlyContinue
        Section 'Done'
        Ok "Deployed. Backup of the previous version: $(if ($backup) { Split-Path $backup -Leaf } else { 'none (first deployment)' })"
    }
}
catch {
    Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Stopped. Files already copied (if any) are described above; a backup of the previous version is in the Backups folder; roll back with -Action Rollback.' -ForegroundColor Red
    $exit = 1
}
finally {
    if ($transcript) { Stop-Transcript | Out-Null; Write-Host "Log: $transcript" }
}
exit $exit
