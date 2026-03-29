// Minimal ambient type declarations for the Fetch API.
// Node 20+ provides these globally but shell-api's lib target is es2021
// which doesn't include them. These declarations cover both production
// code (database.ts) and test code (database.spec.ts).

declare function fetch(
  input: string | URL,
  init?: RequestInit
): Promise<Response>;

interface RequestInit {
  method?: string;
  headers?: Record<string, string> | Headers;
  body?: string | null;
  signal?: AbortSignal;
}

declare class Headers {
  constructor(init?: Record<string, string>);
  append(name: string, value: string): void;
  get(name: string): string | null;
  has(name: string): boolean;
  set(name: string, value: string): void;
}

declare class Response {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  json(): Promise<any>;
  text(): Promise<string>;
  constructor(
    body?: string | null,
    init?: {
      status?: number;
      statusText?: string;
      headers?: Record<string, string>;
    }
  );
}
