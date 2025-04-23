import {
  createContext,
  useState,
  useEffect,
  useRef,
  useContext,
  SetStateAction,
  Dispatch,
} from "react";
import { useTheme } from "@/lib/ThemeProvider";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Pause, Play, Settings2Icon } from "lucide-react";

type AudioControlsProps = {
  audioRef: React.RefObject<HTMLAudioElement>;
  isLoadingAudio: boolean;
  audioError: Error | null;
  duration: number | null;
  currentTime: number;
  setCurrentTime: (newTime: number) => void;
  playbackRate: number;
  dark: boolean;
  audioSrc: string;
  setDuration: Dispatch<SetStateAction<number | null>>;
  setPlaybackRate: (newTime: number) => void;
};

function AudioControls({
  audioRef,
  isLoadingAudio,
  audioError,
  duration,
  currentTime,
  setCurrentTime,
  playbackRate,
}: AudioControlsProps) {
  return (

    <div className="w-full flex justify-center items-center gap-4">

      {isLoadingAudio ? (
        <div>
          Loading audio...
        </div>
      ) : audioError ? (
        <div>
          Error loading audio
        </div>
      ) : (
        <>
          <button
            onClick={() => {
              const audio = audioRef.current;
              if (audio) {
                audio.paused ? audio.play() : audio.pause();
              }
            }}
            disabled={isLoadingAudio || !!audioError}
          >
            {audioRef.current?.paused === false ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </button>
          <div className="ml-2 text-sm font-medium text-neutral-600 dark:text-neutral-400">
            {currentTime ? `${formatTime(currentTime)}` : "0:00"}
          </div>
          {/* progress bar */}
          <div className="flex flex-1 items-center px-2">
            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              step="0.01"
              className="w-full h-1.5 appearance-none rounded-full bg-neutral-300 dark:bg-neutral-700 cursor-pointer
      [&::-webkit-slider-thumb]:appearance-none
      [&::-webkit-slider-thumb]:h-3
      [&::-webkit-slider-thumb]:w-3
      [&::-webkit-slider-thumb]:rounded-full
      [&::-webkit-slider-thumb]:bg-neutral-600
      [&::-webkit-slider-thumb]:dark:bg-neutral-400
      [&::-moz-range-thumb]:h-3
      [&::-moz-range-thumb]:w-3
      [&::-moz-range-thumb]:rounded-full  
      [&::-moz-range-thumb]:bg-neutral-600"
              onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
              disabled={isLoadingAudio || !!audioError}
            />
          </div>
          {/* time display */}
          <div className="ml-2 text-sm font-medium text-neutral-600 dark:text-neutral-400">
            {duration ? `${formatTime(duration)}` : "0:00"}
          </div>
          {/* playback rate display */}
          <div className="text-sm dark:text-neutral-400">
            {`${playbackRate.toFixed(1)}x`}
          </div>
        </>
      )
      }
    </div >


  );
}


export type PlaybackContextType = {
  duration: number | null;
  currentTime: number;
  playbackRate: number;
  mode: string;
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
};

export const PlaybackContext = createContext<PlaybackContextType>({
  duration: null,
  currentTime: 0,
  playbackRate: 1.0,
  mode: "page",
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
});

export function usePlayback() {
  return useContext(PlaybackContext);
}

export type PlaybackProviderProps = {
  children: JSX.Element | JSX.Element[];
  src: string;
  settings: boolean;
  sampleRate: number;
  currentTimeInitial?: number;
  playbackSpeedInitial?: number;
  playheadModeInitial?: string;
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

function PlaybackProvider(props: PlaybackProviderProps) {
  const {
    children,
    src,
    sampleRate: requestedSampleRate,
    currentTimeInitial = 0,
    playbackSpeedInitial = 1.0,
    playheadModeInitial = "page",
  } = props;

  const settings = props.settings ? true : false;
  const [duration, setDuration] = useState<number | null>(null);
  const [currentTime, _setCurrentTime] = useState(currentTimeInitial);
  const [playbackRate, _setPlaybackRate] = useState(playbackSpeedInitial);
  const [mode, setMode] = useState<string>(playheadModeInitial);
  const audioRef = useRef<HTMLAudioElement>(null);
  const intervalRef = useRef<number>();
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const { dark } = useTheme();
  const [sampleRateState, setSampleRate] = useState<number>(requestedSampleRate);


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

        // Update the sample rate state
        setSampleRate(sampleRate);

        return { samples, sampleRate };
      } catch (error) {
        console.error("[PlaybackProvider] Error fetching or decoding audio:", error);
        throw error;
      }
    },


  });

  // Audio player functionality
  useEffect(() => {
    if (audioRef.current !== null) {
      if (audioRef.current.duration) {
        setDuration(audioRef.current.duration);
      }

      if (audioRef.current.readyState >= 1) {
        setDuration(audioRef.current.duration);
      }

      audioRef.current.playbackRate = playbackSpeedInitial;

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      const audio = audioRef.current;

      const startInterval = () => {
        intervalRef.current = window.setInterval(() => {
          if (audio && audio.currentTime) {
            _setCurrentTime(audio.currentTime);
          }
        }, CURRENT_TIME_UPDATE_INTERVAL);
      };

      const clearCurrentInterval = () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = undefined;
        }
      };

      audio.addEventListener("play", startInterval);
      audio.addEventListener("pause", clearCurrentInterval);
      audio.addEventListener("ended", clearCurrentInterval);

      return () => {
        audio.removeEventListener("play", startInterval);
        audio.removeEventListener("pause", clearCurrentInterval);
        audio.removeEventListener("ended", clearCurrentInterval);
        clearCurrentInterval();
      };
    }
  }, [audioRef.current, playbackSpeedInitial]);

  const onDurationChange = (
    e: React.SyntheticEvent<HTMLAudioElement, Event>,
  ) => {
    if (audioRef.current !== null) {
      if (audioRef.current.duration) {
        setDuration(audioRef.current.duration);
      }
    }
  };

  const onTimeUpdate = (e: React.SyntheticEvent<HTMLAudioElement, Event>) => {
    if (audioRef.current !== null) {
      _setCurrentTime(audioRef.current.currentTime);
    }
  };

  const onRateChange = (e: React.SyntheticEvent<HTMLAudioElement, Event>) => {
    if (audioRef.current !== null) {
      if (audioRef.current.duration) {
        setPlaybackRate(audioRef.current.playbackRate);
      }
    }
  };

  const setCurrentTime = (newTime: number) => {
    if (audioRef.current !== null) {
      audioRef.current.currentTime = newTime;
    }
    _setCurrentTime(newTime);
  };

  const setPlaybackRate = (newRate: number) => {
    if (audioRef.current !== null) {
      audioRef.current.playbackRate = newRate;
    }
    _setPlaybackRate(newRate);
  };

  const pause = () => {
    if (audioRef.current !== null) {
      audioRef.current.pause();
    }
  };

  // Determine the number of columns needed for the mode grid based on the number of options
  const playheadModes = ["page", "stop", "loop", "continue", "scroll", "scrub"];
  const gridColumns = playheadModes.length > 5 ? 3 : (playheadModes.length > 2 ? 2 : 1);
  const gridRows = Math.ceil(playheadModes.length / gridColumns);

  return (
    <PlaybackContext.Provider
      value={{
        duration,
        currentTime,
        playbackRate,
        mode,
        sampleRate: sampleRateState,
        setDuration,
        setCurrentTime,
        setPlaybackRate,
        pause,
        audioSamples: audioData?.samples || new Float32Array(0),
        isPlaying: audioRef.current?.paused === false,
        audioSrc: src,
        isLoadingAudio,
        audioError: audioError as Error | null,
      }}
    >
      {children}
      <div className="w-full flex justify-center items-center gap-4">
        <audio
          ref={audioRef}
          className="hidden"
          onTimeUpdate={onTimeUpdate}
          onDurationChange={onDurationChange}
          onRateChange={onRateChange}
          controlsList="nodownload"
        >
          <source src={src} />
        </audio>
        <AudioControls
          audioRef={audioRef}
          isLoadingAudio={isLoadingAudio}
          audioError={audioError as Error | null}
          duration={duration}
          currentTime={currentTime}
          setCurrentTime={setCurrentTime}
          playbackRate={playbackRate}
          dark={dark}
          audioSrc={src}
          setDuration={setDuration}
          setPlaybackRate={setPlaybackRate}
        />

        {settings && (
          <button
            className="flex items-center justify-center "
            onClick={() => {
              setShowSettingsPanel(!showSettingsPanel);
            }}
          >
            <Settings2Icon className="w-4 h-4" />
          </button>
        )}
      </div>

    </PlaybackContext.Provider >
  );
}

// Helper function to format time as mm:ss
function formatTime(time: number): string {
  if (!time) return '0:00';

  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export default PlaybackProvider;
