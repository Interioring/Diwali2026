import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Link2, MessageCircle, MessageSquareHeart, RotateCcw, PencilLine, Flag, Music2, VolumeX, UserPlus, SkipForward } from "lucide-react";
import { MusicPlayer, renderMusic } from "../audio/music.ts";
import type { Greeting } from "../../shared/greeting.ts";
import { CURATED_WISHES } from "../../shared/wishes.ts";
import { randomSeed } from "../greeting/random.ts";
import { SceneCanvas } from "../components/SceneCanvas.tsx";
import { Button, LinkButton, MakerMark } from "../components/ui.tsx";
import { FeedbackForm } from "../components/Feedback.tsx";
import { PostMessageCard, PostMessageView } from "../components/PostMessage.tsx";
// The sign-off on the canvas carries the Interioring lockup; the page adds no second mark.
import { ApiError, fetchGreeting, reportGreeting } from "../lib/api.ts";
import { recordVisit, track } from "../lib/analytics.ts";
import { trackedUrl } from "../../shared/links.ts";
import { postMessage, recipientPostMessage } from "../../shared/messages.ts";
import { navigate } from "../lib/router.ts";
import { isMine } from "../lib/mine.ts";
import {
  canShareFile,
  copyText,
  downloadBlob,
  greetingUrl,
  isInAppBrowser,
  shareFile,
  videoFilename,
  whatsappHref,
} from "../lib/share.ts";
import { ExportCancelled, detectExport, exportGreetingVideo, type ExportMethod } from "../export/exportVideo.ts";

type LoadState = { kind: "loading" } | { kind: "ready"; greeting: Greeting } | { kind: "missing"; message: string } | { kind: "error"; message: string };

type VideoState =
  | { kind: "idle" }
  | { kind: "working"; progress: number }
  | { kind: "ready"; file: File; blob: Blob; withMusic: boolean }
  | { kind: "failed"; message: string }
  | { kind: "unsupported" };

// Room kept under the frame for the actions, sized to each role's tallest state
// (the sender's "video ready" stack), so buttons never sit on the sign-off.
// Both hold the message to post and end with the "Liked this?" feedback link.
const ACTIONS_HEIGHT = { sender: 366, recipient: 332 };
// The feedback form and the full post message take the actions' place; the film eases up to make room.
const FEEDBACK_HEIGHT = 440;
const MESSAGE_HEIGHT = { sender: 312, recipient: 250 };
const SHOW_ACTIONS_AT = 11.8;
// "Skip to send" lands just before the sign-off, so the gift still settles into place.
const SKIP_TO = 11.4;
// While the film plays it gets the whole height; repeats keep a strip for "Skip to send".
const SKIP_ROOM = 76;

