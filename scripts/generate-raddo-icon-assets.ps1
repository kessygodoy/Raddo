Add-Type -AssemblyName System.Drawing

$root = "C:\Codex\Raddo"
$sourcePath = Join-Path $root "store-assets\raddo-icon-1024.png"

if (-not (Test-Path $sourcePath)) {
  throw "Icon source not found: $sourcePath"
}

function Save-ResizedPng($sourcePath, $targetPath, [int]$width, [int]$height) {
  $source = [System.Drawing.Image]::FromFile($sourcePath)
  try {
    $bitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.DrawImage($source, 0, 0, $width, $height)
      } finally {
        $graphics.Dispose()
      }

      $targetDir = Split-Path -Parent $targetPath
      if (-not (Test-Path $targetDir)) {
        New-Item -ItemType Directory -Path $targetDir | Out-Null
      }
      $bitmap.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $bitmap.Dispose()
    }
  } finally {
    $source.Dispose()
  }
}

Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $root "public\raddo-icon.png") -Force
Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $root "android\app\src\main\assets\public\raddo-icon.png") -Force
Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $root "store-assets\raddo-icon-ios-1024.png") -Force

$iosIcon = Join-Path $root "ios\App\App\Assets.xcassets\AppIcon.appiconset\AppIcon-512@2x.png"
if (Test-Path $iosIcon) {
  Copy-Item -LiteralPath $sourcePath -Destination $iosIcon -Force
}

$densitySizes = @{
  "mipmap-mdpi" = 48
  "mipmap-hdpi" = 72
  "mipmap-xhdpi" = 96
  "mipmap-xxhdpi" = 144
  "mipmap-xxxhdpi" = 192
}

foreach ($densityName in $densitySizes.Keys) {
  $size = $densitySizes[$densityName]
  $targetDir = Join-Path $root "android\app\src\main\res\$densityName"
  foreach ($fileName in @("ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png")) {
    Save-ResizedPng $sourcePath (Join-Path $targetDir $fileName) $size $size
  }
}

Write-Host "Raddo icon assets generated from $sourcePath"
