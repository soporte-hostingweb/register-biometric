Add-Type -AssemblyName System.Drawing

$sourcePath = Join-Path $PSScriptRoot '..\tmp\imagegen\hwperu-isotipo-chroma.png'
$assetDir = Join-Path $PSScriptRoot '..\assets\images'
$publicDir = Join-Path $PSScriptRoot '..\public\icons'

function New-TransparentIsotipo {
  param([string]$Source)

  $inputImage = [System.Drawing.Bitmap]::FromFile((Resolve-Path $Source))
  $transparent = New-Object System.Drawing.Bitmap $inputImage.Width, $inputImage.Height,
    ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

  for ($y = 0; $y -lt $inputImage.Height; $y++) {
    for ($x = 0; $x -lt $inputImage.Width; $x++) {
      $pixel = $inputImage.GetPixel($x, $y)
      # The generated source is white artwork over magenta. Its green channel
      # therefore acts as a stable coverage mask for the white brush strokes.
      $alpha = [int](($pixel.G - 150) * (255 / 105))
      $alpha = [Math]::Max(0, [Math]::Min(255, $alpha))
      $transparent.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, 255, 255, 255))
    }
  }

  $inputImage.Dispose()
  return $transparent
}

function Get-AlphaBounds {
  param([System.Drawing.Bitmap]$Image)

  $left = $Image.Width
  $top = $Image.Height
  $right = -1
  $bottom = -1
  for ($y = 0; $y -lt $Image.Height; $y++) {
    for ($x = 0; $x -lt $Image.Width; $x++) {
      if ($Image.GetPixel($x, $y).A -gt 12) {
        $left = [Math]::Min($left, $x)
        $top = [Math]::Min($top, $y)
        $right = [Math]::Max($right, $x)
        $bottom = [Math]::Max($bottom, $y)
      }
    }
  }
  return [System.Drawing.Rectangle]::FromLTRB($left, $top, $right + 1, $bottom + 1)
}

function Save-Canvas {
  param(
    [System.Drawing.Bitmap]$Source,
    [System.Drawing.Rectangle]$SourceBounds,
    [int]$Size,
    [double]$Coverage,
    [System.Drawing.Color]$Background,
    [string]$Path
  )

  $canvas = New-Object System.Drawing.Bitmap $Size, $Size,
    ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  $graphics.Clear($Background)
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

  $targetExtent = [int]($Size * $Coverage)
  $scale = [Math]::Min($targetExtent / $SourceBounds.Width, $targetExtent / $SourceBounds.Height)
  $targetWidth = [int]($SourceBounds.Width * $scale)
  $targetHeight = [int]($SourceBounds.Height * $scale)
  $target = New-Object System.Drawing.Rectangle ([int](($Size - $targetWidth) / 2)),
    ([int](($Size - $targetHeight) / 2)), $targetWidth, $targetHeight
  $graphics.DrawImage($Source, $target, $SourceBounds, [System.Drawing.GraphicsUnit]::Pixel)
  $graphics.Dispose()
  $canvas.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $canvas.Dispose()
}

$isotipo = New-TransparentIsotipo -Source $sourcePath
$bounds = Get-AlphaBounds -Image $isotipo
$transparent = [System.Drawing.Color]::Transparent
$navy = [System.Drawing.ColorTranslator]::FromHtml('#051C33')

Save-Canvas $isotipo $bounds 1024 0.84 $transparent (Join-Path $assetDir 'hwperu-icon-v4.png')
Save-Canvas $isotipo $bounds 1024 0.84 $transparent (Join-Path $assetDir 'hwperu-logo-v4.png')
Save-Canvas $isotipo $bounds 64 0.66 $navy (Join-Path $assetDir 'hwperu-favicon-v4.png')
Save-Canvas $isotipo $bounds 1024 0.84 $transparent (Join-Path $publicDir 'hwperu-logo-v4.png')

Save-Canvas $isotipo $bounds 192 0.66 $navy (Join-Path $publicDir 'pwa-icon-v4-192.png')
Save-Canvas $isotipo $bounds 512 0.66 $navy (Join-Path $publicDir 'pwa-icon-v4-512.png')
Save-Canvas $isotipo $bounds 192 0.56 $navy (Join-Path $publicDir 'pwa-icon-v4-maskable-192.png')
Save-Canvas $isotipo $bounds 512 0.56 $navy (Join-Path $publicDir 'pwa-icon-v4-maskable-512.png')
Save-Canvas $isotipo $bounds 180 0.62 $navy (Join-Path $publicDir 'apple-touch-icon-v4.png')
Save-Canvas $isotipo $bounds 192 0.64 $navy (Join-Path $publicDir 'notification-icon-v4.png')
Save-Canvas $isotipo $bounds 96 0.58 $transparent (Join-Path $publicDir 'notification-badge-v4.png')

$isotipo.Dispose()
