import { Children, useEffect, useMemo } from "react";
import createColorMap from "colormap";
import SpectrogramViewer from "@/lib/SpectrogramViewer";
import SpectrogramNavigator from "@/lib/SpectrogramNavigator";
import SpectrogramContent from "@/lib/SpectrogramContent";
import ZoomProvider from "@/lib/ZoomProvider";
import SpectrogramAnnotations from "@/lib/SpectogramAnnotations";
import { Annotations } from "@/lib/Annotation";
import { usePlayback } from "@/lib/PlaybackProvider";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Colormap } from "@/lib/types";
import { createWorkerFactory, useWorker } from '@shopify/react-web-worker';
// Performance logging function
const log = (func: string, msg: string) => {
  console.log(`[SpectrogramGraphics] ${func}: ${msg}`);
};
// Only chunk if audio is large
const SEGMENT_DURATION = 10; // 10 seconds threshold
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
  colormap: Colormap;
  transparent: boolean;
  playheadColor?: string;
  playheadWidth?: number;
}

const createWorker = createWorkerFactory(() => import('./spectrogram-worker'));


// Helper function to convert blob to dataURL
function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Check if OffscreenCanvas is supported
const isOffscreenCanvasSupported = typeof OffscreenCanvas !== 'undefined';

// Convert ImageData to dataURL using an in-memory canvas or OffscreenCanvas
async function imageDataToDataURL(imageData: ImageData): Promise<string> {
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

  const worker = useWorker(createWorker);



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

      log("queryFn", "Starting spectrogram processing");

      // Prepare parameters object for worker
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

      // Determine if we need chunking
      const samplesPerSecond = sampleRate;
      const shouldChunk = monoAudioSamples.length > SEGMENT_DURATION * samplesPerSecond;

      if (!shouldChunk) {
        // Process entire audio sample at once for small files
        log("queryFn", "Processing audio in a single worker");
        try {
          // Create a copy of the audioSamples to prevent transfer issues
          const samplesCopy = new Float32Array(monoAudioSamples);

          const result = await worker.processSpectrogram(
            undefined,
            samplesCopy,
            sampleRate,
            params,

          );

          if (!result?.imageData) {
            return null;
          }
          // convert from ArrayBuffer to ImageData

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

          return worker.processSpectrogram(
            undefined,
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
      const totalWidth = chunkResults.reduce((sum, result) => sum + (result?.width || 0), 0);
      if (!chunkResults[0]?.height) {
        log("queryFn", "No height found in chunk results");
        return null;
      }
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
            if (!result) {
              log("queryFn", "Skipping null result");
              continue;
            }
            const tempCanvas = new OffscreenCanvas(result.width, result.height);
            const tempCtx = tempCanvas.getContext('2d');

            if (!tempCtx) {
              throw new Error("Failed to get temp canvas context");
            }

            // Ensure we have a 2D context
            if (!(tempCtx instanceof OffscreenCanvasRenderingContext2D)) {
              throw new Error("Failed to get 2D context for temp canvas");
            }

            tempCtx.putImageData(result.imageData, 0, 0);

            // Ensure we have a 2D context for the main canvas
            if (!(offCtx instanceof OffscreenCanvasRenderingContext2D)) {
              throw new Error("Failed to get 2D context for offscreen canvas");
            }

            offCtx.drawImage(tempCanvas, xOffset, 0);
            xOffset += result.width;
          }

          // Convert final stitched image to dataURL
          // Check if convertToBlob is available
          if (!('convertToBlob' in offscreen)) {
            throw new Error("convertToBlob not supported in this environment");
          }
          // fix is of type unknown
          const convertToBlob = offscreen.convertToBlob as (options?: { type?: string }) => Promise<Blob>;
          const blob = await convertToBlob({ type: 'image/png' });
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
        if (!result) {
          log("queryFn", "Skipping null result");
          continue;
        }
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

  if ((!hasAudioData) || isLoading || !processedData?.dataURL) {
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
