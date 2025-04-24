import {
  createContext,
  useState,
  useEffect,
  useContext,
  SetStateAction,
  Dispatch,
} from "react";
import { usePlayback } from "@/lib/PlaybackProvider";

export type ZoomContextType = {
  startTime: number;
  endTime: number;
  zoomedDuration: number;
  isZoomed: boolean;
  setStartTime: Dispatch<SetStateAction<number>>;
  setEndTime: Dispatch<SetStateAction<number>>;
  setCenterTime: (centerTime: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

export const ZoomContext = createContext<ZoomContextType>({
  startTime: 0,
  endTime: 1,
  zoomedDuration: 1,
  isZoomed: false,
  setStartTime: () => { },
  setEndTime: () => { },
  setCenterTime: () => { },
  zoomIn: () => { },
  zoomOut: () => { },
});

export function useZoom() {
  return useContext(ZoomContext);
}

export type ZoomProviderProps = {
  children: JSX.Element | JSX.Element[];
  startTimeInitial?: number;
  endTimeInitial?: number;
};

function ZoomProvider(props: ZoomProviderProps) {
  const { children, startTimeInitial, endTimeInitial } = props;
  const { duration, currentTime, mode, pause, setCurrentTime } = usePlayback();
  const [startTime, setStartTime] = useState(startTimeInitial ?? 0);
  const [endTime, setEndTime] = useState(endTimeInitial ?? duration ?? 1);
  const [previousTime, setPreviousTime] = useState(currentTime);

  useEffect(() => {
    if (duration !== null) {
      setStartTime(startTimeInitial ?? 0);
      setEndTime(endTimeInitial ?? duration);
      setCurrentTime(startTimeInitial ?? 0);
    }
  }, [duration, startTimeInitial, endTimeInitial]);

  const zoomedDuration = endTime - startTime;

  const setCenterTime = (centerTime: number) => {
    if (duration === null) return;

    // Calculate half the view width
    const halfZoomedDuration = zoomedDuration / 2;

    // Ensure we don't go out of bounds
    let newStartTime = Math.max(0, centerTime - halfZoomedDuration);
    let newEndTime = Math.min(duration, centerTime + halfZoomedDuration);

    // Adjust if we hit the boundaries
    if (newStartTime <= 0) {
      newEndTime = Math.min(duration, zoomedDuration);
    }
    if (newEndTime >= duration) {
      newStartTime = Math.max(0, duration - zoomedDuration);
    }

    setStartTime(newStartTime);
    setEndTime(newEndTime);
  };

  // Handle time changes (including scrubbing)
  useEffect(() => {
    // Skip if there's no change in time or we're not zoomed
    if (currentTime === previousTime) {
      setPreviousTime(currentTime);
      return;
    }

    // Keep track of time changes for next update
    setPreviousTime(currentTime);

    if (mode === "stop") {
      if (currentTime >= endTime && currentTime <= endTime + 0.1) {
        pause();
        setCurrentTime(startTime);
      } else if (currentTime > endTime + 0.1) {
        const newStartTime = endTime;
        const newEndTime = endTime + zoomedDuration;
        setStartTime(newStartTime);
        setEndTime(newEndTime);
      } else if (currentTime < startTime - 0.1) {
        const newStartTime = startTime - zoomedDuration;
        const newEndTime = startTime;
        setStartTime(newStartTime);
        setEndTime(newEndTime);
      }
    } else if (mode === "loop") {
      if (currentTime >= endTime || currentTime < startTime) {
        // This is a more direct approach - if we're outside bounds, jump immediately
        setCurrentTime(startTime);
      }
    } else if (mode === "page") {
      if (currentTime >= endTime && currentTime <= endTime + 0.1) {
        nextPage();
      } else if (currentTime > endTime + 0.1) {
        const newStartTime = endTime;
        const newEndTime = endTime + zoomedDuration;
        setStartTime(newStartTime);
        setEndTime(newEndTime);
      } else if (currentTime < startTime - 0.1) {
        const newStartTime = startTime - zoomedDuration;
        const newEndTime = startTime;
        setStartTime(newStartTime);
        setEndTime(newEndTime);
      }
    } else if (mode === "scroll") {
      // Keep the playhead centered or when it approaches the edge, scroll with it
      const bufferPercentage = 0.25; // Buffer zone at the edges (25% of view width)
      const bufferWidth = zoomedDuration * bufferPercentage;

      // Check if playhead is approaching right edge
      if (currentTime > endTime - bufferWidth) {
        const offset = Math.min(bufferWidth, currentTime - (endTime - bufferWidth));
        setStartTime(startTime + offset);
        setEndTime(endTime + offset);
      }
      // Check if playhead is approaching left edge
      else if (currentTime < startTime + bufferWidth) {
        const offset = Math.min(bufferWidth, (startTime + bufferWidth) - currentTime);
        setStartTime(Math.max(0, startTime - offset));
        setEndTime(endTime - offset);
      }
    } else if (mode === "scrub") {
      // True scrubbing mode: always keep playhead exactly in the center
      // This creates a completely fixed playhead with the spectrogram scrolling underneath
      if (duration === null) return;

      // Calculate the exact center position for the current zoom level
      const halfZoomedDuration = zoomedDuration / 2;


      // Calculate time values for the view window with playhead at center
      let newStartTime = Math.max(0, currentTime - halfZoomedDuration);
      let newEndTime = Math.min(duration, currentTime + halfZoomedDuration);


      // Handle edge cases when near the beginning or end of the audio
      if (newStartTime <= 0) {
        newStartTime = 0;
        newEndTime = Math.min(duration, zoomedDuration);
      }
      if (newEndTime >= duration) {
        newEndTime = duration;
        newStartTime = Math.max(0, duration - zoomedDuration);
      }

      // Update the view window to keep playhead centered
      setStartTime(newStartTime);
      setEndTime(newEndTime);
    } else if (mode === "continue") {
      // do nothing
    }
  }, [currentTime, mode]);

  const zoomIn = () => {
    if (duration === null) return;

    // Calculate zoom percentage (20% of current view)
    const zoomPercentage = 0.2;

    // Calculate zoom amount from each side
    const zoomAmount = zoomedDuration * zoomPercentage;

    // Calculate where the current time is within the view as a percentage
    const currentTimeRelativePosition = (currentTime - startTime) / zoomedDuration;

    // Apply zoom keeping the current time at the same relative position
    const newStartTime = Math.max(0, startTime + zoomAmount);
    const newEndTime = Math.min(duration, endTime - zoomAmount);

    // Only zoom if we're not already at maximum zoom
    if (newEndTime - newStartTime >= 0.1) { // Prevent zooming in too much
      // Calculate where currentTime should be in the new view
      const newCurrentTimePosition = newStartTime + (newEndTime - newStartTime) * currentTimeRelativePosition;

      // Set the new zoom window
      setStartTime(newStartTime);
      setEndTime(newEndTime);

      // If current time is outside the new view, adjust it
      if (currentTime < newStartTime || currentTime > newEndTime) {
        setCurrentTime(newCurrentTimePosition);
      }
    }
  };

  const zoomOut = () => {
    if (duration === null) return;

    // Calculate zoom percentage (33% of current view for zooming out)
    const zoomPercentage = 1 / 3;

    // Calculate zoom amount to add to each side
    const zoomAmount = zoomedDuration * zoomPercentage;

    // Calculate where the current time is within the view as a percentage
    const currentTimeRelativePosition = (currentTime - startTime) / zoomedDuration;

    // Apply zoom keeping the current time at the same relative position
    const newStartTime = Math.max(0, startTime - zoomAmount);
    const newEndTime = Math.min(duration, endTime + zoomAmount);

    // Set the new zoom window
    setStartTime(newStartTime);
    setEndTime(newEndTime);

    // For zoom out, we don't need to adjust currentTime as it will always be in the wider view
  };

  const nextPage = () => {
    if (duration === null) return;
    const newEndTime = Math.min(duration, endTime + zoomedDuration);
    const newStartTime = Math.max(0, newEndTime - zoomedDuration);
    setStartTime(newStartTime);
    setEndTime(newEndTime);
  };

  const previousPage = () => {
    if (duration === null) return;
    const newStartTime = Math.max(0, startTime - zoomedDuration);
    const newEndTime = Math.min(duration, newStartTime + zoomedDuration);
    setStartTime(newStartTime);
    setEndTime(newEndTime);
  };

  // Add keyboard event handlers for zoom
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if the event target is an input or textarea
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return; // Don't handle hotkeys when typing in input fields
      }

      // Handle plus/equal key (with or without shift for +)
      if (event.key === '+' || event.key === '=' || event.key === 'Equal') {
        zoomIn();
        event.preventDefault();
      }
      // Handle minus/underscore key (with or without shift for -)
      else if (event.key === '-' || event.key === '_' || event.key === 'Minus') {
        zoomOut();
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [duration, startTime, endTime, zoomedDuration, currentTime]); // Include currentTime in dependencies

  const isZoomed = duration !== null && (startTime > 0 || endTime < duration);

  return (
    <ZoomContext.Provider
      value={{
        startTime,
        endTime,
        zoomedDuration,
        isZoomed,
        setStartTime,
        setEndTime,
        setCenterTime,
        zoomIn,
        zoomOut,
      }}
    >
      {children}
    </ZoomContext.Provider>
  );
}

export default ZoomProvider;
