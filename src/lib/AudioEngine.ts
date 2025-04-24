import { useState, useEffect } from 'react';

/**
 * Custom event system to bridge the audio engine with React
 */
export class AudioEngineEvents {
    private listeners: { [key: string]: Set<(value: any) => void> } = {};

    addEventListener(event: string, callback: (value: any) => void) {
        if (!this.listeners[event]) {
            this.listeners[event] = new Set();
        }
        this.listeners[event].add(callback);
        return () => this.removeEventListener(event, callback);
    }

    removeEventListener(event: string, callback: (value: any) => void) {
        if (this.listeners[event]) {
            this.listeners[event].delete(callback);
        }
    }

    dispatchEvent(event: string, value: any) {
        if (this.listeners[event]) {
            for (const callback of this.listeners[event]) {
                callback(value);
            }
        }
    }
}

/**
 * Hook that listens to audio engine state via events instead of polling.
 * This provides a reactive, efficient way to keep React state in sync with the engine.
 * 
 * @param audioEngineRef Reference to the audio engine
 * @param eventsRef Reference to the events manager
 * @param engineInitialized Whether the engine has been initialized
 * @returns Current playing state from the engine
 */
export function useIsPlaying(
    audioEngineRef: React.RefObject<AudioEngine | null>,
    eventsRef: React.RefObject<AudioEngineEvents | null>,
    engineInitialized: boolean
) {
    // Local state to track playing status
    const [isPlaying, setIsPlaying] = useState(false);

    // Set up event listeners when the engine is initialized
    useEffect(() => {
        if (!engineInitialized || !eventsRef.current) return;

        // Initial state from engine
        if (audioEngineRef.current) {
            setIsPlaying(audioEngineRef.current.isAudioPlaying());
        }

        // Subscribe to play/pause events
        const removePlayListener = eventsRef.current.addEventListener('play', () => {
            setIsPlaying(true);
        });

        const removePauseListener = eventsRef.current.addEventListener('pause', () => {
            setIsPlaying(false);
        });

        return () => {
            removePlayListener();
            removePauseListener();
        };
    }, [engineInitialized, audioEngineRef, eventsRef]);

    return isPlaying;
}


/**
 * Common interface for audio engine implementations
 */
export interface AudioEngine {
    initialize(): Promise<boolean>;
    loadAudioData?(samples: Float32Array, sampleRate: number): Promise<boolean>;
    play(startFrom?: number): boolean;
    pause(): void;
    seek(newTime: number): void;
    setPlaybackRate(rate: number): void;
    setLoopMode(enabled: boolean, start?: number, end?: number): void;
    setVolume(volume: number): void;
    getDuration(): number;
    getCurrentTime(): number;
    isAudioPlaying(): boolean;
    getStatus(): AudioEngineStatus;
    onEnded(callback: () => void): void;
    onTimeUpdate(callback: (currentTime: number) => void): void;
    destroy(): void;
}

/**
 * Status object returned by audio engines
 */
export interface AudioEngineStatus {
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    playbackRate: number;
    loopMode: boolean;
    loopStart: number;
    loopEnd: number;
    volume: number;
}

// Export the constants for use in PlaybackProvider
export const FPS = 50; // 50 frames per second = 20ms interval
export const AUDIO_ENGINE_UPDATE_INTERVAL_MS = 1000 / FPS;

/**
 * Factory function to create the appropriate audio engine
 */
