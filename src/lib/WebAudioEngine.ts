import { AudioEngine, AudioEngineStatus } from './AudioEngine';

/**
 * WebAudioEngine - A wrapper class for WebAudio API operations
 * Encapsulates audio context, buffer loading, playback control and timing logic
 */
export class WebAudioEngine implements AudioEngine {
    private context: AudioContext | null = null;
    private gainNode: GainNode | null = null;
    private sourceNode: AudioBufferSourceNode | null = null;
    private audioBuffer: AudioBuffer | null = null;
    private startTime: number = 0;
    private pausedAt: number = 0;
    private isPlaying: boolean = false;
    private sampleRate: number;
    private loopMode: boolean = false;
    private loopStart: number = 0;
    private loopEnd: number = 0;
    private playbackRate: number = 1.0;
    private volume: number = 1.0;
    private onEndedCallback: (() => void) | null = null;
    private onTimeUpdateCallback: ((currentTime: number) => void) | null = null;
    private timeUpdateInterval: number | null = null;

    constructor(desiredSampleRate: number = 44100) {
        this.sampleRate = desiredSampleRate;
    }

    /**
     * Initialize the audio context and gain node
     */
    async initialize(): Promise<boolean> {
        if (this.context) {
            console.log("[WebAudioEngine] Context already initialized");
            return true;
        }

        try {
            console.log("[WebAudioEngine] Initializing WebAudio context");
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            this.context = new AudioContextClass({
                sampleRate: this.sampleRate,
            });

            console.log(`[WebAudioEngine] Created AudioContext with sample rate: ${this.context.sampleRate}`);
            this.sampleRate = this.context.sampleRate;

            // Create gain node for volume control
            this.gainNode = this.context.createGain();
            this.gainNode.gain.value = 1.0;
            this.gainNode.connect(this.context.destination);
            console.log("[WebAudioEngine] Created and connected GainNode");

            return true;
        } catch (error) {
            console.error("[WebAudioEngine] Failed to initialize WebAudio API:", error);
            return false;
        }
    }

    /**
     * Load audio data into a buffer
     */
    async loadAudioData(samples: Float32Array | Float32Array[], sampleRate: number, numChannels: number): Promise<boolean> {
        if (!this.context) {
            const initialized = await this.initialize();
            if (!initialized) return false;
        }

        try {
            console.log("[WebAudioEngine] Setting up audio buffer");

            // Determine sample length and actual number of channels
            let sampleLength: number;
            let actualNumChannels: number;

            if (Array.isArray(samples)) {
                // For stereo/multi-channel audio
                sampleLength = samples[0].length;
                actualNumChannels = Math.min(samples.length, 2); // Limit to 2 channels (stereo)
                console.log(`[WebAudioEngine] Processing ${actualNumChannels}-channel audio with ${sampleLength} samples`);
            } else {
                // For mono audio
                sampleLength = samples.length;
                actualNumChannels = 1;
                console.log(`[WebAudioEngine] Processing mono audio with ${sampleLength} samples`);
            }

            // Create the audio buffer
            this.audioBuffer = this.context!.createBuffer(actualNumChannels, sampleLength, sampleRate);

            // Fill the audio buffer with samples
            if (Array.isArray(samples)) {
                // Handle stereo/multi-channel audio
                for (let i = 0; i < actualNumChannels; i++) {
                    const channelData = this.audioBuffer.getChannelData(i);
                    const sourceData = samples[i];
                    channelData.set(sourceData);
                }
            } else {
                // Handle mono audio - copy to left channel
                const channelData = this.audioBuffer.getChannelData(0);
                channelData.set(samples);

                // If we want stereo output for mono input, duplicate to right channel
                if (actualNumChannels > 1) {
                    const rightChannelData = this.audioBuffer.getChannelData(1);
                    rightChannelData.set(samples);
                }
            }

            console.log(`[WebAudioEngine] Audio buffer created successfully. Duration: ${this.audioBuffer.duration}s, Channels: ${actualNumChannels}`);
            return true;
        } catch (error) {
            console.error("[WebAudioEngine] Failed to setup WebAudio buffer:", error);
            return false;
        }
    }

    /**
     * Get the duration of the loaded audio
     */
    getDuration(): number {
        return this.audioBuffer ? this.audioBuffer.duration : 0;
    }

    /**
     * Get the current playback position
     */
    getCurrentTime(): number {
        if (!this.context || !this.isPlaying) {
            return this.pausedAt;
        }

        const elapsed = this.context.currentTime - this.startTime;
        return this.pausedAt + (elapsed * this.playbackRate);
    }

