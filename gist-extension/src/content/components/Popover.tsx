// src/content/components/Popover.tsx
import React, { useEffect, useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import DOMPurify from "dompurify";
import { X, Send, Volume2, Pause, Square, PanelRight, BookOpen, Minus, Bookmark, Check, Network, AlertTriangle, WifiOff, Clock, Key, Scissors, CloudOff, RefreshCw } from "lucide-react";
import styles from "./Popover.module.css";
import { Mermaid } from "./Mermaid";
import type { ComplexityLevel, ChatMessage } from "../../utils/messages";

export type PopoverState = "IDLE" | "LOADING" | "STREAMING" | "DONE" | "ERROR";

// ─── Error metadata ──────────────────────────────────────────────────────────

type ErrorVariant = "auth" | "quota" | "rate" | "network" | "timeout" | "service" | "generic";
interface ErrorMeta { Icon: React.ComponentType<{ size?: number }>; title: string; hint: string; variant: ErrorVariant; }

function getErrorMeta(error?: string, code?: string): ErrorMeta {
  const codeMap: Record<string, ErrorMeta> = {
    API_KEY_INVALID:       { Icon: Key,           title: "Invalid API Key",       hint: "Open the extension popup → Settings → API Configuration to update your key.", variant: "auth" },
    API_KEY_MISSING:       { Icon: Key,           title: "API Key Required",      hint: "Open the extension popup → Settings → API Configuration to add your Gemini key.", variant: "auth" },
    QUOTA_EXCEEDED:        { Icon: Clock,         title: "Quota Exceeded",        hint: "Your free Gemini quota is full. Visit aistudio.google.com to check your limits.", variant: "quota" },
    API_PERMISSION_DENIED: { Icon: Key,           title: "Permission Denied",     hint: "Your API key lacks access to this model. Check your Google AI Studio project settings.", variant: "auth" },
    RATE_LIMITED:          { Icon: Clock,         title: "Too Many Requests",     hint: "You're sending requests too quickly. Wait a moment and try again.", variant: "rate" },
    LLM_TIMEOUT:           { Icon: Clock,         title: "Request Timed Out",     hint: "The AI took too long. Try selecting a shorter passage.", variant: "timeout" },
    LLM_UNAVAILABLE:       { Icon: CloudOff,      title: "Service Unavailable",   hint: "Gemini may be warming up or under maintenance. Try again in a moment.", variant: "service" },
    LLM_ERROR:             { Icon: AlertTriangle, title: "AI Error",              hint: "The AI returned an error. Try again or select different text.", variant: "service" },
    NETWORK_ERROR:         { Icon: WifiOff,       title: "No Connection",         hint: "Check your internet connection and try again.", variant: "network" },
    TEXT_TOO_LONG:         { Icon: Scissors,      title: "Text Too Long",         hint: "Highlight a shorter passage — maximum 2,000 characters.", variant: "generic" },
    EMPTY_TEXT:            { Icon: AlertTriangle, title: "Nothing Selected",      hint: "Highlight some text on the page first.", variant: "generic" },
  };
  if (code && codeMap[code]) return codeMap[code];

  // Fallback: keyword detection in error string
  const msg = (error ?? "").toLowerCase();
  if (msg.includes("api key") || msg.includes("invalid key") || msg.includes("unauthenticated")) return codeMap.API_KEY_INVALID;
  if (msg.includes("quota") || msg.includes("exhausted")) return codeMap.QUOTA_EXCEEDED;
  if (msg.includes("too many") || msg.includes("rate limit") || msg.includes("slow down")) return codeMap.RATE_LIMITED;
  if (msg.includes("too long") || msg.includes("2,000") || msg.includes("characters")) return codeMap.TEXT_TOO_LONG;
  if (msg.includes("network") || msg.includes("connection") || msg.includes("offline")) return codeMap.NETWORK_ERROR;
  if (msg.includes("unavailable") || msg.includes("starting up")) return codeMap.LLM_UNAVAILABLE;
  if (msg.includes("timed out") || msg.includes("timeout")) return codeMap.LLM_TIMEOUT;
  return { Icon: AlertTriangle, title: "Something Went Wrong", hint: "Try selecting different text or try again.", variant: "generic" };
}

const MODES: { value: ComplexityLevel; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "simple",   label: "ELI5" },
  { value: "legal",    label: "Legal" },
  { value: "academic", label: "Academic" },
];

