import { Apple } from "lucide-react";

function PlayTriangle(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden {...props}>
      <path fill="#34A853" d="M3 3L3 12L15.6 9.3Z" />
      <path fill="#FBBC05" d="M3 12L15.6 9.3L21 12L15.6 14.7Z" />
      <path fill="#EA4335" d="M3 12L3 21L15.6 14.7Z" />
      <path fill="#4285F4" d="M15.6 9.3L21 12L15.6 14.7Z" />
    </svg>
  );
}

export function AppStoreBadge({ className }) {
  return (
    <span
      className={`inline-flex items-center gap-2.5 rounded-lg bg-foreground px-4 py-2 text-background ${className ?? ""}`}
    >
      <Apple className="h-6 w-6 shrink-0" aria-hidden />
      <span className="flex flex-col items-start leading-tight">
        <span className="text-[9px]">Download on the</span>
        <span className="-mt-0.5 text-base font-semibold leading-tight">App Store</span>
      </span>
    </span>
  );
}

export function GooglePlayBadge({ className }) {
  return (
    <span
      className={`inline-flex items-center gap-2.5 rounded-lg bg-foreground px-4 py-2 text-background ${className ?? ""}`}
    >
      <PlayTriangle className="h-6 w-6 shrink-0" />
      <span className="flex flex-col items-start leading-tight">
        <span className="text-[9px]">GET IT ON</span>
        <span className="-mt-0.5 text-base font-semibold leading-tight">Google Play</span>
      </span>
    </span>
  );
}
