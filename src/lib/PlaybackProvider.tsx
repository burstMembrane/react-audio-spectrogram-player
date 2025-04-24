import {
  createContext,
  useState,
  useEffect,
  useRef,
  useContext,
  SetStateAction,
  Dispatch,
  useCallback,
} from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Settings2Icon, Repeat } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils";
import { useZoom } from "@/lib/ZoomProvider";
import { AudioEngine, createAudioEngine, AUDIO_ENGINE_UPDATE_INTERVAL_MS } from "@/lib/AudioEngine";

type AudioControlsProps = {
  audioRef?: React.RefObject<HTMLAudioElement> | null;
  isLoadingAudio: boolean;
  audioError: Error | null;
  duration: number | null;
  currentTime: number;
  setCurrentTime: (newTime: number) => void;
  playbackRate: number;
  audioSrc: string;
  setDuration: Dispatch<SetStateAction<number | null>>;
  setPlaybackRate: (newTime: number) => void;
  isPlaying: boolean;
  mode: string;
  setMode: (mode: string) => void;
  handleButtonClick: () => void;
  backend: "html5" | "webaudio";
};

const PlayFilled = ({ className }: { className: string }) => (
  <div className={className}>
    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
      <path d="M5 3.87v16.26c0 .75.82 1.2 1.46.82l13.09-8.13c.64-.4.64-1.33 0-1.72L6.46 2.97A.998.998 0 0 0 5 3.87z" />
    </svg>
  </div>
)
const PauseFilled = ({ className }: { className: string }) => (
  <div className={className}>
    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
    </svg>
  </div>
)


function AudioControls({
  audioRef,
  isLoadingAudio,
  audioError,
  duration,
  currentTime,
  setCurrentTime,
  playbackRate,
  isPlaying,
  mode,
  setMode,
  handleButtonClick,
  backend,
}: AudioControlsProps) {
  const [previousMode, setPreviousMode] = useState<string>("continue");
  const [isLoopEnabled, setIsLoopEnabled] = useState(mode === "loop");

  useEffect(() => {
    setIsLoopEnabled(mode === "loop");
  }, [mode]);

  const toggleLoop = () => {
    const newLoopState = !isLoopEnabled;
    setIsLoopEnabled(newLoopState);

    if (newLoopState) {
      if (mode !== "loop") {
        setPreviousMode(mode);
      }
      setMode("loop");
    } else {
      setMode(previousMode);
    }
  };

  return (
    <div className="flex w-full items-center justify-center gap-4">
      <Button
        variant="bare"
        size="sm"
        onClick={handleButtonClick}
        disabled={isLoadingAudio || !!audioError}
      >
        {isPlaying ? (
          <PauseFilled className="w-4 h-4" />
        ) : (
          <PlayFilled className="w-4 h-4 fill-white" />
        )}
      </Button>

      <div className="text-sm font-medium text-neutral-600 dark:text-neutral-400 select-none">
        {currentTime ? formatTime(currentTime) : "0:00"}
      </div>

      <Progress
        value={currentTime}
        maxValue={duration || 0}
        onChange={(value) => setCurrentTime(value)}
      />

      <div className="text-sm font-medium text-neutral-600 dark:text-neutral-400 select-none">
        {duration ? formatTime(duration) : "0:00"}
      </div>

      <div className="text-sm font-medium dark:text-neutral-400 select-none">
        {`${playbackRate.toFixed(1)}x`}
      </div>

      <Button
        variant="bare"
        size="sm"
        onClick={toggleLoop}
        title={isLoopEnabled ? "Disable loop" : "Loop current segment"}
        className={cn(
          isLoopEnabled ? "text-blue-500" : "text-neutral-500 dark:text-neutral-400"
        )}
      >
        <Repeat className="w-4 h-4" />
      </Button>

      <div className="text-xs text-neutral-400 dark:text-neutral-500 hidden md:block">
        {backend === "webaudio" ? "WebAudio" : "HTML5 Audio"}
      </div>
    </div>
  );
}




export type PlaybackContextType = {
  duration: number | null;
  currentTime: number;
  playbackRate: number;
  mode: string;
  previousMode: string;
  sampleRate: number;
  setDuration: Dispatch<SetStateAction<number | null>>;
  setCurrentTime: (newTime: number) => void;
  setPlaybackRate: (newTime: number) => void;
  pause: () => void;
  isPlaying: boolean;
  audioSamples: Float32Array;
  audioSrc: string;
  isLoadingAudio: boolean;
  audioError: Error | null;
  backend: "html5" | "webaudio";
};

