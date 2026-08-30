import { useState } from "react";
import PnrForm from "./components/PnrForm";
import TrackingLookup from "./components/TrackingLookup";

function App() {
  const [showLookup, setShowLookup] = useState(false);

  return (
    <main className="pnr-page">
      <header className="page-header">
        <h1>PNR Tracker</h1>
        <p>Check your Indian Railways PNR status</p>
      </header>

      <section className="pnr-card">
        <PnrForm />
      </section>

      <section className="pnr-card">
        <button
          type="button"
          className="link-button"
          onClick={() => setShowLookup((value) => !value)}
        >
          {showLookup
            ? "Hide tracking lookup"
            : "Check an existing tracking request"}
        </button>

        {showLookup && <TrackingLookup />}
      </section>
    </main>
  );
}

export default App;
