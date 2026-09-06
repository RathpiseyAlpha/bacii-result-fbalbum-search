/**
 * Student Name Privacy Utilities
 * Masks the FIRST half of the name (family name / first word) while keeping the
 * SECOND half (given name / personal name) visible.
 *
 * Example (Khmer):
 * "ជឿន សុមាលីកា" -> "•••• សុមាលីកា"
 * "សុខ ហេង"     -> "•••• ហេង"
 *
 * Example (Latin):
 * "Chhoen Somalika" -> "•••• Somalika"
 */

export function maskStudentFirstName(name: string | undefined | null): string {
  if (!name) return "";
  const trimmed = name.trim();
  if (!trimmed) return "";

  // If name has multiple words (separated by spaces)
  const parts = trimmed.split(/\s+/);
  if (parts.length > 1) {
    // Mask the first half of words (at least 1 word)
    const wordsToMask = Math.max(1, Math.floor(parts.length / 2));
    const maskedParts = parts.map((part, index) => {
      if (index < wordsToMask) {
        return "••••";
      }
      return part;
    });
    return maskedParts.join(" ");
  }

  // Single word: mask the first half of glyphs/characters
  const len = trimmed.length;
  if (len <= 2) return "•• " + trimmed.slice(-1);
  const maskLen = Math.ceil(len / 2);
  return "•••• " + trimmed.slice(maskLen);
}
