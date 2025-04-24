// Worker Manager for Spectrogram Processing
import { nanoid } from 'nanoid';

// Types
interface WorkerTask {
    id: string;
    resolve: (value: any) => void;
    reject: (reason: any) => void;
}

interface TaskMessage {
    id: string;
    type: string;
    data: any;
}

interface SpectrogramParams {
    n_fft: number;
    win_length: number;
    hop_length: number;
    f_min: number;
    f_max: number;
    n_mels: number;
    top_db: number;
    colormap: string;
    transparent: boolean;
}

type LogCallback = (func: string, msg: string) => void;

export class SpectrogramWorkerManager {
    private workers: Worker[] = [];
    private taskQueue: TaskMessage[] = [];
    private pendingTasks = new Map<string, WorkerTask>();
    private availableWorkers: Worker[] = [];
    private isInitialized = false;
    private logCallback: LogCallback | null = null;

    constructor(numWorkers = navigator.hardwareConcurrency || 4) {
        // Cap the number of workers to be reasonable
        const actualWorkers = Math.min(numWorkers, 8);

        // Initialize the workers
        for (let i = 0; i < actualWorkers; i++) {
            this.createWorker();
        }
    }

    // Set a callback for worker logs
    setLogCallback(callback: LogCallback) {
        this.logCallback = callback;
    }

    private log(func: string, msg: string) {
        if (this.logCallback) {
            this.logCallback(func, msg);
        }
    }

    private createWorker() {
        // Create a new worker
        const worker = new Worker(new URL('./spectrogram-worker.ts', import.meta.url), {
            type: 'module'
        });



        // Add message handler
        worker.onmessage = this.handleWorkerMessage.bind(this, worker);

        // Add error handler
        worker.onerror = (error) => {
            this.log('workerManager', `Worker error: ${error.message}`);
            // Try to replace the worker
            worker.terminate();
            const index = this.workers.indexOf(worker);
            if (index > -1) {
                this.workers.splice(index, 1);
                this.createWorker(); // Replace the worker
            }
        };

        // Store the worker
        this.workers.push(worker);
    }

    private handleWorkerMessage(worker: Worker, event: MessageEvent) {
        const { id, type, data, error } = event.data;

        // Handle logs from worker
        if (type === 'log' && data) {
            this.log(data.func, data.msg);
            return;
        }

        // Handle worker ready message
        if (type === 'ready') {
            this.availableWorkers.push(worker);
            this.isInitialized = true;
            this.processQueue();
            return;
        }

        // Handle task completion
        if (id && this.pendingTasks.has(id)) {
            const task = this.pendingTasks.get(id)!;

            if (type === 'error') {
                task.reject(error || 'Unknown worker error');
            } else if (type === 'chunk_complete') {
                // Convert the ArrayBuffer back to ImageData
                const imageData = new ImageData(
                    new Uint8ClampedArray(data.data),
                    data.width,
                    data.height
                );
                task.resolve({
                    imageData,
                    width: data.width,
                    height: data.height
                });
            } else {
                task.resolve(data);
            }

            // Remove the task from pending
            this.pendingTasks.delete(id);

            // Make the worker available again
            this.availableWorkers.push(worker);

            // Process the next task in the queue
            this.processQueue();
        }
    }

    private processQueue() {
        if (this.availableWorkers.length === 0 || this.taskQueue.length === 0) {
            return;
        }
        const task = this.taskQueue.shift()!;
        const worker = this.availableWorkers.pop()!;

        worker.postMessage(task);
    }

    async processChunk(
        audioSamples: Float32Array,
        sampleRate: number,
        params: SpectrogramParams,
        spectrogramData?: number[][]
    ): Promise<any> {
        return new Promise((resolve, reject) => {
            const id = nanoid();
            const message: TaskMessage = {
                id,
                type: 'process_chunk',
                data: {
                    spectrogramData,
                    audioSamples,
                    sampleRate,
                    params
                }
            };
            this.pendingTasks.set(id, { id, resolve, reject });
            if (this.availableWorkers.length > 0) {
                const worker = this.availableWorkers.pop()!;
                worker.postMessage(message, [audioSamples.buffer]);
            } else {
                this.taskQueue.push(message);
            }
        });
    }

    // Wait for all workers to be ready
    async waitForReady(timeout = 5000): Promise<boolean> {
        if (this.isInitialized && this.availableWorkers.length > 0) {
            return true;
        }

        return new Promise((resolve) => {
            const start = Date.now();
            const checkInterval = setInterval(() => {
                if (this.isInitialized && this.availableWorkers.length > 0) {
                    clearInterval(checkInterval);
                    resolve(true);
                } else if (Date.now() - start > timeout) {
                    clearInterval(checkInterval);
                    resolve(false);
                }
            }, 100);
        });
    }

    // Clean up all workers
    terminate() {
        this.workers.forEach(worker => worker.terminate());
        this.workers = [];
        this.availableWorkers = [];
        this.taskQueue = [];
        this.pendingTasks.clear();
    }
}

// Singleton instance
let instance: SpectrogramWorkerManager | null = null;

// Get or create the worker manager instance
export function getWorkerManager(): SpectrogramWorkerManager {
    if (!instance) {
        instance = new SpectrogramWorkerManager();
    }
    return instance;
} 