import { useEffect, useState } from "react";
import { getTrackingRequest, listTrackings } from "../services/pnrApi";
import { isValidEmail, isValidTrackingId } from "../utils/validation";
import { loadLastEmail, saveLastEmail } from "../utils/lastEmail";
import FormField from "./FormField";
import TrackingResult from "./TrackingResult";

// Each search mode keeps its own typed value and its own results, so switching
// modes never loses what was entered or found.
const MODES = {
  email: {
    label: "Email",
    placeholder: "Email used when tracking was started",
    type: "email",
    isValid: (value) => isValidEmail(value),
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
  const [values, setValues] = useState({ email: savedEmail, trackingId: "" });
  const [results, setResults] = useState({ email: null, trackingId: null });
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
          setResults((prev) => ({ ...prev, email: data.items }));
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
  const value = values[mode];
  const trimmed = value.trim();
  const valid = config.isValid(trimmed);

  const setValue = (next) => setValues((prev) => ({ ...prev, [mode]: next }));

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setError("");
  };

  const handleLookup = async () => {
    setError("");
    setResults((prev) => ({ ...prev, [mode]: null }));

    if (!valid) {
      setError(`Please enter a valid ${config.label.toLowerCase()}.`);
      return;
    }

    try {
      setLoading(true);

      if (mode === "trackingId") {
        const tracking = await getTrackingRequest(trimmed);
        setResults((prev) => ({ ...prev, trackingId: [tracking] }));
      } else {
        const data = await listTrackings({ email: trimmed });
        setResults((prev) => ({ ...prev, email: data.items }));
        saveLastEmail(trimmed);
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

  const current = results[mode];

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

      {current && current.length === 0 && (
        <section className="card empty">
          No active tracking requests found.
        </section>
      )}

      {current &&
        current.map((tracking) => (
          <TrackingResult key={tracking.trackingId} tracking={tracking} />
        ))}
    </>
  );
}

export default TrackingLookup;
