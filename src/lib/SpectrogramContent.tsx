import { useRef, useEffect, useState } from "react";
import { usePlayback } from "@/lib/PlaybackProvider";
import { useZoom } from "@/lib/ZoomProvider";

interface SpectrogramContentProps {
  dataURL: string;
  playheadColor?: string;
  playheadWidth?: number;
  height?: number;
  sampleRate?: number;
}

function SpectrogramContent(props: SpectrogramContentProps) {
  const { dataURL, playheadColor, playheadWidth, sampleRate } = props;
  const playheadRef = useRef<SVGLineElement>(null);
  const [displayTime, setDisplayTime] = useState(0);
  const prevTimeRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);

  const { duration, currentTime, mode } = usePlayback();
  const { zoomedDuration, startTime, endTime } = useZoom();

  useEffect(() => {
    // Detect when we're looping back to start in loop mode
    const isLooping = mode === "loop" && prevTimeRef.current > (endTime - 0.2) && currentTime < startTime + 0.2;

    if (isLooping) {
      // Skip animation for loop transitions
      setDisplayTime(currentTime);
    } else {
      // For normal playback, use smooth animation
      setDisplayTime(currentTime);
    }

    prevTimeRef.current = currentTime;

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [currentTime, startTime, endTime, mode]);

  if (!duration) {
    return null;
  }

  // Calculate playhead width based on the zoom level
  const adaptivePlayheadWidth = (playheadWidth || 0.001) * zoomedDuration;
  // Cap the width to a reasonable value to avoid it becoming too thick when zoomed in a lot
  const finalPlayheadWidth = Math.min(adaptivePlayheadWidth, 3);

  return (
    <>
      <image
        width={duration}
        height={100}
        x={0}
        y={0}
        href={dataURL}
        preserveAspectRatio="none"
        pointerEvents="none"
      />
      <line
        ref={playheadRef}
        stroke={playheadColor || "red"}
        strokeWidth={finalPlayheadWidth}
        x1={displayTime}
        x2={displayTime}
        y1={0}
        y2={100}
      />
    </>
  );
}

export default SpectrogramContent;
