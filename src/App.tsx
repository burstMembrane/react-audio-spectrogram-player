import "@/lib/index.css";
import SpectrogramPlayer from "@/lib/SpectrogramPlayer";

import src from "./assets/audio_peggy.mp3";


function App() {
  return (
    <div className="mx-auto flex flex-col items-center max-w-screen-lg h-screen">
      <SpectrogramPlayer
        src={src}
        sampleRate={16000}

        n_fft={1024}
        win_length={1024}
        hop_length={160}
        f_min={60}
        f_max={8000}       // narrower band = more mel bins for F0 and 1st/2nd harmonics
        n_mels={128}       // more bins → smoother transitions, less visible banding
        top_db={80}        // limits dynamic range and reduces exaggeration of quiet bands
        colormap="inferno" // perceptually uniform and less harsh on contrast transitions
        settings={true}
        navigator={false}
        playbackSpeedInitial={1.0}
        playheadModeInitial="scrub"
        playheadWidth={0.0010}
        playheadColor="white"

        specHeight={500}
        navHeight={50}
        controls={true}
        transparent={true}
        dark={true}
        backend="html5"
      />
    </div>
  );
}

export default App;

