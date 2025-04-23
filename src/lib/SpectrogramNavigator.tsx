import { useRef, useState } from "react";
import { usePlayback } from "@/lib/PlaybackProvider";
import { useTheme } from "@/lib/ThemeProvider";
import { useZoom } from "@/lib/ZoomProvider";
import { ZoomIn, ZoomOut } from "lucide-react";

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

  // Add hover states for buttons
  const [zoomInHover, setZoomInHover] = useState(false);
  const [zoomOutHover, setZoomOutHover] = useState(false);
  const [showControls, setShowControls] = useState(false);

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

  // Define common styles for the icon buttons
  const iconButtonStyle: React.CSSProperties = {
    position: 'absolute',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    cursor: 'pointer',
    background: 'transparent',
    border: 'none',
    color: dark ? 'white' : 'black',
    transition: 'all 0.2s ease',
    zIndex: 10,
    opacity: showControls ? 0.9 : 0.3,
    padding: 0,
  };

  // Position buttons in a vertical column on the left
  const zoomInButtonStyle = {
    ...iconButtonStyle,
    left: '8px',
    top: '8px',
    transform: zoomInHover ? 'scale(1.2)' : 'scale(1)',
    opacity: zoomInHover ? 1 : (showControls ? 0.9 : 0.3),
  };

  const zoomOutButtonStyle = {
    ...iconButtonStyle,
    left: '8px',
    top: '34px',
    transform: zoomOutHover ? 'scale(1.2)' : 'scale(1)',
    opacity: zoomOutHover ? 1 : (showControls ? 0.9 : 0.3),
  };

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    display: "flex",
    flexDirection: "row",
    width: '100%',
  };

  // Add a control container for buttons
  const controlsContainerStyle: React.CSSProperties = {
    position: 'absolute',
    left: '8px',
    top: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    zIndex: 10,
    opacity: showControls ? 0.9 : 0.3,
    transition: 'opacity 0.2s ease',
  };

  return (
    <div
      style={containerStyle}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
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
      <div style={controlsContainerStyle}>
        {/* Zoom In button (top) */}
        <button
          onClick={zoomIn}
          title="Zoom In (+)"
          aria-label="Zoom In (press plus key)"
          style={{
            ...iconButtonStyle,
            position: 'static',
            transform: zoomInHover ? 'scale(1.2)' : 'scale(1)',
            opacity: zoomInHover ? 1 : 0.9,
          }}
          onMouseEnter={() => setZoomInHover(true)}
          onMouseLeave={() => setZoomInHover(false)}
        >
          <ZoomIn size={14} strokeWidth={2} />
        </button>

        {/* Zoom Out button (bottom) */}
        <button
          onClick={zoomOut}
          title="Zoom Out (-)"
          aria-label="Zoom Out (press minus key)"
          style={{
            ...iconButtonStyle,
            position: 'static',
            transform: zoomOutHover ? 'scale(1.2)' : 'scale(1)',
            opacity: zoomOutHover ? 1 : 0.9,
          }}
          onMouseEnter={() => setZoomOutHover(true)}
          onMouseLeave={() => setZoomOutHover(false)}
        >
          <ZoomOut size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

export default SpectrogramNavigator;
