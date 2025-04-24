import { Children, useEffect, useMemo, useRef } from "react";
import createColorMap from "colormap";
import SpectrogramViewer from "@/lib/SpectrogramViewer";
import SpectrogramNavigator from "@/lib/SpectrogramNavigator";
import SpectrogramContent from "@/lib/SpectrogramContent";
import ZoomProvider from "@/lib/ZoomProvider";
import SpectrogramAnnotations from "@/lib/SpectogramAnnotations";
import { Annotations } from "@/lib/Annotation";
import { usePlayback } from "@/lib/PlaybackProvider";
import { useSuspenseQuery } from "@tanstack/react-query";
import { getWorkerManager } from "@/lib/worker-manager";


// Performance logging function
const log = (func: string, msg: string) => {
  console.log(`[SpectrogramGraphics] ${func}: ${msg}`);
};
// Only chunk if audio is large
const SEGMENT_DURATION = 30; // 30 seconds threshold
const MAX_CONCURRENT = Math.min(4, navigator.hardwareConcurrency || 4); // Adjust based on hardware capabilities
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

// Helper function to convert blob to dataURL
function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Helper to convert dataURL to Blob
function dataURLToBlob(dataURL: string): Promise<Blob> {
  return fetch(dataURL).then(res => res.blob());
}

// Check if OffscreenCanvas is supported
const isOffscreenCanvasSupported = typeof OffscreenCanvas !== 'undefined';

