import { useRef, useState } from "react";
import { usePlayback } from "./PlaybackProvider";
import { useTheme } from "./ThemeProvider";
import { useZoom } from "./ZoomProvider";

interface SpectrogramNavigatorProps {
  children: JSX.Element;
  height: number;
}

const MINIMUM_ZOOM_WINDOW_DURATION = 0.01;

function SpectrogramNavigator(props: SpectrogramNavigatorProps) {
  const { children, height } = props;
  const { duration, setCurrentTime } = usePlayback();
  const {
    startTime,
    endTime,
    zoomedDuration,
    isZoomed,
    setStartTime,
    setEndTime,
    zoomIn,
    zoomOut,
    setCenterTime,
  } = useZoom();
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const { dark } = useTheme();
  const theme = dark ? "dark" : "light";

  const draggingToZoom = !isZoomed && dragStart && dragEnd;
  const draggingToPan = isZoomed && dragStart;

  const getPointerCoordinate = (
    e: React.MouseEvent<SVGSVGElement, MouseEvent>,
  ) => {
    const boundingClientRect = svgRef.current?.getBoundingClientRect();
    if (boundingClientRect && duration) {
      const { left, right } = boundingClientRect;
      let newTime = (duration * (e.clientX - left)) / (right - left);
      return newTime;
    }
    return null;
  };

  const onPointerDown = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    setDragStart(getPointerCoordinate(e));
  };

  const onPointerMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    const newDragEnd = getPointerCoordinate(e);
    setDragEnd(newDragEnd);
    if (newDragEnd) {
      if (draggingToPan && duration) {
        const newCenterTime = Math.min(
          Math.max(zoomedDuration / 2, newDragEnd),
          duration - zoomedDuration / 2,
        );
        setCenterTime(newCenterTime);
        setCurrentTime(newCenterTime - zoomedDuration / 2);
      }
    }
  };

  const onPointerUp = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (draggingToZoom && duration) {
      if (dragEnd - dragStart >= MINIMUM_ZOOM_WINDOW_DURATION) {
        setStartTime(dragStart);
        setEndTime(dragEnd);
        setCurrentTime(dragStart);
      } else {
        setStartTime(0);
        setEndTime(duration);
        setCurrentTime(0);
      }
    }
    setDragStart(null);
    setDragEnd(null);
  };

  const placeholder_svg = <svg width="100%" height={height} />;

  return (
    <div style={{ display: "flex", flexDirection: "row", gap: 5 }}>
      <button className={theme} onClick={zoomOut} title="Zoom Out (-)" aria-label="Zoom Out (press minus key)">
        Zoom Out
      </button>
      {duration ? (
        <svg
          ref={svgRef}
          width="100%"
          height={height}
          viewBox={`0,0,${duration},100`}
          cursor={isZoomed ? "grabbing" : "zoom-in"}
          preserveAspectRatio="none"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerMove={onPointerMove}
        >
          {children}
          <rect
            x={0}
            width={startTime}
            y="0"
            height="100"
            style={{ fill: "white", opacity: 0.5 }}
          />
          <rect
            x={endTime}
            width={duration - endTime}
            y="0"
            height="100"
            style={{ fill: "white", opacity: 0.5 }}
          />
          {draggingToZoom && dragEnd > dragStart && (
            <rect
              x={dragStart}
              width={dragEnd - dragStart}
              y="0"
              height="100"
              style={{ fill: "red", opacity: 0.5 }}
            />
          )}
        </svg>
      ) : (
        placeholder_svg
      )}
      <button
        className={theme}
        style={{ fontFamily: "monospace" }}
        onClick={zoomIn}
        title="Zoom In (+)"
        aria-label="Zoom In (press plus key)"
      >
        Zoom In
      </button>
    </div>
  );
}

export default SpectrogramNavigator;
