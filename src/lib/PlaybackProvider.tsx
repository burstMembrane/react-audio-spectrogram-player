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
import { decodeAudioData, tryCatch } from "@/lib/utils";
import { useHotkeys } from "react-hotkeys-hook";
import { useZoom } from "@/lib/ZoomProvider";
import { AudioEngine, createAudioEngine, AudioEngineEvents, useIsPlaying } from "@/lib/AudioEngine";
import { AudioControls } from "@/lib/AudioControls";
import { SettingsPanel } from "./SettingsPanel";

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
  togglePlayPause: () => void;
  play: () => void;
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
  togglePlayPause: () => { },
  play: () => { },
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
  } = props;

  const settings = props.settings ? true : false;
  const [duration, setDuration] = useState<number | null>(null);
  const [currentTime, _setCurrentTime] = useState(currentTimeInitial);
  const [playbackRate, _setPlaybackRate] = useState(playbackSpeedInitial);
  const [mode, setMode] = useState<string>(playheadModeInitial);
  const [previousMode, setPreviousMode] = useState<string>(playheadModeInitial);
  const [sampleRateState, setSampleRate] = useState<number>(requestedSampleRate);
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const eventsRef = useRef<AudioEngineEvents>(new AudioEngineEvents());
  const [engineInitialized, setEngineInitialized] = useState(false);
  const isPlaying = useIsPlaying(audioEngineRef, eventsRef, engineInitialized);
  const [backendState, setBackendState] = useState<"html5" | "webaudio">(backend);
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
      const { data: response, error } = await tryCatch<Response>(fetch(src));
      if (error) {
        console.error("[PlaybackProvider] Error fetching audio:", error);
        throw error;
      }
      const arrayBuffer = await response.arrayBuffer();
      const { samples, sampleRate } = await decodeAudioData(arrayBuffer, requestedSampleRate);

      // handle stereo samples
      const numChannels = Array.isArray(samples) ? samples.length : 1;
      const length = Array.isArray(samples) ? samples[0].length : samples.length;
      console.log(`[PlaybackProvider] Audio decoded successfully. Sample rate: ${sampleRate}, Samples: ${length}, Channels: ${numChannels}`);
      setSampleRate(sampleRate);
      return { samples, sampleRate, numChannels };

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

          // Implement custom loop in the time update callback
          if (mode === "loop" && isPlaying && startTime < endTime && time >= endTime) {
            console.log(`[PlaybackProvider] Loop boundary reached at ${time}s, seeking to ${startTime}s`);
            engine.seek(startTime);
          }
        });

        engine.onEnded(() => {
          console.log("[PlaybackProvider] Playback ended");
          // Dispatch pause event when playback ends
          if (eventsRef.current) {
            eventsRef.current.dispatchEvent('pause', true);
          }
        });

        // Add listener for error events on HTML5 audio
        if (backend === "html5") {
          // Attempt to access the HTML5 audio element for more detailed error handling
          const htmlEngine = engine as any;

          if (htmlEngine.audio && htmlEngine.audio instanceof HTMLAudioElement) {
            htmlEngine.audio.addEventListener('error', (e: ErrorEvent) => {
              console.error("[PlaybackProvider] HTML5 audio error:", e);
              // Dispatch pause event on error
              if (eventsRef.current) {
                eventsRef.current.dispatchEvent('pause', true);
              }
            });
          }

        }

        // Set initial parameters
        engine.setPlaybackRate(playbackRate);
        if (backend === "webaudio" && audioData?.samples && audioData.sampleRate && engine.loadAudioData) {
          console.log("[PlaybackProvider] Loading spectrogram audio data into WebAudio engine");
          // handle stereo samples

          engine.loadAudioData(audioData.samples, audioData.sampleRate, audioData.numChannels)
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

    // Configure loop in the audio engine
    if (mode === "loop") {
      audioEngineRef.current.setLoopMode(false); // We're handling loops in our callback
    } else {
      audioEngineRef.current.setLoopMode(false);
    }
  }, [playbackRate, engineInitialized]);

  // Unified functions that work with the current audio engine
  const setCurrentTime = useCallback((newTime: number) => {
    console.log(`[PlaybackProvider] Setting current time to ${newTime}`);
    _setCurrentTime(newTime);
    if (audioEngineRef.current && engineInitialized) {
      audioEngineRef.current.seek(newTime);
    }
  }, [audioEngineRef, engineInitialized]);
  const setPlaybackRate = useCallback((newRate: number) => {
    console.log(`[PlaybackProvider] Setting playback rate to ${newRate}`);
    _setPlaybackRate(newRate);
    if (audioEngineRef.current && engineInitialized) {
      audioEngineRef.current.setPlaybackRate(newRate);
    }
  }, [engineInitialized]);

  // Centralized play control function
  const play = useCallback(() => {
    if (!audioEngineRef.current || !engineInitialized) {
      console.log("[PlaybackProvider] Cannot play: engine not initialized");
      return;
    }

    // Only play if not already playing
    if (!audioEngineRef.current.isAudioPlaying()) {
      console.log("[PlaybackProvider] Play requested");
      const success = audioEngineRef.current.play();
      console.log("[PlaybackProvider] Play result:", success);

      // Dispatch event if successful
      if (success && eventsRef.current) {
        eventsRef.current.dispatchEvent('play', true);
      }
    } else {
      console.log("[PlaybackProvider] Already playing, ignoring play request");
    }
  }, [engineInitialized]);

  // Centralized pause control function
  const pause = useCallback(() => {
    if (!audioEngineRef.current || !engineInitialized) {
      console.log("[PlaybackProvider] Cannot pause: engine not initialized");
      return;
    }

    // Only pause if currently playing
    if (audioEngineRef.current.isAudioPlaying()) {
      console.log("[PlaybackProvider] Pause requested");
      audioEngineRef.current.pause();

      // Dispatch event
      if (eventsRef.current) {
        eventsRef.current.dispatchEvent('pause', true);
      }
    } else {
      console.log("[PlaybackProvider] Already paused, ignoring pause request");
    }
  }, [engineInitialized]);


  // Toggle play/pause directly using engine state
  const togglePlayPause = useCallback(() => {
    if (!audioEngineRef.current || !engineInitialized) {
      console.log("[PlaybackProvider] Cannot toggle: engine not initialized");
      return;
    }

    const engineIsPlaying = audioEngineRef.current.isAudioPlaying();
    console.log(`[PlaybackProvider] Toggle play/pause. Engine state: ${engineIsPlaying ? 'playing' : 'paused'}`);

    engineIsPlaying ? pause() : play();
  }, [engineInitialized, play, pause]);


  // Toggle loop mode
  const toggleLoopMode = useCallback(() => {
    const newLoopState = mode !== "loop";
    if (newLoopState) {
      // Entering loop mode
      if (previousMode === "loop") {
        setPreviousMode("continue");
      } else {
        setPreviousMode(mode);
      }
      setMode("loop");
      console.log("[PlaybackProvider] Loop mode enabled");
    } else {
      // Exiting loop mode
      console.log("[PlaybackProvider] Loop mode disabled");
    }
  }, [mode, previousMode]);

  // hotkeys
  useHotkeys('space', togglePlayPause, { preventDefault: true });
  useHotkeys('left', () => setCurrentTime(currentTime - 0.1), { preventDefault: true });
  useHotkeys('right', () => setCurrentTime(currentTime + 0.1), { preventDefault: true });
  useHotkeys('up', () => audioEngineRef.current?.setVolume(audioEngineRef.current.getStatus().volume + 0.1), { preventDefault: true });
  useHotkeys('down', () => audioEngineRef.current?.setVolume(audioEngineRef.current.getStatus().volume - 0.1), { preventDefault: true });


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
        togglePlayPause,
        play,
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
        {controls &&
          <AudioControls
            isLoadingAudio={isLoadingAudio || !engineInitialized}
            audioError={audioError as Error | null}
            duration={duration}
            currentTime={currentTime}
            playbackRate={playbackRate}
            isPlaying={isPlaying}
            mode={mode}
            backend={backendState}
            onPlayPauseClick={togglePlayPause}
            onSeek={setCurrentTime}
            onLoopToggle={toggleLoopMode}
          />
        }
        {settings &&
          <SettingsPanel
            playbackRate={playbackRate}
            setPlaybackRate={setPlaybackRate}
            mode={mode}
            setMode={setMode}
          />
        }
      </div>
    </PlaybackContext.Provider>
  );
}

export default PlaybackProvider;
