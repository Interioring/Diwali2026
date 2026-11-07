import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Sparkles, PencilLine } from "lucide-react";
import { LIMITS, STYLE_LABELS, WISH_STYLES, cleanText, type WishStyle } from "../../shared/greeting.ts";
import { CURATED_WISHES } from "../../shared/wishes.ts";
import { SceneCanvas } from "../components/SceneCanvas.tsx";
import { Button, MakerMark, StepNumber } from "../components/ui.tsx";
import { createGreeting, suggestWishes } from "../lib/api.ts";
import { track } from "../lib/analytics.ts";
import { navigate } from "../lib/router.ts";
import { randomSeed } from "../greeting/random.ts";
import { rememberMine } from "../lib/mine.ts";

const DRAFT_KEY = "diwali2026:draft";
const SENDER_KEY = "diwali2026:sender";

interface Draft {
  name: string;
  sender: string;
  message: string;
  style: WishStyle;
  seed: number;
  edited: boolean;
}

function loadDraft(): Draft {
  let sender = "";
  try {
    sender = localStorage.getItem(SENDER_KEY) ?? "";
  } catch {
    // storage unavailable
  }
  const fallback: Draft = { name: "", sender, message: CURATED_WISHES.warm[0], style: "warm", seed: randomSeed(), edited: false };
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    const fromNav = (history.state as { draft?: Draft } | null)?.draft;
    const d = fromNav ?? (raw ? (JSON.parse(raw) as Draft) : null);
    if (d && typeof d.name === "string" && typeof d.message === "string" && WISH_STYLES.includes(d.style)) return { ...fallback, ...d };
  } catch {
    // ignore unreadable drafts
  }
  return fallback;
}

const SHORT_STYLE: Record<WishStyle, string> = {
  warm: "Warm",
  cheerful: "Cheerful",
  family: "Family",
  playful: "Playful",
};

