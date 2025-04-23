import {
  createContext,
  useState,
  useEffect,
  useRef,
  useContext,
  SetStateAction,
  Dispatch,
} from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { PauseCircle, PlayCircle, Settings2Icon } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
type AudioControlsProps = {
  audioRef: React.RefObject<HTMLAudioElement>;
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
};

function AudioControls({
  audioRef,
  isLoadingAudio,
  audioError,
  duration,
  currentTime,
  setCurrentTime,
  playbackRate,
  isPlaying,
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
          <Button
            variant={"ghost"}
            size={"icon"}
            onClick={() => {
              const audio = audioRef.current;
              if (audio) {
                if (audio.paused) {
                  audio.play();
                } else {
                  audio.pause();
                }
              }
            }}
            disabled={isLoadingAudio || !!audioError}
          >
            {isPlaying ? (
              <PauseCircle className="w-6 h-6" />
            ) : (
              <PlayCircle className="w-6 h-6" />
            )}
          </Button>
          <div className="flex w-full items-center  space-between gap-4">
            <div className="text-sm font-medium text-neutral-600 dark:text-neutral-400 select-none">
              {currentTime ? `${formatTime(currentTime)}` : "0:00"}
            </div>
            {/* Progress bar with correct props */}
            <Progress
              className="h-2"
              value={currentTime}
              maxValue={duration || 0}
              onChange={(value) => setCurrentTime(value)}

            />
            <div className="text-sm font-medium text-neutral-600 dark:text-neutral-400 select-none">
              {duration ? `${formatTime(duration)}` : "0:00"}
            </div>
          </div>
          <div className="text-sm dark:text-neutral-400 select-none">
            {`${playbackRate.toFixed(1)}x`}
          </div>
        </>
      )}
    </div>
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

  const [sampleRateState, setSampleRate] = useState<number>(requestedSampleRate);

  const [isPlaying, setIsPlaying] = useState(false);

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

  // Add keyboard event listener for spacebar and arrow keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle keyboard shortcuts if we're not in an input field
      if (document.activeElement?.tagName === 'INPUT') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (audioRef.current) {
            if (audioRef.current.paused) {
              audioRef.current.play().then(() => setIsPlaying(true));
            } else {
              audioRef.current.pause();
              setIsPlaying(false);
            }
          }
          break;

        case 'ArrowLeft':
          e.preventDefault();
          // Seek backward
          if (audioRef.current) {
            const seekAmount = e.shiftKey ? 0.01 : 0.1; // Finer seek with shift key
            const newTime = Math.max(0, audioRef.current.currentTime - seekAmount);
            setCurrentTime(newTime);
          }
          break;

        case 'ArrowRight':
          e.preventDefault();
          // Seek forward
          if (audioRef.current && duration) {
            const seekAmount = e.shiftKey ? 0.01 : 0.1; // Finer seek with shift key
            const newTime = Math.min(duration, audioRef.current.currentTime + seekAmount);
            setCurrentTime(newTime);
          }
          break;

        // Optionally add up/down arrows for volume control
        case 'ArrowUp':
          e.preventDefault();
          if (audioRef.current) {
            audioRef.current.volume = Math.min(1, audioRef.current.volume + 0.1);
          }
          break;

        case 'ArrowDown':
          e.preventDefault();
          if (audioRef.current) {
            audioRef.current.volume = Math.max(0, audioRef.current.volume - 0.1);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [duration]); // Add duration to dependencies

  // Add event listeners to update isPlaying state
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);
      const handleEnded = () => setIsPlaying(false);

      audio.addEventListener('play', handlePlay);
      audio.addEventListener('pause', handlePause);
      audio.addEventListener('ended', handleEnded);

      return () => {
        audio.removeEventListener('play', handlePlay);
        audio.removeEventListener('pause', handlePause);
        audio.removeEventListener('ended', handleEnded);
      };
    }
  }, [audioRef.current]);

  // Update the Button click handler
  const togglePlayPause = () => {
    if (audioRef.current) {
      if (audioRef.current.paused) {
        audioRef.current.play().then(() => setIsPlaying(true));
      } else {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

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
        isPlaying: isPlaying,
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
          audioSrc={src}
          setDuration={setDuration}
          setPlaybackRate={setPlaybackRate}
          isPlaying={isPlaying}
        />

        {settings && (
          <Button
            variant={"ghost"}
            size={"icon"}

            onClick={() => {
              setShowSettingsPanel(!showSettingsPanel);
            }}
          >
            <Settings2Icon className="w-4 h-4" />
          </Button>
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