const MODE_COLORS: Record<string, string> = {
  standard: "#10b981",
  simple:   "#60a5fa",
  legal:    "#f59e0b",
  academic: "#a78bfa",
};

const DEFAULT_WIDTH  = 340;
const DEFAULT_HEIGHT = 380;
const MARGIN         = 12;

export interface DrillingLevel {
  term: string;
  level: number;
}

export interface PopoverProps {
  state: PopoverState;
  text: string;
  messages?: ChatMessage[];
  error?: string;
  errorCode?: string;
  position?: DOMRect;
  mode?: ComplexityLevel;
  imageData?: string;
  isSidebarMode?: boolean;
  isVisible?: boolean;
  saveStatus?: "unsaved" | "saving" | "saved" | "error";
  drillingStack?: DrillingLevel[];
  onToggleSidebar?: () => void;
  onOpenLibrary?: () => void;
  onClose: () => void;
  onModeChange?: (mode: ComplexityLevel) => void;
  onSendMessage?: (query: string) => void;
  onSaveGist?: (explanation: string) => void;
  diagramSvg?: string;
  diagramSource?: string;
  diagramState?: "idle" | "loading" | "done" | "error";
  onVisualize?: (text: string) => void;
  onDrill?: (term: string) => void;
  onJumpToDrillingLevel?: (levelIndex: number) => void;
}

