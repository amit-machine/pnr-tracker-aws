import { useState } from "react";
import { getTrackingRequest, listTrackings } from "../services/pnrApi";
import {
  isValidEmail,
  isValidPnr,
  isValidTrackingId,
} from "../utils/validation";
import FormField from "./FormField";
import TrackingResult from "./TrackingResult";

const MODES = {
  email: {
    label: "Email",
    placeholder: "Email used when tracking was started",
    type: "email",
    isValid: (value) => isValidEmail(value),
  },
  pnr: {
    label: "PNR",
    placeholder: "10-digit PNR",
    type: "text",
    isValid: (value) => isValidPnr(value),
  },
  trackingId: {
    label: "Tracking ID",
    placeholder: "Paste the tracking ID you were given",
    type: "text",
    isValid: (value) => isValidTrackingId(value),
  },
};

function TrackingLookup() {
  const [mode, setMode] = useState("email");
  const [value, setValue] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const config = MODES[mode];
  const trimmed = value.trim();
  const valid = config.isValid(trimmed);

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setValue("");
    setResults(null);
    setError("");
  };

  const handleLookup = async () => {
    setError("");
    setResults(null);

    if (!valid) {
      setError(`Please enter a valid ${config.label.toLowerCase()}.`);
      return;
    }

    try {
      setLoading(true);

      if (mode === "trackingId") {
        setResults([await getTrackingRequest(trimmed)]);
      } else {
        const data = await listTrackings({ [mode]: trimmed });
        setResults(data.items);
      }
    } catch (err) {
      console.error("Failed to fetch tracking request:", err);
      setError(
        err.message || "Unable to fetch tracking request. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tracking-lookup">
      <div className="lookup-modes" role="group" aria-label="Search by">
        {Object.entries(MODES).map(([key, option]) => (
          <button
            key={key}
            type="button"
            className={`lookup-mode ${mode === key ? "active" : ""}`}
            aria-pressed={mode === key}
            onClick={() => changeMode(key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <FormField
        id="lookupValue"
        label={config.label}
        type={config.type}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={config.placeholder}
      />

      <button
        className="primary-button"
        onClick={handleLookup}
        disabled={!valid || loading}
      >
        {loading ? "Checking..." : "Check Tracking"}
      </button>

      {error && <p className="error-message">{error}</p>}

      {results && results.length === 0 && (
        <p>No active tracking requests found.</p>
      )}

      {results &&
        results.map((tracking) => (
          <TrackingResult key={tracking.trackingId} tracking={tracking} />
        ))}
    </div>
  );
}

export default TrackingLookup;