export function GreetingPage({ id }: { id: string }) {
  const navState = history.state as { greeting?: Greeting; fresh?: boolean; skippable?: boolean } | null;
  const [load, setLoad] = useState<LoadState>(() =>
    navState?.greeting?.id === id ? { kind: "ready", greeting: navState.greeting } : { kind: "loading" },
  );
  const mine = useMemo(() => Boolean(navState?.fresh) || isMine(id), [id, navState?.fresh]);
  const [playKey, setPlayKey] = useState(0);
  const [skipKey, setSkipKey] = useState(0);
  // Greetings made with "Make one for someone else" can skip to the send actions;
  // the first one always plays in full.
  const skippable = mine && Boolean(navState?.skippable);
  const [confirmReport, setConfirmReport] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [toast, setToast] = useState("");
  const [video, setVideo] = useState<VideoState>({ kind: "idle" });
  const [exportMethod, setExportMethod] = useState<ExportMethod | null | "checking">("checking");
  const [reported, setReported] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const musicRef = useRef<MusicPlayer | null>(null);
  const [music, setMusic] = useState<"off" | "loading" | "on">("off");
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchIt = useCallback(() => {
    setLoad({ kind: "loading" });
    fetchGreeting(id)
      .then((greeting) => setLoad({ kind: "ready", greeting }))
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404)
          setLoad({ kind: "missing", message: "Greetings stay lit for 45 days, or until someone reports them." });
        else setLoad({ kind: "error", message: err instanceof Error ? err.message : "We couldn't open this greeting." });
      });
  }, [id]);

  useEffect(() => {
    if (load.kind === "loading") fetchIt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (load.kind !== "ready") return;
    if (!mine) track("recipient_view", { once: true });
    recordVisit("greeting", mine ? "sender" : "recipient");
  }, [load.kind, mine]);

  useEffect(() => {
    if (load.kind === "ready") document.title = `A Diwali greeting for ${load.greeting.recipientName} · Diwali 2026`;
  }, [load]);

  useEffect(() => {
    void detectExport().then(setExportMethod);
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Compose the score ahead of time so "Play with music" starts instantly.
  useEffect(() => {
    const idle = setTimeout(() => void renderMusic().catch(() => undefined), 1500);
    return () => {
      clearTimeout(idle);
      musicRef.current?.close();
    };
  }, []);

  const skipToSend = () => {
    setSkipKey((k) => k + 1);
    if (music === "on") void musicRef.current?.play(SKIP_TO);
  };

  // Replaying (or turning the music on) keeps the actions in reach once they've appeared.
  const restart = (withMusic: boolean) => {
    setPlayKey((k) => k + 1);
    if (withMusic) void musicRef.current?.play(0);
  };

  const toggleMusic = async () => {
    if (music === "on") {
      musicRef.current?.stop();
      setMusic("off");
      return;
    }
    if (!musicRef.current) musicRef.current = new MusicPlayer();
    musicRef.current.unlock(); // inside the tap, before any await
    setMusic("loading");
    try {
      await renderMusic();
      setMusic("on");
      restart(true);
    } catch {
      setMusic("off");
    }
  };

  const say = (message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  };

  const onTime = useCallback((t: number) => {
    if (t >= SHOW_ACTIONS_AT) setShowActions(true);
  }, []);

  const sceneData = useMemo(
    () =>
      load.kind === "ready"
        ? {
            recipientName: load.greeting.recipientName,
            senderName: load.greeting.senderName,
            message: load.greeting.message,
            seed: load.greeting.seed,
          }
        : { recipientName: "", message: "", seed: 7 },
    [load],
  );

  if (load.kind !== "ready") {
    return <Unavailable state={load} onRetry={fetchIt} />;
  }

  const greeting = load.greeting;
  const url = greetingUrl(greeting.id);
  // Room for whichever panel is showing: the open feedback form or message, else the role's actions.
  const panelHeight = feedbackOpen ? FEEDBACK_HEIGHT : messageOpen ? (mine ? MESSAGE_HEIGHT.sender : MESSAGE_HEIGHT.recipient) : mine ? ACTIONS_HEIGHT.sender : ACTIONS_HEIGHT.recipient;
  // Each channel's link says where it was shared and by whom (the greeting's "With love" name).
  const linkFor = (source: "whatsapp" | "copy") => trackedUrl(url, source, greeting.senderName);

  const startExport = async () => {
    if (exportMethod === null) {
      setVideo({ kind: "unsupported" });
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setVideo({ kind: "working", progress: 0 });
    track("export_started");
    try {
      const { blob, withMusic } = await exportGreetingVideo(sceneData, (p) => setVideo({ kind: "working", progress: p }), ctrl.signal);
      const file = new File([blob], videoFilename(greeting.recipientName), { type: "video/mp4" });
      setVideo({ kind: "ready", file, blob, withMusic });
      track("export_completed");
    } catch (err) {
      if (err instanceof ExportCancelled) {
        setVideo({ kind: "idle" });
        return;
      }
      track("export_failed");
      setVideo({ kind: "failed", message: "This phone couldn't finish the video." });
    }
  };

  const saveVideo = async (file: File, blob: Blob) => {
    if (canShareFile(file)) {
      track("share_video");
      const ok = await shareFile(file);
      if (ok) return;
    }
    track("download_video");
    downloadBlob(blob, file.name);
    say(isInAppBrowser() ? "If nothing downloads, open this page in Chrome or Safari." : "Downloading your video. Check your Downloads.");
  };

  // The words to post with the video (a group, a chat or Status), crediting the sender.
  // The sender speaks to the recipient; a recipient posting it speaks for themselves.
  const site = trackedUrl(`${window.location.origin}/`, "post", greeting.senderName);
  const postText = mine ? postMessage(greeting.recipientName, site) : recipientPostMessage(greeting.senderName, site);
  const copyPostMessage = async () => {
    track("share_post_message");
    say((await copyText(postText)) ? "Message copied. Paste it with the video." : "Couldn't copy the message.");
  };

  const copy = async () => {
    track("share_copy");
    say((await copyText(linkFor("copy"))) ? "Link copied" : "Couldn't copy the link. Use WhatsApp instead.");
  };

  const editThis = () => {
    navigate("/", {
      draft: {
        name: greeting.recipientName,
        sender: greeting.senderName ?? "",
        message: greeting.message,
        style: greeting.style,
        seed: greeting.seed,
        edited: true,
      },
    });
  };

  const makeOwn = (draft?: object) => {
    track("recipient_create_start");
    navigate("/", { fromRecipient: true, ...(draft ? { draft } : {}) });
  };

  // From Amma's greeting from Srini: one back to Srini, signed by Amma.
  const sendBack = () => {
    track("send_back");
    makeOwn({
      name: greeting.senderName ?? "",
      sender: greeting.recipientName,
      message: CURATED_WISHES.warm[0],
      style: "warm",
      seed: randomSeed(),
      edited: false,
    });
  };

  // Same wish and signature, a new name and a new kolam: the quick way to send many.
  const makeAnother = () => {
    track("create_another");
    navigate("/", {
      another: true,
      draft: {
        name: "",
        sender: greeting.senderName ?? "",
        message: greeting.message,
        style: greeting.style,
        seed: randomSeed(),
        edited: !CURATED_WISHES[greeting.style].includes(greeting.message),
      },
    });
  };

  return (
    <div className="relative h-dvh overflow-hidden bg-[#200b07]">
      <h1 className="sr-only">A Diwali greeting for {greeting.recipientName}</h1>
      <p aria-live="polite" className="sr-only">
        {showActions ? (mine ? "Your greeting is ready to send." : "The greeting has finished. You can make one of your own.") : ""}
      </p>
      <SceneCanvas
        mode="play"
        data={sceneData}
        reserveBottom={showActions ? panelHeight : skippable ? SKIP_ROOM : 0}
        playKey={playKey}
        skipKey={skipKey}
        skipTo={SKIP_TO}
        onTime={onTime}
        label={`A Diwali greeting for ${greeting.recipientName}: a kolam drawn in rice powder, diyas lit, and the wish "${greeting.message}"${greeting.senderName ? `, with love from ${greeting.senderName}` : ""}. Happy Diwali 2026. May your lives and homes shine brighter. Interioring.`}
      />

      <button
        type="button"
        onClick={toggleMusic}
        disabled={music === "loading"}
        className={`absolute left-[max(0.75rem,env(safe-area-inset-left))] top-[max(0.75rem,env(safe-area-inset-top))] z-10 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-[0.9rem] font-medium transition-colors ${
          music === "on" ? "text-ink-dim hover:text-powder" : "powder-ring bg-oxide-900/40 text-powder hover:bg-oxide-700/70"
        }`}
      >
        {music === "on" ? (
          <VolumeX className="size-4" strokeWidth={1.8} aria-hidden="true" />
        ) : (
          <Music2 className="size-4" strokeWidth={1.8} aria-hidden="true" />
        )}
        {music === "on" ? "Music off" : music === "loading" ? "Tuning…" : "Play with music"}
      </button>

      <button
        type="button"
        onClick={() => restart(music === "on")}
        className="absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] z-10 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[0.9rem] text-ink-dim hover:text-powder"
      >
        <RotateCcw className="size-4" strokeWidth={1.8} aria-hidden="true" />
        Replay
      </button>

      {skippable && !showActions && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex justify-center px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <Button onClick={skipToSend}>
            <SkipForward className="size-[1.05rem]" strokeWidth={1.8} aria-hidden="true" />
            Skip to send
          </Button>
        </div>
      )}

      <section
        aria-label="Share this greeting"
        inert={!showActions}
        className={`absolute inset-x-0 bottom-0 z-10 px-5 pb-[max(0.9rem,env(safe-area-inset-bottom))] transition-[opacity,transform] duration-700 ease-[var(--ease-out-expo)] ${
          showActions ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"
        }`}
        style={{ minHeight: panelHeight }}
      >
        {feedbackOpen ? (
          <div className="mx-auto w-full max-w-[28rem]">
            <FeedbackForm role={mine ? "sender" : "recipient"} sender={greeting.senderName} onClose={() => setFeedbackOpen(false)} />
          </div>
        ) : messageOpen ? (
          <div className="mx-auto w-full max-w-[28rem]">
            <PostMessageView text={postText} onCopy={copyPostMessage} onClose={() => setMessageOpen(false)} />
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-[28rem] flex-col gap-3">
            {video.kind === "working" ? (
              <ExportProgress progress={video.progress} onCancel={() => abortRef.current?.abort()} />
            ) : video.kind === "ready" ? (
              <div className="flex flex-col gap-2">
                <Button variant="flame" onClick={() => saveVideo(video.file, video.blob)}>
                  <Download className="size-5" strokeWidth={2} aria-hidden="true" />
                  Save video
                </Button>
                <p className="text-center text-[0.9rem] leading-snug text-ink-dim text-pretty">
                  {video.withMusic ? "Music included. Share it from your gallery." : "Made without music. Share from your gallery."}
                </p>
              </div>
            ) : mine ? (
              <LinkButton
                variant="flame"
                href={whatsappHref(linkFor("whatsapp"))}
                target="_blank"
                rel="noopener"
                onClick={() => track("share_whatsapp")}
              >
                <MessageCircle className="size-5" strokeWidth={2} aria-hidden="true" />
                Send on WhatsApp
              </LinkButton>
            ) : (
              <Button variant="flame" onClick={greeting.senderName ? sendBack : () => makeOwn()} className="min-w-0">
                <span className="truncate">{greeting.senderName ? `Send one back to ${greeting.senderName}` : "Make one for someone"}</span>
              </Button>
            )}

            {(video.kind === "failed" || video.kind === "unsupported") && (
              <p role="alert" className="text-center text-[0.88rem] leading-snug text-alert text-pretty">
                {video.kind === "failed"
                  ? `${video.message} The link below works everywhere.`
                  : isInAppBrowser()
                    ? "Videos can't be made inside this app's browser. Open the link in Chrome or Safari, or share the link."
                    : "This browser can't make the video. Share the link instead: it plays the same greeting."}
              </p>
            )}

            {video.kind !== "working" && <PostMessageCard text={postText} onCopy={copyPostMessage} onOpen={() => setMessageOpen(true)} />}

            <div className="grid auto-cols-fr grid-flow-col gap-1.5">
              {video.kind !== "ready" && video.kind !== "working" && (
                <IconAction label={video.kind === "failed" ? "Try download again" : "Download video"} onClick={startExport}>
                  <Download className="size-5" strokeWidth={1.8} aria-hidden="true" />
                </IconAction>
              )}
              {!mine || video.kind === "ready" || video.kind === "working" ? (
                <IconAction label="WhatsApp" href={whatsappHref(linkFor("whatsapp"))} onClick={() => track("share_whatsapp")}>
                  <MessageCircle className="size-5" strokeWidth={1.8} aria-hidden="true" />
                </IconAction>
              ) : null}
              <IconAction label="Copy link" onClick={copy}>
                <Link2 className="size-5" strokeWidth={1.8} aria-hidden="true" />
              </IconAction>
              {mine && video.kind !== "ready" && (
                <IconAction label="Edit" onClick={editThis}>
                  <PencilLine className="size-5" strokeWidth={1.8} aria-hidden="true" />
                </IconAction>
              )}
            </div>

            {mine && video.kind !== "working" && (
              <Button onClick={makeAnother}>
                <UserPlus className="size-[1.1rem]" strokeWidth={1.8} aria-hidden="true" />
                Make one for someone else
              </Button>
            )}

            {!mine && video.kind !== "working" && video.kind !== "ready" && (
              <div className="flex min-h-11 items-center justify-end gap-1 text-[0.8rem]">
                {greeting.senderName && !confirmReport && (
                  <button
                    type="button"
                    onClick={() => makeOwn()}
                    className="mr-auto inline-flex min-h-11 items-center gap-1 text-[0.9rem] font-medium text-ink-dim underline-offset-4 hover:text-powder hover:underline"
                  >
                    <UserPlus className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                    Make one for someone else
                  </button>
                )}
                {confirmReport && !reported ? (
                  // Hiding is immediate and for everyone, so it takes a second, deliberate tap.
                  <>
                    <span className="mr-1 text-ink-dim">Hide this greeting for everyone?</span>
                    <button
                      type="button"
                      onClick={async () => {
                        setReported(true);
                        setConfirmReport(false);
                        try {
                          await reportGreeting(greeting.id);
                          say("Reported. This greeting is now hidden.");
                        } catch {
                          setReported(false);
                          say("Couldn't send the report. Try again.");
                        }
                      }}
                      className="inline-flex min-h-11 items-center rounded-full px-3 font-semibold text-alert hover:text-powder"
                    >
                      Hide
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmReport(false)}
                      className="inline-flex min-h-11 items-center rounded-full px-3 font-semibold text-ink hover:text-powder"
                    >
                      Keep
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={reported}
                    onClick={() => setConfirmReport(true)}
                    className="inline-flex min-h-11 items-center gap-1 text-ink-faint hover:text-ink disabled:opacity-60"
                  >
                    <Flag className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                    {reported ? "Reported" : "Report"}
                  </button>
                )}
              </div>
            )}

            {video.kind !== "working" && (
              <button
                type="button"
                onClick={() => setFeedbackOpen(true)}
                className="mx-auto inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[0.9rem] text-ink-dim underline-offset-4 hover:text-powder hover:underline"
              >
                <MessageSquareHeart className="size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                {/* One line on every phone: the offer itself is in the form. */}
                <span className="hidden min-[380px]:inline">Liked this? Tell us, and get one for your business</span>
                <span className="min-[380px]:hidden">Liked this? Tell us.</span>
              </button>
            )}
          </div>
        )}
      </section>

      <div aria-live="polite" className="pointer-events-none absolute inset-x-0 top-[calc(max(0.75rem,env(safe-area-inset-top))+3.5rem)] z-20 flex justify-center">
        {toast && (
          <span className="rise-in rounded-full bg-powder px-4 py-2 text-[0.92rem] font-medium text-oxide-900 shadow-[0_8px_24px_-6px_rgba(0,0,0,0.5)]">
            {toast}
          </span>
        )}
      </div>
    </div>
  );
}

