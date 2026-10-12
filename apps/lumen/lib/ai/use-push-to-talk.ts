"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { lumenConfig } from "@/config/lumen";

export type VoiceState = "idle" | "recording" | "processing";

interface PushToTalkOptions {
  enabled: boolean;
  organizationId?: string;
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
}

const audioTypes = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"];

export function usePushToTalk({ enabled, organizationId, onTranscript, onError }: PushToTalkOptions) {
  const [state, setState] = useState<VoiceState>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanUpMedia = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  const transcribe = useCallback(async (blob: Blob) => {
    setState("processing");
    try {
      const form = new FormData();
      form.append("audio", blob, `lumen-spraak.${blob.type.includes("mp4") ? "m4a" : "webm"}`);
      if (organizationId) form.append("organizationId", organizationId);
      const response = await fetch("/api/ai/transcribe", { method: "POST", body: form });
      const result = await response.json().catch(() => null) as { text?: string; error?: string } | null;
      if (!response.ok || !result?.text) throw new Error(result?.error ?? "De spraakopname kon niet worden verwerkt.");
      onTranscript(result.text);
    } catch (error) {
      onError(error instanceof Error ? error.message : "De spraakopname kon niet worden verwerkt.");
    } finally {
      setState("idle");
    }
  }, [onError, onTranscript, organizationId]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  }, []);

  const toggle = useCallback(async () => {
    if (!enabled) {
      onError("Spraakbediening is beschikbaar zodra Lumen AI is verbonden.");
      return;
    }
    if (state === "recording") {
      stop();
      return;
    }
    if (state !== "idle") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError("Deze browser ondersteunt geen spraakopname.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mimeType = audioTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onerror = () => {
        recorder.onstop = null;
        cleanUpMedia();
        setState("idle");
        onError("De spraakopname is onverwacht gestopt.");
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        cleanUpMedia();
        if (!blob.size) {
          setState("idle");
          onError("Er is geen hoorbare opname ontvangen.");
          return;
        }
        void transcribe(blob);
      };
      recorder.start(250);
      setState("recording");
      timeoutRef.current = setTimeout(stop, lumenConfig.ai.limits.maxRecordingSeconds * 1_000);
    } catch {
      cleanUpMedia();
      setState("idle");
      onError("Microfoontoegang is niet toegestaan of niet beschikbaar.");
    }
  }, [cleanUpMedia, enabled, onError, state, stop, transcribe]);

  useEffect(() => () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    cleanUpMedia();
  }, [cleanUpMedia]);

  return { state, toggle };
}
