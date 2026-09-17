# Guía de Distribución y Descargas de Rimarc

Este documento explica cómo generar paquetes ejecutables descargables de Rimarc para que cualquier usuario pueda instalarlo y usarlo fácilmente en su sistema operativo.

---

## 📦 Formatos de Descarga Disponibles

Rimarc está configurado para generar instaladores y ejecutables nativos:

| Sistema Operativo | Formato | Descripción |
| :--- | :--- | :--- |
| **Linux (Universal)** | `.AppImage` | Ejecutable portable sin instalación (funciona en cualquier distro). |
| **Linux (Debian / Ubuntu)** | `.deb` | Paquete instalable con doble clic o `sudo dpkg -i`. |
| **Linux (Arch Linux / Manjaro)** | `AUR (rimarc-bin)` | Instalación directa mediante `yay -S rimarc-bin` o `paru`. |
| **Linux (Portable)** | `.tar.gz` | Binario comprimido con su lanzador `.desktop` e iconos. |
| **Windows** | `.msi` / `.exe` | Instalador estándar de Windows. |
| **macOS** | `.dmg` | Imagen de disco para Apple Silicon y macOS. |

---

## 🛠️ Cómo Generar los Paquetes Descargables Localmente

Desde la terminal del proyecto, puedes generar los instaladores con los siguientes comandos:

### 1. Generar paquete universal AppImage (Recomendado para Linux)
```bash
pnpm package:appimage
```
*El archivo generado estará en:*  
`src-tauri/target/release/bundle/appimage/Rimarc_*.AppImage`

Para probarlo inmediatamente:
```bash
chmod +x src-tauri/target/release/bundle/appimage/Rimarc_*.AppImage
./src-tauri/target/release/bundle/appimage/Rimarc_*.AppImage
```

---

### 2. Generar paquete `.deb` (Ubuntu, Debian, Linux Mint, Pop!_OS)
```bash
pnpm package:deb
```
*El archivo generado estará en:*  
`src-tauri/target/release/bundle/deb/rimarc_*_amd64.deb`

Instalación:
```bash
sudo dpkg -i src-tauri/target/release/bundle/deb/rimarc_*_amd64.deb
```

---

### 3. Generar todos los instaladores
```bash
pnpm package:all
```

---

## 🚀 Publicación Automática en GitHub Releases

El proyecto cuenta con un flujo de integración continua en [`.github/workflows/release.yml`](.github/workflows/release.yml) que compila y publica los binarios en la sección de **Releases** de tu repositorio de GitHub.

### Para lanzar una nueva versión descargable:
1. Asegúrate de que la versión en `package.json` y `src-tauri/tauri.conf.json` sea la deseada (ej. `0.4.4`).
2. Crea una etiqueta git (tag) y súbela al repositorio:
   ```bash
   git tag v0.4.4
   git push origin v0.4.4
   ```
3. GitHub Actions compilará automáticamente en máquinas Ubuntu, Windows y macOS, y publicará los instaladores listos para descargar.

---

## 🔄 Actualizador Automático Integrado

Rimarc incluye el plugin `updater` de Tauri configurado con endpoints de GitHub Releases. Cuando un usuario abre la aplicación y existe una nueva versión publicada, Rimarc puede actualizarse de manera automática y transparente.
