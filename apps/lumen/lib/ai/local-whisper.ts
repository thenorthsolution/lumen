import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { lumenConfig } from "@/config/lumen";

const execFileAsync = promisify(execFile);

const extensions: Record<string, string> = {
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "video/webm": "webm",
};

interface WhisperJson {
  text?: string;
  language?: string;
  segments?: Array<{ end?: number }>;
}

export async function transcribeWithLocalWhisper(audio: Uint8Array, mimeType: string) {
  const directory = await mkdtemp(join(tmpdir(), "lumen-whisper-"));
  const input = join(directory, `audio.${extensions[mimeType] ?? "webm"}`);
  try {
    await writeFile(input, audio);
    await execFileAsync(lumenConfig.ai.local.whisperCommand, [
      input,
      "--model", lumenConfig.ai.local.whisperModel,
      "--language", "nl",
      "--task", "transcribe",
      "--output_format", "json",
      "--output_dir", directory,
      "--fp16", "False",
    ], { timeout: lumenConfig.ai.local.whisperTimeoutMs, maxBuffer: 4 * 1024 * 1024 });
    const result = JSON.parse(await readFile(join(directory, "audio.json"), "utf8")) as WhisperJson;
    const text = result.text?.trim() ?? "";
    if (!text) throw new Error("empty local transcript");
    return {
      text,
      language: result.language ?? "nl",
      durationInSeconds: result.segments?.at(-1)?.end,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
