import "./App.css";

import SpectrogramPlayer from "@/lib/SpectrogramPlayer";

import src from "./assets/audio_peggy.mp3";


function App() {
  return (
    <div className="mx-auto flex flex-col items-center max-w-screen-lg h-screen">
      <SpectrogramPlayer
        src={src}
        sampleRate={16000}
        n_fft={2048}
        win_length={400}
        hop_length={160}
        f_min={0}
        f_max={12000.0}
        n_mels={128}
        top_db={120}
        settings={true}
        navigator={false}
        playbackSpeedInitial={1.0}
        playheadModeInitial="scrub"
        playheadWidth={0.0010}
        playheadColor="yellow"
        colormap="inferno"
        specHeight={600}
        navHeight={50}
        controls={true}
        transparent={true}
        dark={true}
        backend="webaudio"
      />
    </div>
  );
}

export default App;

