import { useState } from "react";
import { getPnrStatus } from "../services/pnrApi";
import PnrStatus from "./PnrStatus";
import TrackingForm from "./TrackingForm";

function PnrForm() {
  const [pnr, setPnr] = useState("");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isValidPnr = /^\d{10}$/.test(pnr);

  const handlePnrChange = (e) => {
    const value = e.target.value;

    if (!/^\d*$/.test(value)) {
      return;
    }

    setPnr(value);
    setError("");
  };

  const handleGetStatus = async () => {
    setError("");
    setStatus(null);

    if (!isValidPnr) {
      setError("Please enter a valid 10-digit PNR.");
      return;
    }

    try {
      setLoading(true);

      const data = await getPnrStatus(pnr);

      setStatus(data);
    } catch (error) {
      console.error("Failed to fetch PNR status:", error);
      setError("Unable to fetch PNR status. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pnr-form">
      <section className="form-section">
        <h2>Check PNR Status</h2>

        <div className="form-group">
          <label htmlFor="pnr">PNR Number</label>

          <input
            id="pnr"
            type="text"
            inputMode="numeric"
            value={pnr}
            onChange={handlePnrChange}
            placeholder="Enter your 10-digit PNR"
            maxLength={10}
          />

          <div className="input-hint">{pnr.length}/10 digits</div>
        </div>

        <button
          className="primary-button"
          onClick={handleGetStatus}
          disabled={!isValidPnr || loading}
        >
          {loading ? "Checking..." : "Get Current Status"}
        </button>

        {error && <p className="error-message">{error}</p>}
      </section>

      {status && (
        <>
          <div className="section-divider" />

          <PnrStatus status={status} />

          <div className="section-divider" />

          <TrackingForm pnr={pnr} />
        </>
      )}
    </div>
  );
}

export default PnrForm;
