import { describe, it, expect, vi, beforeEach } from "vitest";
import { mediaFileToFile } from "@/components/panels/editor/media-file-to-file";
import type { MediaFile } from "@/types/media";

const mk = (over: Partial<MediaFile>): MediaFile =>
  ({ id: "f1", name: "clip.mp4", type: "video", ...over } as MediaFile);

describe("mediaFileToFile", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("window", { imageStorage: undefined });
  });

  it("已有 File 时直接返回", async () => {
    const f = new File(["x"], "a.mp4", { type: "video/mp4" });
    const out = await mediaFileToFile(mk({ file: f }));
    expect(out).toBe(f);
  });

  it("http(s)/data: URL 走 fetch 转 File", async () => {
    const blob = new Blob(["abc"], { type: "video/mp4" });
    const fetchMock = vi.fn(async () => new Response(blob));
    vi.stubGlobal("fetch", fetchMock);
    const out = await mediaFileToFile(mk({ url: "https://cdn.example.com/v.mp4" }));
    expect(fetchMock).toHaveBeenCalledWith("https://cdn.example.com/v.mp4");
    expect(out).toBeInstanceOf(File);
    expect(out!.name).toBe("clip.mp4");
    expect(out!.type).toBe("video/mp4");
  });

  it("local-image:// 走 imageStorage.readAsBase64", async () => {
    const bytes = new Uint8Array([104, 105]); // "hi"
    const base64 = Buffer.from(bytes).toString("base64");
    vi.stubGlobal("window", {
      imageStorage: {
        readAsBase64: vi.fn(async () => ({ success: true, base64, mimeType: "video/mp4" })),
      },
    });
    const out = await mediaFileToFile(mk({ url: "local-image://videos/abc.mp4" }));
    expect(out).toBeInstanceOf(File);
    expect(out!.type).toBe("video/mp4");
    expect(await out!.text()).toBe("hi");
  });

  it("无 file 无 url 返回 null", async () => {
    expect(await mediaFileToFile(mk({ file: null, url: undefined }))).toBeNull();
  });

  it("readAsBase64 失败返回 null", async () => {
    vi.stubGlobal("window", {
      imageStorage: { readAsBase64: vi.fn(async () => ({ success: false })) },
    });
    expect(await mediaFileToFile(mk({ url: "local-image://x" }))).toBeNull();
  });
});
