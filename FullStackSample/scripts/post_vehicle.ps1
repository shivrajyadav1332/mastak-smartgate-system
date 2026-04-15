$body = @{ plateNumber = 'ABC-1234' } | ConvertTo-Json -Compress
try {
    $r = Invoke-RestMethod -Uri 'http://localhost:5001/api/vehicle' -Method Post -ContentType 'application/json' -Body $body -ErrorAction Stop
    $r | ConvertTo-Json -Depth 10
} catch {
    Write-Error $_
}
