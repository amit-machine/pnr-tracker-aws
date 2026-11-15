import { useState } from "react";
import PnrForm from "./components/PnrForm";
import TrackingLookup from "./components/TrackingLookup";
import EmailTrackingList from "./components/EmailTrackingList";

function App() {
  const [showLookup, setShowLookup] = useState(false);
  const [showEmailList, setShowEmailList] = useState(false);

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

      <section className="pnr-card">
        <button
          type="button"
          className="link-button"
          onClick={() => setShowEmailList((value) => !value)}
        >
          {showEmailList
            ? "Hide my trackings"
            : "See all trackings for my email"}
        </button>

        {showEmailList && <EmailTrackingList />}
      </section>
    </main>
  );
}

export default App;
