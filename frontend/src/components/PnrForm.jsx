import { useState } from "react";
import { getPnrStatus } from "../services/pnrApi";
import { canTrackPnr } from "../utils/pnrUtils";
import { isValidPnr, isDigitsOnly } from "../utils/validation";
import FormField from "./FormField";
import PnrStatus from "./PnrStatus";
import TrackingForm from "./TrackingForm";

function PnrForm() {
  const [pnr, setPnr] = useState("");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const pnrValid = isValidPnr(pnr);

  const handlePnrChange = (e) => {
    const value = e.target.value;

    if (!isDigitsOnly(value)) {
      return;
    }

    setPnr(value);
    setError("");
    setStatus(null);
  };

  const handleGetStatus = async () => {
    setError("");
    setStatus(null);

    if (!pnrValid) {
      setError("Please enter a valid 10-digit PNR.");
      return;
    }

    try {
      setLoading(true);

      const data = await getPnrStatus(pnr);

      setStatus(data);
    } catch (error) {
      console.error("Failed to fetch PNR status:", error);
      setError(
        error.message || "Unable to fetch PNR status. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pnr-form">
      <section className="form-section">
        <h2>Check PNR Status</h2>

        <FormField
          id="pnr"
          label="PNR Number"
          inputMode="numeric"
          value={pnr}
          onChange={handlePnrChange}
          placeholder="Enter your 10-digit PNR"
          maxLength={10}
          hint={`${pnr.length}/10 digits`}
        />

        <button
          className="primary-button"
          onClick={handleGetStatus}
          disabled={!pnrValid || loading}
        >
          {loading ? "Checking..." : "Get Current Status"}
        </button>

        {error && <p className="error-message">{error}</p>}
      </section>

      {status && (
        <>
          <div className="section-divider" />

          <PnrStatus status={status} />

          {canTrackPnr(status) && (
            <>
              <div className="section-divider" />

              <TrackingForm pnr={pnr} />
            </>
          )}
        </>
      )}
    </div>
  );
}

export default PnrForm;
