import React, { useState, useEffect, useRef } from "react";
import styles from "./CaptureOverlay.module.css";

interface CaptureOverlayProps {
  onCapture: (rect: { x: number; y: number; width: number; height: number }) => void;
  onCancel: () => void;
}

export const CaptureOverlay: React.FC<CaptureOverlayProps> = ({ onCapture, onCancel }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    const pos = { x: e.clientX, y: e.clientY };
    setStartPos(pos);
    setCurrentPos(pos);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setCurrentPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    setIsDragging(false);

    const x = Math.min(startPos.x, currentPos.x);
    const y = Math.min(startPos.y, currentPos.y);
    const width = Math.abs(startPos.x - currentPos.x);
    const height = Math.abs(startPos.y - currentPos.y);

    if (width > 5 && height > 5) {
      onCapture({ x, y, width, height });
    } else {
      onCancel();
    }
  };

  const rect = {
    left: Math.min(startPos.x, currentPos.x),
    top: Math.min(startPos.y, currentPos.y),
    width: Math.abs(startPos.x - currentPos.x),
    height: Math.abs(startPos.y - currentPos.y),
  };

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <div className={styles.instruction}>
        Drag to select an area to explain
        <div className={styles.subtext}>Esc to cancel</div>
      </div>
      {isDragging && (
        <div
          className={styles.selection}
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          }}
        >
          <div className={styles.selectionBorder} />
        </div>
      )}
    </div>
  );
};
