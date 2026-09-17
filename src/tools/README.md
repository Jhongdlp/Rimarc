# Arquitectura de Herramientas y Galería de Notches (Rimarc Tools)

Rimarc cuenta con una arquitectura modular basada en **Notch Tools** (Herramientas / Notches intercambiables). Esto permite que la ventana, la geometría física, el silueteado SVG, el reposicionamiento por bordes y las animaciones sirvan como una **plataforma host**, mientras que el contenido visual y funcional reside en módulos independientes.

---

## 🏛️ Estructura del Sistema

```text
src/
  tools/
    types.ts            # Definición de la interfaz NotchTool
    registry.ts         # Registro central de herramientas disponibles
    ai-agents/          # Herramienta nativa: Monitor de Agentes IA
  lib/
    toolStore.ts        # Almacén reactivo de la herramienta activa (persiste en localStorage)
  components/
    NotchBar.tsx        # Host de la isla dinámica; renderiza cualquier NotchTool
    ToolGallery.tsx     # Interfaz de la Galería de Herramientas
    SettingsPanel.tsx   # Panel de ajustes con pestaña integrada de Galería
```

---

## 🚀 Cómo crear un nuevo Notch / Herramienta

Para crear una nueva herramienta (ej. un reproductor de Spotify, reloj mundial, notas rápidas, estado de GitHub, etc.):

### 1. Crea una carpeta para tu módulo en `src/tools/mi-herramienta/`

Crea el archivo `index.tsx` implementando la interfaz `NotchTool`:

```tsx
import { Music } from "lucide-react";
import { notchHeight } from "../../lib/notchGeometry";
import type { NotchTool } from "../types";

interface MyToolData {
  title: string;
  progress: number;
}

export const miHerramientaTool: NotchTool<MyToolData> = {
  id: "mi-herramienta",
  name: "Reproductor Multimedia",
  tagline: "Control de música y estado de reproducción",
  description: "Muestra la canción actual y te permite pausar o cambiar de pista.",
  version: "1.0.0",
  author: "Mi Nombre",
  category: "utilities",
  badge: "Comunidad",
  icon: Music,

  // Hook reactivo de datos
  useData: () => {
    return { title: "Bohemian Rhapsody", progress: 65 };
  },

  // Altura del notch en px según el número de slots
  getNotchHeight: () => notchHeight(1),

  // Colores de los puntos en modo minimizado (peek)
  getDots: () => ["#1db954"],

  // Si está vacío / sin actividad
  isEmpty: () => false,

  // Lo que se muestra en la silueta del notch al expandirse
  renderBar: ({ data, colors }) => (
    <div style={{ display: "flex", justifyContent: "center" }}>
      {/* Tu componente o RadialRingGauge */}
    </div>
  ),

  // Lo que se muestra en el Popover al hacer hover o clic
  renderPopover: ({ open, anchor, onHoverStart, onHoverEnd }) => (
    /* Tu componente Popover */
  ),
};
```

### 2. Regístrala en `src/tools/registry.ts`

```tsx
import { miHerramientaTool } from "./mi-herramienta";

registerTool(miHerramientaTool);
```

¡Listo! Tu nueva herramienta aparecerá de inmediato en la **Galería de Herramientas**, y cualquier usuario podrá activarla con un clic.
