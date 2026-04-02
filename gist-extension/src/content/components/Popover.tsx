// src/content/components/Popover.tsx
import React, { useEffect, useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { X, Send, Volume2, Pause, Square } from "lucide-react";
import styles from "./Popover.module.css";
import { Mermaid } from "./Mermaid";
import type { ComplexityLevel, ChatMessage } from "../../utils/messages";

export type PopoverState = "IDLE" | "LOADING" | "STREAMING" | "DONE" | "ERROR";

const MODES: { value: ComplexityLevel; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "simple",   label: "ELI5" },
  { value: "legal",    label: "Legal" },
  { value: "academic", label: "Academic" },
];

const DEFAULT_WIDTH  = 340;
const DEFAULT_HEIGHT = 380;
const MARGIN         = 12;

export interface PopoverProps {
  state: PopoverState;
  text: string;
  messages?: ChatMessage[];
  error?: string;
  position?: DOMRect;
  mode?: ComplexityLevel;
  imageData?: string;
  onClose: () => void;
  onModeChange?: (mode: ComplexityLevel) => void;
  onSendMessage?: (query: string) => void;
}

export function Popover({
  state,
  text,
  messages = [],
  error,
  position,
  mode = "standard",
  imageData,
  onClose,
  onModeChange,
  onSendMessage,
}: PopoverProps) {
  const [inputValue, setInputValue] = useState("");
  const [ttsState, setTtsState] = useState<"idle" | "playing" | "paused">("idle");
  const historyRef = useRef<HTMLDivElement>(null);

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

  // Re-anchor whenever a new highlight arrives (position reference changes).
  useEffect(() => {
    if (position) {
      setPos({
        x: getPopoverLeft(position, sizeRef.current.width),
        y: getPopoverTop(position, sizeRef.current.height),
      });
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
    if (state === "IDLE") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state, onClose]);

  // ─── Drag ────────────────────────────────────────────────────────
  const handleHeaderMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Ignore button clicks inside the header
    if ((e.target as HTMLElement).closest("button")) return;
    if (e.button !== 0) return;
    e.preventDefault();

    const originX = e.clientX - posRef.current.x;
    const originY = e.clientY - posRef.current.y;
    setIsDragging(true);

    const onMove = (ev: MouseEvent) => {
      setPos({ x: ev.clientX - originX, y: ev.clientY - originY });
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

  if (state === "IDLE") return null;

  return (
    <div
      className={styles.popover}
      role="dialog"
      aria-label="Gist explanation"
      aria-live="polite"
      style={{
        top:    `${pos.y}px`,
        left:   `${pos.x}px`,
        width:  `${size.width}px`,
        height: `${size.height}px`,
      }}
    >
      {/* Header — doubles as drag handle */}
      <div
        className={`${styles.header} ${isDragging ? styles.headerDragging : ""}`}
        onMouseDown={handleHeaderMouseDown}
      >
        <span className={styles.brand}>GIST</span>
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
              aria-pressed={mode === value}
              disabled={state === "LOADING" || state === "STREAMING"}
              onClick={() => onModeChange(value)}
            >
              {label}
            </button>
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
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`${styles.message} ${msg.role === "user" ? styles.userMessage : styles.modelMessage}`}
          >
            <div className={styles.markdown}>
              <ReactMarkdown
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
          </div>
        ))}

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
              <ReactMarkdown>{text}</ReactMarkdown>
            </div>
          </div>
        )}

        {state === "ERROR" && (
          <div className={styles.errorCard} role="alert">
            <p>{error ?? "Something went wrong."}</p>
            <p className={styles.errorHint}>Try highlighting a shorter passage.</p>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className={styles.inputBar}>
        <input
          type="text"
          className={styles.inputField}
          placeholder="Ask a follow-up..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") handleSend(); }}
          onKeyUp={(e) => e.stopPropagation()}
          onKeyPress={(e) => e.stopPropagation()}
          disabled={state === "LOADING" || state === "STREAMING"}
        />
        <button
          className={styles.sendButton}
          onClick={handleSend}
          disabled={!inputValue.trim() || state === "LOADING" || state === "STREAMING"}
          aria-label="Send"
        >
          <Send size={16} />
        </button>
      </div>

      {/* Resize handle — bottom-right corner */}
      <div
        className={styles.resizeHandle}
        onMouseDown={handleResizeMouseDown}
        aria-hidden="true"
      />
    </div>
  );
}

// ─── Positioning helpers ─────────────────────────────────────────────────────

function getPopoverTop(rect: DOMRect, height: number): number {
  const spaceBelow = window.innerHeight - rect.bottom;
  if (spaceBelow < height + MARGIN) {
    return rect.top + window.scrollY - height - MARGIN;
  }
  return rect.bottom + window.scrollY + MARGIN;
}

function getPopoverLeft(rect: DOMRect, width: number): number {
  const left    = rect.left + window.scrollX;
  const clamped = Math.min(left, window.innerWidth - width - MARGIN);
  return Math.max(MARGIN, clamped);
}
