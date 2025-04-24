// Resampling worker using OfflineAudioContext for efficient sample rate conversion

// Define the worker's communication interface
interface ResamplingRequest {
    audioData: Float32Array | Float32Array[];
    originalSampleRate: number;
    targetSampleRate: number;
}

interface ResamplingResponse {
    status: 'success' | 'error';
    resampledData?: Float32Array | Float32Array[];
    message?: string;
}

// Handle the incoming messages
self.onmessage = async (e: MessageEvent) => {
    try {
        const { audioData, originalSampleRate, targetSampleRate } = e.data as ResamplingRequest;

        if (!audioData || !originalSampleRate || !targetSampleRate) {
            self.postMessage({
                status: 'error',
                message: 'Missing required parameters: audioData, originalSampleRate, or targetSampleRate'
            } as ResamplingResponse);
            return;
        }

        console.log(`[Resampling Worker] Resampling from ${originalSampleRate}Hz to ${targetSampleRate}Hz`);

        const result = await resampleAudio(audioData, originalSampleRate, targetSampleRate);

        self.postMessage({
            status: 'success',
            resampledData: result
        } as ResamplingResponse);
    } catch (error) {
        console.error('[Resampling Worker] Error:', error);
        self.postMessage({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error during resampling'
        } as ResamplingResponse);
    }
};

/**
 * Resample audio data using OfflineAudioContext
 * 
 * @param audioData Audio data to resample (mono or stereo)
 * @param originalSampleRate Original sample rate of the audio
 * @param targetSampleRate Target sample rate for resampling
 * @returns Resampled audio data with the target sample rate
 */
async function resampleAudio(
    audioData: Float32Array | Float32Array[],
    originalSampleRate: number,
    targetSampleRate: number
): Promise<Float32Array | Float32Array[]> {
    // If sample rates are equal, no resampling needed
    if (originalSampleRate === targetSampleRate) {
        return audioData;
    }

    // Determine if audio is mono or stereo
    const isMultiChannel = Array.isArray(audioData);
    const numChannels = isMultiChannel ? (audioData as Float32Array[]).length : 1;
    const sampleCount = isMultiChannel ? (audioData as Float32Array[])[0].length : (audioData as Float32Array).length;

    // Calculate the duration and new sample count
    const duration = sampleCount / originalSampleRate;
    const newSampleCount = Math.ceil(duration * targetSampleRate);

    // Create audio buffer with original sample rate
    const audioContext = new OfflineAudioContext(
        numChannels,
        newSampleCount,
        targetSampleRate
    );

    // Create a buffer with the original audio data
    const buffer = audioContext.createBuffer(numChannels, sampleCount, originalSampleRate);

    // Fill the buffer with our audio data
    if (isMultiChannel) {
        for (let channel = 0; channel < numChannels; channel++) {
            buffer.copyToChannel((audioData as Float32Array[])[channel], channel);
        }
    } else {
        buffer.copyToChannel(audioData as Float32Array, 0);
    }

    // Create a buffer source and play it through the offline context
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);

    // Render the audio through the offline context
    const renderedBuffer = await audioContext.startRendering();

    // Extract the resampled data
    if (isMultiChannel) {
        const result: Float32Array[] = [];
        for (let channel = 0; channel < numChannels; channel++) {
            result.push(renderedBuffer.getChannelData(channel));
        }
        return result;
    } else {
        return renderedBuffer.getChannelData(0);
    }
}

// Indicate that the worker is ready
console.log('[Resampling Worker] Initialized and ready');
