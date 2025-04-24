import SpectrogramGraphics from "./SpectrogramGraphics";
import PlaybackProvider from "./PlaybackProvider";
import ThemeProvider from "./ThemeProvider";

import { Annotations } from "./Annotation";
import { QueryClient } from "@tanstack/react-query";
import { Suspense } from "react";
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { Loader2 } from "lucide-react";
import { Colormap } from "@/lib/types";
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 60 * 24, // 24 hours
    },
  },
})

const persister = createSyncStoragePersister({
  storage: window.localStorage,

})



interface SpectrogramPlayerProps {
  src: string;
  spectrogramData?: number[][];
  sampleRate?: number;
  n_fft?: number;
  win_length?: number;
  hop_length?: number;
  f_min?: number;
  f_max?: number;
  n_mels?: number;
  top_db?: number;
  annotations?: Annotations[];
  navigator?: boolean;
  settings?: boolean;
  controls?: boolean;
  startTimeInitial?: number;
  endTimeInitial?: number;
  playbackSpeedInitial?: number;
  playheadModeInitial?: string;
  specHeight?: number;
  navHeight?: number;
  colormap?: Colormap;
  transparent?: boolean;
  dark?: boolean;
  playheadColor?: string;
  playheadWidth?: number;
  backend?: "webaudio" | "html5";
}
function Loading() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center">
      <div className="flex  items-center justify-center gap-2">

        <Loader2 className="w-4 h-4 animate-spin" />
        <p className="text-sm text-gray-500">Loading Spectrogram...</p>

      </div>
    </div>
  );
}

const SpectrogramPlayer = (props: SpectrogramPlayerProps) => {
  const {
    src,
    spectrogramData = undefined,
    sampleRate = 16000,
    n_fft = 1024,
    win_length = 400,
    hop_length = 160,
    f_min = 0.0,
    f_max = sampleRate / 2,
    n_mels = 128,
    top_db = 80,
    annotations = [],
    navigator = false,
    settings = false,
    controls = true,
    startTimeInitial = undefined,
    endTimeInitial = undefined,
    playbackSpeedInitial = 1.0,
    playheadModeInitial = "scrub",
    specHeight = 200,
    navHeight = 50,
    colormap = "viridis",
    transparent = false,
    playheadColor = "white",
    playheadWidth = 0.005,
    backend = "html5",
  } = props;





  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <Suspense fallback={<Loading />}>
          <PlaybackProvider
            src={src}
            settings={settings}
            sampleRate={sampleRate}
            currentTimeInitial={startTimeInitial}
            playbackSpeedInitial={playbackSpeedInitial}
            playheadModeInitial={playheadModeInitial}
            controls={controls}
            backend={backend}
          >
            <SpectrogramGraphics
              spectrogramData={spectrogramData}
              n_fft={n_fft}
              win_length={win_length}
              hop_length={hop_length}
              f_min={f_min}
              f_max={f_max}
              n_mels={n_mels}
              top_db={top_db}
              annotations={annotations}
              navigator={navigator}
              startTimeInitial={startTimeInitial}
              endTimeInitial={endTimeInitial}
              navHeight={navHeight}
              specHeight={specHeight}
              colormap={colormap}
              transparent={transparent}
              playheadColor={playheadColor}
              playheadWidth={playheadWidth}
            />
          </PlaybackProvider>
        </Suspense>
      </ThemeProvider>
    </PersistQueryClientProvider>
  );

};

export default SpectrogramPlayer;
