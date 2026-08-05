/**
 * Calculates Levenshtein Distance between two strings.
 */
function levenshteinDistance(a, b) {
    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

/**
 * Finds the closest matching string from a list of candidate strings using Levenshtein distance.
 * @param {string} input - The input string to match
 * @param {string[]} candidates - Array of candidate strings
 * @param {number} threshold - Similarity threshold between 0 and 1 (default: 0.5)
 * @returns {string|null} Best matching candidate if above threshold, else null
 */
export function findClosestMatch(input, candidates, threshold = 0.5) {
    if (!input || !candidates || candidates.length === 0) return null;

    const cleanInput = input.trim().toLowerCase();
    let bestMatch = null;
    let highestScore = 0;

    for (const candidate of candidates) {
        if (!candidate) continue;
        const cleanCandidate = candidate.trim().toLowerCase();

        // Exact match case
        if (cleanInput === cleanCandidate) return candidate;

        const maxLen = Math.max(cleanInput.length, cleanCandidate.length);
        if (maxLen === 0) continue;

        const dist = levenshteinDistance(cleanInput, cleanCandidate);
        const score = 1 - dist / maxLen;

        if (score > highestScore && score >= threshold) {
            highestScore = score;
            bestMatch = candidate;
        }
    }

    return bestMatch;
}
