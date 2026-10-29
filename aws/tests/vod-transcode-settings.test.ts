import { buildJobSettings, parseJobIdFromKey, renditionsFor } from "../handlers/vod-transcode/job-settings.js";

const BASE_INPUT = {
  inputBucket: "raw-bucket",
  inputKey: "tryout/abc12345/clip.mp4",
  processedBucket: "hls-bucket",
  jobId: "abc12345",
  maxOutputHeight: 1080,
};

describe("renditionsFor", () => {
  it("includes 1080p, 720p and 360p at the 1080 cap", () => {
    expect(renditionsFor(1080).map((r) => r.name)).toEqual(["1080p", "720p", "360p"]);
  });

  it("drops 1080p when capped at 720", () => {
    expect(renditionsFor(720).map((r) => r.name)).toEqual(["720p", "360p"]);
  });

  it("always includes the 360p floor rendition", () => {
    expect(renditionsFor(360).map((r) => r.name)).toEqual(["360p"]);
  });

  it("hard-rejects anything above 1080p (cost cap)", () => {
    expect(() => renditionsFor(2160)).toThrow("exceeds the 1080p cost cap");
  });
});

describe("buildJobSettings", () => {
  const settings = buildJobSettings(BASE_INPUT);

  it("points the input at the raw S3 object", () => {
    expect(settings.Inputs?.[0]?.FileInput).toBe("s3://raw-bucket/tryout/abc12345/clip.mp4");
  });

  it("writes the HLS group under the jobId prefix in the processed bucket", () => {
    const group = settings.OutputGroups?.[0];
    expect(group?.OutputGroupSettings?.Type).toBe("HLS_GROUP_SETTINGS");
    expect(group?.OutputGroupSettings?.HlsGroupSettings?.Destination).toBe(
      "s3://hls-bucket/abc12345/",
    );
  });

  it("uses single-pass QVBR H.264 with AAC audio on every output (cost rule)", () => {
    const outputs = settings.OutputGroups?.[0]?.Outputs ?? [];
    expect(outputs.length).toBeGreaterThan(0);
    for (const out of outputs) {
      expect(out.VideoDescription?.CodecSettings?.Codec).toBe("H_264");
      expect(out.VideoDescription?.CodecSettings?.H264Settings?.QualityTuningLevel).toBe("SINGLE_PASS");
      expect(out.VideoDescription?.CodecSettings?.H264Settings?.RateControlMode).toBe("QVBR");
      expect(out.AudioDescriptions?.[0]?.CodecSettings?.Codec).toBe("AAC");
    }
  });

  it("never upscales (FIT_NO_UPSCALE) so small clips stay small", () => {
    const outputs = settings.OutputGroups?.[0]?.Outputs ?? [];
    for (const out of outputs) {
      expect(out.VideoDescription?.ScalingBehavior).toBe("FIT_NO_UPSCALE");
    }
  });

  it("names renditions so the top manifest is index.m3u8-compatible", () => {
    const names = settings.OutputGroups?.[0]?.Outputs?.map((o) => o.NameModifier) ?? [];
    expect(names).toContain("_720p");
  });
});

describe("parseJobIdFromKey", () => {
  it("extracts the jobId from broker-minted tryout keys", () => {
    expect(parseJobIdFromKey("tryout/abc12345/my clip.mp4")).toBe("abc12345");
  });

  it("returns null for keys not minted by the broker", () => {
    expect(parseJobIdFromKey("random/file.mp4")).toBeNull();
    expect(parseJobIdFromKey("tryout/x/f.mp4")).toBeNull();
    expect(parseJobIdFromKey("file.mp4")).toBeNull();
  });
});
