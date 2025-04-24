import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


// Utility function to decode audio
export async function decodeAudioData(arrayBuffer: ArrayBuffer, desiredSampleRate: number): Promise<{ samples: Float32Array, sampleRate: number }> {
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



// Types for the result object with discriminated union
type Success<T> = {
  data: T;
  error: null;
};

type Failure<E> = {
  data: null;
  error: E;
};

type Result<T, E = Error> = Success<T> | Failure<E>;

// Main wrapper function
export async function tryCatch<T, E = Error>(
  promise: Promise<T>,
): Promise<Result<T, E>> {
  try {
    const data = await promise;
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error as E };
  }
}