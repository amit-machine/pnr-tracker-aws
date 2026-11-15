import { statusLabel, statusTone } from "../utils/pnrUtils";

// passenger: { serialNumber, status, details, coach, berthNo }
function PassengerCard({ passenger }) {
  const seat = [
    passenger?.coach,
    passenger?.berthNo ? `Berth ${passenger.berthNo}` : null,
  ].filter(Boolean);

  return (
    <div className="passenger">
      <div className="passenger-main">
        <strong>{passenger?.serialNumber || "Passenger"}</strong>
        <span>{passenger?.details || "Details not available"}</span>
      </div>

      <div className="passenger-side">
        <span className={`pill pill-${statusTone(passenger?.status)}`}>
          {statusLabel(passenger?.status)}
        </span>
        <span className="passenger-seat">
          {seat.length ? seat.join(" • ") : "Seat not assigned"}
        </span>
      </div>
    </div>
  );
}

export default PassengerCard;
