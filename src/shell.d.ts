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
