"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";

const DEFAULT_AUDIO = "/vine-boom.mp3";

export default function Page() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [audioSource, setAudioSource] = useState(DEFAULT_AUDIO);
  const [customUrl, setCustomUrl] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [message, setMessage] = useState(
    "Using the built-in Vine Boom file."
  );

  useEffect(() => {
    audioRef.current = new Audio(DEFAULT_AUDIO);
    audioRef.current.preload = "auto";

    const handleEnded = () => setIsPlaying(false);
    audioRef.current.addEventListener("ended", handleEnded);

    return () => {
      audioRef.current?.pause();
      audioRef.current?.removeEventListener("ended", handleEnded);

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const swapSource = (nextSource: string, nextMessage: string) => {
    setAudioSource(nextSource);
    setMessage(nextMessage);
    setIsPlaying(false);

    if (!audioRef.current) {
      return;
    }

    audioRef.current.pause();
    audioRef.current.src = nextSource;
    audioRef.current.load();
  };

  const handlePlay = async () => {
    if (!audioRef.current) {
      return;
    }

    audioRef.current.currentTime = 0;
    await audioRef.current.play();
    setIsPlaying(true);
  };

  const handleUrlApply = () => {
    const nextUrl = customUrl.trim();

    if (!nextUrl) {
      swapSource(DEFAULT_AUDIO, "Using the built-in Vine Boom file.");
      return;
    }

    try {
      const parsed = new URL(nextUrl);
      swapSource(parsed.toString(), "Using your custom audio URL.");
    } catch {
      setMessage("That link is not a valid direct audio URL.");
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }

    const nextObjectUrl = URL.createObjectURL(file);
    objectUrlRef.current = nextObjectUrl;
    swapSource(nextObjectUrl, `Using uploaded file: ${file.name}`);
    event.target.value = "";
  };

  return (
    <main className="page-shell">
      <section className="vine-panel">
        <p className="vine-kicker">Vine Boom</p>
        <button
          className={`vine-button ${isPlaying ? "vine-button-active" : ""}`}
          onClick={() => void handlePlay()}
          type="button"
        >
          <span className="vine-emoji" aria-hidden="true">
            💥
          </span>
          <span className="vine-title">Play Vine Boom</span>
          <span className="vine-caption">
            {isPlaying ? "Playing now" : "Tap for impact"}
          </span>
        </button>

        <p className="vine-message">{message}</p>
      </section>

      <section className="custom-panel">
        <h2>Replace the sound</h2>
        <p className="custom-copy">
          Paste a direct audio file link you control, or upload your own MP3.
          I did not add YouTube-to-MP3 conversion.
        </p>

        <label className="field-label" htmlFor="audio-url">
          Direct audio URL
        </label>
        <div className="url-row">
          <input
            id="audio-url"
            className="audio-input"
            onChange={(event) => setCustomUrl(event.target.value)}
            placeholder="https://example.com/sound.mp3"
            type="url"
            value={customUrl}
          />
          <button className="apply-button" onClick={handleUrlApply} type="button">
            Use link
          </button>
        </div>

        <label className="upload-button" htmlFor="audio-file">
          Upload MP3
        </label>
        <input
          accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg"
          className="file-input"
          id="audio-file"
          onChange={handleFileChange}
          type="file"
        />

        <p className="helper-text">Current source: {audioSource}</p>
      </section>
    </main>
  );
}