export function createAudioEngine(
    backend: "html5" | "webaudio",
    src: string,
    options?: {
        sampleRate?: number;
    }
): Promise<AudioEngine> {
    return new Promise(async (resolve, reject) => {
        try {
            let engine: AudioEngine;

            // Dynamically import the appropriate engine implementation
            if (backend === "webaudio") {
                const { default: WebAudioEngine } = await import('./WebAudioEngine');
                engine = new WebAudioEngine(options?.sampleRate || 44100);
            } else {
                engine = new HTML5AudioEngine(src);
            }

            // Initialize the engine
            const success = await engine.initialize();

            if (success) {
                resolve(engine);
            } else {
                reject(new Error(`Failed to initialize ${backend} audio engine`));
            }
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * HTML5AudioEngine - A wrapper class for HTML5 Audio API operations
 * Implements the same interface as WebAudioEngine for consistent usage
 */
export class HTML5AudioEngine implements AudioEngine {
    private audio: HTMLAudioElement;
    private src: string;
    private intervalId: number | null = null;
    private loopMode: boolean = false;
    private loopStart: number = 0;
    private loopEnd: number = 0;
    private onEndedCallback: (() => void) | null = null;
    private onTimeUpdateCallback: ((currentTime: number) => void) | null = null;
    private timeUpdateInterval: number | null = null;

    constructor(audioSrc: string) {
        this.src = audioSrc;
        this.audio = new Audio();
    }

    /**
     * Initialize the audio element
     */
    async initialize(): Promise<boolean> {
        console.log("[HTML5AudioEngine] Initializing with source:", this.src);

        try {
            this.audio.src = this.src;
            this.audio.preload = "auto";

            // Set up event listeners
            this.setupEventListeners();

            return new Promise<boolean>((resolve) => {
                const canPlayHandler = () => {
                    console.log("[HTML5AudioEngine] Audio is ready to play");
                    this.audio.removeEventListener('canplaythrough', canPlayHandler);
                    resolve(true);
                };

                const errorHandler = (e: ErrorEvent) => {
                    console.error("[HTML5AudioEngine] Error loading audio:", e);
                    this.audio.removeEventListener('error', errorHandler);
                    resolve(false);
                };

                this.audio.addEventListener('canplaythrough', canPlayHandler);
                this.audio.addEventListener('error', errorHandler);

                // If the audio is already loaded, resolve immediately
                if (this.audio.readyState >= 3) {
                    console.log("[HTML5AudioEngine] Audio already loaded");
                    this.audio.removeEventListener('canplaythrough', canPlayHandler);
                    resolve(true);
                }
            });
        } catch (error) {
            console.error("[HTML5AudioEngine] Failed to initialize:", error);
            return false;
        }
    }

    /**
     * Set up event listeners for the audio element
     */
    private setupEventListeners(): void {
        // Handle native ended event
        this.audio.addEventListener('ended', () => {
            console.log("[HTML5AudioEngine] Audio playback ended");

            if (this.loopMode) {
                console.log("[HTML5AudioEngine] Loop mode active, restarting from beginning");
                this.play(0);
            } else if (this.onEndedCallback) {

                this.onEndedCallback();
            }
        });

        // Handle time updates for our callback
        this.audio.addEventListener('timeupdate', () => {
            if (this.onTimeUpdateCallback) {
                this.onTimeUpdateCallback(this.audio.currentTime);
            }
        });
    }

    /**
     * Start or resume playback
     */
    play(startFrom?: number): boolean {
        console.log(`[HTML5AudioEngine] Attempting to play from ${startFrom !== undefined ? startFrom : 'current position'}`);

        try {
            if (startFrom !== undefined) {
                this.audio.currentTime = startFrom;
            }

            const playPromise = this.audio.play();

            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.error("[HTML5AudioEngine] Play error:", error);
                    return false;
                });
            }

            // Start time update interval for more frequent time updates
            this.startTimeUpdateInterval();

            return true;
        } catch (error) {
            console.error("[HTML5AudioEngine] Failed to play:", error);
            return false;
        }
    }

    /**
     * Pause playback
     */
    pause(): void {
        console.log("[HTML5AudioEngine] Pausing playback");
        this.audio.pause();
        this.stopTimeUpdateInterval();
    }

    /**
     * Seek to a specific position
     */
    seek(newTime: number): void {
        console.log(`[HTML5AudioEngine] Seeking to ${newTime}s`);
        this.audio.currentTime = Math.max(0, Math.min(newTime, this.audio.duration));
    }

    /**
     * Set the playback rate
     */
    setPlaybackRate(rate: number): void {
        console.log(`[HTML5AudioEngine] Setting playback rate to ${rate}`);
        this.audio.playbackRate = rate;
    }

    /**
     * Configure looping behavior
     * Note: Custom loop ranges are handled by the PlaybackProvider
     */
    setLoopMode(enabled: boolean, start: number = 0, end: number = 0): void {
        this.loopMode = enabled;
        this.loopStart = start;
        this.loopEnd = end;

        // Only enable native loop for whole file looping
        this.audio.loop = enabled;

        if (enabled) {
            console.log("[HTML5AudioEngine] Loop mode enabled");
        } else {
            console.log("[HTML5AudioEngine] Loop mode disabled");
        }
    }

    /**
     * Start the time update interval for more frequent updates
     */
    private startTimeUpdateInterval(): void {
        this.stopTimeUpdateInterval();

        // Only start interval if we need to update time
        if (!this.onTimeUpdateCallback) return;

        this.timeUpdateInterval = window.setInterval(() => {
            if (this.audio.paused) return;

            // Call the time update callback if registered
            if (this.onTimeUpdateCallback) {
                this.onTimeUpdateCallback(this.audio.currentTime);
            }
        }, AUDIO_ENGINE_UPDATE_INTERVAL_MS);
    }

    /**
     * Stop the time update interval
     */
    private stopTimeUpdateInterval(): void {
        if (this.timeUpdateInterval !== null) {
            clearInterval(this.timeUpdateInterval);
            this.timeUpdateInterval = null;
        }
    }

    /**
     * Set volume (0.0 to 1.0)
     */
    setVolume(volume: number): void {
        const clampedVolume = Math.max(0, Math.min(1, volume));
        console.log(`[HTML5AudioEngine] Setting volume to ${clampedVolume}`);
        this.audio.volume = clampedVolume;
    }

    /**
     * Get the duration of the loaded audio
     */
    getDuration(): number {
        return this.audio.duration || 0;
    }

    /**
     * Get the current playback position
     */
    getCurrentTime(): number {
        return this.audio.currentTime;
    }

    /**
     * Check if audio is currently playing
     */
    isAudioPlaying(): boolean {
        return !this.audio.paused;
    }

    /**
     * Set callback for when playback ends
     */
    onEnded(callback: () => void): void {
        this.onEndedCallback = callback;
    }

    /**
     * Set callback for time updates
     */
    onTimeUpdate(callback: (currentTime: number) => void): void {
        this.onTimeUpdateCallback = callback;

        // If we're already playing, start the interval
        if (!this.audio.paused) {
            this.startTimeUpdateInterval();
        }
    }

    /**
     * Get the current playback status
     */
    getStatus(): AudioEngineStatus {
        return {
            isPlaying: !this.audio.paused,
            currentTime: this.audio.currentTime,
            duration: this.audio.duration || 0,
            playbackRate: this.audio.playbackRate,
            loopMode: this.loopMode,
            loopStart: this.loopStart,
            loopEnd: this.loopEnd,
            volume: this.audio.volume
        };
    }

    /**
     * Clean up resources
     */
    destroy(): void {
        console.log("[HTML5AudioEngine] Cleaning up resources");
        this.stopTimeUpdateInterval();

        // Remove all event listeners
        this.audio.onended = null;
        this.audio.ontimeupdate = null;
        this.audio.onerror = null;
        this.audio.oncanplaythrough = null;

        // Stop playback
        this.audio.pause();

        // Clear src
        this.audio.src = '';
        this.audio.load(); // Reset and release resources
    }
} 