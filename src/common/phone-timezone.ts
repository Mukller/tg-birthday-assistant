/**
 * Best-effort timezone auto-detection from a phone number's country calling code.
 * Telegram doesn't expose a user's timezone via the API, but we know the phone
 * they logged in with — its country code maps to a representative IANA zone.
 * Large countries (RU, US) span multiple zones; we pick the most common one.
 */
const CODE_TO_TZ: Record<string, string> = {
  // CIS
  '7': 'Europe/Moscow', // RU (KZ also +7; Moscow is the common case)
  '380': 'Europe/Kyiv',
  '375': 'Europe/Minsk',
  '374': 'Asia/Yerevan',
  '994': 'Asia/Baku',
  '995': 'Asia/Tbilisi',
  '998': 'Asia/Tashkent',
  '996': 'Asia/Bishkek',
  '992': 'Asia/Dushanbe',
  '993': 'Asia/Ashgabat',
  '373': 'Europe/Chisinau',
  // Europe
  '48': 'Europe/Warsaw',
  '49': 'Europe/Berlin',
  '44': 'Europe/London',
  '33': 'Europe/Paris',
  '39': 'Europe/Rome',
  '34': 'Europe/Madrid',
  '31': 'Europe/Amsterdam',
  '32': 'Europe/Brussels',
  '41': 'Europe/Zurich',
  '43': 'Europe/Vienna',
  '36': 'Europe/Budapest',
  '420': 'Europe/Prague',
  '421': 'Europe/Bratislava',
  '40': 'Europe/Bucharest',
  '359': 'Europe/Sofia',
  '30': 'Europe/Athens',
  '351': 'Europe/Lisbon',
  '353': 'Europe/Dublin',
  '370': 'Europe/Vilnius',
  '371': 'Europe/Riga',
  '372': 'Europe/Tallinn',
  '358': 'Europe/Helsinki',
  '46': 'Europe/Stockholm',
  '47': 'Europe/Oslo',
  '45': 'Europe/Copenhagen',
  '90': 'Europe/Istanbul',
  // Middle East / Asia
  '972': 'Asia/Jerusalem',
  '971': 'Asia/Dubai',
  '966': 'Asia/Riyadh',
  '91': 'Asia/Kolkata',
  '86': 'Asia/Shanghai',
  '81': 'Asia/Tokyo',
  '82': 'Asia/Seoul',
  '62': 'Asia/Jakarta',
  '60': 'Asia/Kuala_Lumpur',
  '66': 'Asia/Bangkok',
  '84': 'Asia/Ho_Chi_Minh',
  // Americas
  '1': 'America/New_York', // US/CA (Eastern as default)
  '55': 'America/Sao_Paulo',
  '52': 'America/Mexico_City',
  '54': 'America/Argentina/Buenos_Aires',
  // Oceania
  '61': 'Australia/Sydney',
  '64': 'Pacific/Auckland',
};

/** Returns an IANA timezone guessed from the phone, or null if unknown. */
export function phoneToTimezone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  // Match the longest known calling-code prefix (up to 4 digits).
  for (let len = 4; len >= 1; len--) {
    const prefix = digits.slice(0, len);
    if (CODE_TO_TZ[prefix]) return CODE_TO_TZ[prefix];
  }
  return null;
}
