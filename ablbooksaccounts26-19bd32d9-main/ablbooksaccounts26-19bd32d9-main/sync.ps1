$ErrorActionPreference = "Continue"

function Update-Status($status, $message) {
    $lastSync = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
    $json = @{
        status = $status
        message = $message
        lastSync = $lastSync
    } | ConvertTo-Json
    $statusPath = Join-Path (Get-Location) "public/sync-status.json"
    if (!(Test-Path "public")) { New-Item -ItemType Directory -Path "public" }
    $json | Out-File -FilePath $statusPath -Encoding utf8 -Force
}

Write-Host "🟢 Antigravity PowerShell Sync Active"
Update-Status "synced" "System Ready"

while ($true) {
    try {
        git add .
        $status = git status --porcelain
        if ($status) {
            Update-Status "syncing" "Committing changes..."
            git commit -m "Auto sync update from Antigravity"
            
            Update-Status "syncing" "Fetching remote updates..."
            $pullSuccess = $false
            $retryCount = 0
            while (-not $pullSuccess -and $retryCount -lt 5) {
                git pull origin main --rebase
                if ($LASTEXITCODE -eq 0) {
                    $pullSuccess = $true
                } else {
                    $retryCount++
                    Update-Status "error" "Pull failed, retry $retryCount/5..."
                    Write-Host "⚠️ Pull failed. Retrying in 10s..."
                    Start-Sleep -Seconds 10
                }
            }

            if ($pullSuccess) {
                Update-Status "syncing" "Pushing to Lovable..."
                $pushSuccess = $false
                $retryCount = 0
                while (-not $pushSuccess -and $retryCount -lt 5) {
                    git push origin main
                    if ($LASTEXITCODE -eq 0) {
                        $pushSuccess = $true
                        Update-Status "synced" "Changes synced successfully to Lovable."
                        Write-Host "✅ Synced at $(Get-Date)"
                    } else {
                        $retryCount++
                        Update-Status "error" "Push failed, retry $retryCount/5..."
                        Write-Host "⚠️ Push failed. Retrying in 10s..."
                        Start-Sleep -Seconds 10
                    }
                }
            }
        }
    } catch {
        Write-Host "⚠️ Sync Warning: $_"
        Update-Status "error" "Sync failed - retrying..."
    }
    
    Start-Sleep -Seconds 3
}
