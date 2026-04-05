/**
 * Ambient module declarations for optional peer/native dependencies.
 *
 * These declarations let TypeScript compile without requiring the actual
 * packages to be installed in the monorepo. The consuming React Native /
 * Expo app provides these at runtime via its own node_modules.
 */

// ─── react-native ─────────────────────────────────────────────────────────────

declare module 'react-native' {
  export type AppStateStatus =
    | 'active'
    | 'background'
    | 'inactive'
    | 'unknown'
    | 'extension';

  export const AppState: {
    readonly currentState: AppStateStatus;
    addEventListener(
      event: 'change',
      handler: (state: AppStateStatus) => void
    ): { remove(): void };
  };

  export const Platform: {
    readonly OS: 'ios' | 'android' | 'web' | 'windows' | 'macos';
    readonly Version: number | string;
    select<T>(specifics: { ios?: T; android?: T; default?: T }): T;
  };

  export const NetInfo: {
    fetch(): Promise<{ isConnected: boolean | null }>;
  };
}

// ─── expo-secure-store ────────────────────────────────────────────────────────

declare module 'expo-secure-store' {
  export function setItemAsync(
    key: string,
    value: string,
    options?: { keychainService?: string }
  ): Promise<void>;
  export function getItemAsync(
    key: string,
    options?: { keychainService?: string }
  ): Promise<string | null>;
  export function deleteItemAsync(
    key: string,
    options?: { keychainService?: string }
  ): Promise<void>;
}

// ─── react ────────────────────────────────────────────────────────────────────
// Only declared if @types/react is not installed in the consuming project.

declare module 'react' {
  export function useState<T>(initial: T | (() => T)): [T, (val: T | ((prev: T) => T)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useCallback<T extends (...args: unknown[]) => unknown>(fn: T, deps: readonly unknown[]): T;
  export function useRef<T>(initial: T): { current: T };
  export function useContext<T>(ctx: React.Context<T>): T;
  export function createContext<T>(defaultValue: T): React.Context<T>;
  export function useReducer<S, A>(
    reducer: (state: S, action: A) => S,
    initialState: S
  ): [S, (action: A) => void];

  export namespace React {
    interface Context<T> {
      Provider: React.ComponentType<{ value: T; children?: ReactNode }>;
      Consumer: React.ComponentType<{ children: (value: T) => ReactNode }>;
    }
    type ReactNode = React.ReactElement | string | number | boolean | null | undefined;
    type ComponentType<P = object> = (props: P) => ReactElement | null;
    interface ReactElement { type: unknown; props: unknown; key: string | null; }
    interface FC<P = object> { (props: P): ReactElement | null; }
  }

  export type ReactNode = React.ReactNode;
  export type FC<P = object> = React.FC<P>;
  export type ReactElement = React.ReactElement;
  export type Context<T> = React.Context<T>;
  export type ComponentType<P = object> = React.ComponentType<P>;
  export type PropsWithChildren<P = object> = P & { children?: ReactNode };
  export default React;
}
