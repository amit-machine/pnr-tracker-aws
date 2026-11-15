import { formatDay, formatDuration, formatTime } from "../utils/pnrUtils";
import PassengerCard from "./PassengerCard";

// One card per train: header, departure → arrival timeline, passengers.
function TrainCard({
  pnr,
  trainNumber,
  trainName,
  source,
  destination,
  departure,
  arrival,
  chart,
  badge,
  chips = [],
  notice,
  passengers = [],
  children,
}) {
  const duration = formatDuration(departure, arrival);

  return (
    <article className="train-card">
      <header className="train-head">
        <div>
          {pnr && <span className="eyebrow">PNR {pnr}</span>}
          <h2>{trainName || "Train details not available"}</h2>
          {trainNumber && <span className="train-number">#{trainNumber}</span>}
        </div>

        {badge && (
          <span className={`pill pill-${badge.tone}`}>{badge.label}</span>
        )}
      </header>

      <div className="route">
        <div className="stop">
          <span className="time">{formatTime(departure) || "--"}</span>
          <span className="day">{formatDay(departure) || ""}</span>
          <span className="station">{source || "Source not available"}</span>
        </div>

        <div className="route-mid">
          <span className="duration">{duration || ""}</span>
          <div className="route-line">
            <span className="dot" />
            <span className="bar" />
            <span className="dot" />
          </div>
        </div>

        <div className="stop stop-end">
          <span className="time">{formatTime(arrival) || "--"}</span>
          <span className="day">{formatDay(arrival) || ""}</span>
          <span className="station">
            {destination || "Destination not available"}
          </span>
        </div>
      </div>

      {(chips.length > 0 || chart) && (
        <div className="chips">
          {chips.map((chip) => (
            <span className="chip" key={chip.label}>
              <small>{chip.label}</small>
              {chip.value}
            </span>
          ))}
          {chart && (
            <span className="chip">
              <small>Chart</small>
              {chart}
            </span>
          )}
        </div>
      )}

      {notice && <p className="notice">{notice}</p>}

      {passengers.length > 0 && (
        <div className="passengers">
          <h3>Passengers</h3>
          {passengers.map((passenger, index) => (
            <PassengerCard
              key={passenger.serialNumber || index}
              passenger={passenger}
            />
          ))}
        </div>
      )}

      {children}
    </article>
  );
}

export default TrainCard;