export const PlaybackContext = createContext<PlaybackContextType>({
  duration: null,
  currentTime: 0,
  playbackRate: 1.0,
  mode: "page",
  previousMode: "continue",
  sampleRate: 16000,
  setDuration: () => { },
  setCurrentTime: () => { },
  setPlaybackRate: () => { },
  pause: () => { },
  isPlaying: false,
  audioSamples: new Float32Array(0),
  audioSrc: "",
  isLoadingAudio: false,
  audioError: null,
  backend: "html5",
});

export function usePlayback() {
  return useContext(PlaybackContext);
}

export type PlaybackProviderProps = {
  children: JSX.Element | JSX.Element[];
  src: string;
  settings: boolean;
  controls: boolean;
  sampleRate: number;
  currentTimeInitial?: number;
  playbackSpeedInitial?: number;
  playheadModeInitial?: string;
  isLooping?: boolean;
  backend?: "html5" | "webaudio";
  zoomStartTime?: number;
  zoomEndTime?: number;
};

const CURRENT_TIME_UPDATE_INTERVAL = 10;

// Utility function to decode audio
async function decodeAudioData(arrayBuffer: ArrayBuffer, desiredSampleRate: number): Promise<{ samples: Float32Array, sampleRate: number }> {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
    sampleRate: desiredSampleRate,
  });

  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  const samples = audioBuffer.getChannelData(0);

  return {
    samples,
    sampleRate: audioContext.sampleRate
  };
}

