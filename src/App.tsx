import { useState, useEffect } from "react";
import { NotchBar } from "./components/NotchBar";
import { StoreApp } from "./components/store/StoreApp";
import { ClipboardWidget } from "./components/ClipboardWidget";
import { ClipboardSettings } from "./components/ClipboardSettings";
import { ClipboardThemeScope } from "./lib/theme";
import { getTauriWindowLabel } from "./lib/tauri";

export default function App() {
  const [label, setLabel] = useState<string | null>(getTauriWindowLabel);

  useEffect(() => {
    const handleUpdate = () => {
      setLabel(getTauriWindowLabel());
    };
    window.addEventListener("hashchange", handleUpdate);
    window.addEventListener("popstate", handleUpdate);
    return () => {
      window.removeEventListener("hashchange", handleUpdate);
      window.removeEventListener("popstate", handleUpdate);
    };
  }, []);

  // Si corre en la ventana dock overlay de Tauri ('main'), renderizar el Notch
  if (label === "main") {
    return <NotchBar />;
  }

  // Si corre en la ventana de portapapeles independiente de la barra de tareas ('clipboard')
  if (label === "clipboard") {
    return (
      <ClipboardThemeScope>
        <ClipboardWidget />
      </ClipboardThemeScope>
    );
  }

  if (label === "clipboard-settings") {
    return (
      <ClipboardThemeScope>
        <ClipboardSettings />
      </ClipboardThemeScope>
    );
  }

  // En la ventana 'store' de Tauri o en modo navegador de desarrollo, renderizar la tienda
  return (
    <StoreApp
      onToggleView={() => {
        window.location.hash = "notch";
        setLabel("main");
      }}
    />
  );
}


