import type { NotchTool } from "./types";
import { agentMonitorTool } from "./ai-agents";

// Lista de herramientas registradas
const toolsRegistry: Map<string, NotchTool<any>> = new Map();

// Registrar herramientas nativas
toolsRegistry.set(agentMonitorTool.id, agentMonitorTool);

export const DEFAULT_TOOL_ID = agentMonitorTool.id;

/** Registra una nueva herramienta en la galería */
export function registerTool(tool: NotchTool<any>) {
  toolsRegistry.set(tool.id, tool);
}

/** Obtiene una herramienta por su identificador */
export function getTool(id: string): NotchTool<any> | undefined {
  return toolsRegistry.get(id);
}

/** Devuelve todas las herramientas disponibles en la galería */
export function getAllTools(): NotchTool<any>[] {
  return Array.from(toolsRegistry.values());
}
