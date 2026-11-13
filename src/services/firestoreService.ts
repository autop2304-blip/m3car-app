/**
 * Firebase Firestore Service for M3CAR - Real Cloud Database
 * Project: gen-lang-client-0714886029
 * Zero localStorage — all reads/writes go directly to Cloud Firestore.
 */

import {
  collection,
  doc,
  setDoc,
  addDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
  Unsubscribe,
  getDocFromServer,
  deleteDoc,
  updateDoc,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import {
  Order,
  DriverProfile,
  WalletTransaction,
  AdminSettings,
  DriverTopUpRequest,
  KeuanganAdminItem,
  WhatsAppNotification,
  LaporanKeuanganItem,
  CleanupSummary,
} from '../types';

export { db, storage };

export const DEFAULT_QRIS_IMAGE_URL = '/assets/aistudio/IMG-20261104-WA0014_1b3b07c0.jpg';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
  rethrow = false
) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  if (rethrow) {
    throw new Error(JSON.stringify(errInfo));
  }
}

/**
 * Remove all `undefined` properties recursively so Firestore setDoc/updateDoc never rejects payloads.
 */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) continue;
    if (val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
      out[key] = stripUndefined(val as Record<string, unknown>);
    } else {
      out[key] = val;
    }
  }
  return out;
}

/**
 * Compress an image file cleanly using Canvas before Storage upload or fallback
 */
export async function compressImageFile(
  file: File,
  maxWidth = 720,
  quality = 0.68
): Promise<{ blob: Blob; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve({ blob, dataUrl });
            } else {
              reject(new Error('Failed to create image blob'));
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => reject(new Error('Invalid image file'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Upload Driver KTP or SIM A to Firebase Storage (/drivers/ktp/ or /drivers/sim/).
 * Falls back to compressed JPEG Data URL if Storage is unreachable or unprovisioned.
 */
export async function uploadDriverDocumentToStorage(
  file: File,
  docType: 'ktp' | 'sim',
  driverPhoneOrId: string
): Promise<{ url: string; storagePath: string; uploadedToStorage: boolean }> {
  const safeKey = (driverPhoneOrId || 'driver').replace(/[^a-zA-Z0-9_-]/g, '') || 'driver';
  const fileName = `${safeKey}_${Date.now()}.jpg`;
  const folderPath = docType === 'ktp' ? `/drivers/ktp/${fileName}` : `/drivers/sim/${fileName}`;
  const cleanRefPath = `drivers/${docType}/${fileName}`;

  const { blob, dataUrl } = await compressImageFile(file, 720, 0.65);

  try {
    const fileRef = storageRef(storage, cleanRefPath);
    const uploadTask = uploadBytes(fileRef, blob, {
      contentType: 'image/jpeg',
      customMetadata: {
        docType,
        driverRef: safeKey,
      },
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Storage upload timeout')), 5000)
    );
    await Promise.race([uploadTask, timeoutPromise]);
    const downloadUrl = await getDownloadURL(fileRef);
    return {
      url: downloadUrl,
      storagePath: folderPath,
      uploadedToStorage: true,
    };
  } catch (err) {
    console.warn(`Firebase Storage upload fallback (${folderPath}):`, err);
    return {
      url: dataUrl,
      storagePath: folderPath,
      uploadedToStorage: false,
    };
  }
}

export function normalizeDriverStatusFromDb(rawStatus?: string): 'MENUNGGU' | 'AKTIF' | 'DIBLOKIR' | 'DITOLAK' {
  const s = String(rawStatus || '').toLowerCase().trim();
  if (s === 'waiting_approval' || s === 'menunggu' || s === 'pending') return 'MENUNGGU';
  if (s === 'approved' || s === 'active' || s === 'aktif') return 'AKTIF';
  if (s === 'rejected' || s === 'ditolak') return 'DITOLAK';
  if (s === 'blocked' || s === 'diblokir') return 'DIBLOKIR';
  return 'MENUNGGU';
}

export function mapDriverStatusToDb(status: string): string {
  const s = String(status || '').toUpperCase().trim();
  if (s === 'MENUNGGU' || s === 'WAITING_APPROVAL') return 'waiting_approval';
  if (s === 'AKTIF' || s === 'APPROVED') return 'approved';
  if (s === 'DITOLAK' || s === 'REJECTED') return 'rejected';
  if (s === 'DIBLOKIR' || s === 'BLOCKED') return 'blocked';
  return 'waiting_approval';
}

export function normalizeOrderStatusFromDb(rawStatus?: string): Order['status'] {
  const s = String(rawStatus || '').toUpperCase().trim();
  if (!s || s === 'PENDING' || s === 'MENUNGGU' || s === 'MENCARI_DRIVER') return 'MENCARI_DRIVER';
  if (s === 'DRIVER_DITEMUKAN' || s === 'DITERIMA' || s === 'ACCEPTED') return 'DRIVER_DITEMUKAN';
  if (s === 'DRIVER_OTW' || s === 'OTW_JEMPUT' || s === 'OTW') return 'DRIVER_OTW';
  if (s === 'DIJEMPUT' || s === 'SUDAH_JEMPUT' || s === 'DALAM_PERJALANAN' || s === 'ON_TRIP') return 'SUDAH_JEMPUT';
  if (s === 'SUDAH_SAMPAI' || s === 'SAMPAI' || s === 'ARRIVED') return 'SUDAH_SAMPAI';
  if (s === 'SELESAI' || s === 'COMPLETED' || s === 'DONE') return 'SELESAI';
  if (s === 'DIBATALKAN' || s === 'BATAL' || s === 'CANCELLED' || s === 'DITOLAK' || s === 'REJECTED') return 'DIBATALKAN';
  return 'MENCARI_DRIVER';
}

export interface CustomerData {
  id: string;
  nama: string;
  no_hp: string;
  alamat?: string;
  tanggal_daftar: string;
  role?: string;
  name?: string;
  phone?: string;
  avatarUrl?: string;
  foto_profil?: string;
  createdAt?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  sourceCollection?: string;
}

let activeOrdersUnsub: Unsubscribe | null = null;
let activeDriversUnsub: Unsubscribe | null = null;
let customersUnsub: Unsubscribe | null = null;
let customersLegacyUnsub: Unsubscribe | null = null;
let penumpangUnsub: Unsubscribe | null = null;
let usersCustomerUnsub: Unsubscribe | null = null;
let adminSettingsUnsub: Unsubscribe | null = null;
let paymentConfigUnsub: Unsubscribe | null = null;
let topUpRequestsUnsub: Unsubscribe | null = null;
let saldoHistoryUnsub: Unsubscribe | null = null;
let keuanganAdminUnsub: Unsubscribe | null = null;
let laporanKeuanganUnsub: Unsubscribe | null = null;
let notificationsUnsub: Unsubscribe | null = null;

/**
 * Parse flexible timestamp fields (ms number, Firestore Timestamp, ISO string, DD/MM/YYYY)
 */
export function parseFlexibleTimestampMs(...candidates: unknown[]): number {
  for (const val of candidates) {
    if (val === undefined || val === null || val === '') continue;
    if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
      return val;
    }
    if (typeof val === 'object' && val !== null && typeof (val as { toMillis?: () => number }).toMillis === 'function') {
      const ms = (val as { toMillis: () => number }).toMillis();
      if (Number.isFinite(ms) && ms > 0) return ms;
    }
    if (typeof val === 'string') {
      const raw = val.trim();
      if (!raw) continue;
      // Check DD/MM/YYYY or D/M/YYYY (with optional HH:mm or HH.mm)
      const dmy = raw.match(
        /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[,\s]+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?)?/
      );
      if (dmy) {
        const day = Number(dmy[1]);
        const month = Number(dmy[2]) - 1;
        const year = Number(dmy[3]);
        const hour = dmy[4] ? Number(dmy[4]) : 0;
        const min = dmy[5] ? Number(dmy[5]) : 0;
        const sec = dmy[6] ? Number(dmy[6]) : 0;
        const parsed = new Date(year, month, day, hour, min, sec).getTime();
        if (!Number.isNaN(parsed) && parsed > 0) return parsed;
      }
      const isoMs = Date.parse(raw);
      if (!Number.isNaN(isoMs) && isoMs > 0) return isoMs;
    }
  }
  return 0;
}

/**
 * Validate Connection to Firestore at Boot using getDocFromServer
 */
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, '_connection_test', 'ping'));
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('the client is offline') || msg.includes('Failed to get document because the client is offline')) {
      console.error('Please check your Firebase configuration (client is offline).');
      return false;
    }
    if (msg.includes('permission-denied') || msg.includes('Missing or insufficient permissions')) {
      console.error('Firestore permission denied on _connection_test/ping.');
      return false;
    }
    return true;
  }
}

