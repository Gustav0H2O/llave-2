# scripts/capture-icons.ps1 — versión simplificada sin bucles
$ErrorActionPreference = "Stop"
$scratch = "C:\Users\EQUIPO\AppData\Local\Temp\commandcode\C--Users-EQUIPO\bcd3aedf-7781-460b-957b-e15731a4d284\scratchpad"
$brand = "C:\Users\EQUIPO\Downloads\bombas de gasolina\public\brand"
$url = "file:///C:/Users/EQUIPO/Downloads/bombas%20de%20gasolina/public/brand/_render-icons.html"

Write-Host "Abriendo navegador..."
npx --yes agent-browser open $url 2>&1 | Out-Null

function Capture($name, $w, $h, $cls, $logo) {
    Write-Host "  $name ${w}x${h} ($cls)..."
    npx --yes agent-browser set viewport $w $h 2>&1 | Out-Null
    npx --yes agent-browser eval "setIconClass('$cls', '$logo')" 2>&1 | Out-Null
    Start-Sleep -Milliseconds 500
    $out = "$scratch\$name.png"
    npx --yes agent-browser screenshot $out 2>&1 | Out-Null
    Copy-Item -Path $out -Destination "$brand\$name.png" -Force
}

Capture "apple-touch-llave"           180 180 "apple" "logo-llave.svg"
Capture "icon-192-llave"             192 192 "apple" "logo-llave.svg"
Capture "icon-512-llave"             512 512 "apple" "logo-llave.svg"
Capture "icon-maskable-512-llave"    512 512 "mask"  "logo-llave-light.svg"
Capture "favicon-32-llave"            32  32 "fav"   "favicon-llave.svg"
Capture "favicon-64-llave"            64  64 "fav"   "favicon-llave.svg"

Write-Host "Listo."