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
        sampleRate={8000}
        n_fft={2048}
        win_length={400}
        hop_length={160}
        f_min={0}
        f_max={8000.0}
        n_mels={128}
        top_db={80}
        settings={true}
        navigator={true}
        playbackSpeedInitial={1.0}
        playheadModeInitial="scrub"
        playheadWidth={0.0010}
        playheadColor="black"
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

