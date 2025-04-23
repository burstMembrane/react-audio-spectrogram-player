import "./App.css";

import SpectrogramPlayer from "@/lib/SpectrogramPlayer";

import src from "./assets/wontgetfooled.mp3";


function App() {
  return (
    <div className="max-w-screen-lg h-screen mx-auto mt-10 ">
      <SpectrogramPlayer
        src={src}
        sampleRate={44100}
        n_fft={2048}
        win_length={400}
        hop_length={160}
        f_min={0}
        f_max={20000.0}
        n_mels={128}
        top_db={120}
        settings={true}
        navigator={false}
        playbackSpeedInitial={1.0}
        playheadModeInitial="scrub"
        playheadWidth={0.0010}
        playheadColor="yellow"
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

