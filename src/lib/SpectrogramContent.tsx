import { useRef, useEffect, useState } from "react";
import { usePlayback } from "@/lib/PlaybackProvider";
import { useZoom } from "@/lib/ZoomProvider";

interface SpectrogramContentProps {
  dataURL: string;
  playheadColor?: string;
  playheadWidth?: number;
  height?: number;
}

function SpectrogramContent(props: SpectrogramContentProps) {
  const { dataURL, playheadColor, playheadWidth } = props;
  const playheadRef = useRef<SVGLineElement>(null);
  const [displayTime, setDisplayTime] = useState(0);
  const prevTimeRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);

  const { duration, currentTime, isPlaying } = usePlayback();
  const { zoomedDuration } = useZoom();


  useEffect(() => {
    setDisplayTime(currentTime);
    prevTimeRef.current = currentTime;
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [currentTime]);

  if (!duration) {
    return null;
  }

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
        strokeWidth={(playheadWidth || 0.0010) * zoomedDuration}
        x1={displayTime}
        x2={displayTime}
        y1={0}
        y2={100}
      />
    </>
  );
}

export default SpectrogramContent;
