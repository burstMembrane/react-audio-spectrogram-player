import { Children, useMemo } from "react";
import createColorMap from "colormap";
import SpectrogramViewer from "@/lib/SpectrogramViewer";
import SpectrogramNavigator from "@/lib/SpectrogramNavigator";
import SpectrogramContent from "@/lib/SpectrogramContent";
import ZoomProvider from "@/lib/ZoomProvider";
import SpectrogramAnnotations from "@/lib/SpectogramAnnotations";
import { Annotations } from "@/lib/Annotation";
import { usePlayback } from "@/lib/PlaybackProvider";
import init, { mel_spectrogram_db } from "rust-melspec-wasm";
import { useSuspenseQuery } from "@tanstack/react-query";


// Performance logging function
const log = (func: string, msg: string) => {
  console.log(`[SpectrogramGraphics] ${func}: ${msg}`);
};
// Only chunk if audio is large
const SEGMENT_DURATION = 30; // 30 seconds threshold
const MAX_CONCURRENT = 4; // Adjust based on hardware capabilities
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

// Enhanced createSpectrogram with OffscreenCanvas support
const createSpectrogram = async (
  spectrogramData: number[][] | undefined,
  audioSamples: Float32Array,
  sampleRate: number,
  n_fft: number,
  win_length: number,
  hop_length: number,
  f_min: number,
  f_max: number,
  n_mels: number,
  top_db: number,
  colormap: string,
  transparent: boolean
) => {
  log("createSpectrogram", "Starting spectrogram data processing");
  const queryStart = performance.now();

  let spec: Float32Array[];

  if (spectrogramData !== undefined) {
    log("createSpectrogram", "Using provided spectrogramData");
    spec = spectrogramData[0].map(
      (_, colIndex) => new Float32Array(spectrogramData.map((row) => row[colIndex]))
    );
  }
  else {
    if (!audioSamples || audioSamples.length === 0) {
      log("createSpectrogram", "No audio samples available");
      return null;
    }
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
      log("createSpectrogram", `Mel spectrogram computed successfully with ${spec.length} frames`);
    } catch (error) {
      log("createSpectrogram", `Error computing spectrogram: ${error}`);
      console.error("Error computing spectrogram:", error);
      throw error;
    }
  }

  // Generate image data from spectrogram
  const imageData = getImageData(spec, transparent, colormap);

  let dataURL;
  let width = imageData.width;
  let height = imageData.height;

  // Use OffscreenCanvas if available for better performance
  if (isOffscreenCanvasSupported) {
    const offscreen = new OffscreenCanvas(width, height);
    const offCtx = offscreen.getContext('2d');

    if (!offCtx) {
      throw new Error("Failed to get offscreen canvas context");
    }

    offCtx.putImageData(imageData, 0, 0);

    // Convert to blob and then to dataURL
    const blob = await offscreen.convertToBlob({ type: 'image/png' });
    dataURL = await blobToDataURL(blob);
  } else {
    // Fallback to regular canvas for browsers without OffscreenCanvas
    dataURL = imageDataToDataURL(imageData);
  }

  const queryEnd = performance.now();
  log("createSpectrogram", `Total processing time: ${(queryEnd - queryStart).toFixed(2)}ms`);

  return { dataURL, width, height };
};

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
  const queryKey = useMemo(() => `spectrogram-${audioSrc}-${n_fft}-${win_length}-${audioSamples.length}-${hop_length}-${f_min}-${f_max}-${n_mels}-${top_db}-${colormap}`, [audioSrc, n_fft, win_length, audioSamples.length, hop_length, f_min, f_max, n_mels, top_db, colormap]);

  const { data: processedData, isLoading } = useSuspenseQuery({
    queryKey: [queryKey],
    queryFn: async () => {
      // Skip processing if no audio data
      if (!audioSamples || audioSamples.length === 0) {
        return null;
      }


      const samplesPerSecond = sampleRate;
      const shouldChunk = audioSamples.length > SEGMENT_DURATION * samplesPerSecond;

      if (!shouldChunk) {
        // Process entire audio sample at once for small files
        const result = await createSpectrogram(
          spectrogramData,
          audioSamples,
          sampleRate,
          n_fft,
          win_length,
          hop_length,
          f_min,
          f_max,
          n_mels,
          top_db,
          colormap,
          transparent
        );

        if (!result?.dataURL) {
          return null;
        }

        return { dataURL: result.dataURL };
      }

      // For large files, process in chunks
      log("queryFn", "Audio file is large, processing in chunks");
      const chunkSize = Math.floor(SEGMENT_DURATION * samplesPerSecond);
      const chunks = [];

      for (let i = 0; i < audioSamples.length; i += chunkSize) {
        chunks.push(audioSamples.slice(i, Math.min(i + chunkSize, audioSamples.length)));
      }

      log("queryFn", `Split audio into ${chunks.length} chunks`);

      // Process chunks with limited concurrency for better performance

      const chunkResults = [];

      for (let i = 0; i < chunks.length; i += MAX_CONCURRENT) {
        const batch = chunks.slice(i, i + MAX_CONCURRENT);
        const batchPromises = batch.map((chunk, idx) => {
          log("queryFn", `Processing chunk ${i + idx + 1}/${chunks.length}`);
          return createSpectrogram(
            undefined, // Don't use spectrogramData for chunks
            chunk,
            sampleRate,
            n_fft,
            win_length,
            hop_length,
            f_min,
            f_max,
            n_mels,
            top_db,
            colormap,
            transparent
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

          // Load and draw all images to the offscreen canvas
          let xOffset = 0;

          // Process images sequentially to maintain order
          for (const result of chunkResults) {
            // Create an image bitmap from the dataURL
            const blob = await dataURLToBlob(result.dataURL);
            const img = await createImageBitmap(blob);

            // Draw to the offscreen canvas
            offCtx.drawImage(img, xOffset, 0);
            xOffset += result.width;

            // Release memory
            img.close();
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
      return new Promise((resolve) => {
        // Load all images first
        const images = chunkResults.map(result => {
          const img = new Image();
          img.src = result.dataURL;
          return img;
        });

        // Count loaded images
        let loadedCount = 0;
        images.forEach(img => {
          img.onload = () => {
            loadedCount++;
            if (loadedCount === images.length) {
              // All images loaded, we can stitch them
              const canvas = document.createElement('canvas');
              canvas.width = totalWidth;
              canvas.height = height;
              const ctx = canvas.getContext('2d');

              if (!ctx) {
                throw new Error("Failed to get canvas context");
              }

              // Draw each image onto the canvas
              let xOffset = 0;
              for (const img of images) {
                ctx.drawImage(img, xOffset, 0);
                xOffset += img.width;
              }

              // Get the final stitched dataURL
              const stitchedDataURL = canvas.toDataURL();

              log("queryFn", "Successfully stitched spectrogram chunks using regular Canvas");

              resolve({ dataURL: stitchedDataURL });
            }
          };

          // Handle loading errors
          img.onerror = () => {
            log("queryFn", "Error loading image for stitching");
            loadedCount++;
            if (loadedCount === images.length) {
              // If all images have been processed (some with errors), try to stitch what we have
              if (images.some(img => img.complete && img.naturalWidth !== 0)) {
                log("queryFn", "Some images failed to load, stitching available ones");
                // Similar stitching code as above
                const canvas = document.createElement('canvas');
                const validImages = images.filter(img => img.complete && img.naturalWidth !== 0);
                const totalWidth = validImages.reduce((sum, img) => sum + img.naturalWidth, 0);
                canvas.width = totalWidth > 0 ? totalWidth : 1;
                canvas.height = validImages.length > 0 ? validImages[0].naturalHeight : 1;
                const ctx = canvas.getContext('2d');

                if (ctx && validImages.length > 0) {
                  let xOffset = 0;
                  for (const img of validImages) {
                    ctx.drawImage(img, xOffset, 0);
                    xOffset += img.naturalWidth;
                  }
                  resolve({ dataURL: canvas.toDataURL() });
                } else {
                  resolve(null);
                }
              } else {
                resolve(null);
              }
            }
          };
        });
      });
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
