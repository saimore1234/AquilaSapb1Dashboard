# Rollback Guide

Every deployment first copies the running **Frontend** and **Backend** to `D:\AquilaDashboard\Backups\<yyyyMMdd-HHmmss>` (with a `manifest.json` showing who deployed and which source commit). Rolling back puts that copy back.

## 1. What a rollback does — and does not do

| Restored | Never touched |
|---|---|
| `Frontend\` (all files) | `Logs\`, `Keys\`, `Backups\` |
| `Backend\` (all files) | `Backend\appsettings.Production.json` |
| | database-type files (`*.mdf *.ldf *.ndf *.bak *.trn`) |
| | IIS settings and the secrets stored on the application pool |
| | **SQL Server data** — a rollback never changes any database |

Database note: releases so far only add portal tables/indexes if missing (idempotent, additive). Rolling the code back leaves those objects in place; the older code simply ignores them. If a future release contains a destructive or non-additive database change, its release notes must say so and you must restore a SQL backup taken before that deployment.

## 2. Automatic rollback during a deployment

Add `-AutoRollback` to the deploy command. If the post-deployment checks fail (API not healthy in 60 s, a SPA route or the proxy not answering, etc.) the script restores the previous version by itself and exits with code 2:
```powershell
.\DEPLOYMENT_POWERSHELL_SCRIPT.ps1 -PublicUrl https://dashboard.companydomain.com -AutoRollback
```

## 3. Rollback with the script (normal case)

```powershell
cd D:\AquilaDashboard\Deployment
.\DEPLOYMENT_POWERSHELL_SCRIPT.ps1 -Action Status                       # list backups, newest first
.\DEPLOYMENT_POWERSHELL_SCRIPT.ps1 -Action Rollback                     # newest backup (asks you to type ROLLBACK)
.\DEPLOYMENT_POWERSHELL_SCRIPT.ps1 -Action Rollback -BackupName 20261103-221500 -PublicUrl https://dashboard.companydomain.com
.\DEPLOYMENT_POWERSHELL_SCRIPT.ps1 -Action Rollback -DryRun             # show what would be restored, change nothing
```
Steps it performs: checks the backup is complete → **saves the current (bad) version as `pre-rollback-<time>`** so you can undo the rollback → puts the API offline → restores Frontend and Backend → brings the API back → runs the health checks. Rolling back is itself reversible: roll back to the `pre-rollback-…` folder.

## 4. Manual rollback (script unavailable)

```powershell
$root = 'D:\AquilaDashboard' ; $b = "$root\Backups\20261103-221500"          # pick the backup

# 1. take the API offline (ASP.NET Core Module stops the app and releases the files)
Set-Content "$root\Backend\app_offline.htm" '<h3>Updating - back in a minute</h3>' ; Start-Sleep 5

# 2. restore (robocopy exit codes below 8 are success)
robocopy "$b\Frontend" "$root\Frontend" /MIR
robocopy "$b\Backend"  "$root\Backend"  /MIR /XD logs /XF appsettings.Production.json app_offline.htm *.mdf *.ldf *.ndf *.bak *.trn

# 3. back online
Remove-Item "$root\Backend\app_offline.htm"

# 4. check
curl.exe -s http://127.0.0.1:5010/api/health
```

## 5. When the new version made things worse in another way

| Situation | Action |
|---|---|
| Wrong setting in `appsettings.Production.json` | edit it, then recycle the pool: `Restart-WebAppPool AquilaApi` (no code rollback needed) |
| Wrong secret (pool variable) | re-run `scripts\Set-AquilaSecrets.ps1` for that value |
| Everyone suddenly logged out | `Jwt__Key` changed — expected; log in again |
| Stored SAP/SQL passwords unreadable | the Data Protection keys changed — put the original `key-*.xml` back into `D:\AquilaDashboard\Keys` and recycle the pool |
| Server-level IIS change broke the site | `appcmd list config` / compare with `IIS_CONFIGURATION_GUIDE.md`; IIS keeps automatic config history in `C:\inetpub\history` |

## 6. Emergency: return to Vercel

Only possible while the Vercel project and the tunnel to this machine still exist (keep them for a few days after cut-over):
1. Point DNS back to Vercel (or the old hostname).
2. Make sure the old API process / tunnel is running.
3. Fix the server, redeploy, re-test, then switch DNS again.

## 7. Backup housekeeping

The deploy script keeps the newest 10 backups (`-KeepBackups`) and prunes only folders named `yyyyMMdd-HHmmss` or `pre-rollback-yyyyMMdd-HHmmss`. Copy important ones off the server. To keep a release permanently, copy its folder out of `Backups\` before it is pruned.

## 8. Practise it

On the first deployment, deploy once, make a trivial change, deploy again, run `-Action Rollback`, and confirm the old version is back (`-Action Status`, open the site). A rollback you have never tried is not a safety net.
