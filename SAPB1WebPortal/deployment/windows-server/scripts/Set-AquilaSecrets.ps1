<#
.SYNOPSIS
  Stores the API's secrets as environment variables of the IIS application pool (applicationHost.config), prompting for each value.

.DESCRIPTION
  Nothing is written to the source tree, to the Frontend folder, to web.config or to any script. Values are read with Read-Host -AsSecureString,
  are never echoed and never passed on a command line (they go straight into the IIS configuration through the WebAdministration module).

  Variables set (ASP.NET Core maps "__" to ":"):
    Jwt__Key                              signing key for login tokens (>= 32 random characters)
    PortalDb__ConnectionString            the portal's own database (SAPB1PortalAdmin: users, roles, permissions, targets)
    CompanyConnectionStrings__<Code>      read-only SQL connection for each SAP B1 company in appsettings.json -> CompanyDatabases:Companies
    SapServiceLayerCredentials__<Code>__Username / __Password   optional: the SAP account used only to create Purchase Requests
    Auth__PortalUsername / Auth__PortalPasswordHash   the built-in administrator login (hash is produced by the API itself; the plain password is not stored)

  Run it again to change a value; press Enter at a prompt to keep the current one. Use -List to see which variables exist (names only).
  Changing a value recycles the API pool. Changing Jwt__Key signs everyone out.
#>
[CmdletBinding()]
param(
    [string]$ApiPool = 'AquilaApi',
    [string[]]$CompanyCodes = @('AOPL'),
    [string]$BackendPath = 'D:\AquilaDashboard\Backend',
    [switch]$List
)
$ErrorActionPreference = 'Stop'
Import-Module WebAdministration
$filter = "system.applicationHost/applicationPools/add[@name='$ApiPool']/environmentVariables"
$pspath = 'MACHINE/WEBROOT/APPHOST'

function Get-Existing { (Get-WebConfiguration -PSPath $pspath -Filter "$filter/add") | ForEach-Object { $_.name } }
function Set-PoolVar([string]$Name, [string]$Value) {
    if (Get-WebConfiguration -PSPath $pspath -Filter "$filter/add[@name='$Name']") {
        Remove-WebConfigurationProperty -PSPath $pspath -Filter $filter -Name '.' -AtElement @{ name = $Name }
    }
    Add-WebConfigurationProperty -PSPath $pspath -Filter $filter -Name '.' -Value @{ name = $Name; value = $Value }
}
function Read-Secret([string]$Prompt) {
    $s = Read-Host -AsSecureString $Prompt
    if ($s.Length -eq 0) { return $null }
    $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

if ($List) { Write-Host "Variables on pool ${ApiPool} (names only):"; Get-Existing | Sort-Object | ForEach-Object { "  $_" }; return }

Write-Host "Setting secrets for application pool '$ApiPool'. Press Enter to keep an existing value.`n" -ForegroundColor Cyan

# JWT key
$jwt = Read-Secret 'Jwt__Key  (type a value, or type GENERATE for a random 64-character key)'
if ($jwt -eq 'GENERATE') {
    $bytes = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes); $jwt = [Convert]::ToBase64String($bytes)
    Write-Host '  generated a random key (not displayed).'
}
if ($jwt) { if ($jwt.Length -lt 32) { throw 'Jwt__Key must be at least 32 characters.' }; Set-PoolVar 'Jwt__Key' $jwt }

# portal database
Write-Host "`nPortal database, e.g.  Server=localhost;Database=SAPB1PortalAdmin;User Id=aquila_portal;Password=...;TrustServerCertificate=True" -ForegroundColor DarkGray
$portal = Read-Secret 'PortalDb__ConnectionString'
if ($portal) { Set-PoolVar 'PortalDb__ConnectionString' $portal }

# companies
foreach ($code in $CompanyCodes) {
    Write-Host "`nCompany $code (read-only SQL login), e.g.  Server=localhost;Database=<SAP DB>;User Id=sapb1_portal_reader;Password=...;TrustServerCertificate=True" -ForegroundColor DarkGray
    $cs = Read-Secret "CompanyConnectionStrings__$code"
    if ($cs) { Set-PoolVar "CompanyConnectionStrings__$code" $cs }
}

# SAP Service Layer account (only used by the one write feature: creating Purchase Requests). Skip it if that feature is not used.
foreach ($code in $CompanyCodes) {
    $slUser = Read-Host "`nSapServiceLayerCredentials__${code}__Username (purchase-request account; Enter to skip/keep)"
    if ($slUser) {
        Set-PoolVar "SapServiceLayerCredentials__${code}__Username" $slUser
        $slPwd = Read-Secret "SapServiceLayerCredentials__${code}__Password"
        if ($slPwd) { Set-PoolVar "SapServiceLayerCredentials__${code}__Password" $slPwd }
    }
}

# built-in administrator
$user = Read-Host "`nAuth__PortalUsername (Enter to keep)"
if ($user) { Set-PoolVar 'Auth__PortalUsername' $user }
$pwd1 = Read-Secret 'New portal administrator password (Enter to keep the current one)'
if ($pwd1) {
    $dll = Join-Path $BackendPath 'SAPB1.Api.dll'
    if (-not (Test-Path $dll)) { throw "Deploy the backend first: $dll not found (the API produces the password hash)." }
    $hash = (& dotnet $dll hash-password $pwd1 | Select-Object -Last 1).Trim()
    if (-not $hash) { throw 'Could not create the password hash.' }
    Set-PoolVar 'Auth__PortalPasswordHash' $hash
    Write-Host '  password hash stored (the plain password was not saved).'
}

Restart-WebAppPool -Name $ApiPool
Write-Host "`nDone. Variables now on ${ApiPool} (names only):" -ForegroundColor Green
Get-Existing | Sort-Object | ForEach-Object { "  $_" }
