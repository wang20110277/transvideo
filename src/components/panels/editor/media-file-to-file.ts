import type { MediaFile } from "@/types/media";

/** preload 暴露的 imageStorage 桥（运行时真实形状；electron.d.ts 的 readAsBase64 声明已过时，故本地声明） */
type ImageStorageBridge = {
  readAsBase64: (
    localPath: string,
  ) => Promise<{
    success: boolean;
    base64?: string;
    mimeType?: string;
  } | null>;
};

function guessMime(type: MediaFile["type"]): string {
  if (type === "image") return "image/png";
  if (type === "audio") return "audio/mpeg";
  return "video/mp4";
}

function safeExt(name: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name);
  return m ? `.${m[1].toLowerCase()}` : "";
}

/** transvideo MediaFile → 编辑器可用的 File；失败返回 null */
export async function mediaFileToFile(mf: MediaFile): Promise<File | null> {
  if (mf.file instanceof File) return mf.file;
  const url = mf.url;
  if (!url) return null;

  const name = mf.name && /\.[A-Za-z0-9]+$/.test(mf.name) ? mf.name : `${mf.name || "asset"}${safeExt(mf.name) || ".mp4"}`;

  // Electron 本地文件（transvideo 的 local-image:// 协议）→ preload 读 base64
  if (url.startsWith("local-image://")) {
    // 经 globalThis 取 window：vitest 为 node 环境（无 window 全局），测试以 globalThis.window 注入桩
    const storage = (globalThis as { window?: { imageStorage?: ImageStorageBridge } }).window
      ?.imageStorage;
    if (!storage) return null;
    const res = await storage.readAsBase64(url);
    if (!res?.success || !res?.base64) return null;
    const mime = res.mimeType || guessMime(mf.type);
    const bin = atob(res.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], name, { type: mime });
  }

  // http(s) / data: / blob:
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const blob = await resp.blob();
  return new File([blob], name, { type: blob.type || guessMime(mf.type) });
}