/**
 * Normalizes customer object for both storage and UI
 */
export function formatCustomerPayload(customer: Partial<CustomerData>): CustomerData {
  const phone = customer.no_hp || customer.phone || '';
  const name = customer.nama || customer.name || 'Penumpang M3Car';
  const id = customer.id || `cust-${phone.replace(/\D/g, '') || Date.now()}`;
  const now = new Date().toLocaleString('id-ID');
  const avatar = customer.avatarUrl || customer.foto_profil;

  return stripUndefined({
    id,
    nama: name,
    no_hp: phone,
    alamat: customer.alamat || 'Ujung Kulon / Jakarta',
    tanggal_daftar: customer.tanggal_daftar || customer.createdAt || now,
    name,
    phone,
    avatarUrl: avatar,
    foto_profil: avatar,
    role: 'customer',
    createdAt: customer.createdAt || now,
    isDeleted: customer.isDeleted,
    deletedAt: customer.deletedAt,
  }) as unknown as CustomerData;
}

/**
 * Save Customer / Penumpang to Firestore (customers collection)
 */
export async function saveCustomerToFirestore(customer: Partial<CustomerData>): Promise<CustomerData> {
  const payload = formatCustomerPayload(customer);
  try {
    const custDoc = doc(db, 'customers', payload.id);
    await setDoc(custDoc, stripUndefined(payload as unknown as Record<string, unknown>), { merge: true });
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `customers/${payload.id}`, true);
    return payload;
  }
}

export async function fetchCustomerByIdFromFirestore(customerId: string): Promise<CustomerData | null> {
  if (!customerId) return null;
  try {
    const snap = await getDoc(doc(db, 'customers', customerId));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      id: snap.id,
      ...data,
      nama: data.nama || data.name || 'Penumpang M3Car',
      no_hp: data.no_hp || data.phone || '',
      alamat: data.alamat || 'Ujung Kulon / Jakarta',
      tanggal_daftar: data.tanggal_daftar || data.createdAt || '',
      role: 'customer',
    } as CustomerData;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `customers/${customerId}`);
    return null;
  }
}

/**
 * Get or query customer/penumpang by phone number across existing collections
 */
export async function getCustomerByPhone(phone: string): Promise<CustomerData | null> {
  const collectionsToCheck = ['customers', 'users_customer', 'penumpang'];
  for (const colName of collectionsToCheck) {
    try {
      const q = query(collection(db, colName), where('no_hp', '==', phone), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const d = snap.docs[0];
        return { id: d.id, ...d.data(), sourceCollection: colName } as CustomerData;
      }
      const q2 = query(collection(db, colName), where('phone', '==', phone), limit(1));
      const snap2 = await getDocs(q2);
      if (!snap2.empty) {
        const d = snap2.docs[0];
        return { id: d.id, ...d.data(), sourceCollection: colName } as CustomerData;
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, colName);
    }
  }
  return null;
}

// In-memory only secret cache (never persisted to localStorage)
const driverSecretsCache = new Map<
  string,
  {
    passwordHash?: string;
    recoveryCodeHash?: string;
    recoveryCodeExpiresAt?: string;
  }
>();

export function getCachedDriverSecrets(driverId: string) {
  return driverSecretsCache.get(driverId) || {};
}

export function setCachedDriverSecrets(
  driverId: string,
  secrets: {
    passwordHash?: string;
    recoveryCodeHash?: string;
    recoveryCodeExpiresAt?: string;
  }
) {
  const prev = driverSecretsCache.get(driverId) || {};
  driverSecretsCache.set(driverId, { ...prev, ...secrets });
}

function normalizePhoneDb(raw: string): string {
  if (!raw) return '';
  let cleaned = String(raw).replace(/\D/g, '');
  if (cleaned.startsWith('62')) {
    cleaned = '0' + cleaned.slice(2);
  } else if (cleaned.startsWith('8')) {
    cleaned = '0' + cleaned;
  }
  return cleaned;
}

function mapFirestoreDocToDriver(id: string, data: DocumentData): DriverProfile {
  const normalizedStatus = normalizeDriverStatusFromDb(data.status || data.statusLabel);
  const ktpUrl = data.ktpUrl || data.ktpPhotoUrl || data.foto_ktp || '';
  const simUrl = data.simUrl || data.simPhotoUrl || data.foto_sim || '';
  const plateVal = data.plate || data.plateNumber || data.plat_mobil || data.plat_nomor || '';
  const carVal = data.car || data.carModel || data.mobil || 'Toyota Avanza';
  const rawSaldo = data.saldo !== undefined && data.saldo !== null ? Number(data.saldo) : undefined;
  const rawBalance = data.balance !== undefined && data.balance !== null ? Number(data.balance) : undefined;
  const resolvedBalance =
    rawSaldo !== undefined && (rawBalance === undefined || rawBalance === 0)
      ? rawSaldo
      : rawBalance ?? rawSaldo ?? 0;

  const passwordHash = typeof data.passwordHash === 'string' ? data.passwordHash : undefined;
  const recoveryCodeHash =
    typeof data.recoveryCodeHash === 'string' ? data.recoveryCodeHash : undefined;
  const recoveryCodeExpiresAt =
    typeof data.recoveryCodeExpiresAt === 'string' ? data.recoveryCodeExpiresAt : undefined;

  setCachedDriverSecrets(id, { passwordHash, recoveryCodeHash, recoveryCodeExpiresAt });

  const {
    password: _omitPw,
    passwordHash: _omitHash,
    recoveryCodeHash: _omitRecHash,
    recoveryCodeExpiresAt: _omitRecExp,
    ...cleanData
  } = data;

  const lokasiVal = data.lokasi || data.currentLocation || '';

  return {
    id,
    ...cleanData,
    name: data.name || data.nama || 'Driver M3Car',
    phone: data.phone || data.no_hp || data.hp || '',
    plateNumber: plateVal,
    plate: plateVal,
    carModel: carVal,
    car: carVal,
    ktpPhotoUrl: ktpUrl,
    ktpUrl,
    simPhotoUrl: simUrl,
    simUrl,
    isOnline:
      data.isOnline !== undefined
        ? Boolean(data.isOnline)
        : data.status_online !== undefined
        ? Boolean(data.status_online)
        : false,
    lokasi: lokasiVal,
    currentLocation: lokasiVal,
    lat: typeof data.lat === 'number' ? data.lat : undefined,
    lng: typeof data.lng === 'number' ? data.lng : undefined,
    locationUpdatedAt: data.locationUpdatedAt || undefined,
    balance: resolvedBalance,
    saldo: resolvedBalance,
    status: normalizedStatus,
    rawStatus: data.status || 'waiting_approval',
    role: 'driver',
    rating: data.rating || 5.0,
    totalTrips: data.totalTrips || 0,
    registeredAt: data.registeredAt || data.tanggal_daftar || '',
    hasPassword: Boolean(passwordHash || data.hasPassword),
    passwordUpdatedAt: data.passwordUpdatedAt || undefined,
  } as DriverProfile;
}

/**
 * Generate next unique driver ID directly from live Firestore collection
 */
