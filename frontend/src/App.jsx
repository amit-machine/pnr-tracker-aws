import { useState } from "react";
import PnrForm from "./components/PnrForm";
import TrackingLookup from "./components/TrackingLookup";

const TABS = [
  { id: "status", label: "Check PNR" },
  { id: "trackings", label: "My trackings" },
];

// The active tab lives in the URL hash (#trackings) so a reload stays on it.
function tabFromHash() {
  const id = window.location.hash.slice(1);
  return TABS.some((item) => item.id === id) ? id : "status";
}

function App() {
  const [tab, setTab] = useState(tabFromHash);

  const selectTab = (id) => {
    setTab(id);
    window.history.replaceState(null, "", `#${id}`);
  };

  return (
    <>
      <header className="hero">
        <div className="hero-inner">
          <span className="hero-badge">🚆 Indian Railways</span>
          <h1>PNR Tracker</h1>
          <p>Check your booking and get an email when its status changes.</p>
        </div>
      </header>

      <main className="page">
        <nav className="tabs" aria-label="Sections">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`tab ${tab === item.id ? "active" : ""}`}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => selectTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Both tabs stay mounted so typed values and results survive switching. */}
        <div hidden={tab !== "status"}>
          <PnrForm />
        </div>
        <div hidden={tab !== "trackings"}>
          <TrackingLookup />
        </div>
      </main>
    </>
  );
}

export default App;
