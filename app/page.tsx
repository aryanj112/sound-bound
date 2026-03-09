"use client";

import { useEffect, useRef, useState } from "react";

type Sound = {
  id: string;
  label: string;
  emoji: string;
  src: string;
};

const SOUNDS: Sound[] = [
  { id: "vine-boom", label: "Vine Boom", emoji: "💥", src: "/sounds/vine-boom.mp3" },
  { id: "airhorn", label: "Airhorn", emoji: "📣", src: "/sounds/airhorn.mp3" },
  { id: "dun-dun-dun", label: "Dun Dun Dun", emoji: "😮", src: "/sounds/dun-dun-dun.mp3" },
  { id: "fahhh", label: "Fahhh", emoji: "😵", src: "/sounds/fahhh.mp3" },
  { id: "fortnite-death", label: "Fortnite Death", emoji: "🎮", src: "/sounds/fortnite-death.mp3" },
  { id: "rizz", label: "Rizz", emoji: "😏", src: "/sounds/rizz.mp3" },
  { id: "spongebob-fail", label: "Spongebob Fail", emoji: "🫠", src: "/sounds/spongebob-fail.mp3" },
  { id: "among-us-imposter", label: "Among Us", emoji: "ඞ", src: "/sounds/among-us-imposter.mp3" }
];

export default function Page() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeSound, setActiveSound] = useState<string | null>(null);

  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.preload = "auto";

    const handleEnded = () => setActiveSound(null);
    audioRef.current.addEventListener("ended", handleEnded);

    return () => {
      audioRef.current?.pause();
      audioRef.current?.removeEventListener("ended", handleEnded);
    };
  }, []);

  const handlePlay = async (sound: Sound) => {
    if (!audioRef.current) {
      return;
    }

    audioRef.current.pause();
    audioRef.current.src = sound.src;
    audioRef.current.currentTime = 0;
    await audioRef.current.play();
    setActiveSound(sound.id);
  };

  return (
    <main className="page-shell">
      <section className="soundboard" aria-label="Meme soundboard">
        {SOUNDS.map((sound) => {
          const isActive = activeSound === sound.id;

          return (
            <button
              key={sound.id}
              aria-label={`Play ${sound.label}`}
              className={`sound-card ${isActive ? "sound-card-active" : ""}`}
              onClick={() => void handlePlay(sound)}
              type="button"
            >
              <span className="sound-emoji" aria-hidden="true">
                {sound.emoji}
              </span>
              <span className="sound-label">{sound.label}</span>
            </button>
          );
        })}
      </section>
    </main>
  );
}
