import init, { mel_spectrogram_db } from "rust-melspec-wasm";

// Create a worker console.log wrapper
const log = (func: string, msg: string) => {
    self.postMessage({ type: 'log', data: { func, msg } });
};


let wasmInitialized = false;
// Helper functions (moved from main file)
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

// Import the colormap at runtime (can't use direct imports in workers)
let colormap: any = null;
async function loadColormap() {
    if (!colormap) {
        try {
            // Dynamic import of the colormap module
            const colormapModule = await import('colormap');
            colormap = colormapModule.default;
        } catch (error) {
            log('loadColormap', `Error loading colormap: ${error}`);
            throw error;
        }
    }
    return colormap;
}

function getImageData(spec: Float32Array[], transparent: boolean, colormapName: string) {
    if (!colormap) {
        throw new Error('Colormap not loaded');
    }

    let colors;
    try {
        colors = colormap({
            colormap: colormapName,
            nshades: 256,
            format: "rgba",
            alpha: 255,
        });
    } catch (error) {
        log('getImageData', `Error with colormap "${colormapName}": ${error}`);
        // Fallback to a default colormap if the requested one doesn't exist
        colors = colormap({
            colormap: 'viridis', // Default fallback colormap
            nshades: 256,
            format: "rgba",
            alpha: 255,
        });
    }

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


export async function processSpectrogram(
    spectrogramData: number[][] | undefined,
    audioSamples: Float32Array,
    sampleRate: number,
    params: any
) {
    log("processSpectrogram", "Starting spectrogram computation in worker");
    const queryStart = performance.now();

    let spec: Float32Array[];

    if (!wasmInitialized) {
        log("processSpectrogram", "Initializing WASM module");
        await init();

    }

    if (!colormap) {
        await loadColormap();
    }

    if (spectrogramData !== undefined) {
        log("processSpectrogram", "Using provided spectrogramData");
        spec = spectrogramData[0].map(
            (_, colIndex) => new Float32Array(spectrogramData.map((row) => row[colIndex]))
        );
        const imageData = getImageData(spec, params.transparent, params.colormap);
        return {
            width: imageData.width,
            height: imageData.height,
            imageData: imageData,
        };
    }

    if (!audioSamples || audioSamples.length === 0) {
        log("processSpectrogram", "No audio samples available");
        return null;
    }

    spec = mel_spectrogram_db(
        sampleRate,
        audioSamples,
        params.n_fft,
        params.win_length,
        params.hop_length,
        params.f_min,
        params.f_max,
        params.n_mels,
        params.top_db
    );
    log("processSpectrogram", `Mel spectrogram computed successfully with ${spec.length} frames`);
    // Generate image data from spectrogram
    const imageData = getImageData(spec, params.transparent, params.colormap);
    const queryEnd = performance.now();
    log("processSpectrogram", `Total processing time: ${(queryEnd - queryStart).toFixed(2)}ms`);

    return {
        width: imageData.width,
        height: imageData.height,
        imageData: imageData,
    };
}
