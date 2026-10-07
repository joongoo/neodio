import Image from "next/image";

export function NeodioLogo({ size = 32 }: { size?: number }) {
  return (
    <Image
      src="/neodio.png"
      alt=""
      width={size}
      height={size}
      sizes={`${size}px`}
      loading="eager"
      className="shrink-0 object-contain"
    />
  );
}
