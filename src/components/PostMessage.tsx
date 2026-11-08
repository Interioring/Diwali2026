import { ClipboardCopy } from "lucide-react";
import { Button } from "./ui.tsx";

/**
 * The words to post with the video, shown on the page with a Copy button (the user's
 * request, 8 Nov 2026). Two lines in the action stack; tapping them opens the whole
 * message in the actions' place, the same way the feedback form does.
 */
export function PostMessageCard({ text, onCopy, onOpen }: { text: string; onCopy: () => void; onOpen: () => void }) {
  return (
    <div className="powder-ring flex items-center gap-2 rounded-2xl bg-oxide-900/45 py-1.5 pl-3.5 pr-1.5">
      <button
        type="button"
        onClick={onOpen}
        aria-label="Show the whole message to post"
        className="min-w-0 flex-1 rounded-lg py-1 text-left"
      >
        <span className="line-clamp-2 whitespace-pre-line text-[0.88rem] leading-snug text-ink-dim">{text}</span>
      </button>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[0.92rem] font-semibold text-powder transition-colors hover:bg-oxide-700/70"
      >
        <ClipboardCopy className="size-4" strokeWidth={1.8} aria-hidden="true" />
        Copy
      </button>
    </div>
  );
}

export function PostMessageView({ text, onCopy, onClose }: { text: string; onCopy: () => void; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-3" role="region" aria-labelledby="post-message-title">
      <h2 id="post-message-title" className="font-display text-[1.35rem] font-bold leading-tight text-powder">
        Post it with this message
      </h2>
      <p className="powder-ring max-h-[11.5rem] overflow-y-auto whitespace-pre-line rounded-2xl bg-oxide-900/45 px-4 py-3 text-[0.95rem] leading-snug text-ink [overflow-wrap:anywhere]">
        {text}
      </p>
      <div className="flex items-center gap-3">
        <Button variant="quiet" onClick={onClose}>
          Done
        </Button>
        <Button variant="flame" className="flex-1" onClick={onCopy} autoFocus>
          <ClipboardCopy className="size-5" strokeWidth={2} aria-hidden="true" />
          Copy message
        </Button>
      </div>
    </div>
  );
}