    /**
     * Set the playback rate
     */
    setPlaybackRate(rate: number): void {
        this.playbackRate = rate;

        if (this.sourceNode) {
            this.sourceNode.playbackRate.value = rate;
            console.log(`[WebAudioEngine] Set playback rate to ${rate}`);
        }
    }

    /**
     * Configure looping behavior
     * Note: Custom loop ranges are handled by the PlaybackProvider
     */
    setLoopMode(enabled: boolean, start: number = 0, end: number = 0): void {
        this.loopMode = enabled;
        this.loopStart = start;
        this.loopEnd = end;
        console.log("[WebAudioEngine] Loop mode set to", enabled ? "true" : "false");


        // Update source node if already playing
        if (this.sourceNode) {
            this.sourceNode.loop = enabled;
        }
    }

    /**
     * Start or resume playback
     */
    play(startFrom: number = this.pausedAt): boolean {
        if (!this.context || !this.audioBuffer || !this.gainNode) {
            console.log("[WebAudioEngine] Cannot play: missing required WebAudio components");
            return false;
        }

        try {
            console.debug(`[WebAudioEngine] Attempting to play audio from position: ${startFrom}s`);

            // If the context is suspended (e.g., after user interaction required), resume it
            if (this.context.state === 'suspended') {
                console.log("[WebAudioEngine] Resuming suspended audio context");
                this.context.resume();
            }

            // If already playing, stop current playback first
            if (this.isPlaying) {
                console.debug("[WebAudioEngine] Already playing, stopping current playback before restarting");
                this.stopSourceNode();
            }

            // Create a new source node
            this.sourceNode = this.context.createBufferSource();
            this.sourceNode.buffer = this.audioBuffer;
            this.sourceNode.connect(this.gainNode);

            // Set playback rate
            this.sourceNode.playbackRate.value = this.playbackRate;
            console.debug(`[WebAudioEngine] Set playback rate to ${this.playbackRate}`);

            // Calculate offset from the current time
            const offset = Math.max(0, startFrom);
            const audioDuration = this.audioBuffer.duration;
            console.log(`[WebAudioEngine] Start from offset: ${offset}s, startFrom: ${startFrom}s, audio duration: ${audioDuration}s`);
            // Safety check: don't try to start from beyond the end of the audio
            if (offset >= audioDuration) {
                console.log(`[WebAudioEngine] Requested start position (${offset}s) is beyond audio duration (${audioDuration}s). Resetting to start.`);
                this.pausedAt = 0;
            } else {
                // Remember when we started playing and from what position
                this.pausedAt = offset;
            }

            // Mark the start time for time calculations
            this.startTime = this.context.currentTime;
            console.debug(`[WebAudioEngine] Starting playback at context time ${this.startTime}, offset ${this.pausedAt}s, audio duration: ${audioDuration}s`);

            // Apply basic loop setting (let PlaybackProvider handle custom ranges)
            this.sourceNode.loop = this.loopMode;

            console.log(`[WebAudioEngine] Starting playback from offset: ${this.pausedAt}s of ${audioDuration}s`);

            // Set playing state before starting
            this.isPlaying = true;

            // Start playback from the offset
            this.sourceNode.start(0, this.pausedAt);
            console.log(`[WebAudioEngine] Playback started successfully from ${this.pausedAt}s`);

            // Handle end of playback
            this.sourceNode.onended = () => {
                // Check if this is a legitimate end (not from a seek operation)
                if (this.sourceNode) {
                    console.log("[WebAudioEngine] Source node playback ended");
                    if (this.isPlaying) {
                        if (this.loopMode) {
                            // If it's simple loop mode, just restart from the beginning
                            console.log("[WebAudioEngine] Loop mode active, restarting from beginning");
                            this.play(0);
                        } else {
                            console.log("[WebAudioEngine] Playback complete, stopping");
                            // Reset position to beginning when playback ends naturally
                            this.pausedAt = 0;
                            this.isPlaying = false;
                            if (this.onEndedCallback) {
                                this.onEndedCallback();
                            }
                        }
                    }
                }
            };

            // Start time update interval
            this.startTimeUpdateInterval();

            return true;
        } catch (error) {
            console.error("[WebAudioEngine] Failed to play audio:", error);
            this.isPlaying = false;
            return false;
        }
    }

