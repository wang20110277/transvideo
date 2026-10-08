import type { CSSProperties, ImgHTMLAttributes } from "react";

interface ImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  fill?: boolean;
  sizes?: string;
  priority?: boolean;
  quality?: number;
  placeholder?: unknown;
  /** next/image 的 unoptimized 选项：Electron 内全部本地加载，接受并忽略 */
  unoptimized?: boolean;
  onLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

/** next/image 替身：fill 模式铺满定位容器，其余按原生 img 透传 */
export function Image({
  src, alt, width, height, fill, sizes, style, onLoad, ...rest
}: ImageProps) {
  const fillStyle: CSSProperties | undefined = fill
    ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }
    : undefined;
  return (
    <img
      src={src}
      alt={alt}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      sizes={sizes}
      style={{ ...fillStyle, ...style }}
      onLoad={onLoad}
      {...rest}
    />
  );
}

export default Image;
