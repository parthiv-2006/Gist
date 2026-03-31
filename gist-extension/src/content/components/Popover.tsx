// src/content/components/Popover.tsx
import React, { useEffect, useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { X, Send, Volume2 } from "lucide-react";
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

export interface PopoverProps {
  state: PopoverState;
  text: string;
  messages?: ChatMessage[];
  error?: string;
  position?: DOMRect;
  mode?: ComplexityLevel;
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
  onClose,
  onModeChange,
  onSendMessage,
}: PopoverProps) {
  const [inputValue, setInputValue] = useState("");
  const historyRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [messages, text]);

  // Close on Escape key
  useEffect(() => {
    if (state === "IDLE") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [state, onClose]);

  // Close on click outside
  useEffect(() => {
    if (state === "IDLE") return;
    const handleClickOutside = (e: MouseEvent) => {
      const host = document.getElementById("gist-shadow-host");
      if (host && !host.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [state, onClose]);

  const handleSend = () => {
    if (!inputValue.trim() || !onSendMessage) return;
    onSendMessage(inputValue.trim());
    setInputValue("");
  };

  const handleTTS = () => {
    const lastMessage = messages[messages.length - 1]?.content || text;
    if (!lastMessage) return;
    
    // Stop any current speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(lastMessage);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  };

  if (state === "IDLE") return null;

  const style: React.CSSProperties = position
    ? {
        top: `${getPopoverTop(position)}px`,
        left: `${getPopoverLeft(position)}px`,
      }
    : { top: "20px", left: "20px" };

  return (
    <div
      className={styles.popover}
      role="dialog"
      aria-label="Gist explanation"
      aria-live="polite"
      style={style}
    >
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.brand}>GIST</span>
        <div className={styles.headerActions}>
          <button
            className={styles.closeButton}
            onClick={handleTTS}
            aria-label="Listen"
            title="Listen to explanation"
            disabled={!text && messages.length === 0}
          >
            <Volume2 size={16} />
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
      {onModeChange && messages.length === 0 && (
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

      {/* Body: Chat History */}
      <div className={styles.chatHistory} ref={historyRef}>
        {messages.map((msg, idx) => (
          <div key={idx} className={`${styles.message} ${msg.role === 'user' ? styles.userMessage : styles.modelMessage}`}>
            <div className={styles.markdown}>
              <ReactMarkdown
                components={{
                  code({ node, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "");
                    if (match && match[1] === "mermaid") {
                      return <Mermaid chart={String(children).replace(/\n$/, "")} />;
                    }
                    return (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {msg.content}
              </ReactMarkdown>
            </div>
          </div>
        ))}

        {/* Current Streaming / Loading Message */}
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
              <ReactMarkdown>
                {text}
              </ReactMarkdown>
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

      {/* Input Bar */}
      <div className={styles.inputBar}>
        <input
          type="text"
          className={styles.inputField}
          placeholder="Ask a follow-up..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
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
    </div>
  );
}

// ─── Positioning helpers ─────────────────────────────────────────────────────

const POPOVER_WIDTH = 320;
const POPOVER_EST_HEIGHT = 200;
const MARGIN = 12;

function getPopoverTop(rect: DOMRect): number {
  const spaceBelow = window.innerHeight - rect.bottom;
  if (spaceBelow < POPOVER_EST_HEIGHT + MARGIN) {
    return rect.top + window.scrollY - POPOVER_EST_HEIGHT - MARGIN;
  }
  return rect.bottom + window.scrollY + MARGIN;
}

function getPopoverLeft(rect: DOMRect): number {
  const left = rect.left + window.scrollX;
  const clamped = Math.min(left, window.innerWidth - POPOVER_WIDTH - MARGIN);
  return Math.max(MARGIN, clamped);
}
