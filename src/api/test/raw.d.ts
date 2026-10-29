// Vite's `?raw` imports, for tests that read a config file as text.
declare module "*?raw" {
  const text: string;
  export default text;
}
