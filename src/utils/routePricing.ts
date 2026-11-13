/**
 * M3Car Route Pricing & Geofencing Utility
 * - Rule 1: Geofence check (Indonesia only; blocks Malaysia, Singapore, etc.)
 * - Rule 2: Jakarta - Ujung Kulon Corridor Deviation Calculator (Rp 15.000 / km deviation)
 */

export interface GeofenceResult {
  isOutsideIndonesia: boolean;
  countryName: string;
  warningText: string;
}

export interface DeviationPricingResult {
  deviationKm: number;
  deviationFee: number;
  basePrice: number;
  totalPrice: number;
  pricePerPerson: number;
  isOffRoute: boolean;
  corridorNote: string;
}

// Jakarta - Ujung Kulon Normal Highway & Toll Corridor Waypoints
// Tol Jakarta-Merak + Tol Serang-Panimbang (83,6 km) to Sumur / Ujung Kulon
const CORRIDOR_POINTS = [
  { lat: -6.1754, lng: 106.8272, name: 'Jakarta Pusat (Monas / Gambir)' },
  { lat: -6.1925, lng: 106.7694, name: 'Kebon Jeruk (Tol Jakarta-Tangerang)' },
  { lat: -6.2255, lng: 106.6272, name: 'Karawaci / Tangerang' },
  { lat: -6.1995, lng: 106.4421, name: 'Balaraja Barat' },
  { lat: -6.1624, lng: 106.3125, name: 'Cikande / Kragilan' },
  { lat: -6.1265, lng: 106.1824, name: 'Serang Timur (Simpang Tol Serang-Panimbang)' },
  { lat: -6.3450, lng: 106.2480, name: 'Rangkasbitung (Seksi 1)' },
  { lat: -6.4680, lng: 106.1250, name: 'Cileles (Seksi 2)' },
  { lat: -6.5380, lng: 105.8450, name: 'Panimbang / Labuan (Seksi 3)' },
  { lat: -6.6250, lng: 105.7100, name: 'Cimanggu / Cibaliung' },
  { lat: -6.6570, lng: 105.5780, name: 'Sumur / Ujung Kulon (Tunggaljaya & Tamanjaya)' },
];

/**
 * Convert degrees to radians
 */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Haversine formula to calculate great-circle distance between 2 points in km
 */
export function calculateHaversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Shortest distance from point P to line segment AB in km
 */
function distanceToSegmentKm(
  pLat: number,
  pLon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): number {
  const segmentLen = calculateHaversineKm(aLat, aLon, bLat, bLon);
  if (segmentLen === 0) return calculateHaversineKm(pLat, pLon, aLat, aLon);

  // Approximate projection parameter t using planar coordinate scaling
  const dx = (bLon - aLon) * Math.cos(toRad((aLat + bLat) / 2));
  const dy = bLat - aLat;
  const px = (pLon - aLon) * Math.cos(toRad((aLat + pLat) / 2));
  const py = pLat - aLat;

  let t = (px * dx + py * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));

  const projLat = aLat + t * (bLat - aLat);
  const projLon = aLon + t * (bLon - aLon);

  return calculateHaversineKm(pLat, pLon, projLat, projLon);
}

/**
 * Check if a location is outside Indonesia.
 * Explicitly detects Malaysia (Johor, Segamat, etc.), Singapore, or any non-ID territory.
 */
