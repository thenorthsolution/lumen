# Lumen Phase 5 foundation

Phase 5 defines the provider-neutral interaction boundary for voice. The first provider-backed implementation is bounded push-to-talk; realtime conversational voice remains a later adapter.

## Delivered

- Text, voice and direct UI are explicit command sources around one world-tool registry.
- `RealtimeVoiceAdapter` owns connection lifecycle and emits transcripts, typed tool calls and structured tool results without access to a renderer instance.
- Voice session state distinguishes idle, connecting, listening, processing, unavailable and error states.
- The microphone records at most 60 seconds, requests Dutch transcription through a server-only Gateway route and submits the transcript through the same chat/tool boundary as typed input.
- Without a configured provider, Lumen reports an unavailable state without pretending to record.

## Provider gate

A realtime provider may be connected only when server-issued ephemeral credentials, explicit microphone consent, interruption handling, tool-result acknowledgement and transcript retention policy are implemented. The current push-to-talk route retains no audio or transcript itself. Renderer operations remain reachable solely through `WorldCommand`.
