import { useEffect, useRef, useState } from "react";
import { Button } from "./ui.tsx";
import { sendFeedback } from "../lib/api.ts";
import { track } from "../lib/analytics.ts";

/**
 * The ask at the end of the greeting page (the user's words, 8 Nov 2026): if you like
 * this, tell us, and Interioring will build one like it for your business for New Year.
 * Everything but the message is optional; contact details are kept only when typed in.
 */
export function FeedbackForm({
  role,
  sender,
  onClose,
}: {
  role: "sender" | "recipient";
  sender?: string;
  onClose: () => void;
}) {
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [business, setBusiness] = useState("");
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"editing" | "sending" | "sent">("editing");
  const [error, setError] = useState("");
  const first = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // After the film has eased up to make room.
    const t = setTimeout(() => first.current?.focus({ preventScroll: true }), 320);
    return () => clearTimeout(t);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() && !contact.trim()) {
      setError("Write a line, or leave a number or email so we can reach you.");
      first.current?.focus();
      return;
    }
    setState("sending");
    setError("");
    try {
      await sendFeedback({ message, name, business, contact, role, sender });
      track("feedback_sent");
      setState("sent");
    } catch (err) {
      setState("editing");
      setError(err instanceof Error ? err.message : "Couldn't send that. Try again.");
    }
  };

  if (state === "sent") {
    return (
      <div className="flex flex-col items-center gap-3 pt-6 text-center" role="status">
        <p className="font-display text-[1.5rem] font-bold leading-tight text-powder">Thank you!</p>
        <p className="max-w-[24rem] text-[0.98rem] leading-snug text-ink-dim text-pretty">
          {contact.trim()
            ? "We'll be in touch about a New Year one, made just for your business."
            : "It helps us make the next one better."}
        </p>
        <Button autoFocus onClick={onClose} className="mt-1">
          Done
        </Button>
      </div>
    );
  }

  const field = "w-full bg-transparent text-[1rem] leading-snug text-powder placeholder:text-ink-faint focus:outline-none";
  const label = "text-[0.85rem] font-medium text-ink-dim";
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" aria-labelledby="feedback-title" noValidate>
      <div>
        <h2 id="feedback-title" className="font-display text-[1.35rem] font-bold leading-tight text-powder">
          Liked this? Tell us.
        </h2>
        <p className="mt-1 text-[0.92rem] leading-snug text-ink-dim text-pretty">
          Want one like it for your business this New Year, made just for you? Leave a number or email and Interioring will build it with you.
        </p>
      </div>
      <label className="block">
        <span className={label}>Your feedback</span>
        <span className="powder-edge mt-1 block pb-2">
          <textarea
            ref={first}
            rows={2}
            maxLength={1000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What did you like? What would you change?"
            className={`${field} resize-none`}
          />
        </span>
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="block min-w-0">
          <span className={label}>Your name</span>
          <span className="powder-edge mt-1 block pb-2">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" className={field} />
          </span>
        </label>
        <label className="block min-w-0">
          <span className={label}>Business</span>
          <span className="powder-edge mt-1 block pb-2">
            <input
              value={business}
              onChange={(e) => setBusiness(e.target.value)}
              maxLength={80}
              autoComplete="organization"
              placeholder="Shop, studio…"
              className={field}
            />
          </span>
        </label>
      </div>
      <label className="block">
        <span className={label}>Phone or email, if you'd like one built</span>
        <span className="powder-edge mt-1 block pb-2">
          <input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={100} className={field} />
        </span>
      </label>
      {error && (
        <p role="alert" className="text-[0.88rem] leading-snug text-alert">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button variant="quiet" onClick={onClose}>
          Not now
        </Button>
        <Button type="submit" variant="flame" className="flex-1" disabled={state === "sending"} aria-busy={state === "sending"}>
          {state === "sending" ? "Sending…" : "Send"}
        </Button>
      </div>
    </form>
  );
}
