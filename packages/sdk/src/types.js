// ─── Error types ────────────────────────────────────────────────────────────
export class AxonError extends Error {
    constructor(providerOrMessage, message) {
        super(message ? `[${providerOrMessage}] ${message}` : providerOrMessage);
        this.name = 'AxonError';
        // Maintain proper prototype chain in ES5 transpilation targets
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
export class ProviderNotImplementedError extends AxonError {
    constructor(provider, method) {
        super(`Provider '${provider}' has not implemented '${method}' yet. Coming in v0.2.`);
        this.name = 'ProviderNotImplementedError';
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
export class ConfigValidationError extends AxonError {
    constructor(field, reason) {
        super(`Invalid phonix.json — field '${field}': ${reason}`);
        this.name = 'ConfigValidationError';
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
//# sourceMappingURL=types.js.map