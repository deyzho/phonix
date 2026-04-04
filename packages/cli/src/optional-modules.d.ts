/**
 * Ambient declarations for optional peer dependencies.
 * These packages are dynamically imported inside try/catch blocks so the CLI
 * works without them installed. The declarations let tsc resolve the imports
 * on build servers where the packages are absent.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module '@_koii/web3.js' {
  const mod: any;
  export = mod;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module '@fluencelabs/js-client' {
  const mod: any;
  export = mod;
}
