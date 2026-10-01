export function daysUntil(dateIso) {
    if (!dateIso)
        return null;
    const diff = new Date(dateIso).getTime() - Date.now();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
}
//# sourceMappingURL=dates.js.map