export function checkIsOutsideIndonesia(params: {
  address?: string;
  lat?: number;
  lng?: number;
  country?: string;
  countryCode?: string;
}): GeofenceResult {
  const { address = '', lat, lng, country = '', countryCode = '' } = params;
  const lowerAddr = address.toLowerCase();
  const lowerCountry = country.toLowerCase();
  const lowerCode = countryCode.toLowerCase();

  // 1. Explicit country or code from geocoding
  if (lowerCode && lowerCode !== 'id') {
    const detectedName = country || lowerCode.toUpperCase();
    return {
      isOutsideIndonesia: true,
      countryName: detectedName,
      warningText:
        'MAAF, M3CAR KHUSUS INDONESIA SAJA. Kami hanya melayani Ujung Kulon - Jakarta (Indonesia).',
    };
  }

  if (lowerCountry && lowerCountry !== 'indonesia') {
    return {
      isOutsideIndonesia: true,
      countryName: country,
      warningText:
        'MAAF, M3CAR KHUSUS INDONESIA SAJA. Kami hanya melayani Ujung Kulon - Jakarta (Indonesia).',
    };
  }

  // 2. Keyword checks for Malaysia, Johor, Segamat, Singapore, etc.
  const foreignKeywords = [
    'malaysia',
    'segamat',
    'johor',
    'singapore',
    'singapura',
    'kuala lumpur',
    'selangor',
    'penang',
    'sabah',
    'sarawak',
    'melaka',
    'pahang',
    'perak',
    'kedah',
    'kelantan',
    'terengganu',
    'perlis',
    'thailand',
    'philippines',
    'australia',
  ];

  for (const kw of foreignKeywords) {
    if (lowerAddr.includes(kw)) {
      const countryName = lowerAddr.includes('singapore') || lowerAddr.includes('singapura')
        ? 'Singapore'
        : 'Malaysia';
      return {
        isOutsideIndonesia: true,
        countryName,
        warningText:
          'MAAF, M3CAR KHUSUS INDONESIA SAJA. Kami hanya melayani Ujung Kulon - Jakarta (Indonesia).',
      };
    }
  }

  // 3. Coordinate bounds checks
  if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
    // Peninsular Malaysia bounding box (Lat 1.2 to 6.8 N, Lng 99.5 to 104.5 E)
    // Segamat is ~Lat 2.5085 N, Lng 102.8155 E
    if (lat >= 1.2 && lat <= 6.8 && lng >= 99.5 && lng <= 104.5) {
      return {
        isOutsideIndonesia: true,
        countryName: 'Malaysia',
        warningText:
          'MAAF, M3CAR KHUSUS INDONESIA SAJA. Kami hanya melayani Ujung Kulon - Jakarta (Indonesia).',
      };
    }

    // Singapore bounding box (Lat 1.15 to 1.48 N, Lng 103.6 to 104.1 E)
    if (lat >= 1.15 && lat <= 1.48 && lng >= 103.6 && lng <= 104.1) {
      return {
        isOutsideIndonesia: true,
        countryName: 'Singapore',
        warningText:
          'MAAF, M3CAR KHUSUS INDONESIA SAJA. Kami hanya melayani Ujung Kulon - Jakarta (Indonesia).',
      };
    }

    // Outer Indonesia bounding box (Lat -11.5 to 6.2, Lng 95.0 to 141.2)
    if (lat < -11.5 || lat > 6.2 || lng < 95.0 || lng > 141.2) {
      return {
        isOutsideIndonesia: true,
        countryName: 'Luar Negeri',
        warningText:
          'MAAF, M3CAR KHUSUS INDONESIA SAJA. Kami hanya melayani Ujung Kulon - Jakarta (Indonesia).',
      };
    }
  }

  return {
    isOutsideIndonesia: false,
    countryName: 'Indonesia',
    warningText: '',
  };
}

/**
 * Validasi Nomor HP Indonesia Khusus (+62 / 08)
 * Blokir nomor Malaysia (+60) atau nomor negara lain
 */
export function validateIndonesianPhone(phone: string): {
  isValid: boolean;
  errorMessage?: string;
  cleanedPhone: string;
} {
  const cleaned = phone.replace(/[\s-]/g, '').trim();

  if (!cleaned) {
    return {
      isValid: false,
      errorMessage: 'Nomor WhatsApp / HP wajib diisi.',
      cleanedPhone: '',
    };
  }

  // Cek nomor Malaysia (+60 / 60 / 01...) atau negara asing lain
  if (
    cleaned.startsWith('+60') ||
    cleaned.startsWith('60') ||
    cleaned.startsWith('+65') ||
    cleaned.startsWith('65') ||
    cleaned.startsWith('+1') ||
    cleaned.startsWith('+44') ||
    cleaned.startsWith('+91') ||
    cleaned.startsWith('+81') ||
    cleaned.startsWith('+82')
  ) {
    return {
      isValid: false,
      errorMessage: 'Hanya Nomor HP Indonesia (+62) yang bisa daftar.',
      cleanedPhone: cleaned,
    };
  }

  // Wajib diawali +62, 62, atau 08
  const startsWithIndo =
    cleaned.startsWith('+62') || cleaned.startsWith('62') || cleaned.startsWith('08');

  if (!startsWithIndo) {
    return {
      isValid: false,
      errorMessage: 'Hanya Nomor HP Indonesia (+62) yang bisa daftar.',
      cleanedPhone: cleaned,
    };
  }

  // Digit minimal 10 sampai 14 digit
  const digitsOnly = cleaned.replace(/\D/g, '');
  if (digitsOnly.length < 10 || digitsOnly.length > 15) {
    return {
      isValid: false,
      errorMessage: 'Nomor HP Indonesia harus terdiri dari 10 - 14 digit angka.',
      cleanedPhone: cleaned,
    };
  }

  return {
    isValid: true,
    cleanedPhone: cleaned,
  };
}

/**
 * Calculate distance deviation from normal Jakarta - Ujung Kulon corridor
 * Normal price: Rp 270.000 / person
 * Surcharge: Rp 15.000 / km deviation
 */
