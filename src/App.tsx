import "./App.css";

import SpectrogramPlayer from "./lib/SpectrogramPlayer";

import src from "./assets/because.mp3";


function App() {
  return (
    <div
      style={{
        maxWidth: "100vw",
        marginTop: 40,
        marginLeft: "auto",
        marginRight: "auto",
        width: "90vw",
      }}
    >
      <SpectrogramPlayer
        src={src}
        // sampleRate={16000}
        n_fft={1024}
        win_length={400}
        hop_length={160}
        f_min={0}
        f_max={8000.0}
        n_mels={128}
        top_db={80}
        settings={true}
        navigator={true}
        playbackSpeedInitial={1.0}
        playheadModeInitial="scroll"
        specHeight={300}
        navHeight={60}
        colormap="inferno"
        transparent={true}
        dark={true}
      />
    </div>
  );
}

export default App;