export async function fetchNextDriverIdFromFirestore(): Promise<string> {
  try {
    const snap = await getDocs(collection(db, 'drivers'));
    let maxNum = 0;
    snap.forEach((d) => {
      const match = (d.id || '').match(/DRV-(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });
    if (maxNum === 0) {
      maxNum = snap.size;
    }
    return `DRV-${String(maxNum + 1).padStart(3, '0')}`;
  } catch {
    return `DRV-${Date.now().toString().slice(-6)}`;
  }
}

export async function fetchDriverByIdFromFirestore(driverId: string): Promise<DriverProfile | null> {
  if (!driverId) return null;
  try {
    const snap = await getDoc(doc(db, 'drivers', driverId));
    if (!snap.exists()) return null;
    return mapFirestoreDocToDriver(snap.id, snap.data());
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `drivers/${driverId}`);
    return null;
  }
}

/**
 * Save / Update Driver in Firestore (collection: drivers)
 */
export async function saveDriverToFirestore(driver: DriverProfile): Promise<void> {
  const now = new Date().toLocaleString('id-ID');
  const dbStatus = mapDriverStatusToDb(driver.status || 'MENUNGGU');
  const plateVal = driver.plateNumber || driver.plate || '';
  const carVal = driver.carModel || driver.car || '';
  const ktpVal = driver.ktpUrl || driver.ktpPhotoUrl || '';
  const simVal = driver.simUrl || driver.simPhotoUrl || '';
  const lokasiVal = driver.lokasi || driver.currentLocation || '';

  const resolvedSaldo = Number(driver.saldo ?? driver.balance ?? 0);

  const payload: Record<string, unknown> = {
    id: driver.id,
    name: driver.name,
    nama: driver.name,
    phone: driver.phone,
    no_hp: driver.phone,
    plate: plateVal,
    plat_mobil: plateVal,
    car: carVal,
    ktpUrl: ktpVal,
    simUrl: simVal,
    status: dbStatus,
    statusLabel: driver.status || 'MENUNGGU',
    plateNumber: plateVal,
    carModel: carVal,
    ktpPhotoUrl: ktpVal,
    simPhotoUrl: simVal,
    avatarUrl: driver.avatarUrl,
    rejectionReason: driver.rejectionReason || '',
    blockReason: driver.blockReason || '',
    isOnline: Boolean(driver.isOnline),
    status_online: Boolean(driver.isOnline),
    online_status: driver.isOnline ? 'ONLINE' : 'OFFLINE',
    lokasi: lokasiVal,
    currentLocation: lokasiVal,
    lat: driver.lat,
    lng: driver.lng,
    locationUpdatedAt: driver.locationUpdatedAt,
    balance: resolvedSaldo,
    saldo: resolvedSaldo,
    rating: driver.rating || 5.0,
    totalTrips: driver.totalTrips || 0,
    registeredAt: driver.registeredAt || now,
    isDeleted: Boolean(driver.isDeleted),
    deletedAt: driver.deletedAt || '',
    updatedAt: new Date().toISOString(),
  };

  if (driver.passwordHash) {
    payload.passwordHash = driver.passwordHash;
    payload.hasPassword = true;
    payload.passwordUpdatedAt = driver.passwordUpdatedAt || new Date().toISOString();
    setCachedDriverSecrets(driver.id, { passwordHash: driver.passwordHash });
  } else if (typeof driver.hasPassword === 'boolean') {
    payload.hasPassword = driver.hasPassword;
  }

  try {
    const driverDoc = doc(db, 'drivers', driver.id);
    await setDoc(driverDoc, stripUndefined(payload), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `drivers/${driver.id}`, true);
  }
}

/**
 * Directly update driver online status in Firestore using updateDoc
 */
export async function updateDriverOnlineStatusInFirestore(
  driverId: string,
  isOnline: boolean
): Promise<void> {
  const driverRef = doc(db, 'drivers', driverId);
  const updatePayload = {
    isOnline,
    status_online: isOnline,
    online_status: isOnline ? 'ONLINE' : 'OFFLINE',
    updatedAt: new Date().toISOString(),
  };
  try {
    await updateDoc(driverRef, updatePayload);
  } catch (error) {
    try {
      await setDoc(driverRef, { id: driverId, ...updatePayload }, { merge: true });
    } catch (fallbackError) {
      handleFirestoreError(fallbackError || error, OperationType.UPDATE, `drivers/${driverId}`, true);
    }
  }
}

/**
 * Directly update driver balance/saldo in Firestore using updateDoc
 */
export async function updateDriverBalanceInFirestore(
  driverId: string,
  newBalance: number
): Promise<void> {
  const driverRef = doc(db, 'drivers', driverId);
  const resolved = Math.max(0, Number(newBalance) || 0);
  const updatePayload = {
    balance: resolved,
    saldo: resolved,
    updatedAt: new Date().toISOString(),
  };
  try {
    await updateDoc(driverRef, updatePayload);
  } catch (error) {
    try {
      await setDoc(driverRef, { id: driverId, ...updatePayload }, { merge: true });
    } catch (fallbackError) {
      handleFirestoreError(fallbackError || error, OperationType.UPDATE, `drivers/${driverId}`, true);
    }
  }
}

/**
 * Directly update driver real-time location in Firestore using updateDoc
 */
export async function updateDriverLocationInFirestore(
  driverId: string,
  location: { lat?: number; lng?: number; lokasi?: string }
): Promise<void> {
  const driverRef = doc(db, 'drivers', driverId);
  const nowIso = new Date().toISOString();
  const lokasiStr =
    location.lokasi ||
    (location.lat !== undefined && location.lng !== undefined
      ? `GPS (${location.lat.toFixed(5)}, ${location.lng.toFixed(5)})`
      : '');

  const updatePayload = stripUndefined({
    lat: location.lat,
    lng: location.lng,
    lokasi: lokasiStr,
    currentLocation: lokasiStr,
    locationUpdatedAt: nowIso,
    updatedAt: nowIso,
  });

  try {
    await updateDoc(driverRef, updatePayload);
  } catch (error) {
    try {
      await setDoc(driverRef, { id: driverId, ...updatePayload }, { merge: true });
    } catch (fallbackError) {
      handleFirestoreError(fallbackError || error, OperationType.UPDATE, `drivers/${driverId}`, true);
    }
  }
}

export async function updateDriverPasswordHashInFirestore(
  driverId: string,
  passwordHash: string,
  passwordUpdatedAt: string,
  clearRecovery = false
): Promise<void> {
  const driverRef = doc(db, 'drivers', driverId);
  const updatePayload: Record<string, unknown> = {
    passwordHash,
    hasPassword: true,
    passwordUpdatedAt,
    updatedAt: new Date().toISOString(),
  };
  if (clearRecovery) {
    updatePayload.recoveryCodeHash = '';
    updatePayload.recoveryCodeExpiresAt = '';
  }

  setCachedDriverSecrets(driverId, {
    passwordHash,
    ...(clearRecovery ? { recoveryCodeHash: '', recoveryCodeExpiresAt: '' } : {}),
  });

  try {
    await updateDoc(driverRef, updatePayload);
  } catch (error) {
    try {
      await setDoc(driverRef, { id: driverId, ...updatePayload }, { merge: true });
    } catch (fallbackError) {
      handleFirestoreError(fallbackError || error, OperationType.UPDATE, `drivers/${driverId}`, true);
    }
  }
}

export async function updateDriverRecoveryCodeHashInFirestore(
  driverId: string,
  recoveryCodeHash: string,
  recoveryCodeExpiresAt: string
): Promise<void> {
  const driverRef = doc(db, 'drivers', driverId);
  const updatePayload: Record<string, unknown> = {
    recoveryCodeHash,
    recoveryCodeExpiresAt,
    updatedAt: new Date().toISOString(),
  };

  setCachedDriverSecrets(driverId, { recoveryCodeHash, recoveryCodeExpiresAt });

  try {
    await updateDoc(driverRef, updatePayload);
  } catch (error) {
    try {
      await setDoc(driverRef, { id: driverId, ...updatePayload }, { merge: true });
    } catch (fallbackError) {
      handleFirestoreError(fallbackError || error, OperationType.UPDATE, `drivers/${driverId}`, true);
    }
  }
}

export async function fetchDriverByPhoneFromFirestore(phone: string): Promise<{
  driver: DriverProfile;
  passwordHash?: string;
  recoveryCodeHash?: string;
  recoveryCodeExpiresAt?: string;
} | null> {
  const target = normalizePhoneDb(phone);
  if (!target) return null;
  try {
    const snap = await Promise.race([
      getDocs(collection(db, 'drivers')),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Firestore lookup timeout')), 6000)),
    ]);
    for (const d of snap.docs) {
      const data = d.data();
      const docPhone = normalizePhoneDb(String(data.phone || data.no_hp || data.hp || ''));
      if (docPhone && docPhone === target) {
        const driver = mapFirestoreDocToDriver(d.id, data);
        const passwordHash = typeof data.passwordHash === 'string' ? data.passwordHash : undefined;
        const recoveryCodeHash =
          typeof data.recoveryCodeHash === 'string' ? data.recoveryCodeHash : undefined;
        const recoveryCodeExpiresAt =
          typeof data.recoveryCodeExpiresAt === 'string' ? data.recoveryCodeExpiresAt : undefined;
        return { driver, passwordHash, recoveryCodeHash, recoveryCodeExpiresAt };
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'drivers');
  }
  return null;
}

/**
 * Update Driver approval/rejection status directly using updateDoc(driverRef, { status })
 */
export async function updateDriverStatusInFirestore(
  driverId: string,
  dbStatus: 'waiting_approval' | 'approved' | 'rejected' | 'blocked',
  extra?: {
    rejectionReason?: string;
    blockReason?: string;
    isOnline?: boolean;
  }
): Promise<void> {
  const driverRef = doc(db, 'drivers', driverId);
  const statusLabel =
    dbStatus === 'approved'
      ? 'AKTIF'
      : dbStatus === 'rejected'
      ? 'DITOLAK'
      : dbStatus === 'blocked'
      ? 'DIBLOKIR'
      : 'MENUNGGU';

  const updatePayload: Record<string, unknown> = {
    status: dbStatus,
    statusLabel,
    updatedAt: new Date().toISOString(),
  };

  if (typeof extra?.isOnline === 'boolean') {
    updatePayload.isOnline = extra.isOnline;
    updatePayload.status_online = extra.isOnline;
    updatePayload.online_status = extra.isOnline ? 'ONLINE' : 'OFFLINE';
  }
  if (extra?.rejectionReason !== undefined) {
    updatePayload.rejectionReason = extra.rejectionReason;
  }
  if (extra?.blockReason !== undefined) {
    updatePayload.blockReason = extra.blockReason;
  }

  try {
    await updateDoc(driverRef, updatePayload);
  } catch (error) {
    try {
      await setDoc(driverRef, { id: driverId, ...updatePayload }, { merge: true });
    } catch (fallbackError) {
      handleFirestoreError(fallbackError || error, OperationType.UPDATE, `drivers/${driverId}`, true);
    }
  }
}

/**
 * Save / Update Order in Firestore (orders collection)
 */
export async function saveOrderToFirestore(order: Order): Promise<void> {
  const now = new Date().toLocaleString('id-ID');
  const dariVal = order.dari || order.pickupLocation || '';
  const keVal = order.ke || order.destination || '';
  const hargaVal = Number(order.harga ?? order.totalPrice ?? 270000);
  const statusLower =
    order.status === 'MENCARI_DRIVER'
      ? 'mencari_driver'
      : order.status === 'DRIVER_OTW'
      ? 'otw_jemput'
      : order.status === 'DRIVER_DITEMUKAN' || order.status === 'SUDAH_JEMPUT'
      ? 'dalam_perjalanan'
      : order.status === 'SELESAI'
      ? 'selesai'
      : 'dibatalkan';

  const payload = stripUndefined({
    ...order,
    id: order.id,
    id_order: order.orderNumber || order.id,
    customerId: order.customerId || `cust-${(order.customerPhone || '').replace(/\D/g, '')}`,
    id_customer: order.customerPhone,
    id_driver: order.driverId || '',
    dari: dariVal,
    ke: keVal,
    titik_jemput: dariVal,
    tujuan: keVal,
    jarak_km: order.deviationKm ? 83.6 + order.deviationKm : 83.6,
    harga: hargaVal,
    status: order.status,
    status_db: statusLower,
    tanggal_order: order.date || now,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    pickupLocation: dariVal,
    destination: keVal,
    driverId: order.driverId || '',
    driverName: order.driverName || '',
    driverPhone: order.driverPhone || '',
    driverPlate: order.driverPlate || '',
    driverCar: order.driverCar || '',
    passengers: order.passengers || 1,
    totalPrice: hargaVal,
    commissionAmount: order.commissionAmount || 0,
    driverEarnings: order.driverEarnings || 0,
    tollRoute: order.tollRoute || 'Tol Jakarta-Merak + Tol Serang-Panimbang 83,6 km',
    eta: order.eta || '6 jam 30 menit',
    paymentMethod: order.paymentMethod || 'TUNAI',
    paymentStatus: order.paymentStatus || 'BELUM_BAYAR',
    createdAt: order.createdAt || now,
    createdAtIso: (order as { createdAtIso?: string }).createdAtIso || new Date().toISOString(),
    createdAtMs:
      (order as { createdAtMs?: number }).createdAtMs ||
      parseFlexibleTimestampMs(order.createdAt, order.date) ||
      Date.now(),
    updatedAt: new Date().toISOString(),
  });

  try {
    const orderDoc = doc(db, 'orders', order.id);
    await setDoc(orderDoc, payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `orders/${order.id}`, true);
  }
}

export async function updateOrderInFirestore(orderId: string, fields: Record<string, unknown>): Promise<void> {
  const orderRef = doc(db, 'orders', orderId);
  const payload = stripUndefined({
    ...fields,
    updatedAt: new Date().toISOString(),
  });
  try {
    await updateDoc(orderRef, payload);
  } catch (error) {
    try {
      await setDoc(orderRef, { id: orderId, ...payload }, { merge: true });
    } catch (fallbackError) {
      handleFirestoreError(fallbackError || error, OperationType.UPDATE, `orders/${orderId}`, true);
    }
  }
}

/**
 * Save Transaction in Firestore (saldo_history collection)
 */
export async function saveTransactionToFirestore(tx: WalletTransaction, driverPhone?: string): Promise<void> {
  const payload = stripUndefined({
    ...tx,
    id: tx.id,
    driverId: tx.driverId,
    driverPhone: driverPhone || '',
    date: tx.date,
    type: tx.type,
    amount: tx.amount,
    balanceAfter: tx.balanceAfter,
    description: tx.description,
    orderId: tx.orderId || '',
    paymentMethod: tx.paymentMethod,
    status: tx.status,
    updatedAt: new Date().toISOString(),
  });

  try {
    const txDoc = doc(db, 'saldo_history', tx.id);
    await setDoc(txDoc, payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `saldo_history/${tx.id}`, true);
  }
}

/**
 * Save Admin Operational Settings in Firestore (setting_admin/config)
 */
export async function saveAdminSettingsToFirestore(settings: AdminSettings): Promise<void> {
  try {
    const { adminPasswordHash: _omittedSecret, ...safeSettings } = settings;
    const settingDoc = doc(db, 'setting_admin', 'config');
    await setDoc(
      settingDoc,
      stripUndefined({
        ...safeSettings,
        adminPhone: settings.adminPhone || '085811594114',
        companyBank: settings.companyBank,
        rates: settings.rates,
        commissionRates: settings.commissionRates,
        routes: settings.routes || [],
        tariffs: settings.tariffs || [],
        updatedAt: new Date().toISOString(),
      }),
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'setting_admin/config', true);
  }
}

/**
 * Save Official QRIS Payment Image URL/DataURL in centralized Firestore doc:
 * collection: setting_admin, document: payment_config, field: qrisImageUrl
 */
export async function savePaymentQrisToFirestore(qrisImageUrl: string): Promise<void> {
  const cleanUrl = (qrisImageUrl || '').trim() || DEFAULT_QRIS_IMAGE_URL;
  const updatedAt = new Date().toISOString();
  try {
    await setDoc(
      doc(db, 'setting_admin', 'payment_config'),
      {
        qrisImageUrl: cleanUrl,
        updatedAt,
      },
      { merge: true }
    );
    // Keep setting_admin/config mirrored as secondary convenience
    await setDoc(
      doc(db, 'setting_admin', 'config'),
      {
        qrisImageUrl: cleanUrl,
        qrisUpdatedAt: updatedAt,
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'setting_admin/payment_config', true);
  }
}

/**
 * Direct onSnapshot subscription for setting_admin/payment_config (QRIS Image)
 */
export function subscribePaymentConfig(
  onChange: (data: { qrisImageUrl?: string; updatedAt?: string }) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'setting_admin', 'payment_config'),
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        onChange({
          qrisImageUrl:
            typeof data.qrisImageUrl === 'string' && data.qrisImageUrl.trim()
              ? data.qrisImageUrl
              : DEFAULT_QRIS_IMAGE_URL,
          updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
        });
      } else {
        onChange({ qrisImageUrl: DEFAULT_QRIS_IMAGE_URL });
      }
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, 'setting_admin/payment_config');
    }
  );
}

