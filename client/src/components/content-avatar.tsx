import { useState } from "react";

export function ContentAvatar({ src, name, className }: { src?: string | null; name: string; className: string }) {
  const [failedSource, setFailedSource] = useState<string>();
  const source = src?.trim();
  return source && failedSource !== source ? (
    <img src={source} alt={name} className={`rounded-full object-cover ${className}`} onError={() => setFailedSource(source)} />
  ) : (
    <span role="img" aria-label={name} className={`flex items-center justify-center rounded-full bg-secondary font-medium t-secondary ${className}`}>
      {Array.from(name.trim())[0] || "?"}
    </span>
  );
}
