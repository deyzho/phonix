/**
 * Ambient declarations for optional peer dependencies.
 *
 * These packages are listed under optionalDependencies and imported
 * dynamically inside try/catch blocks so that the SDK works without them
 * installed. The declarations here tell tsc that the modules exist so that
 * `import(...)` expressions type-check cleanly. The actual types are not
 * needed because every call site already casts the import result inline.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module '@fluencelabs/js-client' {
  const mod: any;
  export = mod;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module '@_koii/web3.js' {
  const mod: any;
  export = mod;
}
