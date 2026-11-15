import { useEffect, useState } from "react";
import { getTrackingRequest, listTrackings } from "../services/pnrApi";
import {
  isValidEmail,
  isValidPnr,
  isValidTrackingId,
} from "../utils/validation";
import { loadLastEmail, saveLastEmail } from "../utils/lastEmail";
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
  // The last email searched is restored (and searched again) after a reload.
  const [savedEmail] = useState(() => {
    const email = loadLastEmail();
    return isValidEmail(email) ? email : "";
  });

  const [mode, setMode] = useState("email");
  const [value, setValue] = useState(savedEmail);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(Boolean(savedEmail));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!savedEmail) {
      return undefined;
    }

    let cancelled = false;

    listTrackings({ email: savedEmail })
      .then((data) => {
        if (!cancelled) {
          setResults(data.items);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to restore last search:", err);
          setError(err.message || "Unable to fetch tracking request.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [savedEmail]);

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

        if (mode === "email") {
          saveLastEmail(trimmed);
        }
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
    <>
      <section className="card">
        <h2 className="card-title">Find my trackings</h2>

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
          label={`Search by ${config.label.toLowerCase()}`}
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
          {loading ? "Searching..." : "Find trackings"}
        </button>

        {error && <p className="error-message">{error}</p>}
      </section>

      {results && results.length === 0 && (
        <section className="card empty">
          No active tracking requests found.
        </section>
      )}

      {results &&
        results.map((tracking) => (
          <TrackingResult key={tracking.trackingId} tracking={tracking} />
        ))}
    </>
  );
}

export default TrackingLookup;