export function Popover({
  state,
  text,
  messages = [],
  error,
  errorCode,
  position,
  mode = "standard",
  imageData,
  isSidebarMode = false,
  isVisible = false,
  saveStatus = "unsaved",
  drillingStack = [],
  onToggleSidebar,
  onOpenLibrary,
  onClose,
  onModeChange,
  onSendMessage,
  onSaveGist,
  diagramSvg,
  diagramSource,
  diagramState = "idle",
  onVisualize,
  onDrill,
  onJumpToDrillingLevel,
}: PopoverProps) {
  const [inputValue, setInputValue] = useState("");
  const [ttsState, setTtsState] = useState<"idle" | "playing" | "paused">("idle");
  const [minimized, setMinimized] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const isInputDisabled = (state === "LOADING" || state === "STREAMING") || (state === "IDLE" && messages.length === 0);

  // ─── Position & Size (drag / resize) ────────────────────────────
  const [pos,  setPos]  = useState(() =>
    position
      ? { x: getPopoverLeft(position, DEFAULT_WIDTH), y: getPopoverTop(position, DEFAULT_HEIGHT) }
      : { x: 20, y: 20 }
  );
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
  const [isDragging, setIsDragging] = useState(false);

  // Keep refs in sync so event-handler closures always read the latest values.
  const posRef  = useRef(pos);  posRef.current  = pos;
  const sizeRef = useRef(size); sizeRef.current = size;

  // ─── Double-click word drilling ────────────────────────────────────────────
  const handleDoubleClickWord = (word: string) => {
    if (!onDrill || !word.trim()) return;
    if (drillingStack.length >= 10) return; // cap depth
    onDrill(word.trim());
  };

  // ─── Re-anchor and restore whenever a new highlight arrives ────────────────────
  useEffect(() => {
    if (position) {
      setPos({
        x: getPopoverLeft(position, sizeRef.current.width),
        y: getPopoverTop(position, sizeRef.current.height),
      });
      setMinimized(false);
    }
  }, [position]);

  // ─── Auto-scroll chat ────────────────────────────────────────────
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [messages, text]);

  // ─── Close on Escape ─────────────────────────────────────────────
  useEffect(() => {
    if (state === "IDLE" && !isSidebarMode) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state, isSidebarMode, onClose]);

  // ─── Drag ────────────────────────────────────────────────────────
  const handleHeaderMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Ignore button clicks inside the header
    if ((e.target as HTMLElement).closest("button")) return;
    if (e.button !== 0) return;
    e.preventDefault();

    const originX = e.clientX - posRef.current.x;
    const originY = e.clientY - posRef.current.y;
    setIsDragging(true);

    const HEADER_H = 44; // keep the header reachable within the viewport
    const onMove = (ev: MouseEvent) => {
      const w = sizeRef.current.width;
      const newX = Math.max(MARGIN, Math.min(window.innerWidth  - w - MARGIN, ev.clientX - originX));
      const newY = Math.max(MARGIN, Math.min(window.innerHeight - HEADER_H,   ev.clientY - originY));
      setPos({ x: newX, y: newY });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      setIsDragging(false);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
  };

  // ─── Resize ──────────────────────────────────────────────────────
  const handleResizeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation(); // don't trigger drag

    const startX = e.clientX;
    const startY = e.clientY;
    const startW = sizeRef.current.width;
    const startH = sizeRef.current.height;

    const onMove = (ev: MouseEvent) => {
      const w = Math.max(280, Math.min(640, startW + ev.clientX - startX));
      const h = Math.max(220, Math.min(720, startH + ev.clientY - startY));
      setSize({ width: w, height: h });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
  };

  // ─── Send / TTS ──────────────────────────────────────────────────
  const handleSend = () => {
    if (!inputValue.trim() || !onSendMessage) return;
    onSendMessage(inputValue.trim());
    setInputValue("");
  };

  const handleTTS = () => {
    if (ttsState === "playing") {
      window.speechSynthesis.pause();
      return;
    }
    if (ttsState === "paused") {
      window.speechSynthesis.resume();
      return;
    }

    const lastMessage = messages[messages.length - 1]?.content || text;
    if (!lastMessage) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(lastMessage);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => setTtsState("playing");
    utterance.onend = () => setTtsState("idle");
    utterance.onerror = () => setTtsState("idle");
    utterance.onpause = () => setTtsState("paused");
    utterance.onresume = () => setTtsState("playing");

    window.speechSynthesis.speak(utterance);
  };

  const handleStopTTS = () => {
    window.speechSynthesis.cancel();
    setTtsState("idle");
  };

  if (state === "IDLE" && !isSidebarMode && !isVisible) return null;

  // Minimized: draggable floating dot — click restores, drag repositions
  if (minimized) {
    const minimizedStyle = isSidebarMode
      ? { bottom: "24px", right: "16px" }
      : { top: `${pos.y}px`, left: `${pos.x}px` };

    const handleMinimizedMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();

      const startX  = e.clientX;
      const startY  = e.clientY;
      const originX = e.clientX - posRef.current.x;
      const originY = e.clientY - posRef.current.y;
      const ICON_D  = 36; // icon diameter
      let moved = false;

      const onMove = (ev: MouseEvent) => {
        if (!moved && (Math.abs(ev.clientX - startX) > 4 || Math.abs(ev.clientY - startY) > 4)) {
          moved = true;
        }
        if (moved) {
          const nx = Math.max(MARGIN, Math.min(window.innerWidth  - ICON_D - MARGIN, ev.clientX - originX));
          const ny = Math.max(MARGIN, Math.min(window.innerHeight - ICON_D - MARGIN, ev.clientY - originY));
          setPos({ x: nx, y: ny });
        }
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup",   onUp);
        if (!moved) setMinimized(false); // treat as click → restore
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup",   onUp);
    };

    return (
      <button
        className={styles.minimizedIcon}
        style={minimizedStyle}
        onMouseDown={handleMinimizedMouseDown}
        aria-label="Restore Gist"
        title="Restore Gist"
      >
        <span className={styles.minimizedDot} />
      </button>
    );
  }

  return (
    <div
      className={`${styles.popover} ${isSidebarMode ? styles.sidebar : ""}`}
      role="dialog"
      aria-label="Gist explanation"
      aria-live="polite"
      style={!isSidebarMode ? {
        top:    `${pos.y}px`,
        left:   `${pos.x}px`,
        width:  `${size.width}px`,
        height: `${size.height}px`,
      } : {}}
    >
      {/* Header — doubles as drag handle */}
      <div
        className={`${styles.header} ${isDragging ? styles.headerDragging : ""}`}
        onMouseDown={handleHeaderMouseDown}
      >
        <div className={styles.brand}>
          <svg width="15" height="15" viewBox="0 0 32 32" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
            <rect width="32" height="32" rx="6" fill="oklch(0.75 0.11 150)" />
            <path d="M 20.8 11.5 A 7 7 0 1 0 20.8 15.2 H 24 V 21.5 Q 24 26.2 18.4 26.2 Q 13.8 26.2 13.4 22.7" stroke="oklch(0.22 0.03 150)" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M 14 7.5 C 19 9.2 20 17 14 19.5 C 8 17 9 9.2 14 7.5 Z" fill="oklch(0.30 0.07 150)" />
            <path d="M 14 8.5 Q 14.5 13.5 14 18.5" stroke="oklch(0.20 0.04 150)" strokeWidth="0.5" fill="none" strokeLinecap="round" />
          </svg>
          <span className={styles.brandName}>Gist</span>
        </div>
        <div className={styles.headerActions}>
          {ttsState !== "idle" && (
            <button
              className={styles.closeButton}
              onClick={handleStopTTS}
              aria-label="Stop TTS"
              title="Stop"
            >
              <Square size={14} fill="currentColor" />
            </button>
          )}
          <button
            className={styles.closeButton}
            onClick={handleTTS}
            aria-label={ttsState === "playing" ? "Pause" : "Listen"}
            title={ttsState === "playing" ? "Pause" : "Listen"}
            disabled={!text && messages.length === 0}
          >
            {ttsState === "playing" ? <Pause size={16} /> : <Volume2 size={16} />}
          </button>
          <button
            className={styles.closeButton}
            onClick={onOpenLibrary}
            aria-label="Open Library"
            title="Library"
          >
            <BookOpen size={16} />
          </button>
          <div className={styles.headerSep} aria-hidden="true" />
          <button
            className={styles.closeButton}
            onClick={onToggleSidebar}
            aria-label={isSidebarMode ? "Dock floating" : "Dock to sidebar"}
            title={isSidebarMode ? "Dock floating" : "Dock to sidebar"}
          >
            <PanelRight size={16} />
          </button>
          <button
            className={styles.closeButton}
            onClick={() => setMinimized(true)}
            aria-label="Minimize"
            title="Minimize"
          >
            <Minus size={14} />
          </button>
          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Mode selector */}
      {onModeChange && (
        <div className={styles.modeSelector}>
          {MODES.map(({ value, label }) => (
            <button
              key={value}
              className={`${styles.modeButton} ${mode === value ? styles.modButtonActive : ""}`}
              style={mode === value ? {
                color: MODE_COLORS[value],
                background: `${MODE_COLORS[value]}14`,
                borderColor: `${MODE_COLORS[value]}30`,
              } : {}}
              aria-pressed={mode === value}
              disabled={state === "LOADING" || state === "STREAMING"}
              onClick={() => onModeChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Breadcrumb trail for drilling */}
      {drillingStack.length > 0 && (
        <div className={styles.breadcrumb}>
          <button
            className={styles.breadcrumbBtn}
            onClick={() => onJumpToDrillingLevel?.(-1)}
            title="Back to root explanation"
          >
            ← Root
          </button>
          {drillingStack.map((level, idx) => (
            <React.Fragment key={idx}>
              <span className={styles.breadcrumbSep} aria-hidden="true">›</span>
              <button
                className={styles.breadcrumbBtn}
                onClick={() => onJumpToDrillingLevel?.(idx)}
                title={level.term}
              >
                {level.term}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Chat history */}
      <div className={styles.chatHistory} ref={historyRef}>
        {imageData && (
          <div className={styles.visualContext}>
            <img src={imageData} alt="Captured area" className={styles.thumbnail} />
            <div className={styles.visualBadge}>Visual Context</div>
          </div>
        )}

        {/* Empty state for sidebar */}
        {messages.length === 0 && state === "IDLE" && (
          <div className={styles.emptySidebar}>
            <div className={styles.emptyIcon}>
              <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <line x1="7" y1="8"  x2="17" y2="8"  />
                <line x1="7" y1="12" x2="14" y2="12" />
                <line x1="7" y1="16" x2="16" y2="16" />
              </svg>
            </div>
            <h3>{isSidebarMode ? "Gist Sidebar" : "Ready to Gist"}</h3>
            <p>Highlight any text on this page for an instant AI-powered explanation.</p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isLastModel = msg.role === "model" && idx === messages.length - 1;
          return (
            <div
              key={idx}
              className={`${styles.message} ${msg.role === "user" ? styles.userMessage : styles.modelMessage}`}
            >
              <div
                className={styles.markdown}
                onDoubleClick={(e) => {
                  const selection = window.getSelection();
                  if (selection && selection.toString().length > 0) {
                    handleDoubleClickWord(selection.toString());
                  }
                }}
                style={{ cursor: "default", userSelect: "text" }}
              >
                <ReactMarkdown
                  allowedElements={["p","br","strong","em","code","pre","h1","h2","h3","h4","ul","ol","li","blockquote","a"]}
                  unwrapDisallowed={true}
                  components={{
                    code({ node, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || "");
                      if (match && match[1] === "mermaid") {
                        return <Mermaid chart={String(children).replace(/\n$/, "")} />;
                      }
                      return <code className={className} {...props}>{children}</code>;
                    },
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              </div>
              {isLastModel && state === "DONE" && (onSaveGist || onVisualize) && (
                <div className={styles.messageActions}>
                  {onSaveGist && (
                    <button
                      className={`${styles.saveButton} ${saveStatus === "saved" ? styles.saveButtonSaved : ""} ${saveStatus === "error" ? styles.saveButtonError : ""}`}
                      onClick={() => saveStatus === "unsaved" || saveStatus === "error" ? onSaveGist(msg.content) : undefined}
                      disabled={saveStatus === "saving" || saveStatus === "saved"}
                      title={saveStatus === "saved" ? "Saved to library" : saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Save failed — retry" : "Save to library"}
                      aria-label={saveStatus === "saved" ? "Saved to library" : "Save to library"}
                    >
                      {saveStatus === "saved"
                        ? <Check size={12} />
                        : <Bookmark size={12} fill={saveStatus === "saving" ? "currentColor" : "none"} />
                      }
                      <span>{saveStatus === "saved" ? "Saved" : saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Retry save" : "Save"}</span>
                    </button>
                  )}
                  {onVisualize && (
                    <button
                      className={`${styles.saveButton} ${diagramState === "done" ? styles.saveButtonSaved : ""} ${diagramState === "error" ? styles.saveButtonError : ""}`}
                      onClick={() => diagramState === "idle" || diagramState === "error" ? onVisualize(msg.content) : undefined}
                      disabled={diagramState === "loading" || diagramState === "done"}
                      title={diagramState === "done" ? "Diagram drawn" : diagramState === "loading" ? "Drawing diagram…" : diagramState === "error" ? "Diagram failed — retry" : "Generate visual diagram"}
                      aria-label="Visualize as diagram"
                    >
                      <Network size={12} />
                      <span>{diagramState === "done" ? "Drawn" : diagramState === "loading" ? "Drawing…" : diagramState === "error" ? "Retry diagram" : "Visualize"}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Diagram panel — shown after messages when visualize is active */}
        {diagramState === "loading" && (
          <div className={styles.diagramPanel}>
            <div className={styles.diagramLabel}>Drawing diagram…</div>
            <div className={styles.diagramShimmer}>
              <div className={styles.diagramShimmerBar} style={{ width: "70%" }} />
              <div className={styles.diagramShimmerBar} style={{ width: "90%" }} />
              <div className={styles.diagramShimmerBar} style={{ width: "55%" }} />
            </div>
          </div>
        )}
        {diagramState === "done" && diagramSvg && (
          <div className={styles.diagramPanel}>
            <div className={styles.diagramLabel}>Visual diagram</div>
            <div
              className={styles.diagramSvg}
              dangerouslySetInnerHTML={{ __html: sanitizeSvg(diagramSvg) }}
            />
          </div>
        )}
        {diagramState === "done" && !diagramSvg && diagramSource && (
          <div className={styles.diagramPanel}>
            <div className={styles.diagramLabel}>Diagram source</div>
            <Mermaid chart={diagramSource} />
          </div>
        )}
        {diagramState === "error" && (
          <div className={styles.diagramPanel}>
            <div className={styles.diagramError}>Couldn't render diagram. Try again.</div>
          </div>
        )}

        {state === "LOADING" && (
          <div className={`${styles.message} ${styles.modelMessage}`}>
            <div className={styles.skeleton} data-testid="gist-skeleton">
              <div className={styles.skeletonLine} />
              <div className={styles.skeletonLine} />
              <div className={styles.skeletonLine} />
            </div>
          </div>
        )}

        {state === "STREAMING" && (
          <div className={`${styles.message} ${styles.modelMessage}`}>
            <div className={`${styles.markdown} ${styles.streaming}`}>
              <ReactMarkdown allowedElements={["p","br","strong","em","code","pre","h1","h2","h3","h4","ul","ol","li","blockquote"]} unwrapDisallowed={true}>{text}</ReactMarkdown>
            </div>
          </div>
        )}

        {state === "ERROR" && (() => {
          const meta = getErrorMeta(error, errorCode);
          return (
            <div className={`${styles.errorCard} ${styles[`errorVariant_${meta.variant}`]}`} role="alert">
              <div className={styles.errorHeader}>
                <span className={styles.errorIconWrap}>
                  <meta.Icon size={13} />
                </span>
                <span className={styles.errorTitle}>{meta.title}</span>
              </div>
              <p className={styles.errorMessage}>{error ?? "Something went wrong."}</p>
              <p className={styles.errorHint}>{meta.hint}</p>
            </div>
          );
        })()}
      </div>

      {/* Input bar */}
      <div className={`${styles.inputBar} ${isInputDisabled ? styles.inputBarDisabled : ""}`}>
        <div className={styles.inputBarWrapper}>
          <input
            type="text"
            className={styles.inputField}
            placeholder={isInputDisabled ? "Gist something to chat..." : "Ask a follow-up..."}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Escape") e.stopPropagation();
              if (e.key === "Enter") handleSend();
              if (e.key === "Escape") onClose();
            }}
            onKeyUp={(e) => e.stopPropagation()}
            onKeyPress={(e) => e.stopPropagation()}
            disabled={isInputDisabled}
          />
          <button
            className={styles.sendButton}
            onClick={handleSend}
            disabled={!inputValue.trim() || isInputDisabled}
            aria-label="Send"
          >
            <Send size={14} />
          </button>
        </div>
      </div>

      {/* Resize handle — bottom-right corner */}
      {!isSidebarMode && (
        <div
          className={styles.resizeHandle}
          onMouseDown={handleResizeMouseDown}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

// ─── SVG sanitizer ───────────────────────────────────────────────────────────
const _SVG_ALLOWED_TAGS = [
  "svg", "g", "path", "rect", "text", "tspan", "circle", "ellipse",
  "line", "polyline", "polygon", "defs", "marker", "use", "title",
  "desc", "clipPath", "mask", "linearGradient", "radialGradient", "stop",
];
const _SVG_ALLOWED_ATTR = [
  "class", "id", "d", "fill", "stroke", "stroke-width", "stroke-dasharray",
  "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2",
  "width", "height", "transform", "viewBox", "xmlns", "marker-end",
  "marker-start", "marker-mid", "refX", "refY", "markerWidth", "markerHeight",
  "orient", "points", "opacity", "font-size", "font-family", "text-anchor",
  "dominant-baseline", "clip-path", "mask", "href", "gradientUnits",
  "gradientTransform", "offset", "stop-color", "stop-opacity", "preserveAspectRatio",
];

function sanitizeSvg(svg: string): string {
  return DOMPurify.sanitize(svg, {
    ALLOWED_TAGS: _SVG_ALLOWED_TAGS,
    ALLOWED_ATTR: _SVG_ALLOWED_ATTR,
  });
}

// ─── Positioning helpers ─────────────────────────────────────────────────────

function getPopoverTop(rect: DOMRect, height: number): number {
  // rect coords are viewport-relative; popover is position:fixed — no scroll offset needed.
  const spaceBelow = window.innerHeight - rect.bottom;
  if (spaceBelow < height + MARGIN) {
    return Math.max(MARGIN, rect.top - height - MARGIN);
  }
  return Math.min(rect.bottom + MARGIN, window.innerHeight - height - MARGIN);
}

function getPopoverLeft(rect: DOMRect, width: number): number {
  // rect.left is already viewport-relative — do not add scrollX.
  const clamped = Math.min(rect.left, window.innerWidth - width - MARGIN);
  return Math.max(MARGIN, clamped);
}