export function PlaybackProvider(props: PlaybackProviderProps) {
  const {
    children,
    src,
    sampleRate: requestedSampleRate,
    currentTimeInitial = 0,
    playbackSpeedInitial = 1.0,
    playheadModeInitial = "page",
    controls = true,
    backend = "html5",
    zoomStartTime,
    zoomEndTime,
  } = props;

  const settings = props.settings ? true : false;
  const [duration, setDuration] = useState<number | null>(null);
  const [currentTime, _setCurrentTime] = useState(currentTimeInitial);
  const [playbackRate, _setPlaybackRate] = useState(playbackSpeedInitial);
  const [mode, setMode] = useState<string>(playheadModeInitial);
  const [previousMode, setPreviousMode] = useState<string>(playheadModeInitial);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sampleRateState, setSampleRate] = useState<number>(requestedSampleRate);
  const [loopCheckInterval, setLoopCheckInterval] = useState<number | null>(null);

  // Reference to the current audio engine implementation
  const audioEngineRef = useRef<AudioEngine | null>(null);

  // Track whether the engine has been initialized
  const [engineInitialized, setEngineInitialized] = useState(false);

  // Determine which backend is actually in use
  const [backendState, setBackendState] = useState<"html5" | "webaudio">(backend);

  // Get zoom context
  const { startTime, endTime } = useZoom();

  // Fetch audio data for WebAudio
  const {
    data: audioData,
    error: audioError,
    isLoading: isLoadingAudio,
  } = useSuspenseQuery({
    queryKey: ['audio', src, requestedSampleRate],
    queryFn: async () => {


      console.log("[PlaybackProvider] Fetching audio data from:", src);
      try {
        const response = await fetch(src);
        if (!response.ok) {
          throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        console.log("[PlaybackProvider] Audio fetched, decoding...");

        const { samples, sampleRate } = await decodeAudioData(arrayBuffer, requestedSampleRate);
        console.log(`[PlaybackProvider] Audio decoded successfully. Sample rate: ${sampleRate}, Samples: ${samples.length}`);

        setSampleRate(sampleRate);

        return { samples, sampleRate };
      } catch (error) {
        console.error("[PlaybackProvider] Error fetching or decoding audio:", error);
        throw error;
      }
    },
  });

  // Initialize the audio engine
  useEffect(() => {
    console.log(`[PlaybackProvider] Initializing audio engine (${backend})`);

    // Cleanup function for previous engine
    const cleanup = () => {
      if (audioEngineRef.current) {
        console.log("[PlaybackProvider] Cleaning up previous audio engine");
        audioEngineRef.current.destroy();
        audioEngineRef.current = null;
        setEngineInitialized(false);
      }
    };

    // Clean up any existing engine
    cleanup();

    // Create the new engine
    createAudioEngine(backend, src, { sampleRate: requestedSampleRate })
      .then(engine => {
        console.log(`[PlaybackProvider] ${backend} audio engine initialized successfully`);
        audioEngineRef.current = engine;
        setBackendState(backend);
        setEngineInitialized(true);

        // Set up callbacks
        engine.onTimeUpdate(time => {
          _setCurrentTime(time);
        });

        engine.onEnded(() => {
          setIsPlaying(false);
        });

        // Set initial parameters
        engine.setPlaybackRate(playbackRate);


        if (backend === "webaudio" && audioData?.samples && audioData.sampleRate && engine.loadAudioData) {
          console.log("[PlaybackProvider] Loading spectrogram audio data into WebAudio engine");
          engine.loadAudioData(audioData.samples, audioData.sampleRate)
            .then(success => {
              if (success) {
                // Update duration once audio is loaded
                const audioDuration = engine.getDuration();
                if (audioDuration > 0) {
                  setDuration(audioDuration);
                }
              }
            });
        }

        // Get the duration (mainly for HTML5 engine)
        const checkDuration = () => {
          const audioDuration = engine.getDuration();
          if (audioDuration > 0) {
            setDuration(audioDuration);
            return true;
          }
          return false;
        };

        // Check duration immediately
        if (!checkDuration() && backend === "html5") {
          // If not available, check periodically for HTML5 audio
          const intervalId = setInterval(() => {
            if (checkDuration()) {
              clearInterval(intervalId);
            }
          }, 100);

          // Clean up interval after 10 seconds
          setTimeout(() => clearInterval(intervalId), 10000);
        }
      })
      .catch(error => {
        console.error(`[PlaybackProvider] Error initializing ${backend} audio engine:`, error);
      });

    return cleanup;
  }, [backend, src, requestedSampleRate]);

  // Update engine configuration when parameters change
  useEffect(() => {
    if (!audioEngineRef.current || !engineInitialized) return;

    // Update playback rate
    audioEngineRef.current.setPlaybackRate(playbackRate);

    // Configure base loop settings - we'll handle the custom loop logic ourselves
    if (mode === "loop") {
      // Simple loop for whole file, the custom loop range will be handled by our interval
      audioEngineRef.current.setLoopMode(false);
    } else {
      audioEngineRef.current.setLoopMode(false);
    }
  }, [playbackRate, engineInitialized]);

  // Set up keyboard event listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle keyboard shortcuts if we're not in an input field
      if (document.activeElement?.tagName === 'INPUT') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlayPause();
          break;

        case 'ArrowLeft':
          e.preventDefault();
          // Seek backward
          const seekBackAmount = e.shiftKey ? 0.01 : 0.1; // Finer seek with shift key
          const newBackTime = Math.max(0, currentTime - seekBackAmount);
          setCurrentTime(newBackTime);
          break;

        case 'ArrowRight':
          e.preventDefault();
          // Seek forward
          const seekFwdAmount = e.shiftKey ? 0.01 : 0.1; // Finer seek with shift key
          const newFwdTime = Math.min(duration || 0, currentTime + seekFwdAmount);
          setCurrentTime(newFwdTime);
          break;

        // Volume control
        case 'ArrowUp':
          e.preventDefault();
          if (audioEngineRef.current) {
            const currentStatus = audioEngineRef.current.getStatus();
            audioEngineRef.current.setVolume(Math.min(1, currentStatus.volume + 0.1));
          }
          break;

        case 'ArrowDown':
          e.preventDefault();
          if (audioEngineRef.current) {
            const currentStatus = audioEngineRef.current.getStatus();
            audioEngineRef.current.setVolume(Math.max(0, currentStatus.volume - 0.1));
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [duration, currentTime]);

  // Implement custom loop functionality in the provider
  useEffect(() => {
    // Clean up existing interval
    if (loopCheckInterval) {
      clearInterval(loopCheckInterval);
      setLoopCheckInterval(null);
    }

    // Only set up loop checking if:
    // 1. We're in loop mode
    // 2. We're playing 
    // 3. We have valid start/end times
    // 4. Engine is initialized
    if (mode === "loop" && isPlaying && engineInitialized && startTime < endTime) {
      console.log(`[PlaybackProvider] Setting up loop check interval: ${startTime}s to ${endTime}s`);

      // Check at the same frequency as the audio engines
      const intervalId = window.setInterval(() => {
        if (!audioEngineRef.current) return;

        const currentTime = audioEngineRef.current.getCurrentTime();

        // Check if we need to loop
        if (currentTime >= endTime) {
          console.log(`[PlaybackProvider] Loop boundary reached at ${currentTime}s, seeking to ${startTime}s`);
          audioEngineRef.current.seek(startTime);
        }
      }, AUDIO_ENGINE_UPDATE_INTERVAL_MS);

      setLoopCheckInterval(intervalId);
    }

    // Clean up on unmount
    return () => {
      if (loopCheckInterval) {
        clearInterval(loopCheckInterval);
      }
    };
  }, [mode, isPlaying, startTime, endTime, engineInitialized]);

  // Unified functions that work with the current audio engine
  const setCurrentTime = useCallback((newTime: number) => {
    if (audioEngineRef.current && engineInitialized) {
      audioEngineRef.current.seek(newTime);
      _setCurrentTime(newTime);
    }
  }, [engineInitialized]);

  const setPlaybackRate = useCallback((newRate: number) => {
    _setPlaybackRate(newRate);
    if (audioEngineRef.current && engineInitialized) {
      audioEngineRef.current.setPlaybackRate(newRate);
    }
  }, [engineInitialized]);

  const togglePlayPause = useCallback(() => {
    if (!audioEngineRef.current || !engineInitialized) return;

    if (isPlaying) {
      audioEngineRef.current.pause();
      setIsPlaying(false);
    } else {
      const success = audioEngineRef.current.play();
      if (success) {
        setIsPlaying(true);
      }
    }
  }, [isPlaying, engineInitialized]);

  const pause = useCallback(() => {
    if (audioEngineRef.current && engineInitialized) {
      audioEngineRef.current.pause();
      setIsPlaying(false);
    }
  }, [engineInitialized]);

  // Handle loop mode changes
  useEffect(() => {
    if (!audioEngineRef.current || !engineInitialized) return;

    if (mode === "loop") {
      // Store previous mode when entering loop mode
      if (previousMode === "loop") {
        setPreviousMode("continue");
      }
    } else {
      // We're not in loop mode, remember this mode
      setPreviousMode(mode);

      // Make sure to clean up any existing loop interval
      if (loopCheckInterval) {
        clearInterval(loopCheckInterval);
        setLoopCheckInterval(null);
      }
    }
  }, [mode, previousMode, engineInitialized, loopCheckInterval]);

  return (
    <PlaybackContext.Provider
      value={{
        duration,
        currentTime,
        playbackRate,
        mode,
        previousMode,
        sampleRate: sampleRateState,
        setDuration,
        setCurrentTime,
        setPlaybackRate,
        pause,
        isPlaying,
        audioSamples: audioData?.samples || new Float32Array(0),
        audioSrc: src,
        isLoadingAudio: isLoadingAudio || !engineInitialized,
        audioError: audioError as Error | null,
        backend: backendState,
      }}
    >
      {children}
      <div className="w-full flex justify-center items-center gap-4">
        <AudioControls
          audioRef={null}
          isLoadingAudio={isLoadingAudio || !engineInitialized}
          audioError={audioError as Error | null}
          duration={duration}
          currentTime={currentTime}
          setCurrentTime={setCurrentTime}
          playbackRate={playbackRate}
          audioSrc={src}
          setDuration={setDuration}
          setPlaybackRate={setPlaybackRate}
          isPlaying={isPlaying}
          mode={mode}
          setMode={setMode}
          handleButtonClick={togglePlayPause}
          backend={backendState}
        />

        {settings &&
          settingsPanel({
            playbackRate,
            setPlaybackRate,
            mode,
            setMode
          })
        }
      </div>
    </PlaybackContext.Provider>
  );
}

function settingsPanel({
  playbackRate,
  setPlaybackRate,
  mode,
  setMode
}: {
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
  mode: string;
  setMode: (mode: string) => void;
}) {
  const playbackRates = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
  const playheadModes = ["page", "stop", "loop", "continue", "scroll", "scrub"];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon">
          <Settings2Icon className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <div className="grid gap-4">


          {/* Playback Speed Section */}
          <div className="grid gap-2">
            <Label className="font-medium leading-none">Playback Speed</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {playbackRates.map((rate) => (
                <Button
                  key={rate}
                  variant={playbackRate === rate ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPlaybackRate(rate)}
                >
                  {rate}x
                </Button>
              ))}
            </div>
          </div>

          {/* Playhead Mode Section */}
          <div className="border-t pt-3 space-y-2">
            <Label className="font-medium leading-none">Playhead Mode</Label>
            <div className="grid grid-cols-3 gap-2">
              {playheadModes.map((modeOption) => (
                <Button
                  key={modeOption}
                  variant={mode === modeOption ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMode(modeOption)}
                  className="capitalize"
                >
                  {modeOption}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Helper function to format time as mm:ss
function formatTime(time: number): string {
  if (!time) return '0:00';

  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export default PlaybackProvider;
