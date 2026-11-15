import { useState } from "react";
import PnrForm from "./components/PnrForm";
import TrackingLookup from "./components/TrackingLookup";

const TABS = [
  { id: "status", label: "Check PNR" },
  { id: "trackings", label: "My trackings" },
];

function App() {
  const [tab, setTab] = useState("status");

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
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {tab === "status" ? <PnrForm /> : <TrackingLookup />}
      </main>
    </>
  );
}

export default App;
