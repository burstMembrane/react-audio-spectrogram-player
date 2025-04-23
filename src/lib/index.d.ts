import React from 'react';

export interface Annotations {
    data: (string | number)[][];
    title?: string;
    height?: number;
    strokeWidth?: number;
}

export interface SpectrogramPlayerProps {
    src: string;
    sxx?: number[][];
    sampleRate?: number;
    n_fft?: number;
    win_length?: number;
    hop_length?: number;
    f_min?: number;
    f_max?: number;
    n_mels?: number;
    top_db?: number;
    annotations?: Annotations[];
    navigator?: boolean;
    settings?: boolean;
    startTimeInitial?: number;
    endTimeInitial?: number;
    playbackSpeedInitial?: number;
    playheadModeInitial?: string;
    specHeight?: number;
    navHeight?: number;
    colormap?: string;
    transparent?: boolean;
    dark?: boolean;
    playheadColor?: string;
    playheadWidth?: number;
}

declare const SpectrogramPlayer: React.FC<SpectrogramPlayerProps>;

export default SpectrogramPlayer; 