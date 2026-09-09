/**
 * Icons come from Lucide (ISC licence), wrapped here so the rest of the app
 * uses one consistent set of names and default sizes.
 */
import {
  ExternalLink,
  Heart,
  ImagePlus,
  LoaderCircle,
  MessageCircle,
  Quote,
  Repeat2,
  Settings2,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";

type IconProps = { className?: string };

const stroke = 1.75;

export function HeartIcon({ className = "size-3.5" }: IconProps) {
  return <Heart className={className} strokeWidth={stroke} aria-hidden />;
}

export function RepostIcon({ className = "size-3.5" }: IconProps) {
  return <Repeat2 className={className} strokeWidth={stroke} aria-hidden />;
}

export function ReplyIcon({ className = "size-3.5" }: IconProps) {
  return <MessageCircle className={className} strokeWidth={stroke} aria-hidden />;
}

export function QuoteIcon({ className = "size-3.5" }: IconProps) {
  return <Quote className={className} strokeWidth={stroke} aria-hidden />;
}

export function ImageIcon({ className = "size-[18px]" }: IconProps) {
  return <ImagePlus className={className} strokeWidth={stroke} aria-hidden />;
}

export function SettingsIcon({ className = "size-[18px]" }: IconProps) {
  return <Settings2 className={className} strokeWidth={stroke} aria-hidden />;
}

export function CloseIcon({ className = "size-4" }: IconProps) {
  return <X className={className} strokeWidth={2} aria-hidden />;
}

export function SpinnerIcon({ className = "size-4" }: IconProps) {
  return (
    <LoaderCircle
      className={`${className} ls-spin`}
      strokeWidth={2.25}
      aria-hidden
    />
  );
}

export function SparkIcon({ className = "size-3.5" }: IconProps) {
  return <Sparkles className={className} strokeWidth={stroke} aria-hidden />;
}

export function WarningIcon({ className = "size-3.5" }: IconProps) {
  return <TriangleAlert className={className} strokeWidth={stroke} aria-hidden />;
}

export function LinkIcon({ className = "size-3.5" }: IconProps) {
  return <ExternalLink className={className} strokeWidth={stroke} aria-hidden />;
}
