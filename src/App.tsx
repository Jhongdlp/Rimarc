import { NotchBar } from "./components/NotchBar";
import { useAgentScan } from "./hooks/useAgentScan";

const SCAN_INTERVAL_MS = 2500;

export default function App() {
  return <NotchBar sessions={useAgentScan(SCAN_INTERVAL_MS)} />;
}
