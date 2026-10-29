// Pure builders for the MediaConvert HLS job - no SDK calls, fully unit-testable.
//
// Cost rules (AGENTS.md): single-pass only, H.264/AAC, never above 1080p.
// MAX_OUTPUT_HEIGHT is enforced again here as defence-in-depth.

import type { JobSettings, Output } from "@aws-sdk/client-mediaconvert";

export type MediaConvertJobSettings = JobSettings;

export interface Rendition {
  name: string;
  width: number;
  height: number;
  maxBitrate: number;
}

const RENDITION_1080: Rendition = { name: "1080p", width: 1920, height: 1080, maxBitrate: 5_000_000 };
const RENDITION_720: Rendition = { name: "720p", width: 1280, height: 720, maxBitrate: 3_000_000 };
const RENDITION_360: Rendition = { name: "360p", width: 640, height: 360, maxBitrate: 800_000 };

const HARD_CAP = 1080;

export function renditionsFor(maxOutputHeight: number): Rendition[] {
  if (maxOutputHeight > HARD_CAP) {
    throw new Error(`MAX_OUTPUT_HEIGHT ${maxOutputHeight} exceeds the 1080p cost cap`);
  }
  const renditions: Rendition[] = [];
  if (maxOutputHeight >= 1080) renditions.push(RENDITION_1080);
  if (maxOutputHeight >= 720) renditions.push(RENDITION_720);
  renditions.push(RENDITION_360);
  return renditions;
}

export interface JobSettingsInput {
  inputBucket: string;
  inputKey: string;
  processedBucket: string;
  jobId: string;
  maxOutputHeight: number;
}

function buildVideoOutput(rendition: Rendition): Output {
  return {
    NameModifier: `_${rendition.name}`,
    ContainerSettings: { Container: "M3U8" },
    VideoDescription: {
      Width: rendition.width,
      Height: rendition.height,
      // Never upscale: a 480p tryout clip stays 480p in its top rendition.
      ScalingBehavior: "FIT_NO_UPSCALE",
      CodecSettings: {
        Codec: "H_264",
        H264Settings: {
          RateControlMode: "QVBR",
          QualityTuningLevel: "SINGLE_PASS", // cost rule: never multi-pass
          SceneChangeDetect: "TRANSITION_DETECTION",
          MaxBitrate: rendition.maxBitrate,
        },
      },
    },
    AudioDescriptions: [
      {
        CodecSettings: {
          Codec: "AAC",
          AacSettings: {
            Bitrate: 96_000,
            CodingMode: "CODING_MODE_2_0",
            SampleRate: 48_000,
          },
        },
      },
    ],
  };
}

export function buildJobSettings(input: JobSettingsInput): MediaConvertJobSettings {
  return {
    Inputs: [
      {
        FileInput: `s3://${input.inputBucket}/${input.inputKey}`,
        AudioSelectors: { "Audio Selector 1": { DefaultSelection: "DEFAULT" } },
        VideoSelector: {},
        TimecodeSource: "EMBEDDED",
      },
    ],
    OutputGroups: [
      {
        Name: "HLS",
        OutputGroupSettings: {
          Type: "HLS_GROUP_SETTINGS",
          HlsGroupSettings: {
            Destination: `s3://${input.processedBucket}/${input.jobId}/`,
            SegmentLength: 6,
            MinSegmentLength: 0,
            ManifestDurationFormat: "INTEGER",
          },
        },
        Outputs: renditionsFor(input.maxOutputHeight).map(buildVideoOutput),
      },
    ],
  };
}

// Raw upload keys are minted by the platform broker as tryout/<jobId>/<file>.
export function parseJobIdFromKey(key: string): string | null {
  const parts = key.split("/");
  if (parts.length < 2 || parts[0] !== "tryout") return null;
  const candidate = parts[1];
  return candidate && candidate.length >= 8 ? candidate : null;
}
