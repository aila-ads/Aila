/**
 * Writing languages offered for a project. The list is limited to scripts
 * the export fonts cover (Latin, Greek, Cyrillic), so every export prints
 * the text correctly. The language guides AI replies and export metadata.
 */
export const LANGUAGE_OPTIONS: ReadonlyArray<{ readonly value: string; readonly label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'nl', label: 'Dutch' },
  { value: 'sv', label: 'Swedish' },
  { value: 'da', label: 'Danish' },
  { value: 'nb', label: 'Norwegian' },
  { value: 'fi', label: 'Finnish' },
  { value: 'pl', label: 'Polish' },
  { value: 'cs', label: 'Czech' },
  { value: 'ro', label: 'Romanian' },
  { value: 'hu', label: 'Hungarian' },
  { value: 'tr', label: 'Turkish' },
  { value: 'el', label: 'Greek' },
  { value: 'ru', label: 'Russian' },
  { value: 'uk', label: 'Ukrainian' },
  { value: 'vi', label: 'Vietnamese' },
  { value: 'id', label: 'Indonesian' },
  { value: 'ms', label: 'Malay' },
  { value: 'sw', label: 'Swahili' },
  { value: 'ha', label: 'Hausa' },
  { value: 'ig', label: 'Igbo' },
  { value: 'yo', label: 'Yoruba' },
  { value: 'zu', label: 'Zulu' },
  { value: 'af', label: 'Afrikaans' },
];

/** The options, plus the current value when it is not in the list. */
export function languageOptions(current: string) {
  return LANGUAGE_OPTIONS.some((option) => option.value === current)
    ? LANGUAGE_OPTIONS
    : [{ value: current, label: current }, ...LANGUAGE_OPTIONS];
}
