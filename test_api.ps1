$headers = @{
    "Content-Type" = "application/json"
}

# Test 1: Invalid Email
$body1 = @{
    name = "Test User"
    email = "invalid-email"
    password = "Password123"
    role = "mentee"
} | ConvertTo-Json

Write-Host "Testing Invalid Email..."
try {
    $null = Invoke-RestMethod -Uri "http://localhost:3001/register" -Method Post -Headers $headers -Body $body1 -ErrorAction Stop
    Write-Host "FAILED: Should have rejected invalid email." -ForegroundColor Red
} catch {
    Write-Host "SUCCESS: Rejected invalid email." -ForegroundColor Green
    Write-Host $_.Exception.Message
}

# Test 2: Weak Password
$body2 = @{
    name = "Test User"
    email = "valid@email.com"
    password = "weak"
    role = "mentee"
} | ConvertTo-Json

Write-Host "`nTesting Weak Password..."
try {
    $null = Invoke-RestMethod -Uri "http://localhost:3001/register" -Method Post -Headers $headers -Body $body2 -ErrorAction Stop
    Write-Host "FAILED: Should have rejected weak password." -ForegroundColor Red
} catch {
    Write-Host "SUCCESS: Rejected weak password." -ForegroundColor Green
    Write-Host $_.Exception.Message
}

# Test 3: Valid Registration (Optional, might fail if email exists)
$body3 = @{
    name = "Valid User"
    email = "valid.user." + (Get-Random) + "@example.com"
    password = "Password123!"
    role = "mentee"
} | ConvertTo-Json

Write-Host "`nTesting Valid Registration..."
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3001/register" -Method Post -Headers $headers -Body $body3 -ErrorAction Stop
    Write-Host "SUCCESS: Registered valid user. Response:"
    $response | ConvertTo-Json | Write-Host
} catch {
    Write-Host "FAILED: Could not register valid user." -ForegroundColor Red
    Write-Host $_.Exception.Message
}