export function calculateCorridorDeviation(params: {
  lat?: number;
  lng?: number;
  address?: string;
}): { deviationKm: number; deviationFee: number; reason?: string } {
  const { lat, lng, address = '' } = params;
  const lowerAddr = address.toLowerCase();

  // If coordinates are available, calculate minimum distance to corridor polyline
  if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
    let minDistanceKm = Infinity;

    for (let i = 0; i < CORRIDOR_POINTS.length - 1; i++) {
      const p1 = CORRIDOR_POINTS[i];
      const p2 = CORRIDOR_POINTS[i + 1];
      const dist = distanceToSegmentKm(lat, lng, p1.lat, p1.lng, p2.lat, p2.lng);
      if (dist < minDistanceKm) {
        minDistanceKm = dist;
      }
    }

    // Buffer allowance: 8 km corridor tolerance (along highway, access roads, inner city)
    const CORRIDOR_TOLERANCE_KM = 8;
    if (minDistanceKm <= CORRIDOR_TOLERANCE_KM) {
      return {
        deviationKm: 0,
        deviationFee: 0,
        reason: 'Dalam jalur normal Tol Jakarta - Ujung Kulon',
      };
    } else {
      const devKm = Math.max(1, Math.round(minDistanceKm - CORRIDOR_TOLERANCE_KM));
      return {
        deviationKm: devKm,
        deviationFee: devKm * 15000,
        reason: `Titik jemput melenceng ${devKm} km dari jalur utama Tol Serang-Panimbang`,
      };
    }
  }

  // Address keyword fallback when GPS is not active
  const knownOffCorridor: Array<{ keyword: string; km: number; label: string }> = [
    { keyword: 'bogor', km: 35, label: 'Area Bogor (Melenceng 35 km)' },
    { keyword: 'bekasi', km: 25, label: 'Area Bekasi (Melenceng 25 km)' },
    { keyword: 'cikarang', km: 35, label: 'Area Cikarang (Melenceng 35 km)' },
    { keyword: 'depok', km: 20, label: 'Area Depok (Melenceng 20 km)' },
    { keyword: 'malingping', km: 40, label: 'Area Malingping (Melenceng 40 km)' },
    { keyword: 'bayah', km: 55, label: 'Area Bayah (Melenceng 55 km)' },
    { keyword: 'cilegon', km: 18, label: 'Area Cilegon (Melenceng 18 km)' },
    { keyword: 'merak', km: 22, label: 'Area Pelabuhan Merak (Melenceng 22 km)' },
    { keyword: 'anyer', km: 20, label: 'Area Pantai Anyer (Melenceng 20 km)' },
    { keyword: 'carita', km: 15, label: 'Area Carita (Melenceng 15 km)' },
    { keyword: 'pandeglang kota', km: 12, label: 'Pandeglang Kota (Melenceng 12 km)' },
  ];

  for (const item of knownOffCorridor) {
    if (lowerAddr.includes(item.keyword)) {
      return {
        deviationKm: item.km,
        deviationFee: item.km * 15000,
        reason: item.label,
      };
    }
  }

  // Default normal corridor
  return {
    deviationKm: 0,
    deviationFee: 0,
    reason: 'Dalam jalur normal Tol Jakarta - Ujung Kulon',
  };
}

/**
 * Calculate total price with transparent breakdown according to Rule 2:
 * Total Bayar = (Harga Normal Rp 270.000 x Jumlah Orang) + (Jarak Melenceng dalam KM x Rp 15.000)
 */
export function calculateOrderPricing(
  passengers: number,
  deviationKm: number
): DeviationPricingResult {
  const pricePerPerson = 270000;
  const basePrice = Math.max(1, passengers) * pricePerPerson;
  const safeDevKm = Math.max(0, deviationKm);
  const deviationFee = safeDevKm * 15000;
  const totalPrice = basePrice + deviationFee;

  let corridorNote = 'Jalur Utama Tol Jakarta-Merak + Tol Serang-Panimbang (83,6 km)';
  if (safeDevKm > 0) {
    corridorNote = `Keluar Jalur Utama: Melenceng ${safeDevKm} km (Tambahan Rp 15.000/km = Rp ${deviationFee.toLocaleString('id-ID')})`;
  }

  return {
    deviationKm: safeDevKm,
    deviationFee,
    basePrice,
    totalPrice,
    pricePerPerson,
    isOffRoute: safeDevKm > 0,
    corridorNote,
  };
}

/**
 * Generates a valid WhatsApp direct click-to-chat URL with Indonesian country code (+62).
 * Converts local numbers (08...) to standard international format (628...).
 */
export function formatWaUrl(phone: string, text: string): string {
  if (!phone) return '#';
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  } else if (!cleaned.startsWith('62')) {
    cleaned = '62' + cleaned;
  }
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(text)}`;
}
