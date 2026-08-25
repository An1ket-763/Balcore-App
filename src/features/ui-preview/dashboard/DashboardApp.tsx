import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
// @ts-ignore
import "./dashboard.css";
import Onboarding from "./Onboarding";
import Sidebar from "./Sidebar";
import Topnav from "./Topnav";
import OverviewView from "./views/OverviewView";
import ProtocolView from "./views/ProtocolView";
import ActivityView from "./views/ActivityView";
import Overlays from "./modals/Overlays";
import { initDashboardScripts } from "./dashboardScripts";

const ONBOARD_KEY = "balcore-onboarded";
const NAME_KEY = "balcore-display-name";

export default function DashboardApp() {
  const { isConnected, address, status } = useAccount();
  const [onboarded, setOnboarded] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const isResuming = status === "connecting" || status === "reconnecting";

  useEffect(() => {
    if (!address) return;
    try {
      const key = address.toLowerCase();
      if (localStorage.getItem(`${ONBOARD_KEY}:${key}`) === "1") {
        setOnboarded(true);
        setDisplayName(localStorage.getItem(`${NAME_KEY}:${key}`) ?? "");
      }
    } catch {}
  }, [address]);

  const ready = isConnected && onboarded;

  useEffect(() => {
    if (isResuming) return;
    if (!isConnected && onboarded) setOnboarded(false);
  }, [isConnected, onboarded, isResuming]);

  // Keep the dashboard mounted while the wallet resumes/switches network,
  // otherwise the imperative script listeners are lost on remount.
  if (isResuming && !onboarded) {
    return null;
  }

  if (!ready && !(isResuming && onboarded)) {
    return (
      <Onboarding
        onComplete={(name: string) => {
          setDisplayName(name);
          setOnboarded(true);
          if (address) {
            try {
              const key = address.toLowerCase();
              localStorage.setItem(`${ONBOARD_KEY}:${key}`, "1");
              localStorage.setItem(`${NAME_KEY}:${key}`, name);
            } catch {}
          }
        }}
      />
    );
  }

  return (
    <div className="app">
      <Sidebar displayName={displayName} open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div
        className={`side-scrim${menuOpen ? " open" : ""}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />
      <main className="main">
        <Topnav
          onConnectClick={() => { }}
          menuOpen={menuOpen}
          onMenuToggle={() => setMenuOpen((v) => !v)}
        />
        <OverviewView />
        <ProtocolView />
        <ActivityView />
      </main>
      <Overlays />
      <DashboardScriptsMount />
    </div>
  );
}

/** Re-runs the imperative dashboard wiring every time the dashboard DOM mounts. */
function DashboardScriptsMount() {
  useEffect(() => {
    try {
      initDashboardScripts();
    } catch (err) {
      console.error("[balcore] initDashboardScripts failed:", err);
    }
  }, []);
  return null;
}
