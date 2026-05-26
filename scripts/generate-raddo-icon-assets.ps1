Add-Type -AssemblyName System.Drawing

$code = @"
using System;
using System.IO;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

public static class RaddoIconGenerator3 {
  static void DrawRoundedLine(Graphics g, Pen pen, PointF[] points) {
    using (var path = new GraphicsPath()) {
      path.AddLines(points);
      g.DrawPath(pen, path);
    }
  }

  public static void DrawMark(Graphics g, float cx, float cy, float s) {
    using (var red = new SolidBrush(Color.FromArgb(255, 255, 68, 70))) {
      g.FillEllipse(red, cx - s / 2f, cy - s / 2f, s, s);
    }

    float stroke = s * .105f;
    using (var pen = new Pen(Color.FromArgb(255, 21, 28, 31), stroke)) {
      pen.StartCap = LineCap.Round;
      pen.EndCap = LineCap.Round;
      pen.LineJoin = LineJoin.Round;
      var rect = new RectangleF(cx - s * .25f, cy - s * .25f, s * .50f, s * .50f);
      g.DrawArc(pen, rect, 18f, 306f);
      DrawRoundedLine(g, pen, new [] {
        new PointF(cx - s * .26f, cy + s * .12f),
        new PointF(cx - s * .30f, cy + s * .31f),
        new PointF(cx - s * .13f, cy + s * .25f)
      });
    }

    using (var dot = new SolidBrush(Color.FromArgb(255, 21, 28, 31))) {
      g.FillEllipse(dot, cx - s * .08f, cy - s * .08f, s * .16f, s * .16f);
      g.FillEllipse(dot, cx - s * .23f, cy - s * .24f, s * .11f, s * .11f);
    }
  }

  public static void DrawIcon(Bitmap bmp, bool opaqueBg) {
    using (var g = Graphics.FromImage(bmp)) {
      g.SmoothingMode = SmoothingMode.AntiAlias;
      g.InterpolationMode = InterpolationMode.HighQualityBicubic;
      g.PixelOffsetMode = PixelOffsetMode.HighQuality;
      g.Clear(opaqueBg ? Color.FromArgb(255, 7, 17, 31) : Color.Transparent);
      float W = bmp.Width, H = bmp.Height, S = Math.Min(W, H);
      DrawMark(g, W / 2f, H / 2f, S * .82f);
    }
  }

  public static void Save(string path, int w, int h, bool opaqueBg) {
    Directory.CreateDirectory(Path.GetDirectoryName(path));
    using (var bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb)) {
      DrawIcon(bmp, opaqueBg);
      bmp.Save(path, ImageFormat.Png);
    }
  }

  public static void SaveSplash(string path, int w, int h) {
    Directory.CreateDirectory(Path.GetDirectoryName(path));
    using (var bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb))
    using (var g = Graphics.FromImage(bmp)) {
      g.SmoothingMode = SmoothingMode.AntiAlias;
      g.Clear(Color.FromArgb(255, 7, 17, 31));
      float S = Math.Min(w, h) * .42f;
      DrawMark(g, w / 2f, h / 2f, S);
      bmp.Save(path, ImageFormat.Png);
    }
  }
}
"@

Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing

$root = "C:\Codex\Raddo"
[RaddoIconGenerator3]::Save((Join-Path $root "store-assets\raddo-icon-1024.png"), 1024, 1024, $false)
[RaddoIconGenerator3]::Save((Join-Path $root "store-assets\raddo-icon-ios-1024.png"), 1024, 1024, $true)
[RaddoIconGenerator3]::Save((Join-Path $root "public\raddo-icon.png"), 512, 512, $false)

Get-ChildItem -Path (Join-Path $root "android\app\src\main\res") -Recurse -File -Include ic_launcher.png,ic_launcher_round.png,ic_launcher_foreground.png | ForEach-Object {
  $old = [System.Drawing.Image]::FromFile($_.FullName)
  $w = $old.Width
  $h = $old.Height
  $old.Dispose()
  [RaddoIconGenerator3]::Save($_.FullName, $w, $h, $false)
}

Get-ChildItem -Path (Join-Path $root "android\app\src\main\res") -Recurse -File -Include splash.png | ForEach-Object {
  $old = [System.Drawing.Image]::FromFile($_.FullName)
  $w = $old.Width
  $h = $old.Height
  $old.Dispose()
  [RaddoIconGenerator3]::SaveSplash($_.FullName, $w, $h)
}

$iosIcon = Join-Path $root "ios\App\App\Assets.xcassets\AppIcon.appiconset\AppIcon-512@2x.png"
if (Test-Path $iosIcon) {
  [RaddoIconGenerator3]::Save($iosIcon, 1024, 1024, $true)
}

Get-ChildItem -Path (Join-Path $root "ios\App\App\Assets.xcassets\Splash.imageset") -File -Include *.png | ForEach-Object {
  [RaddoIconGenerator3]::Save($_.FullName, 2732, 2732, $true)
}

Write-Host "Raddo icon assets generated."
