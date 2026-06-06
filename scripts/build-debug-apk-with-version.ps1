$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$androidDir = Join-Path $root "android"
$buildGradle = Join-Path $androidDir "app\build.gradle"
$apkDir = Join-Path $androidDir "app\build\outputs\apk\debug"
$apkPath = Join-Path $apkDir "app-debug.apk"

$gradleText = Get-Content -LiteralPath $buildGradle -Raw
$versionMatch = [regex]::Match($gradleText, 'versionName\s+"([^"]+)"')

if (-not $versionMatch.Success) {
  throw "Nao consegui encontrar versionName em android/app/build.gradle."
}

$versionName = $versionMatch.Groups[1].Value
$versionedApkName = "raddo-$versionName.apk"
$versionedApkPath = Join-Path $apkDir $versionedApkName
$publicBaseUrl = $env:RADDO_UPDATE_PUBLIC_BASE_URL

if ([string]::IsNullOrWhiteSpace($publicBaseUrl)) {
  $publicBaseUrl = "https://zsmfrfiemthftuiyursr.supabase.co/storage/v1/object/public/raddo-updates"
}

Set-Location $androidDir

if (Test-Path "C:\Program Files\Java\jdk-21.0.10") {
  $env:JAVA_HOME = "C:\Program Files\Java\jdk-21.0.10"
  $env:Path = "$env:JAVA_HOME\bin;$env:Path"
} elseif (Test-Path "C:\Program Files\Java\latest") {
  $env:JAVA_HOME = "C:\Program Files\Java\latest"
  $env:Path = "$env:JAVA_HOME\bin;$env:Path"
}

.\gradlew.bat --stop | Out-Null
.\gradlew.bat assembleDebug --no-daemon
if ($LASTEXITCODE -ne 0) {
  throw "Falha ao gerar APK Android. Verifique JAVA_HOME/JDK e tente novamente."
}

$builtApkPath = Join-Path $apkDir $versionedApkName
if (-not (Test-Path -LiteralPath $builtApkPath)) {
  $builtApkPath = $apkPath
}

if (-not (Test-Path -LiteralPath $builtApkPath)) {
  throw "APK nao encontrado em $apkDir."
}

if ($builtApkPath -ne $versionedApkPath) {
  Copy-Item -LiteralPath $builtApkPath -Destination $versionedApkPath -Force
}

$manifest = [ordered]@{
  version = $versionName
  message = "Nova versao do Raddo disponivel. Atualize para receber melhorias e correcoes."
  apkUrl = "$publicBaseUrl/$versionedApkName"
}

$manifestPath = Join-Path $apkDir "version.json"
$manifest | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

Write-Host "APK gerado: $builtApkPath"
Write-Host "APK versionado: $versionedApkPath"
Write-Host "Manifest gerado: $manifestPath"
