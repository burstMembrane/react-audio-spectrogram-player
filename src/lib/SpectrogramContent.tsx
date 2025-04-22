import { useRef } from "react";
import { usePlayback } from "./PlaybackProvider";
import { useZoom } from "./ZoomProvider";

interface SpectrogramContentProps {
  dataURL: string;
  playheadColor?: string;
  playheadWidth?: number;
}

function SpectrogramContent(props: SpectrogramContentProps) {
  const { dataURL, playheadColor, playheadWidth } = props;
  const playheadRef = useRef<SVGLineElement>(null);

  const { duration, currentTime } = usePlayback();
  const { zoomedDuration } = useZoom();

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
        x1={currentTime}
        x2={currentTime}
        y1={0}
        y2={100}
      />
    </>
  );
}

export default SpectrogramContent;