export function Create({ fromRecipient = false }: { fromRecipient?: boolean }) {
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [pool, setPool] = useState<{ style: WishStyle; source: "ai" | "curated"; wishes: string[]; index: number }>(() => ({
    style: draft.style,
    source: "curated",
    wishes: CURATED_WISHES[draft.style],
    index: Math.max(0, CURATED_WISHES[draft.style].indexOf(draft.message)),
  }));
  const [aiState, setAiState] = useState<"idle" | "loading" | "note">("idle");
  const [aiNote, setAiNote] = useState("");
  const [nameError, setNameError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    track(fromRecipient ? "recipient_create_start" : "landing_view", { once: true });
  }, [fromRecipient]);

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // storage may be unavailable; the draft still lives in memory
    }
  }, [draft]);

  const sceneData = useMemo(
    () => ({ recipientName: cleanText(draft.name, LIMITS.nameMax), message: draft.message, seed: draft.seed }),
    [draft.name, draft.message, draft.seed],
  );
  const senderLeft = LIMITS.senderMax - draft.sender.length;

  const update = (patch: Partial<Draft>) => {
    if (!startedRef.current) {
      startedRef.current = true;
      track("create_start", { once: true });
    }
    setDraft((d) => ({ ...d, ...patch }));
  };

  const chooseStyle = (style: WishStyle) => {
    const wishes = CURATED_WISHES[style];
    setPool({ style, source: "curated", wishes, index: 0 });
    setAiState("idle");
    update({ style, message: draft.edited ? draft.message : wishes[0] });
  };

  const anotherWish = () => {
    const next = (pool.index + 1) % pool.wishes.length;
    setPool({ ...pool, index: next });
    update({ message: pool.wishes[next], edited: false });
  };

  const askAi = async () => {
    setAiState("loading");
    track("wish_ai_requested");
    const res = await suggestWishes(draft.style);
    const fresh = res.wishes.filter((w) => w !== draft.message);
    const list = fresh.length ? fresh : res.wishes;
    setPool({ style: draft.style, source: res.source, wishes: list, index: 0 });
    update({ message: list[0], edited: false });
    if (res.source === "ai") {
      setAiState("idle");
    } else {
      setAiState("note");
      setAiNote("The AI writer is resting, so here's one of ours.");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = cleanText(draft.name, LIMITS.nameMax);
    if (!name) {
      setNameError("Add their name to light the greeting.");
      nameRef.current?.focus();
      return;
    }
    const message = cleanText(draft.message, LIMITS.messageMax) || CURATED_WISHES[draft.style][0];
    const senderName = cleanText(draft.sender, LIMITS.senderMax);
    setSaving(true);
    setSaveError("");
    try {
      try {
        localStorage.setItem(SENDER_KEY, senderName);
      } catch {
        // storage unavailable
      }
      const greeting = await createGreeting({
        recipientName: name,
        message,
        style: draft.style,
        seed: draft.seed,
        ...(senderName ? { senderName } : {}),
      });
      track("greeting_created");
      rememberMine(greeting.id);
      navigate(`/g/${greeting.id}`, { greeting, fresh: true });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "We couldn't save the greeting. Please try again.");
      setSaving(false);
    }
  };

  const nameLeft = LIMITS.nameMax - draft.name.length;
  const msgLeft = LIMITS.messageMax - draft.message.length;

  return (
    <div className="relative min-h-dvh overflow-x-clip bg-[#200b07]">
      <SceneCanvas
        mode="stage"
        data={sceneData}
        stageRef={stageRef}
        label={sceneData.recipientName ? `A kolam with lit diyas, and the name ${sceneData.recipientName}` : "A kolam drawn in rice powder around a lit diya"}
      />

      <main className="relative mx-auto flex w-full max-w-[30rem] flex-col px-6 pb-36 pt-[max(1.5rem,env(safe-area-inset-top))] md:max-w-[34rem] md:pb-16">
        <header className="rise-in">
          <h1 className="font-display text-[2.6rem] font-bold leading-[0.98] tracking-[-0.02em] text-powder text-balance sm:text-[3.1rem]">
            Compile your light
          </h1>
          <p className="mt-3 max-w-[30ch] text-[1.04rem] leading-snug text-ink-dim text-pretty">
            A Diwali 2026 greeting, drawn as a kolam and lit for one name. Send it as a link, or download it as a video with music.
          </p>
        </header>

        {/* The canvas draws the kolam and the name inside this box. */}
        <div ref={stageRef} aria-hidden="true" className="h-[min(23rem,46svh)] w-full sm:h-[min(26rem,48svh)]" />

        <form onSubmit={submit} noValidate className="flex flex-col gap-9">
          <section aria-labelledby="step-name">
            <div className="flex items-center gap-3">
              <StepNumber n={1} active={!draft.name} />
              <label id="step-name" htmlFor="recipient" className="text-[1.02rem] font-semibold text-ink">
                Their name
              </label>
            </div>
            <div className={`powder-edge mt-2 pb-2 ${nameError ? "is-invalid" : ""}`}>
              <input
                id="recipient"
                ref={nameRef}
                value={draft.name}
                maxLength={LIMITS.nameMax}
                autoComplete="off"
                autoCapitalize="words"
                enterKeyHint="next"
                placeholder="Amma, Rohan, the Sharma family…"
                aria-invalid={Boolean(nameError)}
                aria-describedby={nameError ? "name-error" : undefined}
                onChange={(e) => {
                  update({ name: e.target.value });
                  if (nameError) setNameError("");
                }}
                className="w-full bg-transparent text-[1.35rem] font-medium leading-tight text-powder placeholder:text-ink-faint/80 focus:outline-none"
              />
            </div>
            <div className="mt-1.5 flex min-h-5 justify-between text-[0.86rem]">
              <span id="name-error" role="alert" className="text-alert">
                {nameError}
              </span>
              {nameLeft <= 10 && <span className="text-ink-faint tabular-nums">{nameLeft} left</span>}
            </div>
          </section>

          <section aria-labelledby="step-wish">
            <div className="flex items-center gap-3">
              <StepNumber n={2} />
              <label id="step-wish" htmlFor="wish" className="text-[1.02rem] font-semibold text-ink">
                Your wish
              </label>
            </div>

            <div role="radiogroup" aria-label="Wish style" className="-mx-6 mt-3 flex gap-2 overflow-x-auto px-6 pb-1 [scrollbar-width:none]">
              {WISH_STYLES.map((style) => {
                const on = draft.style === style;
                return (
                  <button
                    key={style}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    title={STYLE_LABELS[style]}
                    onClick={() => chooseStyle(style)}
                    className={`min-h-10 shrink-0 rounded-full px-4 text-[0.95rem] font-medium transition-colors ${
                      on ? "bg-powder text-oxide-900" : "powder-ring text-ink-dim hover:text-powder"
                    }`}
                  >
                    {SHORT_STYLE[style]}
                  </button>
                );
              })}
            </div>

            <div className="powder-edge mt-4 pb-2">
              <textarea
                id="wish"
                value={draft.message}
                maxLength={LIMITS.messageMax}
                rows={3}
                onChange={(e) => update({ message: e.target.value, edited: true })}
                className="w-full resize-none bg-transparent text-[1.15rem] leading-relaxed text-ink focus:outline-none"
              />
            </div>
            <div className="mt-1.5 flex items-start justify-between gap-3 text-[0.86rem] text-ink-faint">
              <span aria-live="polite">{aiState === "note" ? aiNote : pool.source === "ai" ? "Written by AI for this style. Edit it freely." : "Tap the wish to make it your own."}</span>
              <span className="shrink-0 tabular-nums">{msgLeft <= 40 ? `${msgLeft} left` : ""}</span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={anotherWish}>
                <RefreshCw className="size-4" strokeWidth={1.8} aria-hidden="true" />
                Another wish
              </Button>
              <Button onClick={askAi} disabled={aiState === "loading"} aria-busy={aiState === "loading"}>
                <Sparkles className="size-4" strokeWidth={1.8} aria-hidden="true" />
                {aiState === "loading" ? "Writing wishes…" : "Write me new ones"}
              </Button>
              <Button
                variant="quiet"
                onClick={() => {
                  update({ message: "", edited: true });
                  document.getElementById("wish")?.focus();
                }}
              >
                <PencilLine className="size-4" strokeWidth={1.8} aria-hidden="true" />
                Start from blank
              </Button>
            </div>
          </section>

          <section aria-labelledby="step-from">
            <div className="flex items-center gap-3">
              <StepNumber n={3} />
              <label id="step-from" htmlFor="sender" className="text-[1.02rem] font-semibold text-ink">
                From <span className="font-normal text-ink-faint">(optional)</span>
              </label>
            </div>
            <div className="powder-edge mt-2 pb-2">
              <input
                id="sender"
                value={draft.sender}
                maxLength={LIMITS.senderMax}
                autoComplete="name"
                autoCapitalize="words"
                enterKeyHint="done"
                placeholder="Your name"
                onChange={(e) => update({ sender: e.target.value })}
                className="w-full bg-transparent text-[1.35rem] font-medium leading-tight text-powder placeholder:text-ink-faint/80 focus:outline-none"
              />
            </div>
            <p className="mt-1.5 flex justify-between text-[0.86rem] text-ink-faint">
              <span>Signed at the end: “With love, {cleanText(draft.sender, LIMITS.senderMax) || "your name"}”.</span>
              {senderLeft <= 10 && <span className="tabular-nums">{senderLeft} left</span>}
            </p>
          </section>

          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 px-6 pb-[max(1rem,env(safe-area-inset-bottom))] md:pointer-events-auto md:static md:p-0 [&_button]:pointer-events-auto [&_p]:pointer-events-auto">
            <div className="mx-auto flex w-full max-w-[30rem] flex-col gap-2 md:max-w-none">
              {saveError && (
                <p role="alert" className="text-center text-[0.92rem] text-alert">
                  {saveError}
                </p>
              )}
              <div className="flex items-center">
                <Button type="submit" variant="flame" className="flex-1" disabled={saving} aria-busy={saving}>
                  {saving ? "Lighting the lamps…" : saveError ? "Try again" : "Light the greeting"}
                </Button>
              </div>
            </div>
          </div>
        </form>

        <footer className="mt-12 flex flex-col items-start gap-3 border-t border-transparent">
          <MakerMark />
          <p className="max-w-[40ch] text-[0.8rem] leading-snug text-ink-faint">
            We keep only the names and wish needed to show the greeting, for 45 days. No sign-in, no contacts.
          </p>
        </footer>
      </main>
    </div>
  );
}
