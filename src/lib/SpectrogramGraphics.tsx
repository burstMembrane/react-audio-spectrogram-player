import { useRef, useEffect, useState, Children, useMemo } from "react";
import createColorMap from "colormap";
import SpectrogramViewer from "./SpectrogramViewer";
import SpectrogramNavigator from "./SpectrogramNavigator";
import SpectrogramContent from "./SpectrogramContent";
import ZoomProvider from "./ZoomProvider";
import SpectrogramAnnotations from "./SpectogramAnnotations";
import { Annotations } from "./Annotation";
import { usePlayback } from "./PlaybackProvider";
import { useTheme } from "./ThemeProvider";
import init, { mel_spectrogram_db } from "rust-melspec-wasm";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

// Performance logging function
const log = (func: string, msg: string) => {
  console.log(`[SpectrogramGraphics] ${func}: ${msg}`);
};


interface SpectrogramGraphicsProps {
  spectrogramData?: number[][];
  n_fft?: number;
  win_length?: number;
  hop_length?: number;
  f_min?: number;
  f_max?: number;
  n_mels?: number;
  top_db?: number;
  annotations?: Annotations[];
  navigator: boolean;
  startTimeInitial?: number;
  endTimeInitial?: number;
  specHeight: number;
  navHeight?: number;
  colormap: string;
  transparent: boolean;
  playheadColor?: string;
  playheadWidth?: number;
}

// Helper function to find max value in array
function max(arr: Float32Array[]) {
  let maxVal = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    const rowMax = Math.max(...arr[i]);
    maxVal = Math.max(maxVal, rowMax);
  }
  return maxVal;
}

// Helper function to find min value in array
function min(arr: Float32Array[]) {
  let minVal = Infinity;
  for (let i = 0; i < arr.length; i++) {
    const rowMin = Math.min(...arr[i]);
    minVal = Math.min(minVal, rowMin);
  }
  return minVal;
}

