import os
import uuid
import tempfile
from io import BytesIO
from pathlib import Path

import yt_dlp
from pydub import AudioSegment
from supabase import create_client, Client
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

BUCKET_NAME = os.getenv("SUPABASE_BUCKET", "community-sounds")
MAX_DURATION_S = int(os.getenv("MAX_DURATION_S", "60"))


def download_youtube_audio(url: str) -> tuple[BytesIO, str]:
    """Downloads YouTube audio as MP3. Raises ValueError if over 60s."""

    # Probe metadata first — no download yet
    with yt_dlp.YoutubeDL({"quiet": True}) as ydl:
        info = ydl.extract_info(url, download=False)

    duration_s = info.get("duration", 0)
    if duration_s > MAX_DURATION_S:
        raise ValueError(
            f"Audio is {duration_s}s — exceeds the {MAX_DURATION_S}s maximum."
        )

    title = info.get("title", "audio")

    # Download into a temp directory so yt-dlp/ffmpeg can create the final MP3 itself.
    with tempfile.TemporaryDirectory() as tmp_dir:
        output_template = str(Path(tmp_dir) / "audio.%(ext)s")
        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": output_template,
            "noplaylist": True,
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
            }],
            "quiet": True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        mp3_files = sorted(Path(tmp_dir).glob("*.mp3"))
        if not mp3_files:
            raise ValueError("Download finished, but no MP3 file was produced.")

        file_bytes = mp3_files[0].read_bytes()
        if not file_bytes:
            raise ValueError("The downloaded file is empty.")

    buffer = BytesIO(file_bytes)
    buffer.seek(0)
    return buffer, title


@app.get("/health")
def health():
    return jsonify({"ok": True})


@app.get("/community-sounds")
def list_community_sounds():
    try:
        response = (
            supabase.table("community_sounds")
            .select("id, title, public_url")
            .order("uploaded_at", desc=True)
            .execute()
        )
    except Exception as e:
        return jsonify({"error": f"Failed to load community sounds: {str(e)}"}), 500

    rows = response.data or []
    sounds = [
        {
            "id": row["id"],
            "label": row["title"],
            "emoji": "🌐",
            "src": row["public_url"],
        }
        for row in rows
    ]

    return jsonify({"sounds": sounds})


@app.post("/community-sounds")
def community_sounds():
    payload = request.get_json(silent=True) or {}
    raw_url = str(payload.get("url", "")).strip()

    if not raw_url:
        return jsonify({"error": "A URL is required."}), 400

    # 1. Download audio from YouTube
    try:
        raw_buffer, title = download_youtube_audio(raw_url)
    except ValueError as e:
        return jsonify({"error": str(e)}), 422
    except Exception as e:
        return jsonify({"error": f"Failed to process YouTube URL: {str(e)}"}), 422

    # 2. Load into pydub to get accurate duration + file size
    try:
        audio: AudioSegment = AudioSegment.from_file(raw_buffer)
    except Exception as e:
        return jsonify({"error": f"Audio decode failed: {str(e)}"}), 422

    final_duration_s = round(len(audio) / 1000, 2)

    # 3. Export to MP3 buffer
    final_buffer = BytesIO()
    audio.export(final_buffer, format="mp3")
    final_buffer.seek(0)
    file_bytes = final_buffer.read()
    file_size = len(file_bytes)

    # 4. Upload to Supabase Storage
    file_name = f"{uuid.uuid4()}.mp3"
    try:
        supabase.storage.from_(BUCKET_NAME).upload(
            path=file_name,
            file=file_bytes,
            file_options={"content-type": "audio/mpeg"},
        )
        public_url = supabase.storage.from_(BUCKET_NAME).get_public_url(file_name)
    except Exception as e:
        return jsonify({"error": f"Storage upload failed: {str(e)}"}), 500

    # 5. Insert row into DB
    try:
        supabase.table("community_sounds").insert({
            "title":        title,
            "youtube_url":  raw_url,
            "storage_path": file_name,
            "public_url":   public_url,
            "duration_s":   final_duration_s,
            "file_size":    file_size,
        }).execute()
    except Exception as e:
        return jsonify({"error": f"Database insert failed: {str(e)}"}), 500

    # 6. Return success payload
    return jsonify({
        "message":    "Sound uploaded successfully.",
        "sound": {
            "id":    file_name,
            "label": title,
            "emoji": "🌐",
            "src":   public_url,
        },
        "title":      title,
        "public_url": public_url,
        "duration_s": final_duration_s,
        "file_size":  file_size,
    }), 201


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)
