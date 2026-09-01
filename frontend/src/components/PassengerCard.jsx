import { statusLabel } from "../utils/pnrUtils";

function PassengerCard({ passenger }) {
  const current = passenger?.current;

  return (
    <div className="passenger-card">
      <div>
        <h4>{passenger?.serialNumber || "Passenger"}</h4>

        <span className="passenger-details">
          {current?.details || "Not available"}
        </span>
      </div>

      <div className="passenger-status">
        <strong>{statusLabel(current?.status)}</strong>

        <span>
          {current?.coach || "Not assigned"}
          {" • "}
          {current?.berthNo ? `Berth ${current.berthNo}` : "No berth"}
        </span>
      </div>
    </div>
  );
}

export default PassengerCard;
