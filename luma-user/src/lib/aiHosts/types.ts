/**
 * AI / Prerecorded Host schema
 * --------------------------------------------------------------
 * CLOUD BUCKET LINKING:
 * Set NEXT_PUBLIC_AI_HOST_CDN to your S3 / GCS / R2 / Cloudflare bucket root.
 * Expected object layout per host:
 *   ${CDN}/${host_id}/intro.mp4   → video_url_1 (greeting / answer clip)
 *   ${CDN}/${host_id}/loop.mp4    → video_url_2 (seamless reaction loop)
 *   ${CDN}/${host_id}/avatar.jpg  → optional avatar override
 *
 * Example:
 *   NEXT_PUBLIC_AI_HOST_CDN=https://my-bucket.s3.amazonaws.com/ai-hosts
 */

export type AiHostRecord = {
  host_id: string;
  name: string;
  avatar: string;
  /** Greeting / “answered call” clip — plays once on CONNECTED */
  video_url_1: string;
  /** Seamless looping reaction — plays after intro, no visible controls */
  video_url_2: string;
  age: number;
  cost_per_minute: number;
  country?: string;
  tags?: string[];
};

export type CallTransport = "agora_live" | "ai_prerecorded";

export type CallEngineState =
  | "IDLE"
  | "ROUTING"
  | "RINGING"
  | "CONNECTED"
  | "DISCONNECTED"
  | "FAILED";

export type CallRouteDecision = {
  transport: CallTransport;
  reason: string;
  realHostsOnline: number;
  aiHost: AiHostRecord | null;
  liveHostId: string | null;
};
