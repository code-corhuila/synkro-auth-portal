declare module 'shell/authentication' {
    export interface LoginOutcome {
        user: {
            sub: string;
            role: string;
        };
        destination: string;
    }
    export const authentication: {
        login(credentials: {
            email: string;
            password: string;
        }, options?: {
            signal?: AbortSignal;
            returnTo?: string;
        }): Promise<LoginOutcome>;
    };
}

declare module 'shell/apiClient' {
    export interface RequestOptions {
        method?: string;
        body?: unknown;
        query?: Record<string, string | number | boolean | null | undefined>;
        idempotencyKey?: string;
        signal?: AbortSignal;
    }
    export const apiClient: {
        request<T>(path: string, options?: RequestOptions): Promise<T>;
    };
}

declare module 'shell/session' {
    export interface ShellUser {
        sub: string;
        role: string;
    }
    export const session: {
        user(): ShellUser | null;
        sessionId(): string | null;
        subscribe(listener: () => void): () => void;
    };
}
