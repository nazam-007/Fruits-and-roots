import { useState } from "react";
import type { MenuItem } from "../../data/menu";
import {
  getMenuItemFallbackEmoji,
  getMenuItemImage,
} from "../../data/menuImages";

type Props = {
  item: MenuItem;
  alt?: string;
  imageClassName: string;
  fallbackClassName: string;
  width?: number;
  height?: number;
  loading?: "eager" | "lazy";
};

export default function MenuItemImage({
  item,
  alt = item.name,
  imageClassName,
  fallbackClassName,
  width,
  height,
  loading = "lazy",
}: Props) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const image = getMenuItemImage(item);

  if (!image || failedImage === image) {
    return (
      <span aria-hidden="true" className={fallbackClassName}>
        {getMenuItemFallbackEmoji(item)}
      </span>
    );
  }

  return (
    <img
      src={image}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      decoding="async"
      onError={() => setFailedImage(image)}
      className={imageClassName}
    />
  );
}
