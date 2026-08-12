import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import "./dashboard.css";
import Onboarding from "./Onboarding";
import Sidebar from "./Sidebar";
import Topnav from "./Topnav";
import OverviewView from "./views/OverviewView";
import ProtocolView from "./views/ProtocolView";
import ActivityView from "./views/ActivityView";
import Overlays from "./modals/Overlays";
import { initDashboardScripts } from "./dashboardScripts";

/**
 * Gate: the dashboard UI is not rendered at all until the wallet is connected
 * and onboarding is finished.
 */
export default function DashboardApp() {
  const { isConnected } = useAccount();
  const [onboarded, setOnboarded] = useState(false);
  const [displayName, setDisplayName] = useState("");

  const ready = isConnected && onboarded;

  // reset the gate if the user disconnects
  useEffect(() => {
    if (!isConnected && onboarded) setOnboarded(false);
  }, [isConnected, onboarded]);

  useEffect(() => {
    if (!ready) return;
    initDashboardScripts();
  }, [ready]);

  if (!ready) {
    return (
      <Onboarding
        onComplete={(name: string) => {
          setDisplayName(name);
          setOnboarded(true);
        }}
      />
    );
  }

  return (
    <div className="app">
      <Sidebar displayName={displayName} />
      <main className="main">
        <Topnav onConnectClick={() => {}} />
        <OverviewView />
        <ProtocolView />
        <ActivityView />
      </main>
      <Overlays />
    </div>
  );
}
