import { useRef, useState } from "react";
import { usePlayback } from "@/lib/PlaybackProvider";
import { useTheme } from "@/lib/ThemeProvider";
import { useZoom } from "@/lib/ZoomProvider";
import { ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const { theme } = useTheme();


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
    <div
      className="relative flex w-full"

    >
      {duration ? (
        <svg
          ref={svgRef}
          width="100%"
          height={height}
          viewBox={`0,0,${duration},100`}

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
            style={{ fill: "white", opacity: 0.2 }}
          />
          <rect
            x={endTime}
            width={duration - endTime}
            y="0"
            height="100"
            style={{ fill: "white", opacity: 0.2 }}
          />
          {draggingToZoom && dragEnd > dragStart && (
            <rect
              x={dragStart}
              width={dragEnd - dragStart}
              y="0"
              height="100"
              style={{ fill: "white", opacity: 0.2 }}
            />
          )}
        </svg>
      ) : (
        placeholder_svg
      )}

      {/* Controls container with buttons in a column */}
      <div className={cn(
        "absolute left-2 top-2 flex flex-col gap-1 z-10 transition-opacity duration-200",
      )}>
        {/* Zoom In button */}
        <button
          onClick={zoomIn}
          title="Zoom In (+)"
          aria-label="Zoom In (press plus key)"
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md bg-transparent border-none",
            "cursor-pointer transition-all duration-200 p-0",
            theme === 'dark' ? "text-white" : "text-black",
          )}

        >
          <ZoomIn size={14} strokeWidth={2} />
        </button>

        {/* Zoom Out button */}
        <button
          onClick={zoomOut}
          title="Zoom Out (-)"
          aria-label="Zoom Out (press minus key)"
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md bg-transparent border-none",
            "cursor-pointer transition-all duration-200 p-0",
            theme === 'dark' ? "text-white" : "text-black",
          )}
        >
          <ZoomOut size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

export default SpectrogramNavigator;