    /**
     * Pause playback
     */
    pause(): void {
        if (!this.isPlaying || !this.context) {
            console.log("[WebAudioEngine] Cannot pause: not playing or missing context");
            return;
        }

        try {
            console.log("[WebAudioEngine] Pausing playback");

            // Calculate where we paused before stopping the source
            if (this.sourceNode && this.context) {
                const elapsed = this.context.currentTime - this.startTime;
                this.pausedAt = this.pausedAt + (elapsed * this.playbackRate);
                console.log(`[WebAudioEngine] Paused at position: ${this.pausedAt}s (elapsed: ${elapsed}s)`);
            }

            // Stop the current source node
            this.stopSourceNode();

            // Update state after operations are complete
            this.isPlaying = false;

            // Stop time update interval
            this.stopTimeUpdateInterval();
        } catch (error) {
            console.error("[WebAudioEngine] Failed to pause playback:", error);
            // Ensure playback state is accurate even if there's an error
            this.isPlaying = false;
        }
    }

    /**
     * Seek to a specific position
     */
    seek(newTime: number): void {
        console.log(`[WebAudioEngine] Seeking to position: ${newTime}s`);

        // Store whether we're currently playing
        const wasPlaying = this.isPlaying;

        // Bound the seek time to valid range
        const boundedTime = Math.max(0, Math.min(newTime, this.getDuration()));

        // Update the pause position regardless of playback state
        this.pausedAt = boundedTime;

        if (wasPlaying) {
            console.log("[WebAudioEngine] Currently playing, restarting from new position");

            // Store original isPlaying state
            const originalIsPlaying = this.isPlaying;

            try {
                // Stop current playback without affecting isPlaying
                if (this.sourceNode) {
                    this.stopSourceNode();
                }

                // Start playback from new position while preserving isPlaying state
                this.isPlaying = originalIsPlaying;

                // Restart playback with a slight delay to avoid race conditions
                setTimeout(() => {
                    if (originalIsPlaying) {
                        console.log(`[WebAudioEngine] Resuming playback at ${this.pausedAt}s after seek`);
                        this.play(this.pausedAt);
                    }
                }, 20);
            } catch (error) {
                console.error("[WebAudioEngine] Error during seek while playing:", error);
                // Restore original state on error
                this.isPlaying = originalIsPlaying;
            }
        } else {
            console.log("[WebAudioEngine] Not currently playing, updating position only");
            // Just update position, no need to restart playback
        }
    }

    /**
     * Set volume (0.0 to 1.0)
     */
    setVolume(volume: number): void {
        if (!this.gainNode) return;

        // Clamp volume between 0 and 1
        const clampedVolume = Math.max(0, Math.min(1, volume));
        this.volume = clampedVolume;
        this.gainNode.gain.value = clampedVolume;
        console.log(`[WebAudioEngine] Set volume to ${clampedVolume}`);
    }

    /**
     * Clean up resources
     */
    destroy(): void {
        this.stopTimeUpdateInterval();
        this.stopSourceNode();

        if (this.context) {
            this.context.close();
            this.context = null;
        }

        this.gainNode = null;
        this.audioBuffer = null;
        console.log("[WebAudioEngine] Resources destroyed");
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
    }

    /**
     * Start the time update interval
     */
    private startTimeUpdateInterval(): void {
        this.stopTimeUpdateInterval();

        if (!this.onTimeUpdateCallback) return;

        this.timeUpdateInterval = window.setInterval(() => {
            if (!this.isPlaying) return;

            const currentTime = this.getCurrentTime();
            this.onTimeUpdateCallback!(currentTime);
        }, 50); // 20fps updates
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
     * Safely stop and disconnect the source node
     */
    private stopSourceNode(): void {
        if (this.sourceNode) {
            try {
                // Remove the onended handler temporarily to prevent false triggers during seek
                this.sourceNode.onended = null;

                this.sourceNode.stop();
                this.sourceNode.disconnect();
            } catch (e) {
                console.log("[WebAudioEngine] Error stopping source node:", e);
            }
            this.sourceNode = null;
        }
    }

    /**
     * Check if audio is currently playing
     */
    isAudioPlaying(): boolean {
        return this.isPlaying;
    }

    /**
     * Get the current playback status
     */
    getStatus(): AudioEngineStatus {
        return {
            isPlaying: this.isPlaying,
            currentTime: this.getCurrentTime(),
            duration: this.getDuration(),
            playbackRate: this.playbackRate,
            loopMode: this.loopMode,
            loopStart: this.loopStart,
            loopEnd: this.loopEnd,
            volume: this.volume
        };
    }
}

export default WebAudioEngine; 