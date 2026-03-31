/// <reference types="vite/client" />

// CSS Modules type declaration for Vite + TypeScript
declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}

// Inline CSS asset import (used by shadow-host for deterministic style injection)
declare module "*?inline" {
  const content: string;
  export default content;
}
