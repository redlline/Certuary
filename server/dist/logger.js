const MAX_ENTRIES = 1000;
const buffer = [];
function record(level, args) {
    const message = args
        .map((a) => (typeof a === "string" ? a : a instanceof Error ? `${a.message}\n${a.stack}` : JSON.stringify(a)))
        .join(" ");
    buffer.push({ ts: new Date().toISOString(), level, message });
    if (buffer.length > MAX_ENTRIES)
        buffer.splice(0, buffer.length - MAX_ENTRIES);
}
const origLog = console.log.bind(console);
const origWarn = console.warn.bind(console);
const origError = console.error.bind(console);
console.log = (...args) => {
    record("info", args);
    origLog(...args);
};
console.warn = (...args) => {
    record("warn", args);
    origWarn(...args);
};
console.error = (...args) => {
    record("error", args);
    origError(...args);
};
export function getLogs(limit = 300, level) {
    const filtered = level ? buffer.filter((e) => e.level === level) : buffer;
    return filtered.slice(-limit);
}
//# sourceMappingURL=logger.js.map