function SpectrogramGraphics(props: SpectrogramGraphicsProps) {
  const {
    spectrogramData = undefined,
    n_fft = 1024,
    win_length = 400,
    hop_length = 160,
    f_min = 0.0,
    f_max = 8000.0,
    n_mels = 128,
    top_db = 80,
    annotations = [],
    navigator = false,
    startTimeInitial = undefined,
    endTimeInitial = undefined,
    specHeight = 200,
    navHeight = 50,
    colormap = "viridis",
    transparent = false,
    playheadColor = "red",
    playheadWidth = 0.005,
  } = props;



  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dataURL, setDataURL] = useState<string>("");
  const { audioSamples, sampleRate, audioSrc } = usePlayback();
  const { dark } = useTheme();



  // Check if we have audio data
  const hasAudioData = true



  const { data: processedData, isLoading } = useQuery({
    queryKey: ['spectrogram', audioSrc, audioSamples?.length],
    queryFn: async () => {
      log("queryFn", "Starting spectrogram data processing");
      const queryStart = performance.now();

      let spec: Float32Array[];
      if (!audioSamples || audioSamples.length === 0) {
        log("queryFn", "No audio samples available");
        return null;
      }

      // Use provided spectrogramData if available
      if (spectrogramData !== undefined) {
        log("queryFn", "Using provided spectrogramData");
        spec = spectrogramData[0].map(
          (_, colIndex) => new Float32Array(spectrogramData.map((row) => row[colIndex]))
        );
      }
      // Otherwise generate from audio samples
      else {
        if (!audioSamples || audioSamples.length === 0) {
          log("queryFn", "No audio samples available");
          return null;
        }

        // Initialize WASM if needed
        log("queryFn", "Initializing WASM and computing spectrogram");
        try {
          // Load WASM inside the query function
          await init();

          // Generate mel spectrogram
          spec = mel_spectrogram_db(
            sampleRate,
            audioSamples,
            n_fft,
            win_length,
            hop_length,
            f_min,
            f_max,
            n_mels,
            top_db
          );

          log("queryFn", `Mel spectrogram computed successfully with ${spec.length} frames`);
        } catch (error) {
          log("queryFn", `Error computing spectrogram: ${error}`);
          console.error("Error computing spectrogram:", error);
          throw error;
        }
      }

      // Process the image data
      log("queryFn", "Processing image data");
      const colors = createColorMap({
        colormap,
        nshades: 256,
        format: "rgba",
        alpha: 255,
      });

      const smax = max(spec);
      const smin = min(spec);

      const imageData = new ImageData(spec.length, spec[0].length);

      for (let j = spec[0].length - 1; j >= 0; j--) {
        for (let i = spec.length - 1; i >= 0; i--) {
          const num = Math.floor((255 * (spec[i][j] - smin)) / (smax - smin));
          const redIndex = ((spec[0].length - 1 - j) * spec.length + i) * 4;
          imageData.data[redIndex] = colors[num][0];
          imageData.data[redIndex + 1] = colors[num][1];
          imageData.data[redIndex + 2] = colors[num][2];
          imageData.data[redIndex + 3] = transparent ? num : 255;
        }
      }

      const queryEnd = performance.now();
      log("queryFn", `Total processing time: ${(queryEnd - queryStart).toFixed(2)}ms`);

      return {
        spec,
        imageData
      };
    },
    enabled: true,


  });

  // Draw the spectrogram image to canvas when data is available
  useEffect(() => {
    if (!processedData) return;

    log("drawCanvas", "Drawing spectrogram to canvas");
    const drawStart = performance.now();

    // Draw to canvas
    if (!canvasRef.current) return;

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    canvasRef.current.width = processedData.imageData.width;
    canvasRef.current.height = processedData.imageData.height;

    ctx.putImageData(processedData.imageData, 0, 0);
    const newDataUrl = canvasRef.current.toDataURL();

    // Update state
    setDataURL(newDataUrl);

    const drawEnd = performance.now();
    log("drawCanvas", `Canvas drawing completed in ${(drawEnd - drawStart).toFixed(2)}ms`);
  }, [processedData]);

  // Create a simple loading placeholder
  const loadingContent = (
    <div
      style={{
        width: "100%",
        height: specHeight,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: dark ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.2)',
        color: dark ? 'white' : 'black',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
      }}
    >
      <Loader2 style={{ width: 20, height: 20 }} />
      <span style={{ marginLeft: 10 }}>Computing spectrogram...</span>
    </div>
  );

  // No audio content placeholder
  const noAudioContent = (
    <div
      style={{
        width: "100%",
        height: specHeight,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: dark ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)',
        color: dark ? 'white' : 'black',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
      }}
    >
      <span>No audio data available</span>
    </div>
  );

  const spectrogramContent = <SpectrogramContent dataURL={dataURL} playheadColor={playheadColor} playheadWidth={playheadWidth} />;

  if (!hasAudioData && !spectrogramData) {
    return (
      <>
        {noAudioContent}
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        {loadingContent}
      </>
    );
  }

  return (
    <>
      <canvas hidden ref={canvasRef} />
      <ZoomProvider startTimeInitial={startTimeInitial} endTimeInitial={endTimeInitial}>
        <>
          <SpectrogramViewer height={specHeight}>
            {spectrogramContent}
          </SpectrogramViewer>
          {Children.toArray(
            annotations?.map(({ title, data, height, strokeWidth }) => (
              <SpectrogramAnnotations
                title={title}
                height={height}
                data={data}
                strokeWidth={strokeWidth}
              />
            ))
          )}
          {navigator && (
            <SpectrogramNavigator height={navHeight}>
              {spectrogramContent}
            </SpectrogramNavigator>
          )}
        </>
      </ZoomProvider>
    </>
  );
}

export default SpectrogramGraphics;
