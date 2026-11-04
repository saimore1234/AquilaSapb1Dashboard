<#
.SYNOPSIS
  One-time IIS preparation for the Aquila SAP B1 Business Hub on Windows Server 2022.

.DESCRIPTION
  Creates the folder structure, the two application pools and two sites (public frontend + loopback-only API), turns on the ARR proxy,
  allows the X-Forwarded-Proto server variable, sets folder permissions and firewall rules.

  Safe to re-run (idempotent). Supports -WhatIf: run it with -WhatIf first to see exactly what it would change.
  It does NOT install ARR, URL Rewrite or the Hosting Bundle (it checks for them and tells you where to get them), does not touch SQL Server,
  and does not store any secret.

.EXAMPLE
  .\Setup-IIS.ps1 -WhatIf
.EXAMPLE
  .\Setup-IIS.ps1 -HostName dashboard.companydomain.com -CertificateThumbprint 1A2B3C...
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [string]$Root = 'D:\AquilaDashboard',
    [string]$HostName = '',                        # empty = no domain yet: the site answers on every host name / the server IP over http :80
    [string]$CertificateThumbprint = '',          # thumbprint of the server certificate in LocalMachine\My (leave empty to create the HTTPS binding later)
    [string]$WebSite = 'AquilaDashboard',
    [string]$ApiSite = 'AquilaApi',
    [string]$WebPool = 'AquilaWeb',
    [string]$ApiPool = 'AquilaApi',
    [int]$ApiPort = 5011
)

$ErrorActionPreference = 'Stop'

function Step([string]$Description, [scriptblock]$Action) {
    if ($PSCmdlet.ShouldProcess($Description)) { Write-Host "  -> $Description"; & $Action }
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and -not $WhatIfPreference) { throw 'Run this script from an elevated (Administrator) PowerShell.' }

Write-Host "`n== 1. Prerequisites ==" -ForegroundColor Cyan
$missing = @()
if (-not (Test-Path "$env:windir\System32\inetsrv\w3wp.exe")) { $missing += 'IIS (Web-Server role) is not installed. Run: Install-WindowsFeature Web-Server, Web-Static-Content, Web-Default-Doc, Web-Http-Errors, Web-Http-Logging, Web-Stat-Compression, Web-Dyn-Compression, Web-Filtering, Web-Mgmt-Console -IncludeManagementTools' }
if (-not (Test-Path "$env:windir\System32\inetsrv\rewrite.dll")) { $missing += 'IIS URL Rewrite 2.1 is not installed: https://www.iis.net/downloads/microsoft/url-rewrite' }
if (-not (Test-Path "${env:ProgramFiles}\IIS\Application Request Routing\requestRouter.dll")) { $missing += 'Application Request Routing (ARR) 3.0 is not installed: https://www.iis.net/downloads/microsoft/application-request-routing' }
if (-not (Test-Path "${env:ProgramFiles}\IIS\Asp.Net Core Module\V2\aspnetcorev2.dll")) { $missing += '.NET 8 ASP.NET Core Hosting Bundle is not installed (install it AFTER IIS): https://dotnet.microsoft.com/download/dotnet/8.0 -> "Hosting Bundle"' }
if ($missing.Count -gt 0) {
    $missing | ForEach-Object { Write-Warning $_ }
    if (-not $WhatIfPreference) { throw 'Install the missing prerequisites above, then run this script again. (After installing the Hosting Bundle run: net stop was /y; net start w3svc)' }
}
else { Write-Host '  All prerequisites found.' -ForegroundColor Green }

if ($WhatIfPreference -and -not (Get-Module -ListAvailable WebAdministration)) { Write-Host '  (WebAdministration module not available here - showing the plan only.)'; }
else { Import-Module WebAdministration }

Write-Host "`n== 2. Folders ==" -ForegroundColor Cyan
foreach ($d in 'Frontend', 'Backend', 'Logs', 'Logs\api', 'Logs\stdout', 'Logs\deploy', 'Backups', 'Keys', 'Deployment') {
    $p = Join-Path $Root $d
    if (-not (Test-Path $p)) { Step "Create $p" { New-Item -ItemType Directory -Path $p -Force | Out-Null } } else { Write-Host "  exists: $p" }
}

Write-Host "`n== 3. Application pools ==" -ForegroundColor Cyan
function Ensure-Pool([string]$Name, [bool]$AlwaysRunning) {
    if (-not (Test-Path "IIS:\AppPools\$Name")) { Step "Create application pool $Name (No Managed Code, Integrated)" { New-WebAppPool -Name $Name | Out-Null } }
    Step "Configure pool $Name" {
        Set-ItemProperty "IIS:\AppPools\$Name" -Name managedRuntimeVersion -Value ''
        Set-ItemProperty "IIS:\AppPools\$Name" -Name managedPipelineMode -Value 'Integrated'
        if ($AlwaysRunning) {
            # Start with the server (not on the first request) and never idle out: the API keeps its caches and starts after a reboot by itself.
            Set-ItemProperty "IIS:\AppPools\$Name" -Name startMode -Value 'AlwaysRunning'
            Set-ItemProperty "IIS:\AppPools\$Name" -Name processModel.idleTimeout -Value ([TimeSpan]::Zero)
            Set-ItemProperty "IIS:\AppPools\$Name" -Name processModel.loadUserProfile -Value $true
            Set-ItemProperty "IIS:\AppPools\$Name" -Name recycling.periodicRestart.time -Value ([TimeSpan]::Zero)
        }
    }
}
Ensure-Pool $WebPool $false
Ensure-Pool $ApiPool $true