// Convert ImageData to dataURL using an in-memory canvas or OffscreenCanvas
async function imageDataToDataURL(imageData: ImageData): Promise<string> {
  if (isOffscreenCanvasSupported) {
    const offscreen = new OffscreenCanvas(imageData.width, imageData.height);
    const offCtx = offscreen.getContext('2d');

    if (!offCtx) {
      throw new Error("Failed to get offscreen canvas context");
    }

    offCtx.putImageData(imageData, 0, 0);
    const blob = await offscreen.convertToBlob({ type: 'image/png' });
    return await blobToDataURL(blob);
  } else {
    // Fallback to regular canvas
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error("Failed to get canvas context");
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL();
  }
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
  const hasAudioData = !!audioSamples && audioSamples.length > 0;
  const queryKey = useMemo(() => `spectrogram-${audioSrc}-${n_fft}-${win_length}-${audioSamples?.length ?? 0}-${hop_length}-${f_min}-${f_max}-${n_mels}-${top_db}-${colormap}`, [audioSrc, n_fft, win_length, audioSamples?.length, hop_length, f_min, f_max, n_mels, top_db, colormap]);

  // Initialize worker manager
  const workerManagerRef = useRef(getWorkerManager());

  // Set up logging from workers
  useEffect(() => {
    workerManagerRef.current.setLogCallback(log);

    // No cleanup needed - the worker manager is a singleton
  }, []);

  const { data: processedData, isLoading } = useSuspenseQuery({
    queryKey: [queryKey],
    queryFn: async () => {
      // Skip processing if no audio data
      if (!audioSamples || audioSamples.length === 0) {
        return null;
      }

      let monoAudioSamples: Float32Array;
      // if audioSamples is stereo, we want to process the mean of the two channels
      if (Array.isArray(audioSamples) && audioSamples.length === 2) {
        // For stereo, convert to mono by averaging the channels
        const leftChannel = audioSamples[0];
        const rightChannel = audioSamples[1];
        const length = leftChannel.length;

        monoAudioSamples = new Float32Array(length);
        // mean
        for (let i = 0; i < length; i++) {
          monoAudioSamples[i] = (leftChannel[i] + rightChannel[i]) / 2;
        }
      } else {
        // If it's already mono, just use as is
        monoAudioSamples = audioSamples as Float32Array;
      }

      const isReady = await workerManagerRef.current.waitForReady();
      log("queryFn", `Worker ready: ${isReady}`);
      if (!isReady) {
        log("queryFn", "Workers failed to initialize");
        return null;
      }

      // Determine if we need chunking
      const samplesPerSecond = sampleRate;
      const shouldChunk = monoAudioSamples.length > SEGMENT_DURATION * samplesPerSecond;

      // Prepare parameters object for workers
      const params = {
        n_fft,
        win_length,
        hop_length,
        f_min,
        f_max,
        n_mels,
        top_db,
        colormap,
        transparent
      };

      if (!shouldChunk) {
        // Process entire audio sample at once for small files
        log("queryFn", "Processing audio in a single worker");
        try {
          // Create a copy of the audioSamples to prevent transfer issues
          const samplesCopy = new Float32Array(monoAudioSamples);

          const result = await workerManagerRef.current.processChunk(
            samplesCopy,
            sampleRate,
            params,
            spectrogramData
          );

          if (!result?.imageData) {
            return null;
          }

          // Convert image data to dataURL
          const dataURL = await imageDataToDataURL(result.imageData);
          return { dataURL };
        } catch (error) {
          log("queryFn", `Error processing audio: ${error}`);
          return null;
        }
      }

      // For large files, process in chunks
      log("queryFn", "Audio file is large, processing in chunks");
      const chunkSize = Math.floor(SEGMENT_DURATION * samplesPerSecond);
      const chunks = [];

      for (let i = 0; i < monoAudioSamples.length; i += chunkSize) {
        chunks.push(monoAudioSamples.slice(i, Math.min(i + chunkSize, monoAudioSamples.length)));
      }

      log("queryFn", `Split audio into ${chunks.length} chunks`);

      const chunkResults = [];

      for (let i = 0; i < chunks.length; i += MAX_CONCURRENT) {
        const batch = chunks.slice(i, i + MAX_CONCURRENT);
        const batchPromises = batch.map((chunk, idx) => {
          log("queryFn", `Processing chunk ${i + idx + 1}/${chunks.length}`);

          // Create a copy to prevent transfer issues with reused data
          const chunkCopy = new Float32Array(chunk);

          return workerManagerRef.current.processChunk(
            chunkCopy,
            sampleRate,
            params
          );
        });

        const batchResults = await Promise.all(batchPromises);
        chunkResults.push(...batchResults.filter(Boolean));
      }

      if (chunkResults.length === 0) {
        log("queryFn", "No chunks were successfully processed");
        return null;
      }

      // Calculate dimensions of the final stitched image
      const totalWidth = chunkResults.reduce((sum, result) => sum + result.width, 0);
      const height = chunkResults[0].height;

      log("queryFn", `Stitching ${chunkResults.length} images with total width ${totalWidth}`);

      // Use OffscreenCanvas for stitching if available
      if (isOffscreenCanvasSupported) {
        try {
          // Create offscreen canvas for stitching
          const offscreen = new OffscreenCanvas(totalWidth, height);
          const offCtx = offscreen.getContext('2d');

          if (!offCtx) {
            throw new Error("Failed to get offscreen canvas context for stitching");
          }

          // Create temporary canvases for each chunk result
          let xOffset = 0;
          for (const result of chunkResults) {
            const tempCanvas = new OffscreenCanvas(result.width, result.height);
            const tempCtx = tempCanvas.getContext('2d');

            if (!tempCtx) {
              throw new Error("Failed to get temp canvas context");
            }

            tempCtx.putImageData(result.imageData, 0, 0);
            offCtx.drawImage(tempCanvas, xOffset, 0);
            xOffset += result.width;
          }

          // Convert final stitched image to dataURL
          const blob = await offscreen.convertToBlob({ type: 'image/png' });
          const stitchedDataURL = await blobToDataURL(blob);

          log("queryFn", "Successfully stitched spectrogram chunks using OffscreenCanvas");
          return { dataURL: stitchedDataURL };
        } catch (error) {
          log("queryFn", `Error using OffscreenCanvas for stitching: ${error}`);
          // Fall back to regular canvas stitching
        }
      }

      // Fallback: stitch using regular canvas
      const canvas = document.createElement('canvas');
      canvas.width = totalWidth;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error("Failed to get canvas context");
      }

      // Draw each image onto the canvas
      let xOffset = 0;
      for (const result of chunkResults) {
        // Create a temp canvas for each chunk
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = result.width;
        tempCanvas.height = result.height;
        const tempCtx = tempCanvas.getContext('2d');

        if (!tempCtx) {
          throw new Error("Failed to get temp canvas context");
        }

        tempCtx.putImageData(result.imageData, 0, 0);
        ctx.drawImage(tempCanvas, xOffset, 0);
        xOffset += result.width;
      }

      // Get the final stitched dataURL
      const stitchedDataURL = canvas.toDataURL();

      log("queryFn", "Successfully stitched spectrogram chunks using regular Canvas");

      return { dataURL: stitchedDataURL };
    },
  });

  if ((!hasAudioData && !spectrogramData) || isLoading || !processedData?.dataURL) {
    return null;
  }

  return (
    <ZoomProvider startTimeInitial={startTimeInitial} endTimeInitial={endTimeInitial}>
      <>
        <SpectrogramViewer height={specHeight}>
          <SpectrogramContent
            dataURL={processedData.dataURL}
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
              sampleRate={sampleRate}
              dataURL={processedData.dataURL}
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
