import "./App.css";

import SpectrogramPlayer from "./lib/SpectrogramPlayer";

import src from "./assets/audio_peggy.mp3";


function App() {
  return (
    <div className="max-w-screen-lg mx-auto mt-5">
      <SpectrogramPlayer
        src={src}
        sampleRate={16000}
        n_fft={2048}
        win_length={400}
        hop_length={160}
        f_min={0}
        f_max={12000.0}
        n_mels={128}
        top_db={80}
        settings={true}
        navigator={true}
        playbackSpeedInitial={1.0}
        playheadModeInitial="scrub"
        playheadWidth={0.0010}
        playheadColor="white"
        specHeight={500}
        navHeight={50}
        colormap="inferno"
        transparent={true}
        dark={true}
      />
    </div>
  );
}

export default App;

