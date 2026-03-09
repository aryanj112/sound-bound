"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Sound = {
  id: string;
  label: string;
  emoji: string;
  src: string;
};

type CommunityResponse = {
  sounds?: Sound[];
  error?: string;
};

type SubmitResponse = {
  error?: string;
  message?: string;
  sound?: Sound;
};

const CORE_SOUNDS: Sound[] = [
  { id: "vine-boom", label: "Vine Boom", emoji: "💥", src: "/sounds/vine-boom.mp3" },
  { id: "airhorn", label: "Airhorn", emoji: "📣", src: "/sounds/airhorn.mp3" },
  { id: "dun-dun-dun", label: "Dun Dun Dun", emoji: "😮", src: "/sounds/dun-dun-dun.mp3" },
  { id: "fahhh", label: "Fahhh", emoji: "😵", src: "/sounds/fahhh.mp3" },
  { id: "fortnite-death", label: "Fortnite Death", emoji: "🎮", src: "/sounds/fortnite-death.mp3" },
  { id: "rizz", label: "Rizz", emoji: "😏", src: "/sounds/rizz.mp3" },
  { id: "spongebob-fail", label: "Spongebob Fail", emoji: "🫠", src: "/sounds/spongebob-fail.mp3" },
  { id: "among-us-imposter", label: "Among Us", emoji: "ඞ", src: "/sounds/among-us-imposter.mp3" }
];

const COMMUNITY_API_URL =
  process.env.NEXT_PUBLIC_COMMUNITY_API_URL ??
  "http://127.0.0.1:5000/community-sounds";

export default function Page() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeSound, setActiveSound] = useState<string | null>(null);
  const [communitySounds, setCommunitySounds] = useState<Sound[]>([]);
  const [url, setUrl] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [submitMessage, setSubmitMessage] = useState(
    "Paste a link to add a community sound."
  );

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

  useEffect(() => {
    const loadCommunitySounds = async () => {
      try {
        const response = await fetch(COMMUNITY_API_URL, {
          cache: "no-store"
        });
        const payload = (await response.json()) as CommunityResponse;

        if (!response.ok) {
          setSubmitState("error");
          setSubmitMessage(payload.error ?? "Failed to load community sounds.");
          return;
        }

        setCommunitySounds(payload.sounds ?? []);
      } catch {
        setSubmitState("error");
        setSubmitMessage("Could not reach the community backend.");
      }
    };

    void loadCommunitySounds();
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitState("loading");
    setSubmitMessage("Sending URL to the backend...");

    try {
      const response = await fetch(COMMUNITY_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ url })
      });

      const payload = (await response.json()) as SubmitResponse;

      if (!response.ok) {
        setSubmitState("error");
        setSubmitMessage(payload.error ?? "Community sound submission failed.");
        return;
      }

      setSubmitState("success");
      setSubmitMessage(payload.message ?? "URL accepted.");
      if (payload.sound) {
        setCommunitySounds((current) => [payload.sound!, ...current]);
      }
      setUrl("");
    } catch {
      setSubmitState("error");
      setSubmitMessage("The request failed before reaching the server.");
    }
  };

  const renderBoard = (sounds: Sound[]) => (
    <div className="soundboard">
      {sounds.map((sound) => {
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
    </div>
  );

  return (
    <main className="page-shell">
      <section className="section-block">
        <div className="section-heading">
          <p className="section-kicker">Core Sounds</p>
          <h1>Soundboard</h1>
        </div>
        {renderBoard(CORE_SOUNDS)}
      </section>

      <section className="section-block">
        <div className="section-heading">
          <p className="section-kicker">Community Sounds</p>
          <h2>Submit a link</h2>
        </div>

        <form className="community-form" onSubmit={(event) => void handleSubmit(event)}>
          <input
            className="community-input"
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/video-or-audio"
            type="url"
            value={url}
          />
          <button className="community-button" disabled={submitState === "loading"} type="submit">
            {submitState === "loading" ? "Sending..." : "Submit URL"}
          </button>
        </form>

        <p className={`community-message community-message-${submitState}`}>{submitMessage}</p>

        {communitySounds.length > 0 ? (
          renderBoard(communitySounds)
        ) : (
          <div className="community-empty">
            <p>No community sounds yet.</p>
            <p>
              Submit a link and your Flask backend can add it to Supabase.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
