import {
  createContext,
  useState,
  useEffect,
  useRef,
  useContext,
  SetStateAction,
  Dispatch,
} from "react";
import { useTheme } from "./ThemeProvider";
import { useSuspenseQuery } from "@tanstack/react-query";

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

  const theme = dark ? "dark" : "light";

  // Use React Query to fetch and decode audio
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
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap: 8,
          marginTop: 10,
          borderRadius: 8,
          overflow: "hidden",
          backgroundColor: dark ? "rgba(30, 30, 35, 0.7)" : "rgba(245, 245, 250, 0.7)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          boxShadow: dark
            ? "0 4px 12px rgba(0, 0, 0, 0.2), 0 1px 3px rgba(0, 0, 0, 0.1)"
            : "0 4px 12px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05)"
        }}
      >
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            padding: 12,
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              position: "relative",
              height: 36,
              borderRadius: 6,
              overflow: "hidden",
              backgroundColor: dark ? "rgba(20, 20, 25, 0.4)" : "rgba(230, 230, 235, 0.4)",
              padding: "0 2px",
            }}
          >
            <audio
              ref={audioRef}
              style={{
                position: "absolute",
                opacity: 0, // Hide the audio element visually
                width: "100%",
                height: "100%",
              }}
              onTimeUpdate={onTimeUpdate}
              onDurationChange={onDurationChange}
              onRateChange={onRateChange}
              controlsList="nodownload"
            >
              <source src={src} />
            </audio>

            {/* Loading indicator */}
            {isLoadingAudio ? (
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                color: dark ? "rgba(255, 255, 255, 0.7)" : "rgba(0, 0, 0, 0.7)",
                fontSize: 12,
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
              }}>
                Loading audio...
              </div>
            ) : audioError ? (
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                color: "#e74c3c",
                fontSize: 12,
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
              }}>
                Error loading audio
              </div>
            ) : (
              <>
                {/* Custom audio controls */}
                <button
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 32,
                    height: 32,
                    margin: "2px 4px",
                    borderRadius: 5,
                    backgroundColor: dark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)",
                    color: dark ? "rgba(255, 255, 255, 0.9)" : "rgba(0, 0, 0, 0.9)",
                    transition: "background-color 0.15s ease",
                  }}
                  onClick={() => {
                    if (audioRef.current) {
                      if (audioRef.current.paused) {
                        audioRef.current.play();
                      } else {
                        audioRef.current.pause();
                      }
                    }
                  }}
                  disabled={isLoadingAudio || !!audioError}
                >
                  {audioRef.current && !audioRef.current.paused ? (
                    // Pause icon
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="6" y="4" width="4" height="16" />
                      <rect x="14" y="4" width="4" height="16" />
                    </svg>
                  ) : (
                    // Play icon
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="5,3 19,12 5,21" fill="currentColor" stroke="none" />
                    </svg>
                  )}
                </button>

                {/* Time display */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  marginLeft: 4,
                  fontSize: 12,
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                  color: dark ? "rgba(255, 255, 255, 0.7)" : "rgba(0, 0, 0, 0.7)",
                  minWidth: 80,
                }}>
                  {duration ? (
                    `${formatTime(currentTime)} / ${formatTime(duration)}`
                  ) : "0:00 / 0:00"}
                </div>

                {/* Time slider */}
                <div style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 8px",
                }}>
                  <input
                    type="range"
                    min="0"
                    max={duration || 0}
                    value={currentTime}
                    step="0.01"
                    style={{
                      width: "100%",
                      height: 4,
                      borderRadius: 2,
                      appearance: "none",
                      backgroundColor: dark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)",
                      outline: "none",
                      transition: "height 0.15s ease",
                      cursor: "pointer",
                    }}
                    onChange={(e) => {
                      const time = parseFloat(e.target.value);
                      setCurrentTime(time);
                    }}
                    disabled={isLoadingAudio || !!audioError}
                  />
                </div>

                {/* Playback rate display */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  fontSize: 12,
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                  color: dark ? "rgba(255, 255, 255, 0.7)" : "rgba(0, 0, 0, 0.7)",
                  marginRight: 4,
                }}>
                  {`${playbackRate.toFixed(1)}x`}
                </div>
              </>
            )}
          </div>

          {settings && (
            <button
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: 6,
                backgroundColor: dark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)",
                color: dark ? "rgba(255, 255, 255, 0.9)" : "rgba(0, 0, 0, 0.9)",
                transition: "background-color 0.15s ease",
              }}
              onClick={() => {
                setShowSettingsPanel(!showSettingsPanel);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          )}
        </div>

        {settings && showSettingsPanel && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 3fr",
              columnGap: 8,
              rowGap: 8,
              padding: "5px 12px 12px 12px",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
              fontSize: 13,
              backgroundColor: dark ? "rgba(20, 20, 25, 0.3)" : "rgba(230, 230, 235, 0.3)",
              borderTop: dark ? "1px solid rgba(255, 255, 255, 0.05)" : "1px solid rgba(0, 0, 0, 0.05)",
            }}
          >
            <div style={{
              display: "flex",
              alignItems: "center",
              color: dark ? "rgba(255, 255, 255, 0.9)" : "rgba(0, 0, 0, 0.9)",
              fontWeight: 500
            }}>
              Playback Speed
            </div>
            <div style={{ display: "flex", flexDirection: "row", gap: 8, alignItems: "center" }}>
              <input
                type="range"
                min="0.1"
                max="2.0"
                value={playbackRate}
                step="0.1"
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  appearance: "none",
                  backgroundColor: dark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)",
                  outline: "none",
                  cursor: "pointer",
                }}
                onChange={(e) => {
                  setPlaybackRate(Number(e.target.value));
                }}
                disabled={isLoadingAudio || !!audioError}
              />
              <div style={{
                minWidth: 36,
                textAlign: "right",
                color: dark ? "rgba(255, 255, 255, 0.7)" : "rgba(0, 0, 0, 0.7)",
              }}>
                {`${playbackRate.toFixed(1)}x`}
              </div>
            </div>

            <div style={{
              display: "flex",
              alignItems: "center",
              color: dark ? "rgba(255, 255, 255, 0.9)" : "rgba(0, 0, 0, 0.9)",
              fontWeight: 500
            }}>
              Playhead Mode
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${gridColumns}, 1fr)`,
                gridTemplateRows: `repeat(${gridRows}, 1fr)`,
                gap: 4,
              }}
            >
              {playheadModes.map((modeName) => (
                <div
                  key={modeName}
                  style={{
                    padding: "4px 8px",
                    textAlign: "center",
                    cursor: "pointer",
                    borderRadius: 4,
                    backgroundColor: mode === modeName
                      ? (dark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.1)")
                      : (dark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)"),
                    color: mode === modeName
                      ? (dark ? "rgba(255, 255, 255, 1)" : "rgba(0, 0, 0, 0.9)")
                      : (dark ? "rgba(255, 255, 255, 0.7)" : "rgba(0, 0, 0, 0.7)"),
                    fontWeight: mode === modeName ? 500 : 400,
                    transition: "all 0.15s ease",
                  }}
                  onClick={() => {
                    setMode(modeName);
                  }}
                  title={modeName === "scrub"
                    ? "Keeps the playhead fixed in the center with the audio scrolling underneath - best for reducing motion sickness"
                    : modeName}
                >
                  {modeName.charAt(0).toUpperCase() + modeName.slice(1)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PlaybackContext.Provider>
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