/**
 * Save Top Up Request to Firestore
 */
export async function saveTopUpRequestToFirestore(req: DriverTopUpRequest): Promise<void> {
  try {
    const reqDoc = doc(db, 'topup_requests', req.id);
    await setDoc(
      reqDoc,
      stripUndefined({
        ...req,
        updatedAt: new Date().toISOString(),
      }),
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `topup_requests/${req.id}`, true);
  }
}

/**
 * Save / Update Keuangan Admin item (keuangan_admin collection)
 */
export async function saveKeuanganAdminToFirestore(item: KeuanganAdminItem): Promise<void> {
  try {
    const docRef = doc(db, 'keuangan_admin', item.id);
    await setDoc(
      docRef,
      stripUndefined({
        ...item,
        id_transaksi: item.id_transaksi || item.id,
        isDeleted: Boolean(item.isDeleted),
        updatedAt: new Date().toISOString(),
      }),
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `keuangan_admin/${item.id}`, true);
  }
}

/**
 * Archive completed/paid order revenue into `laporan_keuangan` collection (idempotent).
 * Preserves trip revenue and commission totals when old order documents are cleaned up after 7/30 days.
 */
export async function archiveOrderToLaporanKeuangan(order: Order): Promise<LaporanKeuanganItem> {
  const timeMs =
    parseFlexibleTimestampMs(
      (order as { createdAtMs?: number }).createdAtMs,
      (order as { createdAtIso?: string }).createdAtIso,
      order.completedAt,
      order.createdAt,
      order.date,
      order.updatedAt
    ) || Date.now();
  const createdAtIso =
    (order as { createdAtIso?: string }).createdAtIso || new Date(timeMs).toISOString();
  const year = new Date(timeMs).getFullYear();
  const totalPrice = Number(order.totalPrice ?? order.harga ?? 0);
  const commissionAmount =
    Number(order.commissionAmount) || Math.round(totalPrice * (order.commissionRate || 0.12));
  const driverEarnings =
    Number(order.driverEarnings) || Math.max(0, totalPrice - commissionAmount);

  const docId = `LK-ORD-${order.id}`;
  const item: LaporanKeuanganItem = {
    id: docId,
    orderId: order.id,
    orderNumber: order.orderNumber || `M3-${order.id.slice(-6)}`,
    customerName: order.customerName || 'Penumpang M3Car',
    customerPhone: order.customerPhone || '',
    driverId: order.driverId || '',
    driverName: order.driverName || '',
    driverPlate: order.driverPlate || '',
    pickupLocation: order.pickupLocation || order.dari || '-',
    destination: order.destination || order.ke || '-',
    date: order.date || order.createdAt || new Date(timeMs).toLocaleDateString('id-ID'),
    time: order.time || '',
    passengers: order.passengers || 1,
    paymentMethod: order.paymentMethod || 'TUNAI',
    paymentStatus: order.paymentStatus || (order.status === 'SELESAI' ? 'LUNAS' : 'BELUM_BAYAR'),
    totalPrice,
    commissionAmount,
    driverEarnings,
    year,
    createdAt: order.createdAt || new Date(timeMs).toLocaleString('id-ID'),
    createdAtIso,
    createdAtMs: timeMs,
    completedAt: order.completedAt || new Date().toISOString(),
    archivedAt: new Date().toISOString(),
    isDeleted: false,
  };

  try {
    await setDoc(doc(db, 'laporan_keuangan', docId), stripUndefined(item as unknown as Record<string, unknown>), {
      merge: true,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `laporan_keuangan/${docId}`);
  }
  return item;
}

/**
 * Save WhatsApp Notification log directly to Firestore (wa_notifications)
 */
export async function saveNotificationToFirestore(notif: WhatsAppNotification): Promise<void> {
  try {
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();
    await addDoc(
      collection(db, 'wa_notifications'),
      stripUndefined({
        ...notif,
        createdAtIso: nowIso,
        createdAtMs: nowMs,
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'wa_notifications');
  }
}

/**
 * Automatic 7-day or 30-day Cleanup for Completed/Cancelled Orders & WA Activity Logs.
 * Preserves completed order financials inside `laporan_keuangan` before deleting from `orders`.
 * NEVER deletes `topup_requests`, `laporan_keuangan`, `keuangan_admin`, or `saldo_history` (retained 1 year).
 */
export async function runAutoHistoryCleanupFromFirestore(
  retentionDays: 7 | 30 = 7
): Promise<CleanupSummary> {
  const days: 7 | 30 = retentionDays === 30 ? 30 : 7;
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  let deletedOrders = 0;
  let archivedOrders = 0;
  let deletedLogs = 0;

  // 1. Clean `orders` with terminal status SELESAI / DIBATALKAN older than retentionDays
  try {
    const ordersSnap = await getDocs(collection(db, 'orders'));
    for (const d of ordersSnap.docs) {
      const data = d.data();
      const normStatus = normalizeOrderStatusFromDb(data.status || data.status_db);
      if (normStatus !== 'SELESAI' && normStatus !== 'DIBATALKAN') continue;

      const createdMs = parseFlexibleTimestampMs(
        data.createdAtMs,
        data.createdAtIso,
        data.completedAt,
        data.createdAt,
        data.tanggal_order,
        data.updatedAt
      );
      if (!createdMs || createdMs >= cutoffMs) continue;

      // Preserve revenue in `laporan_keuangan` before deleting SELESAI / LUNAS order
      if (normStatus === 'SELESAI' || data.paymentStatus === 'LUNAS') {
        const dariVal = data.dari || data.pickupLocation || data.titik_jemput || '-';
        const keVal = data.ke || data.destination || data.tujuan || '-';
        const hargaVal = Number(data.harga ?? data.totalPrice ?? 0);
        await archiveOrderToLaporanKeuangan({
          id: d.id,
          orderNumber: data.orderNumber || data.id_order || `M3-${d.id.slice(-6)}`,
          customerId: data.customerId || data.id_customer || '',
          customerName: data.customerName || data.nama || 'Penumpang M3Car',
          customerPhone: data.customerPhone || data.no_hp || '',
          driverId: data.driverId || data.id_driver || '',
          driverName: data.driverName || data.nama_driver || '',
          driverPlate: data.driverPlate || data.plat_mobil || '',
          pickupLocation: dariVal,
          destination: keVal,
          date: data.date || data.tanggal_order || '',
          time: data.time || '',
          passengers: Number(data.passengers) || 1,
          region: data.region || 'jakarta',
          pricePerPerson: Number(data.pricePerPerson) || hargaVal,
          totalPrice: hargaVal,
          commissionRate: Number(data.commissionRate) || 0.12,
          commissionAmount: Number(data.commissionAmount) || 0,
          driverEarnings: Number(data.driverEarnings) || 0,
          tollRoute: data.tollRoute || '',
          eta: data.eta || '',
          status: normStatus,
          paymentMethod: data.paymentMethod || 'TUNAI',
          paymentStatus: data.paymentStatus || (normStatus === 'SELESAI' ? 'LUNAS' : 'BELUM_BAYAR'),
          createdAt: data.createdAt || '',
          completedAt: data.completedAt || '',
          updatedAt: data.updatedAt || '',
        });
        archivedOrders += 1;
      }

      await deleteDoc(doc(db, 'orders', d.id));
      deletedOrders += 1;
    }
  } catch (err) {
    console.warn('Auto-cleanup orders notice:', err);
  }

  // 2. Clean WA activity logs in both `wa_notifications` and `wa_logs` older than retentionDays
  for (const logCol of ['wa_notifications', 'wa_logs'] as const) {
    try {
      const logSnap = await getDocs(collection(db, logCol));
      for (const d of logSnap.docs) {
        const data = d.data();
        const logMs = parseFlexibleTimestampMs(
          data.createdAtMs,
          data.createdAtIso,
          data.timestamp,
          data.createdAt
        );
        if (!logMs || logMs >= cutoffMs) continue;
        await deleteDoc(doc(db, logCol, d.id));
        deletedLogs += 1;
      }
    } catch (err) {
      console.warn(`Auto-cleanup ${logCol} notice:`, err);
    }
  }

  const ranAt = new Date().toISOString();
  try {
    await setDoc(
      doc(db, 'setting_admin', 'config'),
      { lastAutoCleanupAt: ranAt, orderRetentionDays: days },
      { merge: true }
    );
  } catch {
    // Non-fatal metadata update
  }

  return {
    deletedOrders,
    deletedLogs,
    archivedOrders,
    retentionDays: days,
    ranAt,
  };
}

/**
 * Annual Financial Purge (> 1 Year / 365 days or Selected Past Year).
 * Only executed after Admin double confirmation in Menu Keuangan.
 */
export async function purgeAnnualFinancialDataFromFirestore(
  mode: 'OLDER_THAN_1_YEAR' | 'PREVIOUS_YEARS' | number = 'OLDER_THAN_1_YEAR'
): Promise<{
  deletedLaporan: number;
  deletedTopUps: number;
  deletedKeuangan: number;
  deletedSaldoHistory: number;
  totalDeleted: number;
}> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const oneYearAgoMs = now.getTime() - 365 * 24 * 60 * 60 * 1000;

  const shouldPurge = (timeMs: number, explicitYear?: number): boolean => {
    const derivedYear =
      typeof explicitYear === 'number' && explicitYear > 2000
        ? explicitYear
        : timeMs > 0
        ? new Date(timeMs).getFullYear()
        : 0;

    if (typeof mode === 'number') {
      return derivedYear === mode;
    }
    if (mode === 'PREVIOUS_YEARS') {
      return derivedYear > 0 && derivedYear < currentYear;
    }
    // Default: OLDER_THAN_1_YEAR
    return timeMs > 0 && timeMs < oneYearAgoMs;
  };

  let deletedLaporan = 0;
  let deletedTopUps = 0;
  let deletedKeuangan = 0;
  let deletedSaldoHistory = 0;

  // 1. laporan_keuangan
  try {
    const snap = await getDocs(collection(db, 'laporan_keuangan'));
    for (const d of snap.docs) {
      const data = d.data();
      const ms = parseFlexibleTimestampMs(data.createdAtMs, data.createdAtIso, data.createdAt, data.date);
      if (shouldPurge(ms, Number(data.year))) {
        await deleteDoc(doc(db, 'laporan_keuangan', d.id));
        deletedLaporan += 1;
      }
    }
  } catch (e) {
    console.warn('Purge laporan_keuangan error:', e);
  }

  // 2. topup_requests
  try {
    const snap = await getDocs(collection(db, 'topup_requests'));
    for (const d of snap.docs) {
      const data = d.data();
      const ms = parseFlexibleTimestampMs(data.createdAtMs, data.createdAt, data.updatedAt);
      if (shouldPurge(ms)) {
        await deleteDoc(doc(db, 'topup_requests', d.id));
        deletedTopUps += 1;
      }
    }
  } catch (e) {
    console.warn('Purge topup_requests error:', e);
  }

  // 3. keuangan_admin
  try {
    const snap = await getDocs(collection(db, 'keuangan_admin'));
    for (const d of snap.docs) {
      const data = d.data();
      const ms = parseFlexibleTimestampMs(data.createdAtMs, data.createdAt, data.tanggal);
      if (shouldPurge(ms)) {
        await deleteDoc(doc(db, 'keuangan_admin', d.id));
        deletedKeuangan += 1;
      }
    }
  } catch (e) {
    console.warn('Purge keuangan_admin error:', e);
  }

  // 4. saldo_history
  try {
    const snap = await getDocs(collection(db, 'saldo_history'));
    for (const d of snap.docs) {
      const data = d.data();
      const ms = parseFlexibleTimestampMs(data.createdAtMs, data.date, data.updatedAt);
      if (shouldPurge(ms)) {
        await deleteDoc(doc(db, 'saldo_history', d.id));
        deletedSaldoHistory += 1;
      }
    }
  } catch (e) {
    console.warn('Purge saldo_history error:', e);
  }

  return {
    deletedLaporan,
    deletedTopUps,
    deletedKeuangan,
    deletedSaldoHistory,
    totalDeleted: deletedLaporan + deletedTopUps + deletedKeuangan + deletedSaldoHistory,
  };
}

/**
 * Permanently Delete records from Firestore
 */
export async function deleteOrderFromFirestore(orderId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'orders', orderId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `orders/${orderId}`, true);
  }
}

