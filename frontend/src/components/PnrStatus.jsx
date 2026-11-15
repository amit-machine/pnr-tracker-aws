import { parseRailkitDate } from "../utils/pnrUtils";
import TrainCard from "./TrainCard";

function PnrStatus({ status, children }) {
  const journey = status.journey || {};

  const chips = [
    journey.class && { label: "Class", value: journey.class },
    journey.quota && { label: "Quota", value: journey.quota },
    journey.distance && { label: "Distance", value: `${journey.distance} km` },
  ].filter(Boolean);

  const passengers = (status.passengers || []).map((passenger) => ({
    serialNumber: passenger.serialNumber,
    ...passenger.current,
  }));

  return (
    <TrainCard
      pnr={status.pnr}
      trainNumber={status.train?.number}
      trainName={status.train?.name}
      source={journey.source?.name}
      destination={journey.destination?.name}
      departure={parseRailkitDate(journey.dateOfJourney)}
      arrival={parseRailkitDate(journey.arrivalDate)}
      chart={status.chart?.status}
      chips={chips}
      passengers={passengers}
    >
      {children}
    </TrainCard>
  );
}

export default PnrStatus;
