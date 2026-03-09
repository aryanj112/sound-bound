import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import ytdl from "ytdl-core";

type CommunityRow = {
  id: string;
  title: string;
  public_url: string;
};

type DownloadResult = {
  buffer: Buffer;
  title: string;
  durationS: number;
  contentType: string;
  extension: string;
};

const BUCKET_NAME = process.env.SUPABASE_BUCKET ?? "community-sounds";
const MAX_DURATION_S = parseInt(process.env.MAX_DURATION_S ?? "60", 10);

function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY.");
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function downloadYoutubeAudio(
  url: string
): Promise<DownloadResult> {
  const info = await ytdl.getInfo(url);
  const durationS = parseInt(info.videoDetails.lengthSeconds, 10);
  const title = info.videoDetails.title;

  if (durationS > MAX_DURATION_S) {
    throw new Error(
      `Audio is ${durationS}s — exceeds the ${MAX_DURATION_S}s maximum.`
    );
  }

  const audioFormats = ytdl.filterFormats(info.formats, "audioonly");
  const preferredFormat =
    audioFormats
      .filter((format) => Boolean(format.url))
      .sort((left, right) => {
        const leftBitrate = left.audioBitrate ?? 0;
        const rightBitrate = right.audioBitrate ?? 0;
        return rightBitrate - leftBitrate;
      })[0];

  if (!preferredFormat?.url) {
    throw new Error("No audio-only format was available for this video.");
  }

  const response = await fetch(preferredFormat.url);
  if (!response.ok) {
    throw new Error(`Audio download failed with status ${response.status}.`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.byteLength === 0) {
    throw new Error("The downloaded audio file is empty.");
  }

  const contentType =
    preferredFormat.mimeType?.split(";")[0] ??
    response.headers.get("content-type") ??
    "audio/mpeg";
  const extension = preferredFormat.container ?? "mp3";

  return { buffer, title, durationS, contentType, extension };
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("community_sounds")
      .select("id, title, public_url")
      .order("uploaded_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: `Failed to load community sounds: ${error.message}` },
        { status: 500 }
      );
    }

    const sounds = (data ?? []).map((row: CommunityRow) => ({
      id: row.id,
      label: row.title,
      emoji: "🌐",
      src: row.public_url,
    }));

    return NextResponse.json({ sounds });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as { url?: string };
  const rawUrl = body.url?.trim();

  if (!rawUrl) {
    return NextResponse.json({ error: "A URL is required." }, { status: 400 });
  }

  try {
    new URL(rawUrl);
  } catch {
    return NextResponse.json(
      { error: "The URL format is invalid." },
      { status: 400 }
    );
  }

  // 1. Download and convert audio
  let buffer: Buffer;
  let title: string;
  let durationS: number;
  let contentType: string;
  let extension: string;

  try {
    ({ buffer, title, durationS, contentType, extension } =
      await downloadYoutubeAudio(rawUrl));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Download failed.";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const fileSize = buffer.byteLength;
  const fileName = `${crypto.randomUUID()}.${extension}`;

  // 2. Upload to Supabase Storage
  const supabase = getSupabaseAdmin();

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(fileName, buffer, { contentType });

  if (uploadError) {
    return NextResponse.json(
      { error: `Storage upload failed: ${uploadError.message}` },
      { status: 500 }
    );
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(fileName);

  const publicUrl = urlData.publicUrl;

  // 3. Insert row into DB
  const { error: dbError } = await supabase
    .from("community_sounds")
    .insert({
      title,
      youtube_url: rawUrl,
      storage_path: fileName,
      public_url: publicUrl,
      duration_s: durationS,
      file_size: fileSize,
    });

  if (dbError) {
    await supabase.storage.from(BUCKET_NAME).remove([fileName]);
    return NextResponse.json(
      { error: `Database insert failed: ${dbError.message}` },
      { status: 500 }
    );
  }

  // 4. Return success payload
  return NextResponse.json(
    {
      message: "Sound uploaded successfully.",
      sound: {
        id: fileName,
        label: title,
        emoji: "🌐",
        src: publicUrl,
      },
      title,
      public_url: publicUrl,
      duration_s: durationS,
      file_size: fileSize,
    },
    { status: 201 }
  );
}
