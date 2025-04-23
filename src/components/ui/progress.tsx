import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

interface ProgressProps {
  value?: number;
  maxValue?: number;
  onChange?: (value: number) => void;
  className?: string;
}

function Progress({
  className,
  value,
  maxValue = 100,
  onChange,
  ...props
}: ProgressProps & Omit<React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>, 'onChange'>) {
  const progressRef = React.useRef<HTMLDivElement>(null);
  const [instantSeek, setInstantSeek] = React.useState(false);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !onChange) return;

    const rect = progressRef.current.getBoundingClientRect();
    const clickPosition = event.clientX - rect.left;
    const percentage = (clickPosition / rect.width) * 100;
    const newValue = (percentage / 100) * maxValue;

    setInstantSeek(true);
    onChange(Math.max(0, Math.min(maxValue, newValue)));

    // Reset clicking state after a short delay
    setTimeout(() => setInstantSeek(false), 100);
  };


  // also setClicking to true when we reach the end so we can loop smoothly
  const handleLoop = () => {
    if (value === maxValue) {
      setInstantSeek(true);

      setTimeout(() => setInstantSeek(false), 100);
    }
  };

  const percentage = maxValue > 0 ? ((value || 0) / maxValue) * 100 : 0;

  return (
    <ProgressPrimitive.Root
      ref={progressRef}
      data-slot="progress"
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-gray-700 dark:bg-gray-700 cursor-pointer",
        className
      )}
      onChange={handleLoop}
      onClick={handleClick}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "h-full dark:bg-gray-200 bg-gray-200",
          instantSeek ? "" : "transition-all duration-150"
        )}
        style={{ width: `${percentage}%` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
