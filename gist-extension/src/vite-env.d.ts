// CSS Modules type declaration for Vite + TypeScript
declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}