function IconAction({
  label,
  onClick,
  href,
  children,
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  children: React.ReactNode;
}) {
  const cls =
    "flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[0.76rem] font-medium leading-tight text-ink-dim transition-colors hover:bg-oxide-700/60 hover:text-powder";
  if (href)
    return (
      <a href={href} target="_blank" rel="noopener" onClick={onClick} className={cls}>
        {children}
        <span className="text-center">{label}</span>
      </a>
    );
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
      <span className="text-center">{label}</span>
    </button>
  );
}

/** Export progress as a powder line drawing itself, not a spinner. */
function ExportProgress({ progress, onCancel }: { progress: number; onCancel: () => void }) {
  const pct = Math.round(progress * 100);
  return (
    <div className="flex flex-col gap-2" role="status" aria-live="polite">
      <div className="flex items-baseline justify-between text-[0.95rem]">
        <span className="font-semibold text-ink">Drawing your video</span>
        <span className="tabular-nums text-gold">{pct}%</span>
      </div>
      <div className="relative h-3 w-full" aria-hidden="true">
        <div className="absolute inset-0 [background-image:radial-gradient(circle,rgba(244,239,228,0.28)_1.4px,transparent_1.9px)] [background-size:10px_12px]" />
        <div
          className="absolute inset-y-0 left-0 [background-image:radial-gradient(circle,var(--color-gold)_2px,transparent_2.6px)] [background-size:10px_12px] transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between gap-3 text-[0.9rem] text-ink-faint">
        <span>Keep this screen open. It takes a few seconds.</span>
        <button type="button" onClick={onCancel} className="min-h-8 text-ink-dim underline underline-offset-4 hover:text-powder">
          Cancel
        </button>
      </div>
    </div>
  );
}

function Unavailable({ state, onRetry }: { state: LoadState; onRetry: () => void }) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#200b07]">
      <SceneCanvas mode="stage" data={{ recipientName: "", message: "", seed: 2026 }} label="A kolam on a dark threshold" className="opacity-60" />
      <main className="relative mx-auto flex min-h-dvh max-w-[28rem] flex-col justify-end gap-5 px-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {state.kind === "loading" ? (
          <p role="status" className="font-display text-[2rem] text-ink">
            Opening your greeting…
          </p>
        ) : (
          <>
            <h1 className="font-display text-[2rem] font-bold leading-tight text-powder text-balance">
              {state.kind === "missing" ? "This lamp has gone out" : "We couldn't open this greeting"}
            </h1>
            <p className="text-[1.02rem] leading-snug text-ink-dim text-pretty">{"message" in state ? state.message : ""}</p>
            <div className="flex flex-col gap-2">
              {state.kind === "error" && (
                <Button variant="flame" onClick={onRetry}>
                  Try again
                </Button>
              )}
              <Button variant={state.kind === "error" ? "powder" : "flame"} onClick={() => navigate("/")}>
                Make a Diwali greeting
              </Button>
            </div>
            <MakerMark />
          </>
        )}
      </main>
    </div>
  );
}
