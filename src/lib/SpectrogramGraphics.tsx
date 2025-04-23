import { useRef, useEffect, useState, Children, useMemo } from "react";
import createColorMap from "colormap";
import SpectrogramViewer from "@/lib/SpectrogramViewer";
import SpectrogramNavigator from "@/lib/SpectrogramNavigator";
import SpectrogramContent from "@/lib/SpectrogramContent";
import ZoomProvider from "@/lib/ZoomProvider";
import SpectrogramAnnotations from "@/lib/SpectogramAnnotations";
import { Annotations } from "@/lib/Annotation";
import { usePlayback } from "@/lib/PlaybackProvider";
import { useTheme } from "@/lib/ThemeProvider";
import init, { mel_spectrogram_db } from "rust-melspec-wasm";
import { useSuspenseQuery } from "@tanstack/react-query";
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

function max(arr: Float32Array[]) {
  let maxVal = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    const rowMax = Math.max(...arr[i]);
    maxVal = Math.max(maxVal, rowMax);
  }
  return maxVal;
}

function min(arr: Float32Array[]) {
  let minVal = Infinity;
  for (let i = 0; i < arr.length; i++) {
    const rowMin = Math.min(...arr[i]);
    minVal = Math.min(minVal, rowMin);
  }
  return minVal;
}

function getImageData(spec: Float32Array[], transparent: boolean, colormap: string) {
  const colors = createColorMap({
    colormap: colormap,
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

  return imageData;
}

/**
 * Convert ImageData to dataURL using an in-memory canvas
 */
function imageDataToDataURL(imageData: ImageData): string {
  const canvas = document.createElement('canvas');
  console.log("imageData", imageData);
  canvas.width = imageData.width;
  canvas.height = imageData.height;



  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
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

  const { audioSamples, sampleRate, audioSrc } = usePlayback();
  const { dark } = useTheme();

  const hasAudioData = !!audioSamples && audioSamples.length > 0;
  const queryKey = useMemo(() => `spectrogram-${audioSrc}-${n_fft}-${win_length}-${audioSamples.length}-${hop_length}-${f_min}-${f_max}-${n_mels}-${top_db}-${colormap}`, [audioSrc, n_fft, win_length, audioSamples.length, hop_length, f_min, f_max, n_mels, top_db, colormap]);

  const { data: processedData, isLoading } = useSuspenseQuery({
    queryKey: [queryKey],
    queryFn: async () => {
      log("queryKey", queryKey.toString());
      log("queryFn", "Starting spectrogram data processing");
      const queryStart = performance.now();

      let spec: Float32Array[];

      if (spectrogramData !== undefined) {
        log("queryFn", "Using provided spectrogramData");
        spec = spectrogramData[0].map(
          (_, colIndex) => new Float32Array(spectrogramData.map((row) => row[colIndex]))
        );
      }
      else {
        if (!audioSamples || audioSamples.length === 0) {
          log("queryFn", "No audio samples available");
          return null;
        }

        log("queryFn", "Initializing WASM and computing spectrogram");
        try {
          await init();

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

      // Generate image data from spectrogram
      const imageData = getImageData(spec, transparent, colormap);

      // Generate dataURL directly in the query function
      const dataURL = imageDataToDataURL(imageData);

      const queryEnd = performance.now();
      log("queryFn", `Total processing time: ${(queryEnd - queryStart).toFixed(2)}ms`);

      return {
        spec,
        imageData,
        dataURL,

      };
    },

  });



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



  if (!hasAudioData && !spectrogramData) {
    return noAudioContent;
  }

  if (isLoading || !processedData?.dataURL) {
    return loadingContent;
  }


  return (
    <ZoomProvider startTimeInitial={startTimeInitial} endTimeInitial={endTimeInitial}>
      <>
        <SpectrogramViewer height={specHeight}>
          <SpectrogramContent
            dataURL={processedData?.dataURL}
            playheadColor={playheadColor}
            playheadWidth={playheadWidth}

          />
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
            <SpectrogramContent
              dataURL={processedData?.dataURL}
              playheadColor={playheadColor}
              playheadWidth={playheadWidth}
            />
          </SpectrogramNavigator>
        )}
      </>
    </ZoomProvider>
  );
}

export default SpectrogramGraphics;