Write-Host "`n== 4. Sites ==" -ForegroundColor Cyan
if (-not (Test-Path "IIS:\Sites\$WebSite")) {
    Step "Create site $WebSite -> $Root\Frontend (http :80, host '$(if ($HostName) { $HostName } else { '*  (no domain)' })')" {
        New-Website -Name $WebSite -PhysicalPath (Join-Path $Root 'Frontend') -ApplicationPool $WebPool -Port 80 -HostHeader $HostName | Out-Null
    }
} else { Write-Host "  exists: site $WebSite" }
if ($CertificateThumbprint -and -not $HostName) { Write-Warning 'A certificate needs a -HostName. HTTPS binding skipped (no-domain mode: http only).' }
elseif ($CertificateThumbprint) {
    if (-not (Get-WebBinding -Name $WebSite -Protocol https -ErrorAction SilentlyContinue)) {
        Step "Add HTTPS binding :443 ($HostName) with certificate $CertificateThumbprint" {
            New-WebBinding -Name $WebSite -Protocol https -Port 443 -HostHeader $HostName -SslFlags 1
            $cert = Get-Item "Cert:\LocalMachine\My\$CertificateThumbprint"
            (Get-WebBinding -Name $WebSite -Protocol https).AddSslCertificate($cert.Thumbprint, 'My')
        }
    } else { Write-Host '  HTTPS binding already present.' }
} elseif ($HostName) { Write-Warning 'No -CertificateThumbprint given: add the HTTPS binding later (IIS_CONFIGURATION_GUIDE.md, section "HTTPS").' }

if (-not (Test-Path "IIS:\Sites\$ApiSite")) {
    Step "Create site $ApiSite -> $Root\Backend on 127.0.0.1:$ApiPort (loopback only, not reachable from the network)" {
        New-Website -Name $ApiSite -PhysicalPath (Join-Path $Root 'Backend') -ApplicationPool $ApiPool -Port $ApiPort -IPAddress '127.0.0.1' | Out-Null
        Set-ItemProperty "IIS:\Sites\$ApiSite" -Name applicationDefaults.preloadEnabled -Value $true
    }
} else { Write-Host "  exists: site $ApiSite" }

Write-Host "`n== 5. ARR reverse proxy ==" -ForegroundColor Cyan
Step 'Enable the ARR proxy (system.webServer/proxy) with a 5 minute timeout' {
    Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name enabled -Value $true
    Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name timeout -Value ([TimeSpan]::FromMinutes(5))
}
$existingVar = $null
if (-not $WhatIfPreference) { $existingVar = Get-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter "system.webServer/rewrite/allowedServerVariables/add[@name='HTTP_X_FORWARDED_PROTO']" -Name name -ErrorAction SilentlyContinue }
if (-not $existingVar) {
    Step 'Allow the HTTP_X_FORWARDED_PROTO server variable for URL Rewrite' {
        Add-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/rewrite/allowedServerVariables' -Name '.' -Value @{ name = 'HTTP_X_FORWARDED_PROTO' }
    }
} else { Write-Host '  HTTP_X_FORWARDED_PROTO already allowed.' }

Write-Host "`n== 6. Folder permissions ==" -ForegroundColor Cyan
function Grant([string]$Path, [string]$Identity, [string]$Rights) {
    Step "Grant $Identity $Rights on $Path" {
        $acl = Get-Acl $Path
        $rule = New-Object Security.AccessControl.FileSystemAccessRule($Identity, $Rights, 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($rule); Set-Acl -Path $Path -AclObject $acl
    }
}
if (-not $WhatIfPreference) {
    Grant (Join-Path $Root 'Frontend') 'IIS_IUSRS' 'ReadAndExecute'
    Grant (Join-Path $Root 'Backend')  "IIS AppPool\$ApiPool" 'ReadAndExecute'
    Grant (Join-Path $Root 'Logs')     "IIS AppPool\$ApiPool" 'Modify'
    # The Data Protection keys decrypt the SAP/SQL passwords stored in the portal database: only the API identity and Administrators may touch them.
    $keys = Join-Path $Root 'Keys'
    Step "Restrict $keys to Administrators, SYSTEM and the API pool identity" {
        $acl = Get-Acl $keys; $acl.SetAccessRuleProtection($true, $false)
        foreach ($id in 'BUILTIN\Administrators', 'NT AUTHORITY\SYSTEM') { $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($id, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))) }
        $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule("IIS AppPool\$ApiPool", 'Modify', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
        Set-Acl -Path $keys -AclObject $acl
    }
}

Write-Host "`n== 7. Firewall ==" -ForegroundColor Cyan
foreach ($port in 80, 443) {
    $name = "Aquila Dashboard HTTP(S) $port"
    if (-not (Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue)) {
        Step "Allow inbound TCP $port" { New-NetFirewallRule -DisplayName $name -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow | Out-Null }
    } else { Write-Host "  rule exists: $name" }
}
$blockName = "Aquila API $ApiPort (block external)"
if (-not (Get-NetFirewallRule -DisplayName $blockName -ErrorAction SilentlyContinue)) {
    Step "Block inbound TCP $ApiPort from the network (the API is reached only through IIS on this machine)" { New-NetFirewallRule -DisplayName $blockName -Direction Inbound -Protocol TCP -LocalPort $ApiPort -Action Block | Out-Null }
}
Write-Host '  SQL Server (TCP 1433) is NOT opened by this script and must not be reachable from outside the server network.'

Write-Host "`nDone. Next: copy appsettings.Production.json, run scripts\Set-AquilaSecrets.ps1, then DEPLOYMENT_POWERSHELL_SCRIPT.ps1." -ForegroundColor Green
