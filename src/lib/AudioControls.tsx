import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Repeat } from "lucide-react";
import { cn } from "@/lib/utils";

type AudioControlsProps = {
    isLoadingAudio: boolean;
    audioError: Error | null;
    duration: number | null;
    currentTime: number;
    playbackRate: number;
    isPlaying: boolean;
    mode: string;
    backend: "html5" | "webaudio";
    onPlayPauseClick: () => void;
    onSeek: (time: number) => void;
    onLoopToggle: () => void;
};

// Helper function to format time as mm:ss
function formatTime(time: number): string {
    if (!time) return '0:00';

    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
}


const PlayFilled = ({ className }: { className: string }) => (
    <div className={className}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
            <path d="M5 3.87v16.26c0 .75.82 1.2 1.46.82l13.09-8.13c.64-.4.64-1.33 0-1.72L6.46 2.97A.998.998 0 0 0 5 3.87z" />
        </svg>
    </div>
)
const PauseFilled = ({ className }: { className: string }) => (
    <div className={className}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
        </svg>
    </div>
)



export function AudioControls({
    isLoadingAudio,
    audioError,
    duration,
    currentTime,
    playbackRate,
    isPlaying,
    mode,
    backend,
    onPlayPauseClick,
    onSeek,
    onLoopToggle,
}: AudioControlsProps) {
    const isLoopEnabled = mode === "loop";

    return (
        <div className="flex w-full items-center justify-center gap-4">
            <Button
                variant="bare"
                size="sm"
                onClick={onPlayPauseClick}
                disabled={isLoadingAudio || !!audioError}
            >
                {isPlaying ? (
                    <PauseFilled className="w-4 h-4" />
                ) : (
                    <PlayFilled className="w-4 h-4 fill-white" />
                )}
            </Button>

            <div className="text-sm font-medium text-neutral-600 dark:text-neutral-400 select-none">
                {currentTime ? formatTime(currentTime) : "0:00"}
            </div>

            <Progress
                value={currentTime}
                maxValue={duration || 0}
                onChange={(value) => onSeek(value)}
            />

            <div className="text-sm font-medium text-neutral-600 dark:text-neutral-400 select-none">
                {duration ? formatTime(duration) : "0:00"}
            </div>

            <div className="text-sm font-medium dark:text-neutral-400 select-none">
                {`${playbackRate.toFixed(1)}x`}
            </div>

            <Button
                variant="bare"
                size="sm"
                onClick={onLoopToggle}
                title={isLoopEnabled ? "Disable loop" : "Loop current segment"}
                className={cn(
                    isLoopEnabled ? "text-blue-500" : "text-neutral-500 dark:text-neutral-400"
                )}
            >
                <Repeat className="w-4 h-4" />
            </Button>

            <div className="text-xs text-neutral-400 dark:text-neutral-500 hidden md:block">
                {backend === "webaudio" ? "WebAudio" : "HTML5"}
            </div>
        </div>
    );
}


