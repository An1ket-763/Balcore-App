/// <reference types="vite/client" />

declare module "*.css?url" {
  const src: string;
  export default src;
}

declare module "*.css" {
  /** CSS side-effect module. */
}