export async function deleteDriverFromFirestore(driverId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'drivers', driverId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `drivers/${driverId}`, true);
  }
}

export async function deleteCustomerFromFirestore(customerId: string): Promise<void> {
  const cols = ['customers', 'users_customer', 'penumpang', 'users'];
  for (const colName of cols) {
    try {
      await deleteDoc(doc(db, colName, customerId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${colName}/${customerId}`);
    }
  }
}

export async function deleteKeuanganAdminFromFirestore(keuanganId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'keuangan_admin', keuanganId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `keuangan_admin/${keuanganId}`, true);
  }
}

export async function deleteTransactionFromFirestore(txId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'saldo_history', txId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `saldo_history/${txId}`, true);
  }
}

export async function deleteTopUpRequestFromFirestore(requestId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'topup_requests', requestId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `topup_requests/${requestId}`, true);
  }
}

export async function clearAllTransactionsFromFirestore(txIds: string[]): Promise<void> {
  for (const id of txIds) {
    try {
      await deleteDoc(doc(db, 'saldo_history', id));
    } catch (e) {
      console.warn('Failed to delete tx:', id, e);
    }
  }
}

export async function clearAllCustomersFromFirestore(customerIds: string[]): Promise<void> {
  const cols = ['customers', 'users_customer', 'penumpang'];
  for (const id of customerIds) {
    for (const colName of cols) {
      try {
        await deleteDoc(doc(db, colName, id));
      } catch (e) {
        console.warn(`Failed to delete customer from ${colName}:`, id, e);
      }
    }
  }
}

export async function clearAllTopUpRequestsFromFirestore(requestIds: string[]): Promise<void> {
  for (const id of requestIds) {
    try {
      await deleteDoc(doc(db, 'topup_requests', id));
    } catch (e) {
      console.warn('Failed to delete topup request:', id, e);
    }
  }
}

/**
 * REALTIME onSnapshot LISTENERS FOR ALL FIRESTORE COLLECTIONS
 * Ensures Driver & Customer changes appear immediately in Admin without refreshing.
 */
export function setupRealtimeListeners(callbacks: {
  onActiveOrdersChange: (orders: Order[]) => void;
  onDriversChange: (drivers: DriverProfile[]) => void;
  onCustomersChange?: (customers: CustomerData[]) => void;
  onSettingsChange: (settings: Partial<AdminSettings>) => void;
  onPaymentConfigChange?: (config: { qrisImageUrl?: string; updatedAt?: string }) => void;
  onTransactionsChange: (tx: WalletTransaction[]) => void;
  onTopUpRequestsChange?: (requests: DriverTopUpRequest[]) => void;
  onKeuanganAdminChange?: (items: KeuanganAdminItem[]) => void;
  onLaporanKeuanganChange?: (items: LaporanKeuanganItem[]) => void;
  onNotificationsChange?: (notifs: WhatsAppNotification[]) => void;
  onConnected: (connected: boolean) => void;
  onError?: (errMessage: string) => void;
}): () => void {
  // Clear any existing listeners
  if (activeOrdersUnsub) activeOrdersUnsub();
  if (activeDriversUnsub) activeDriversUnsub();
  if (customersUnsub) customersUnsub();
  if (customersLegacyUnsub) customersLegacyUnsub();
  if (penumpangUnsub) penumpangUnsub();
  if (usersCustomerUnsub) usersCustomerUnsub();
  if (adminSettingsUnsub) adminSettingsUnsub();
  if (paymentConfigUnsub) paymentConfigUnsub();
  if (topUpRequestsUnsub) topUpRequestsUnsub();
  if (saldoHistoryUnsub) saldoHistoryUnsub();
  if (keuanganAdminUnsub) keuanganAdminUnsub();
  if (laporanKeuanganUnsub) laporanKeuanganUnsub();
  if (notificationsUnsub) notificationsUnsub();

  try {
    // 1. ORDERS: Realtime onSnapshot with limit(30) optimization
    activeOrdersUnsub = onSnapshot(
      query(collection(db, 'orders'), orderBy('updatedAt', 'desc'), limit(30)),
      (snapshot) => {
        callbacks.onConnected(true);
        const orderList: Order[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          const dariVal = data.dari || data.pickupLocation || data.titik_jemput || data.jemput || '';
          const keVal = data.ke || data.destination || data.tujuan || '';
          const hargaVal = Number(data.harga ?? data.totalPrice ?? 270000);
          const normStatus = normalizeOrderStatusFromDb(data.status || data.status_db);
          orderList.push({
            id: d.id,
            ...data,
            orderNumber: data.orderNumber || data.id_order || `M3-${d.id.slice(-6)}`,
            customerId: data.customerId || data.id_customer || '',
            customerPhone:
              data.customerPhone || data.no_hp || data.phone || data.no_hp_customer || data.id_customer || '',
            customerName:
              data.customerName || data.nama || data.nama_customer || data.nama_penumpang || 'Penumpang M3Car',
            pickupLocation: dariVal,
            dari: dariVal,
            destination: keVal,
            ke: keVal,
            totalPrice: hargaVal,
            harga: hargaVal,
            driverId: data.driverId || data.id_driver || '',
            driverName: data.driverName || data.nama_driver || '',
            driverPlate: data.driverPlate || data.plat_mobil || data.plat_nomor || '',
            status: normStatus,
            createdAt: data.createdAt || data.tanggal_order || new Date().toLocaleString('id-ID'),
          } as Order);
        });
        orderList.sort((a, b) => ((b.updatedAt || b.createdAt || '') > (a.updatedAt || a.createdAt || '') ? 1 : -1));
        callbacks.onActiveOrdersChange(orderList);
      },
      (err) => {
        callbacks.onConnected(false);
        callbacks.onError?.(err.message);
        handleFirestoreError(err, OperationType.LIST, 'orders');
      }
    );

    // 2. DRIVERS: Realtime onSnapshot on collection(db, 'drivers')
    activeDriversUnsub = onSnapshot(
      collection(db, 'drivers'),
      (snapshot) => {
        callbacks.onConnected(true);
        const driversList: DriverProfile[] = [];
        snapshot.forEach((d) => {
          driversList.push(mapFirestoreDocToDriver(d.id, d.data()));
        });
        callbacks.onDriversChange(driversList);
      },
      (err) => {
        callbacks.onConnected(false);
        callbacks.onError?.(err.message);
        handleFirestoreError(err, OperationType.LIST, 'drivers');
      }
    );

    // 3. CUSTOMERS: Realtime onSnapshot on 'customers' + legacy fallback collections
    const customerBuckets: Record<'customers' | 'users_customer' | 'penumpang' | 'users', Map<string, CustomerData>> = {
      customers: new Map(),
      users_customer: new Map(),
      penumpang: new Map(),
      users: new Map(),
    };

    const emitMergedCustomers = () => {
      if (!callbacks.onCustomersChange) return;
      const merged = new Map<string, CustomerData>();
      const orderKeys: Array<'users' | 'users_customer' | 'penumpang' | 'customers'> = [
        'users',
        'users_customer',
        'penumpang',
        'customers',
      ];
      for (const colKey of orderKeys) {
        customerBuckets[colKey].forEach((val, id) => {
          merged.set(id, val);
        });
      }
      callbacks.onCustomersChange(Array.from(merged.values()));
    };

    const mapCustomerSnapshot = (
      colKey: 'customers' | 'users_customer' | 'penumpang' | 'users',
      snapshot: any,
      filterUsersRole = false
    ) => {
      const nextMap = new Map<string, CustomerData>();
      snapshot.forEach((d: any) => {
        const data = d.data();
        if (filterUsersRole) {
          const r = String(data.role || '').toLowerCase();
          if (r === 'admin' || r === 'driver') return;
        }
        const nama = data.nama || data.name || data.nama_lengkap || 'Penumpang M3Car';
        const noHp = data.no_hp || data.phone || data.hp || data.whatsapp || '';
        nextMap.set(d.id, {
          id: d.id,
          ...data,
          nama,
          name: nama,
          no_hp: noHp,
          phone: noHp,
          alamat: data.alamat || data.address || 'Ujung Kulon / Jakarta',
          tanggal_daftar: data.tanggal_daftar || data.createdAt || data.tanggal || '',
          role: 'customer',
          sourceCollection: colKey,
        } as CustomerData);
      });
      customerBuckets[colKey] = nextMap;
      emitMergedCustomers();
    };

    customersUnsub = onSnapshot(
      collection(db, 'customers'),
      (snap) => mapCustomerSnapshot('customers', snap),
      (err) => handleFirestoreError(err, OperationType.LIST, 'customers')
    );

    customersLegacyUnsub = onSnapshot(
      collection(db, 'users_customer'),
      (snap) => mapCustomerSnapshot('users_customer', snap),
      (err) => handleFirestoreError(err, OperationType.LIST, 'users_customer')
    );

    penumpangUnsub = onSnapshot(
      collection(db, 'penumpang'),
      (snap) => mapCustomerSnapshot('penumpang', snap),
      (err) => handleFirestoreError(err, OperationType.LIST, 'penumpang')
    );

    usersCustomerUnsub = onSnapshot(
      collection(db, 'users'),
      (snap) => mapCustomerSnapshot('users', snap, true),
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    );

    // 4. SETTING_ADMIN
    adminSettingsUnsub = onSnapshot(
      doc(db, 'setting_admin', 'config'),
      (snap) => {
        if (snap.exists()) {
          callbacks.onSettingsChange(snap.data() as Partial<AdminSettings>);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'setting_admin/config');
      }
    );

    // 4b. SETTING_ADMIN/PAYMENT_CONFIG (QRIS)
    paymentConfigUnsub = onSnapshot(
      doc(db, 'setting_admin', 'payment_config'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          callbacks.onPaymentConfigChange?.({
            qrisImageUrl:
              typeof data.qrisImageUrl === 'string' && data.qrisImageUrl.trim()
                ? data.qrisImageUrl
                : DEFAULT_QRIS_IMAGE_URL,
            updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
          });
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'setting_admin/payment_config');
      }
    );

    // 5. TOP UP REQUESTS
    topUpRequestsUnsub = onSnapshot(
      collection(db, 'topup_requests'),
      (snapshot) => {
        const list: DriverTopUpRequest[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          const rawStatus = String(data.status || 'MENUNGGU').toUpperCase().trim();
          const normStatus: DriverTopUpRequest['status'] =
            rawStatus === 'BERHASIL' || rawStatus === 'DISETUJUI' || rawStatus === 'APPROVED'
              ? 'BERHASIL'
              : rawStatus === 'DITOLAK' || rawStatus === 'REJECTED'
              ? 'DITOLAK'
              : 'MENUNGGU';
          const statusLabel =
            data.statusLabel ||
            (normStatus === 'BERHASIL'
              ? 'Disetujui'
              : normStatus === 'DITOLAK'
              ? 'Ditolak'
              : 'Menunggu Konfirmasi');
          list.push({
            id: d.id,
            ...data,
            amount: Number(data.amount) || 0,
            status: normStatus,
            statusLabel,
          } as DriverTopUpRequest);
        });
        list.sort((a, b) => {
          const aMs = Number(a.createdAtMs || 0);
          const bMs = Number(b.createdAtMs || 0);
          if (aMs !== bMs) return bMs - aMs;
          return (b.createdAt || '') > (a.createdAt || '') ? 1 : -1;
        });
        callbacks.onTopUpRequestsChange?.(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'topup_requests');
      }
    );

    // 6. SALDO_HISTORY
    saldoHistoryUnsub = onSnapshot(
      collection(db, 'saldo_history'),
      (snapshot) => {
        const txList: WalletTransaction[] = [];
        snapshot.forEach((d) => {
          txList.push({ id: d.id, ...d.data() } as WalletTransaction);
        });
        txList.sort((a, b) => ((b.date || '') > (a.date || '') ? 1 : -1));
        callbacks.onTransactionsChange(txList);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'saldo_history');
      }
    );

    // 7. KEUANGAN_ADMIN
    keuanganAdminUnsub = onSnapshot(
      collection(db, 'keuangan_admin'),
      (snapshot) => {
        const list: KeuanganAdminItem[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            id_transaksi: data.id_transaksi || d.id,
            tanggal: data.tanggal || '',
            jenis: data.jenis || 'masuk',
            keterangan: data.keterangan || '',
            jumlah_rp: Number(data.jumlah_rp) || 0,
            id_order: data.id_order || '',
            nama_driver: data.nama_driver || '',
            nama_customer: data.nama_customer || '',
            isDeleted: Boolean(data.isDeleted),
            deletedAt: data.deletedAt || '',
            createdAt: data.createdAt || '',
          } as KeuanganAdminItem);
        });
        list.sort((a, b) => ((b.createdAt || b.tanggal || '') > (a.createdAt || a.tanggal || '') ? 1 : -1));
        callbacks.onKeuanganAdminChange?.(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'keuangan_admin');
      }
    );

    // 7b. LAPORAN_KEUANGAN (Preserved 1-year archived order financials)
    laporanKeuanganUnsub = onSnapshot(
      collection(db, 'laporan_keuangan'),
      (snapshot) => {
        const list: LaporanKeuanganItem[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          const timeMs =
            parseFlexibleTimestampMs(data.createdAtMs, data.createdAtIso, data.createdAt, data.date) ||
            Date.now();
          list.push({
            id: d.id,
            orderId: data.orderId || d.id.replace(/^LK-ORD-/, ''),
            orderNumber: data.orderNumber || d.id,
            customerName: data.customerName || 'Penumpang M3Car',
            customerPhone: data.customerPhone || '',
            driverId: data.driverId || '',
            driverName: data.driverName || '',
            driverPlate: data.driverPlate || '',
            pickupLocation: data.pickupLocation || '-',
            destination: data.destination || '-',
            date: data.date || '',
            time: data.time || '',
            passengers: Number(data.passengers) || 1,
            paymentMethod: data.paymentMethod || 'TUNAI',
            paymentStatus: data.paymentStatus || 'LUNAS',
            totalPrice: Number(data.totalPrice) || 0,
            commissionAmount: Number(data.commissionAmount) || 0,
            driverEarnings: Number(data.driverEarnings) || 0,
            year: Number(data.year) || new Date(timeMs).getFullYear(),
            createdAt: data.createdAt || '',
            createdAtIso: data.createdAtIso || new Date(timeMs).toISOString(),
            createdAtMs: timeMs,
            completedAt: data.completedAt || '',
            archivedAt: data.archivedAt || '',
            isDeleted: Boolean(data.isDeleted),
          });
        });
        list.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
        callbacks.onLaporanKeuanganChange?.(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'laporan_keuangan');
      }
    );

    // 8. WA_NOTIFICATIONS with limit(30)
    notificationsUnsub = onSnapshot(
      query(collection(db, 'wa_notifications'), limit(30)),
      (snapshot) => {
        const list: WhatsAppNotification[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          list.push({
            id: data.id || d.id,
            recipientPhone: data.recipientPhone || '',
            recipientName: data.recipientName || '',
            recipientRole: data.recipientRole || 'driver',
            title: data.title || '',
            message: data.message || '',
            timestamp: data.timestamp || '',
            type: data.type || 'system',
          } as WhatsAppNotification);
        });
        list.sort((a, b) => ((b.timestamp || '') > (a.timestamp || '') ? 1 : -1));
        callbacks.onNotificationsChange?.(list.slice(0, 30));
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'wa_notifications');
      }
    );
  } catch (e) {
    console.error('Failed to start Firestore listeners:', e);
    callbacks.onConnected(false);
  }

  return () => {
    activeOrdersUnsub?.();
    activeDriversUnsub?.();
    customersUnsub?.();
    customersLegacyUnsub?.();
    penumpangUnsub?.();
    usersCustomerUnsub?.();
    adminSettingsUnsub?.();
    paymentConfigUnsub?.();
    topUpRequestsUnsub?.();
    saldoHistoryUnsub?.();
    keuanganAdminUnsub?.();
    laporanKeuanganUnsub?.();
    notificationsUnsub?.();
  };
}

/**
 * PAGINATED FETCH FOR ORDERS
 */
export async function fetchPaginatedOrders(
  pageSize = 20,
  lastVisibleDoc?: QueryDocumentSnapshot<DocumentData> | null
): Promise<{
  orders: Order[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}> {
  try {
    const ordersCol = collection(db, 'orders');
    let q = query(ordersCol, limit(pageSize));
    if (lastVisibleDoc) {
      q = query(ordersCol, startAfter(lastVisibleDoc), limit(pageSize));
    }

    const snap = await getDocs(q);
    const orders: Order[] = [];
    snap.forEach((d) => {
      const data = d.data();
      const dariVal = data.dari || data.pickupLocation || data.titik_jemput || '';
      const keVal = data.ke || data.destination || data.tujuan || '';
      const hargaVal = Number(data.harga ?? data.totalPrice ?? 270000);
      orders.push({
        id: d.id,
        ...data,
        orderNumber: data.orderNumber || data.id_order || `M3-${d.id.slice(-6)}`,
        customerId: data.customerId || data.id_customer || '',
        customerPhone: data.customerPhone || data.no_hp || data.id_customer || '',
        customerName: data.customerName || data.nama || 'Penumpang M3Car',
        pickupLocation: dariVal,
        dari: dariVal,
        destination: keVal,
        ke: keVal,
        totalPrice: hargaVal,
        harga: hargaVal,
        status: normalizeOrderStatusFromDb(data.status || data.status_db),
      } as Order);
    });

    const lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
    const hasMore = snap.docs.length === pageSize;

    return { orders, lastDoc, hasMore };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'orders');
    return { orders: [], lastDoc: null, hasMore: false };
  }
}

/**
 * PAGINATED FETCH FOR CUSTOMERS / PENUMPANG
 */
export async function fetchPaginatedCustomers(
  pageSize = 20,
  lastVisibleDoc?: QueryDocumentSnapshot<DocumentData> | null
): Promise<{
  customers: CustomerData[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}> {
  try {
    const custCol = collection(db, 'customers');
    let q = query(custCol, limit(pageSize));
    if (lastVisibleDoc) {
      q = query(custCol, startAfter(lastVisibleDoc), limit(pageSize));
    }

    const snap = await getDocs(q);
    const customers: CustomerData[] = [];
    snap.forEach((d) => {
      const data = d.data();
      customers.push({
        id: d.id,
        ...data,
        nama: data.nama || data.name || 'Penumpang M3Car',
        no_hp: data.no_hp || data.phone || '',
        alamat: data.alamat || 'Ujung Kulon / Jakarta',
        tanggal_daftar: data.tanggal_daftar || data.createdAt || '',
      } as CustomerData);
    });

    const lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
    const hasMore = snap.docs.length === pageSize;

    return { customers, lastDoc, hasMore };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'customers');
    return { customers: [], lastDoc: null, hasMore: false };
  }
}

/**
 * Ensure Admin Settings document exists in Firestore without seeding any dummy users/orders
 */
export async function ensureAdminSettingsInitialized(settings: AdminSettings): Promise<void> {
  try {
    const existing = await getDoc(doc(db, 'setting_admin', 'config'));
    if (!existing.exists()) {
      await saveAdminSettingsToFirestore(settings);
    }
    const existingPay = await getDoc(doc(db, 'setting_admin', 'payment_config'));
    if (!existingPay.exists()) {
      await setDoc(
        doc(db, 'setting_admin', 'payment_config'),
        {
          qrisImageUrl: settings.qrisImageUrl || DEFAULT_QRIS_IMAGE_URL,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }
  } catch (e) {
    console.info('Firestore admin settings check notice:', e);
  }
}

export async function fetchAdminConfigFromFirestore(): Promise<Record<string, unknown> | null> {
  try {
    const snap = await getDoc(doc(db, 'setting_admin', 'config'));
    if (snap.exists()) {
      return snap.data() as Record<string, unknown>;
    }
    return null;
  } catch (e) {
    console.warn('Gagal membaca konfigurasi admin dari Firestore:', e);
    return null;
  }
}

export async function updateAdminAccessCodeInFirestore(newCode: string): Promise<void> {
  const cleanCode = newCode.trim();
  try {
    await setDoc(
      doc(db, 'setting_admin', 'config'),
      {
        adminAccessCode: cleanCode,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'setting_admin/config', true);
  }
}
