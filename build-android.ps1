# Builds the web UI, bundles it into the Android shell, and (optionally) installs it on a box.
# Usage: .\build-android.ps1 [-Device 10.0.0.79:5555] [-SetDefault]
param(
    [string]$Device,
    [switch]$SetDefault
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$env:ANDROID_HOME = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:USERPROFILE\Android\Sdk" }

Push-Location $root
npm run build
if ($LASTEXITCODE) { throw 'npm run build failed' }
Pop-Location

Push-Location "$root\android"
.\gradlew.bat assembleDebug
if ($LASTEXITCODE) { throw 'gradle build failed' }
Pop-Location

$apk = "$root\android\app\build\outputs\apk\debug\app-debug.apk"
Write-Host "APK: $apk"

if ($Device) {
    adb -s $Device install -r $apk
    if ($SetDefault) { adb -s $Device shell cmd package set-home-activity com.hxxdy.launcher/.MainActivity }
}
