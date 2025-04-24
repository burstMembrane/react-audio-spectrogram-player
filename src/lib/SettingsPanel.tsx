import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Settings2Icon } from "lucide-react";
import { Label } from "@/components/ui/label";

export function SettingsPanel({
    playbackRate,
    setPlaybackRate,
    mode,
    setMode
}: {
    playbackRate: number;
    setPlaybackRate: (rate: number) => void;
    mode: string;
    setMode: (mode: string) => void;
}) {
    const playbackRates = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
    const playheadModes = ["page", "stop", "loop", "continue", "scroll", "scrub"];

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon">
                    <Settings2Icon className="w-4 h-4" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64">
                <div className="grid gap-4">


                    {/* Playback Speed Section */}
                    <div className="grid gap-2">
                        <Label className="font-medium leading-none">Playback Speed</Label>
                        <div className="flex flex-wrap gap-2 mt-1">
                            {playbackRates.map((rate) => (
                                <Button
                                    key={rate}
                                    variant={playbackRate === rate ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setPlaybackRate(rate)}
                                >
                                    {rate}x
                                </Button>
                            ))}
                        </div>
                    </div>

                    {/* Playhead Mode Section */}
                    <div className="border-t pt-3 space-y-2">
                        <Label className="font-medium leading-none">Playhead Mode</Label>
                        <div className="grid grid-cols-3 gap-2">
                            {playheadModes.map((modeOption) => (
                                <Button
                                    key={modeOption}
                                    variant={mode === modeOption ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setMode(modeOption)}
                                    className="capitalize"
                                >
                                    {modeOption}
                                </Button>
                            ))}
                        </div>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    )
}

