import { classLabel, stopReasonLabel } from "../utils/pnrUtils";
import TrainCard from "./TrainCard";

function TrackingResult({ tracking }) {
  const stopReason = stopReasonLabel(tracking.stopReason);

  const chips = [
    tracking.travelClass && {
      label: "Class",
      value: classLabel(tracking.travelClass),
    },
    tracking.quota && { label: "Quota", value: tracking.quota },
  ].filter(Boolean);

  return (
    <TrainCard
      pnr={tracking.pnr}
      trainNumber={tracking.trainNumber}
      trainName={tracking.trainName}
      source={tracking.source}
      destination={tracking.destination}
      departure={tracking.journeyDate}
      arrival={tracking.arrivalDate}
      chart={tracking.lastStatus?.chart}
      chips={chips}
      badge={
        tracking.active
          ? { label: "Tracking active", tone: "success" }
          : { label: "Stopped", tone: "neutral" }
      }
      notice={
        !tracking.active && stopReason ? `Tracking stopped: ${stopReason}` : null
      }
      passengers={tracking.lastStatus?.passengers || []}
    />
  );
}

export default TrackingResult;
