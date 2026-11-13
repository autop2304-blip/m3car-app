/**
 * M3CAR Central Application Store
 * Pure Cloud Firestore real-time synchronization (onSnapshot + setDoc/addDoc/updateDoc).
 * Zero localStorage — all devices share the same live Firestore database.
 */

import { useSyncExternalStore } from 'react';
import {
  User,
  DriverProfile,
  Order,
  OrderStatus,
  WalletTransaction,
  AdminSettings,
  WhatsAppNotification,
  RegionZone,
  DriverTopUpRequest,
  CompanyBankAccount,
  KeuanganAdminItem,
  LaporanKeuanganItem,
  CleanupSummary,
  TravelRoute,
  PriceTariff,
} from '../types';
import {
  playOrderAlertChime,
  playSuccessChime,
  playPassengerNotificationChime,
  playDriverAcceptedSound,
} from '../utils/audio';
import {
  checkIsOutsideIndonesia,
  validateIndonesianPhone,
  calculateCorridorDeviation,
} from '../utils/routePricing';
import {
  setupRealtimeListeners,
  saveOrderToFirestore,
  updateOrderInFirestore,
  saveDriverToFirestore,
  updateDriverOnlineStatusInFirestore,
  updateDriverBalanceInFirestore,
  updateDriverLocationInFirestore,
  updateDriverStatusInFirestore,
  updateDriverPasswordHashInFirestore,
  updateDriverRecoveryCodeHashInFirestore,
  fetchDriverByPhoneFromFirestore,
  fetchDriverByIdFromFirestore,
  fetchNextDriverIdFromFirestore,
  getCachedDriverSecrets,
  setCachedDriverSecrets,
  saveTransactionToFirestore,
  saveAdminSettingsToFirestore,
  saveTopUpRequestToFirestore,
  saveCustomerToFirestore,
  saveKeuanganAdminToFirestore,
  archiveOrderToLaporanKeuangan,
  runAutoHistoryCleanupFromFirestore,
  purgeAnnualFinancialDataFromFirestore,
  saveNotificationToFirestore,
  deleteOrderFromFirestore,
  deleteDriverFromFirestore,
  deleteCustomerFromFirestore,
  deleteKeuanganAdminFromFirestore,
  deleteTransactionFromFirestore,
  deleteTopUpRequestFromFirestore,
  clearAllTransactionsFromFirestore,
  clearAllCustomersFromFirestore,
  clearAllTopUpRequestsFromFirestore,
  ensureAdminSettingsInitialized,
  fetchAdminConfigFromFirestore,
  updateAdminAccessCodeInFirestore,
  testFirestoreConnection,
  fetchPaginatedOrders,
  fetchPaginatedCustomers,
  savePaymentQrisToFirestore,
  DEFAULT_QRIS_IMAGE_URL,
  CustomerData,
} from '../services/firestoreService';

const SESSION_KEY_ADMIN_TOKEN = 'm3car_admin_token';
const SESSION_KEY_ADMIN_AUTH = 'm3car_admin_authenticated';
const SESSION_KEY_DRIVER_TOKEN = 'm3car_driver_token';
const SESSION_KEY_CUSTOMER_USER = 'm3car_customer_session';
const DEFAULT_ADMIN_FALLBACK_CODE = '011zilstiker';
export const MIN_DRIVER_ACTIVE_BALANCE = 10000;

const DEFAULT_SETTINGS: AdminSettings = {
  adminPhone: '085811594114',
  waDirekturPhone: '901102051050',
  pricePerPerson: 270000,
  pricePerKm: 3500,
  receiptTimeLimitMinutes: 30,
  orderRetentionDays: 7,
  companyBank: {
    bankName: 'SeaBank',
    accountNumber: '901102051050',
    accountHolder: 'Ali Husen - CV. ROYAL TRANS BERKAH GROUP',
  },
  routes: [],
  tariffs: [],
  rates: {
    jakarta: 270000,
    tangerang_depok: 275000,
    bogor_bekasi: 300000,
  },
  commissionRates: {
    longTrip: 0.12,
    shortTrip: 0.15,
  },
  tripayQrisFeeFlat: 1000,
  tripayQrisFeePercent: 0.007,
  qrisImageUrl: DEFAULT_QRIS_IMAGE_URL,
  siteContent: {
    appName: 'M3CAR',
    tagline: 'Jemput Cepat, Sampai Selamat',
    subTagline: 'Travel Antar Jemput Ujung Kulon - Jakarta',
    announcement: 'Rute Cepat Tol Serang-Panimbang (Ujung Kulon - Jakarta PP)',
    welcomeText: 'M3CAR - KHUSUS INDONESIA. Ujung Kulon - Jakarta.',
    tollRouteDesc: 'Tol Jakarta-Merak + Tol Serang-Panimbang 83,6 km',
    travelTimeEta: '6 jam 30 menit',
    bannerUrl: '',
  },
};

// Global reactive store registry for useSyncExternalStore
type Listener = () => void;
const listeners = new Set<Listener>();
let storeVersion = 0;
let notifyScheduled = false;

function notify() {
  storeVersion++;
  if (!notifyScheduled) {
    notifyScheduled = true;
    queueMicrotask(() => {
      notifyScheduled = false;
      listeners.forEach((l) => {
        try {
          l();
        } catch (e) {
          console.error('Store listener error:', e);
        }
      });
    });
  }
}

function subscribeToStore(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getStoreSnapshot() {
  return storeVersion;
}

function getStoredAdminToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    return sessionStorage.getItem(SESSION_KEY_ADMIN_TOKEN) || sessionStorage.getItem(SESSION_KEY_ADMIN_AUTH) || '';
  } catch {
    return '';
  }
}

function setStoredAdminToken(token: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      sessionStorage.setItem(SESSION_KEY_ADMIN_TOKEN, token);
      sessionStorage.setItem(SESSION_KEY_ADMIN_AUTH, 'true');
    } else {
      sessionStorage.removeItem(SESSION_KEY_ADMIN_TOKEN);
      sessionStorage.removeItem(SESSION_KEY_ADMIN_AUTH);
    }
  } catch {}
}

function getStoredDriverToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    return sessionStorage.getItem(SESSION_KEY_DRIVER_TOKEN) || '';
  } catch {
    return '';
  }
}

function setStoredDriverToken(token: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      sessionStorage.setItem(SESSION_KEY_DRIVER_TOKEN, token);
    } else {
      sessionStorage.removeItem(SESSION_KEY_DRIVER_TOKEN);
    }
  } catch {}
}

function getStoredCustomerUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY_CUSTOMER_USER);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.role === 'customer' && parsed.phone) {
      return parsed as User;
    }
    return null;
  } catch {
    return null;
  }
}

function setStoredCustomerUser(user: User | null) {
  if (typeof window === 'undefined') return;
  try {
    if (user && user.role === 'customer') {
      sessionStorage.setItem(SESSION_KEY_CUSTOMER_USER, JSON.stringify(user));
    } else {
      sessionStorage.removeItem(SESSION_KEY_CUSTOMER_USER);
    }
  } catch {}
}

function sanitizeDriverForClient(driver: DriverProfile): DriverProfile {
  const {
    password: _omitPw,
    passwordHash: _omitHash,
    recoveryCodeHash: _omitRecHash,
    recoveryCodeExpiresAt: _omitRecExp,
    ...safe
  } = driver;
  return {
    ...safe,
    hasPassword: Boolean(driver.hasPassword || driver.passwordHash),
  };
}

// In-memory reactive state hydrated directly from Firestore onSnapshot
const globalState = {
  currentUser: getStoredCustomerUser() as User | DriverProfile | null,
  isAdminAuthenticated: false,
  isCheckingAdminSession: true,
  customers: [] as CustomerData[],
  drivers: [] as DriverProfile[],
  orders: [] as Order[],
  transactions: [] as WalletTransaction[],
  topUpRequests: [] as DriverTopUpRequest[],
  keuanganAdmin: [] as KeuanganAdminItem[],
  laporanKeuangan: [] as LaporanKeuanganItem[],
  lastCleanupSummary: null as CleanupSummary | null,
  settings: { ...DEFAULT_SETTINGS } as AdminSettings,
  notifications: [] as WhatsAppNotification[],
  isFirebaseConnected: false,
  firestoreError: null as string | null,
};

let lastCleanupAttemptMs = 0;
let cleanupInFlightPromise: Promise<CleanupSummary | null> | null = null;
const SESSION_KEY_LAST_CLEANUP_MS = 'm3car_last_cleanup_ms';

let unsubAllFirestore: (() => void) | null = null;
let firestoreInitialized = false;

export function startFirestoreRealtimeSync() {
  if (typeof window === 'undefined') return;
  if (firestoreInitialized && unsubAllFirestore) return;
  firestoreInitialized = true;

  testFirestoreConnection().then((ok) => {
    globalState.isFirebaseConnected = ok;
    notify();
  });

  unsubAllFirestore = setupRealtimeListeners({
    onActiveOrdersChange: (newOrders) => {
      const prevCount = globalState.orders.filter((o) => o.status === 'MENCARI_DRIVER').length;
      const newCount = newOrders.filter((o) => o.status === 'MENCARI_DRIVER').length;
      if (newCount > prevCount) {
        playOrderAlertChime();
      }
      globalState.orders = newOrders;
      globalState.firestoreError = null;
      notify();
    },
    onDriversChange: (newDrivers) => {
      const sanitizedList = (newDrivers || []).map(sanitizeDriverForClient);
      globalState.drivers = sanitizedList;
      globalState.firestoreError = null;
      if (globalState.currentUser && globalState.currentUser.role === 'driver') {
        const match = sanitizedList.find((d) => d.id === globalState.currentUser?.id);
        if (match) {
          globalState.currentUser = match;
        }
      }
      notify();
    },
    onCustomersChange: (newCustomers) => {
      globalState.customers = newCustomers || [];
      notify();
    },
    onSettingsChange: (newSettings) => {
      const merged: AdminSettings = {
        ...DEFAULT_SETTINGS,
        ...globalState.settings,
        ...newSettings,
        rates: {
          ...DEFAULT_SETTINGS.rates,
          ...(globalState.settings.rates || {}),
          ...(newSettings.rates || {}),
        },
        commissionRates: {
          ...DEFAULT_SETTINGS.commissionRates,
          ...(globalState.settings.commissionRates || {}),
          ...(newSettings.commissionRates || {}),
        },
        companyBank: newSettings.companyBank
          ? { ...(globalState.settings.companyBank || DEFAULT_SETTINGS.companyBank!), ...newSettings.companyBank }
          : globalState.settings.companyBank || DEFAULT_SETTINGS.companyBank,
        siteContent: {
          ...DEFAULT_SETTINGS.siteContent,
          ...(globalState.settings.siteContent || {}),
          ...(newSettings.siteContent || {}),
        },
        routes: Array.isArray(newSettings.routes) ? newSettings.routes : globalState.settings.routes || [],
        tariffs: Array.isArray(newSettings.tariffs) ? newSettings.tariffs : globalState.settings.tariffs || [],
      };
      if ('adminPasswordHash' in merged) {
        delete merged.adminPasswordHash;
      }
      globalState.settings = merged;
      notify();
    },
    onPaymentConfigChange: (pc) => {
      globalState.settings = {
        ...globalState.settings,
        qrisImageUrl: pc.qrisImageUrl || DEFAULT_QRIS_IMAGE_URL,
        qrisUpdatedAt: pc.updatedAt || globalState.settings.qrisUpdatedAt,
      };
      notify();
    },
    onTransactionsChange: (newTx) => {
      globalState.transactions = newTx || [];
      notify();
    },
    onTopUpRequestsChange: (newReqs) => {
      globalState.topUpRequests = newReqs || [];
      notify();
    },
    onKeuanganAdminChange: (items) => {
      globalState.keuanganAdmin = items || [];
      notify();
    },
    onLaporanKeuanganChange: (items) => {
      globalState.laporanKeuangan = items || [];
      notify();
    },
    onNotificationsChange: (notifs) => {
      globalState.notifications = notifs || [];
      notify();
    },
    onConnected: (connected) => {
      globalState.isFirebaseConnected = connected;
      notify();
    },
    onError: (errMsg) => {
      globalState.firestoreError = errMsg;
      notify();
    },
  });

  ensureAdminSettingsInitialized(globalState.settings);
  restoreDriverSessionFromServer();
}

async function restoreDriverSessionFromServer() {
  if (typeof window === 'undefined') return;
  try {
    const token = getStoredDriverToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch('/api/driver/session', {
      method: 'GET',
      credentials: 'include',
      headers,
    });
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    if (!data?.ok || !data?.authenticated || !data?.user?.id) return;

    const liveDriver = await fetchDriverByIdFromFirestore(data.user.id);
    if (liveDriver && !liveDriver.isDeleted && liveDriver.status !== 'DIBLOKIR') {
      if (!globalState.currentUser) {
        globalState.currentUser = sanitizeDriverForClient(liveDriver);
        notify();
      }
    }
  } catch {
    // Ignore session restore failure when not logged in
  }
}

if (typeof window !== 'undefined') {
  startFirestoreRealtimeSync();
}

function generateNextCustomerId(existingCustomers: CustomerData[]): string {
  let maxNum = 0;
  existingCustomers.forEach((c) => {
    const match = (c.id || '').match(/CUST-(\d+)/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  });
  if (maxNum === 0) {
    maxNum = existingCustomers.length;
  }
  return `CUST-${String(maxNum + 1).padStart(3, '0')}`;
}

export function normalizePhone(raw: string): string {
  if (!raw) return '';
  let cleaned = raw.replace(/\D/g, '');
  if (cleaned.startsWith('62')) {
    cleaned = '0' + cleaned.slice(2);
  } else if (cleaned.startsWith('8')) {
    cleaned = '0' + cleaned;
  }
  return cleaned;
}

export function normalizeName(raw: string): string {
  return (raw || '').trim().toLowerCase();
}

export function useM3CarStore() {
  useSyncExternalStore(subscribeToStore, getStoreSnapshot, () => 0);

  // WhatsApp notification saved directly to Firestore
  const sendWhatsAppNotification = (
    phone: string,
    name: string,
    role: 'driver' | 'customer' | 'admin',
    title: string,
    message: string,
    type: WhatsAppNotification['type']
  ) => {
    const newNotif: WhatsAppNotification = {
      id: `wa-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      recipientPhone: phone,
      recipientName: name,
      recipientRole: role,
      title,
      message,
      timestamp: new Date().toLocaleString('id-ID'),
      type,
    };
    globalState.notifications = [newNotif, ...globalState.notifications].slice(0, 50);
    saveNotificationToFirestore(newNotif);
    notify();
  };

  // Frontend + Firestore Admin Authentication Actions (Zero external API fetch)
  const resolveExpectedAdminCode = async (): Promise<string> => {
    const envCode = String(import.meta.env?.VITE_ADMIN_ACCESS_CODE ?? '').trim();

    let firestoreCode = String(globalState.settings.adminAccessCode || '').trim();
    if (!firestoreCode) {
      const configDoc = await fetchAdminConfigFromFirestore();
      if (configDoc) {
        firestoreCode = String(
          configDoc.adminAccessCode || configDoc.kodeAdmin || configDoc.adminCode || ''
        ).trim();
      }
    }

    return firestoreCode || envCode || DEFAULT_ADMIN_FALLBACK_CODE;
  };

  const verifyAdminSessionWithServer = async (): Promise<boolean> => {
    globalState.isCheckingAdminSession = true;
    notify();

    const isSessionActive =
      typeof window !== 'undefined' &&
      (sessionStorage.getItem(SESSION_KEY_ADMIN_AUTH) === 'true' || Boolean(getStoredAdminToken()));

    if (isSessionActive) {
      const adminUser: User = {
        id: 'admin-root',
        name: 'Admin Pusat M3CAR',
        phone: globalState.settings.adminPhone || '085811594114',
        role: 'admin',
      };
      globalState.currentUser = adminUser;
      globalState.isAdminAuthenticated = true;
      globalState.isCheckingAdminSession = false;
      notify();
      return true;
    }

    setStoredAdminToken(null);
    if (globalState.currentUser?.role === 'admin') {
      globalState.currentUser = null;
    }
    globalState.isAdminAuthenticated = false;
    globalState.isCheckingAdminSession = false;
    notify();
    return false;
  };

  const loginAdminWithServer = async (code: string): Promise<{ success: boolean; message?: string }> => {
    const trimmedCode = (code || '').trim();
    if (!trimmedCode) {
      return { success: false, message: 'Masukkan Kode Admin.' };
    }

    const envCode = String(import.meta.env?.VITE_ADMIN_ACCESS_CODE ?? '').trim();
    const expectedCode = await resolveExpectedAdminCode();

    const isValid =
      trimmedCode === expectedCode ||
      (envCode !== '' && trimmedCode === envCode);

    if (isValid) {
      setStoredAdminToken('admin-session-active');
      const adminUser: User = {
        id: 'admin-root',
        name: 'Admin Pusat M3CAR',
        phone: globalState.settings.adminPhone || '085811594114',
        role: 'admin',
      };
      globalState.currentUser = adminUser;
      globalState.isAdminAuthenticated = true;
      globalState.isCheckingAdminSession = false;
      notify();
      return { success: true };
    }

    return { success: false, message: 'Kode Salah' };
  };

  const logoutAdminWithServer = async () => {
    setStoredAdminToken(null);
    globalState.isAdminAuthenticated = false;
    globalState.currentUser = null;
    notify();
  };

  const changeAdminCodeWithServer = async (
    currentCode: string,
    newCode: string
  ): Promise<{ success: boolean; message: string }> => {
    const trimmedCurrent = (currentCode || '').trim();
    const trimmedNew = (newCode || '').trim();

    if (!trimmedCurrent || !trimmedNew || trimmedNew.length < 6) {
      return { success: false, message: 'Kode Admin baru minimal 6 karakter.' };
    }

    const envCode = String(import.meta.env?.VITE_ADMIN_ACCESS_CODE ?? '').trim();
    const expectedCode = await resolveExpectedAdminCode();

    const isCurrentValid =
      trimmedCurrent === expectedCode ||
      (envCode !== '' && trimmedCurrent === envCode);

    if (!isCurrentValid) {
      return { success: false, message: 'Kode Admin saat ini salah.' };
    }

    try {
      await updateAdminAccessCodeInFirestore(trimmedNew);
      globalState.settings = {
        ...globalState.settings,
        adminAccessCode: trimmedNew,
      };
      notify();
      return { success: true, message: 'Kode Admin berhasil diperbarui di Firebase Cloud Firestore.' };
    } catch {
      return { success: false, message: 'Gagal menyimpan Kode Admin baru ke Firestore.' };
    }
  };

  // Customer Login / Auto-register (langsung tulis ke Firestore)
  const login = (phone: string, _password?: string, role?: 'customer' | 'driver' | 'admin') => {
    if (role === 'admin') {
      return { success: false, message: 'Gunakan verifikasi server Panel Admin.' };
    }
    if (role === 'driver') {
      return {
        success: false,
        message: 'Masuk Driver wajib menggunakan Nomor HP dan Kata Sandi pribadi.',
      };
    }

    const phoneCheck = validateIndonesianPhone(phone);
    if (!phoneCheck.isValid) {
      return {
        success: false,
        message: phoneCheck.errorMessage || 'Hanya Nomor HP Indonesia (+62) yang bisa daftar.',
      };
    }
    const cleanPhone = phoneCheck.cleanedPhone;

    const existing = globalState.customers.find(
      (c) =>
        (c.no_hp && c.no_hp.replace(/\D/g, '') === cleanPhone.replace(/\D/g, '')) ||
        (c.phone && c.phone.replace(/\D/g, '') === cleanPhone.replace(/\D/g, ''))
    );

    if (existing) {
      const custUser: User = {
        id: existing.id,
        name: existing.nama || existing.name || `Pelanggan ${cleanPhone.slice(-4)}`,
        phone: cleanPhone,
        role: 'customer',
      };
      globalState.currentUser = custUser;
      notify();
      return {
        success: true,
        user: custUser,
        alreadyRegistered: true,
        message: 'Nomor ini sudah terdaftar, langsung masuk.',
      };
    }

    const nextId = generateNextCustomerId(globalState.customers);
    const now = new Date().toLocaleString('id-ID');
    const custUser: User = {
      id: nextId,
      name: `Customer ${cleanPhone.slice(-4)}`,
      phone: cleanPhone,
      role: 'customer',
    };
    globalState.currentUser = custUser;

    const customerDoc: CustomerData = {
      id: nextId,
      nama: custUser.name,
      no_hp: cleanPhone,
      alamat: 'Ujung Kulon / Jakarta',
      tanggal_daftar: now,
      name: custUser.name,
      phone: cleanPhone,
      role: 'customer',
      createdAt: now,
    };
    saveCustomerToFirestore(customerDoc).catch(console.error);
    globalState.customers = [customerDoc, ...globalState.customers];

    notify();
    return { success: true, user: custUser, message: 'Pendaftaran berhasil!' };
  };

  // Dedicated Customer Registration -> saved directly to Firestore
  const registerCustomer = (data: { name: string; phone: string; address?: string }) => {
    const phoneCheck = validateIndonesianPhone(data.phone);
    if (!phoneCheck.isValid) {
      return {
        success: false,
        message: phoneCheck.errorMessage || 'Hanya Nomor HP Indonesia (+62) yang bisa daftar.',
      };
    }

    const cleanPhone = phoneCheck.cleanedPhone;
    const cleanName = data.name.trim() || 'Penumpang M3Car';

    const existing = globalState.customers.find(
      (c) =>
        (c.no_hp && c.no_hp.replace(/\D/g, '') === cleanPhone.replace(/\D/g, '')) ||
        (c.phone && c.phone.replace(/\D/g, '') === cleanPhone.replace(/\D/g, ''))
    );

    if (existing) {
      const custUser: User = {
        id: existing.id,
        name: existing.nama || existing.name || cleanName,
        phone: cleanPhone,
        role: 'customer',
      };
      globalState.currentUser = custUser;
      setStoredCustomerUser(custUser);
      notify();
      return {
        success: true,
        alreadyRegistered: true,
        message: 'Nomor ini sudah terdaftar, langsung masuk.',
        customer: existing,
        user: custUser,
      };
    }

    const nextId = generateNextCustomerId(globalState.customers);
    const now = new Date().toLocaleString('id-ID');
    const custDoc: CustomerData = {
      id: nextId,
      nama: cleanName,
      no_hp: cleanPhone,
      alamat: data.address || 'Ujung Kulon / Jakarta',
      tanggal_daftar: now,
      name: cleanName,
      phone: cleanPhone,
      role: 'customer',
      createdAt: now,
    };

    saveCustomerToFirestore(custDoc).catch(console.error);
    globalState.customers = [custDoc, ...globalState.customers];

    const custUser: User = {
      id: nextId,
      name: cleanName,
      phone: cleanPhone,
      role: 'customer',
    };
    globalState.currentUser = custUser;
    setStoredCustomerUser(custUser);

    notify();
    return {
      success: true,
      alreadyRegistered: false,
      message: 'Pendaftaran berhasil!',
      customer: custDoc,
      user: custUser,
    };
  };

  const logout = () => {
    const wasDriver = globalState.currentUser?.role === 'driver';
    globalState.currentUser = null;
    setStoredDriverToken(null);
    setStoredCustomerUser(null);
    if (wasDriver && typeof window !== 'undefined') {
      fetch('/api/driver/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    }
    notify();
  };

  const loginUnified = (name: string, phone: string) => {
    const trimmedName = (name || '').trim();
    const cleanPhone = normalizePhone(phone);

    if (!trimmedName || !cleanPhone) {
      return { success: false, message: 'Silakan isi Nama Lengkap dan Nomor WhatsApp Anda.' };
    }

    if (cleanPhone.length < 10 || cleanPhone.length > 14 || !cleanPhone.startsWith('08')) {
      return { success: false, message: 'Nomor HP tidak valid. Masukkan nomor HP Indonesia yang aktif (08...).' };
    }

    const driverByPhone = globalState.drivers.find(
      (d) => d && !d.isDeleted && d.phone && normalizePhone(d.phone) === cleanPhone
    );

    if (driverByPhone) {
      return {
        success: false,
        message: 'Nomor ini terdaftar sebagai Mitra Driver. Silakan masuk melalui Portal Driver dengan kata sandi pribadi Anda.',
      };
    }

    const customerByPhone = globalState.customers.find((c) => {
      const p = c.no_hp || c.phone || '';
      return p && normalizePhone(p) === cleanPhone;
    });

    if (customerByPhone) {
      const existingName = customerByPhone.nama || customerByPhone.name || trimmedName;
      const custUser: User = {
        id: customerByPhone.id,
        name: existingName,
        phone: cleanPhone,
        role: 'customer',
        avatarUrl: customerByPhone.foto_profil || customerByPhone.avatarUrl,
      };
      globalState.currentUser = custUser;
      setStoredCustomerUser(custUser);
      notify();
      return {
        success: true,
        role: 'customer' as const,
        user: custUser,
        message: 'Nomor ini sudah terdaftar, langsung masuk.',
      };
    }

    const nextId = generateNextCustomerId(globalState.customers);
    const now = new Date().toLocaleString('id-ID');
    const custUser: User = {
      id: nextId,
      name: trimmedName,
      phone: cleanPhone,
      role: 'customer',
    };
    const newCustomerDoc: CustomerData = {
      id: nextId,
      nama: trimmedName,
      no_hp: cleanPhone,
      name: trimmedName,
      phone: cleanPhone,
      alamat: 'Ujung Kulon / Jakarta',
      tanggal_daftar: now,
      role: 'customer',
      createdAt: now,
    };

    saveCustomerToFirestore(newCustomerDoc).catch(console.error);
    globalState.customers = [newCustomerDoc, ...globalState.customers];
    globalState.currentUser = custUser;
    setStoredCustomerUser(custUser);

    notify();
    return {
      success: true,
      role: 'customer' as const,
      user: custUser,
      message: `Pendaftaran berhasil! Selamat datang, ${trimmedName}.`,
    };
  };

  const switchRole = (targetRole: 'customer' | 'driver' | 'admin') => {
    if (targetRole === 'admin') return;
    if (targetRole === 'driver') {
      if (globalState.currentUser && globalState.currentUser.role === 'driver') return;
      globalState.currentUser = null;
      notify();
    } else {
      if (globalState.currentUser?.role !== 'customer') {
        globalState.currentUser = null;
        notify();
      }
    }
  };

  // Dedicated Driver Registration -> writes directly to Firestore collection 'drivers'
  const registerDriver = async (data: {
    name: string;
    phone: string;
    plateNumber: string;
    carModel: string;
    ktpPhotoUrl: string;
    simPhotoUrl: string;
    password: string;
    confirmPassword: string;
  }): Promise<{
    success: boolean;
    message?: string;
    code?: string;
    pendingDriverId?: string;
    needsFirstPassword?: boolean;
    driver?: DriverProfile;
  }> => {
    const phoneCheck = validateIndonesianPhone(data.phone);
    if (!phoneCheck.isValid) {
      return {
        success: false,
        message: phoneCheck.errorMessage || 'Hanya Nomor HP Indonesia (+62) yang bisa daftar.',
      };
    }

    if (!data.name.trim()) {
      return { success: false, message: 'Nama Lengkap wajib diisi.' };
    }
    if (!data.plateNumber.trim()) {
      return { success: false, message: 'No Polisi wajib diisi.' };
    }
    if (!data.carModel.trim()) {
      return { success: false, message: 'Merk Mobil wajib diisi.' };
    }
    if (!data.ktpPhotoUrl) {
      return { success: false, message: 'Foto KTP wajib diupload.' };
    }
    if (!data.simPhotoUrl) {
      return { success: false, message: 'Foto SIM A wajib diupload.' };
    }
    if (!data.password || data.password.length < 6) {
      return { success: false, message: 'Kata sandi pribadi minimal 6 karakter.' };
    }
    if (data.password !== data.confirmPassword) {
      return { success: false, message: 'Konfirmasi kata sandi tidak cocok.' };
    }

    const cleanPhone = normalizePhone(phoneCheck.cleanedPhone);
    const cleanName = data.name.trim();
    const cleanPlate = data.plateNumber.trim().toUpperCase();
    const cleanCar = data.carModel.trim();

    const firestoreMatch = await fetchDriverByPhoneFromFirestore(cleanPhone);
    const localExisting = globalState.drivers.find(
      (d) => !d.isDeleted && d.phone && normalizePhone(d.phone) === cleanPhone
    );
    const existing =
      (firestoreMatch && !firestoreMatch.driver.isDeleted ? firestoreMatch.driver : null) ||
      localExisting;

    if (existing) {
      const hasPw = Boolean(
        existing.hasPassword ||
          firestoreMatch?.passwordHash ||
          getCachedDriverSecrets(existing.id).passwordHash
      );
      if (!hasPw) {
        return {
          success: false,
          code: 'LEGACY_NO_PASSWORD',
          needsFirstPassword: true,
          message:
            'Nomor HP ini sudah terdaftar sebagai akun Driver lama dan belum memiliki kata sandi. Gunakan menu "Buat Kata Sandi Pertama Kali" tanpa perlu daftar ulang.',
        };
      }
      return {
        success: false,
        code: 'PHONE_ALREADY_REGISTERED',
        message:
          'Nomor HP ini sudah terdaftar sebagai akun Driver. Setiap nomor HP hanya boleh memiliki satu akun.',
      };
    }

    let hashedData: { ok?: boolean; passwordHash?: string; passwordUpdatedAt?: string; message?: string } | null = null;
    try {
      const res = await fetch('/api/driver/hash-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: data.password,
          confirmPassword: data.confirmPassword,
        }),
      });
      hashedData = await res.json().catch(() => null);
      if (!res.ok || !hashedData?.ok || !hashedData?.passwordHash) {
        return {
          success: false,
          message: hashedData?.message || 'Gagal mengamankan kata sandi di server.',
        };
      }
    } catch {
      return {
        success: false,
        message: 'Gagal terhubung ke server keamanan untuk mengenkripsi kata sandi.',
      };
    }

    const nextId = await fetchNextDriverIdFromFirestore();
    const now = new Date().toLocaleString('id-ID');

    const driverForDb: DriverProfile = {
      id: nextId,
      name: cleanName,
      phone: cleanPhone,
      role: 'driver',
      status: 'MENUNGGU',
      rawStatus: 'waiting_approval',
      carModel: cleanCar,
      car: cleanCar,
      plateNumber: cleanPlate,
      plate: cleanPlate,
      isOnline: false,
      balance: 0,
      saldo: 0,
      rating: 5.0,
      totalTrips: 0,
      ktpPhotoUrl: data.ktpPhotoUrl,
      ktpUrl: data.ktpPhotoUrl,
      simPhotoUrl: data.simPhotoUrl,
      simUrl: data.simPhotoUrl,
      registeredAt: now,
      hasPassword: true,
      passwordHash: hashedData.passwordHash,
      passwordUpdatedAt: hashedData.passwordUpdatedAt || new Date().toISOString(),
    };

    try {
      await saveDriverToFirestore(driverForDb);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan data driver ke Cloud Firestore.';
      return {
        success: false,
        message: `Gagal menyimpan ke Firestore: ${msg}`,
      };
    }

    setCachedDriverSecrets(nextId, { passwordHash: hashedData.passwordHash });
    const safeDriver = sanitizeDriverForClient(driverForDb);
    globalState.drivers = [safeDriver, ...globalState.drivers.filter((d) => d.id !== safeDriver.id)];

    sendWhatsAppNotification(
      safeDriver.phone,
      safeDriver.name,
      'driver',
      'Pendaftaran Driver Diterima (Menunggu Persetujuan Admin)',
      `Halo ${safeDriver.name}, pendaftaran Mitra Driver M3CAR (${cleanPlate} - ${cleanCar}) telah diterima dengan status MENUNGGU PERSETUJUAN ADMIN. Setelah Admin menyetujui, silakan masuk dengan Nomor HP & kata sandi pribadi Anda.`,
      'acc'
    );

    notify();
    return {
      success: true,
      pendingDriverId: nextId,
      driver: safeDriver,
      message:
        'Pendaftaran berhasil! Data tersimpan real-time di Cloud Firestore dengan status MENUNGGU PERSETUJUAN ADMIN.',
    };
  };

  // Driver Login dengan Nomor HP & Kata Sandi Pribadi
  const loginDriverWithPassword = async (
    phoneInput: string,
    passwordInput: string
  ): Promise<{
    success: boolean;
    message?: string;
    needsFirstPassword?: boolean;
    pendingApproval?: boolean;
    blocked?: boolean;
    driverId?: string;
    driverPhone?: string;
    driverName?: string;
    user?: DriverProfile;
  }> => {
    const cleanPhone = normalizePhone(phoneInput);
    if (!cleanPhone || cleanPhone.length < 9) {
      return { success: false, message: 'Masukkan Nomor HP Indonesia yang valid.' };
    }
    if (!passwordInput) {
      return { success: false, message: 'Kata sandi wajib diisi.' };
    }

    const firestoreMatch = await fetchDriverByPhoneFromFirestore(cleanPhone);
    const localMatch = globalState.drivers.find(
      (d) => d?.phone && normalizePhone(d.phone) === cleanPhone
    );

    const driver = firestoreMatch?.driver || localMatch;
    if (!driver) {
      return {
        success: false,
        message: 'Nomor HP driver belum terdaftar. Silakan daftar sebagai Mitra Driver terlebih dahulu.',
      };
    }

    if (driver.isDeleted) {
      return {
        success: false,
        message: 'Akun driver ini telah dihapus oleh Admin.',
      };
    }

    if (firestoreMatch?.driver) {
      const sanitized = sanitizeDriverForClient(firestoreMatch.driver);
      const existsInLocal = globalState.drivers.some((d) => d.id === sanitized.id);
      globalState.drivers = existsInLocal
        ? globalState.drivers.map((d) => (d.id === sanitized.id ? sanitized : d))
        : [sanitized, ...globalState.drivers];
    }

    const cachedSecrets = getCachedDriverSecrets(driver.id);
    const passwordHash = firestoreMatch?.passwordHash || cachedSecrets.passwordHash;

    if (!passwordHash && !driver.hasPassword) {
      return {
        success: false,
        needsFirstPassword: true,
        driverId: driver.id,
        driverPhone: driver.phone,
        driverName: driver.name,
        message:
          'Akun driver lama Anda belum memiliki kata sandi. Silakan buat kata sandi pertama kali tanpa mengulang pendaftaran atau unggah ulang KTP/SIM.',
      };
    }

    if (!passwordHash) {
      return {
        success: false,
        message:
          'Data verifikasi kata sandi belum termuat dari Firestore. Pastikan koneksi internet aktif lalu coba lagi.',
      };
    }

    try {
      const res = await fetch('/api/driver/verify-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: passwordInput,
          passwordHash,
          driverId: driver.id,
          phone: cleanPhone,
          name: driver.name,
          status: driver.status,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !data?.verified) {
        return {
          success: false,
          pendingApproval: Boolean(data?.pendingApproval),
          blocked: Boolean(data?.blocked),
          driverId: driver.id,
          driverPhone: driver.phone,
          driverName: driver.name,
          message: data?.message || 'Nomor HP atau kata sandi salah.',
        };
      }

      if (data.token) {
        setStoredDriverToken(data.token);
      }

      const safeDriver = sanitizeDriverForClient(driver);
      globalState.currentUser = safeDriver;
      notify();
      return {
        success: true,
        user: safeDriver,
      };
    } catch {
      return {
        success: false,
        message: 'Gagal terhubung ke server verifikasi login driver.',
      };
    }
  };

  const setupFirstTimeDriverPassword = async (data: {
    phone: string;
    plateNumber: string;
    fullName?: string;
    password: string;
    confirmPassword: string;
  }): Promise<{ success: boolean; message: string; status?: DriverProfile['status'] }> => {
    const cleanPhone = normalizePhone(data.phone);
    if (!cleanPhone) {
      return { success: false, message: 'Masukkan Nomor HP terdaftar.' };
    }
    if (!data.plateNumber.trim()) {
      return { success: false, message: 'Masukkan Nomor Polisi (Plat Kendaraan) yang terdaftar untuk verifikasi.' };
    }

    const firestoreMatch = await fetchDriverByPhoneFromFirestore(cleanPhone);
    const localMatch = globalState.drivers.find(
      (d) => !d.isDeleted && d.phone && normalizePhone(d.phone) === cleanPhone
    );
    const driver = firestoreMatch?.driver || localMatch;

    if (!driver || driver.isDeleted) {
      return {
        success: false,
        message: 'Nomor HP driver lama tidak ditemukan. Pastikan nomor HP sesuai data pendaftaran.',
      };
    }

    const cachedSecrets = getCachedDriverSecrets(driver.id);
    const hasExistingPassword = Boolean(
      firestoreMatch?.passwordHash || cachedSecrets.passwordHash || driver.hasPassword
    );

    try {
      const res = await fetch('/api/driver/first-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: cleanPhone,
          plateNumber: data.plateNumber,
          fullName: data.fullName || '',
          storedPhone: driver.phone,
          storedPlate: driver.plateNumber || driver.plate || '',
          storedName: driver.name || '',
          hasExistingPassword,
          password: data.password,
          confirmPassword: data.confirmPassword,
        }),
      });
      const resp = await res.json().catch(() => null);
      if (!res.ok || !resp?.ok || !resp?.passwordHash) {
        return {
          success: false,
          message: resp?.message || 'Gagal membuat kata sandi pertama kali.',
        };
      }

      const passwordUpdatedAt = resp.passwordUpdatedAt || new Date().toISOString();
      await updateDriverPasswordHashInFirestore(driver.id, resp.passwordHash, passwordUpdatedAt, false);

      const updatedDriver: DriverProfile = sanitizeDriverForClient({
        ...driver,
        hasPassword: true,
        passwordUpdatedAt,
      });
      globalState.drivers = globalState.drivers.map((d) =>
        d.id === driver.id ? updatedDriver : d
      );
      notify();

      return {
        success: true,
        status: driver.status,
        message:
          driver.status === 'AKTIF'
            ? 'Kata sandi pribadi berhasil dibuat! Silakan masuk dengan Nomor HP & kata sandi Anda.'
            : 'Kata sandi pribadi berhasil dibuat! Status akun Anda saat ini menunggu persetujuan Admin.',
      };
    } catch {
      return {
        success: false,
        message: 'Gagal terhubung ke server keamanan untuk menyimpan kata sandi.',
      };
    }
  };

  const recoverDriverPassword = async (data: {
    phone: string;
    plateNumber?: string;
    fullName?: string;
    recoveryCode?: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<{ success: boolean; message: string }> => {
    const cleanPhone = normalizePhone(data.phone);
    if (!cleanPhone) {
      return { success: false, message: 'Nomor HP terdaftar wajib diisi.' };
    }

    const firestoreMatch = await fetchDriverByPhoneFromFirestore(cleanPhone);
    const localMatch = globalState.drivers.find(
      (d) => !d.isDeleted && d.phone && normalizePhone(d.phone) === cleanPhone
    );
    const driver = firestoreMatch?.driver || localMatch;

    if (!driver || driver.isDeleted) {
      return {
        success: false,
        message: 'Nomor HP driver tidak ditemukan.',
      };
    }

    const cachedSecrets = getCachedDriverSecrets(driver.id);
    const recoveryCodeHash =
      firestoreMatch?.recoveryCodeHash || cachedSecrets.recoveryCodeHash || '';
    const recoveryCodeExpiresAt =
      firestoreMatch?.recoveryCodeExpiresAt || cachedSecrets.recoveryCodeExpiresAt || '';

    try {
      const res = await fetch('/api/driver/recover-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: cleanPhone,
          plateNumber: data.plateNumber || '',
          fullName: data.fullName || '',
          recoveryCode: data.recoveryCode || '',
          storedPhone: driver.phone,
          storedPlate: driver.plateNumber || driver.plate || '',
          storedName: driver.name || '',
          storedRecoveryCodeHash: recoveryCodeHash,
          storedRecoveryExpiresAt: recoveryCodeExpiresAt,
          newPassword: data.newPassword,
          confirmPassword: data.confirmPassword,
        }),
      });
      const resp = await res.json().catch(() => null);
      if (!res.ok || !resp?.ok || !resp?.passwordHash) {
        return {
          success: false,
          message: resp?.message || 'Pemulihan kata sandi gagal.',
        };
      }

      const passwordUpdatedAt = resp.passwordUpdatedAt || new Date().toISOString();
      await updateDriverPasswordHashInFirestore(driver.id, resp.passwordHash, passwordUpdatedAt, true);

      const updatedDriver: DriverProfile = sanitizeDriverForClient({
        ...driver,
        hasPassword: true,
        passwordUpdatedAt,
      });
      globalState.drivers = globalState.drivers.map((d) =>
        d.id === driver.id ? updatedDriver : d
      );
      notify();

      return {
        success: true,
        message:
          'Pemulihan akun berhasil! Kata sandi baru Anda sudah aktif. Silakan masuk dengan kata sandi baru.',
      };
    } catch {
      return {
        success: false,
        message: 'Gagal terhubung ke server pemulihan kata sandi.',
      };
    }
  };

  const generateDriverRecoveryCode = async (
    driverId: string
  ): Promise<{ success: boolean; recoveryCode?: string; expiresAt?: string; message?: string }> => {
    const token = getStoredAdminToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      const res = await fetch('/api/driver/generate-recovery-code', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ driverId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !data?.recoveryCode) {
        return {
          success: false,
          message: data?.message || 'Gagal membuat kode pemulihan di server.',
        };
      }

      await updateDriverRecoveryCodeHashInFirestore(
        driverId,
        data.recoveryCodeHash,
        data.recoveryCodeExpiresAt
      );

      return {
        success: true,
        recoveryCode: data.recoveryCode,
        expiresAt: data.recoveryCodeExpiresAt,
      };
    } catch {
      return {
        success: false,
        message: 'Gagal terhubung ke server Admin untuk membuat kode pemulihan.',
      };
    }
  };

  // Resubmit KTP & SIM A documents if rejected -> writes directly to Firestore
  const resubmitDriverDocuments = async (driverId: string, ktpUrl: string, simUrl: string) => {
    const driver = globalState.drivers.find((d) => d.id === driverId);
    if (!driver) return;

    const updatedDriver: DriverProfile = {
      ...driver,
      ktpPhotoUrl: ktpUrl,
      ktpUrl,
      simPhotoUrl: simUrl,
      simUrl,
      status: 'MENUNGGU',
      rawStatus: 'waiting_approval',
      rejectionReason: undefined,
      isOnline: false,
    };
    globalState.drivers = globalState.drivers.map((d) => (d.id === driverId ? updatedDriver : d));
    if (globalState.currentUser?.id === driverId) {
      globalState.currentUser = updatedDriver;
    }
    notify();

    await saveDriverToFirestore(updatedDriver);
  };

  // Admin Driver Actions -> directly update Firestore via updateDoc
  const approveDriver = (driverId: string) => {
    const driver = globalState.drivers.find((d) => d.id === driverId);
    if (!driver) return;

    const currentBal = Number(driver.saldo ?? driver.balance ?? 0);
    const canBeOnline = currentBal >= MIN_DRIVER_ACTIVE_BALANCE;

    const updatedDriver: DriverProfile = {
      ...driver,
      status: 'AKTIF',
      rawStatus: 'approved',
      isOnline: canBeOnline,
      rejectionReason: undefined,
    };
    globalState.drivers = globalState.drivers.map((d) => (d.id === driverId ? updatedDriver : d));

    updateDriverStatusInFirestore(driverId, 'approved', {
      isOnline: canBeOnline,
      rejectionReason: '',
    }).catch(console.error);

    sendWhatsAppNotification(
      driver.phone,
      driver.name,
      'driver',
      'Selamat Anda Diterima!',
      `Selamat ${driver.name}, dokumen KTP & SIM A Anda telah DISETUJUI oleh Admin M3CAR. ${
        canBeOnline
          ? 'Sekarang Anda dapat langsung menerima order penumpang!'
          : 'Silakan isi saldo terlebih dahulu pada menu Isi Saldo agar dapat mengaktifkan status Siap Terima Order.'
      }`,
      'acc'
    );

    if (globalState.currentUser?.id === driverId) {
      globalState.currentUser = {
        ...globalState.currentUser,
        status: 'AKTIF',
        rawStatus: 'approved',
        isOnline: canBeOnline,
      } as DriverProfile;
    }

    playDriverAcceptedSound();
    notify();
  };

  const rejectDriver = (driverId: string, reason: string) => {
    const driver = globalState.drivers.find((d) => d.id === driverId);
    if (!driver) return;

    const updatedDriver: DriverProfile = {
      ...driver,
      status: 'DITOLAK',
      rawStatus: 'rejected',
      rejectionReason: reason,
      isOnline: false,
    };
    globalState.drivers = globalState.drivers.map((d) => (d.id === driverId ? updatedDriver : d));

    updateDriverStatusInFirestore(driverId, 'rejected', {
      isOnline: false,
      rejectionReason: reason,
    }).catch(console.error);

    sendWhatsAppNotification(
      driver.phone,
      driver.name,
      'driver',
      'Pendaftaran Ditolak',
      `Maaf ${driver.name}, verifikasi dokumen KTP/SIM A Driver M3CAR Anda DITOLAK. Alasan: ${reason}. Silakan unggah ulang foto KTP & SIM A yang jelas.`,
      'reject'
    );

    if (globalState.currentUser?.id === driverId) {
      globalState.currentUser = {
        ...globalState.currentUser,
        status: 'DITOLAK',
        rawStatus: 'rejected',
        rejectionReason: reason,
        isOnline: false,
      } as DriverProfile;
    }

    notify();
  };

  const blockDriver = (driverId: string, reason: string) => {
    const driver = globalState.drivers.find((d) => d.id === driverId);
    if (!driver) return;

    const updatedDriver = {
      ...driver,
      status: 'DIBLOKIR' as const,
      rawStatus: 'blocked',
      blockReason: reason,
      isOnline: false,
    };
    globalState.drivers = globalState.drivers.map((d) => (d.id === driverId ? updatedDriver : d));

    updateDriverStatusInFirestore(driverId, 'blocked', {
      isOnline: false,
      blockReason: reason,
    }).catch(console.error);

    sendWhatsAppNotification(
      driver.phone,
      driver.name,
      'driver',
      'Akun Driver Diblokir',
      `Pemberitahuan: Akun Mitra Driver M3Car atas nama ${driver.name} telah DIBLOKIR oleh Admin Pusat karena: ${reason}. Anda tidak dapat menerima order perjalanan. Hubungi Admin di 085811594114 untuk klarifikasi.`,
      'block'
    );

    if (globalState.currentUser?.id === driverId) {
      globalState.currentUser = {
        ...globalState.currentUser,
        status: 'DIBLOKIR',
        rawStatus: 'blocked',
        blockReason: reason,
        isOnline: false,
      } as DriverProfile;
    }

    notify();
  };

  const unblockDriver = (driverId: string) => {
    const driver = globalState.drivers.find((d) => d.id === driverId);
    if (!driver) return;

    const currentBal = Number(driver.saldo ?? driver.balance ?? 0);
    const canBeOnline = currentBal >= MIN_DRIVER_ACTIVE_BALANCE;

    const updatedDriver = {
      ...driver,
      status: 'AKTIF' as const,
      rawStatus: 'approved',
      blockReason: undefined,
      isOnline: canBeOnline,
    };
    globalState.drivers = globalState.drivers.map((d) => (d.id === driverId ? updatedDriver : d));

    updateDriverStatusInFirestore(driverId, 'approved', {
      isOnline: canBeOnline,
      blockReason: '',
    }).catch(console.error);

    sendWhatsAppNotification(
      driver.phone,
      driver.name,
      'driver',
      'Blokir Akun Dibuka',
      `Halo ${driver.name}, blokir akun Driver M3Car Anda telah DIBUKA oleh Admin. Anda sekarang dapat kembali online dan menerima order penumpang.`,
      'unblock'
    );

    if (globalState.currentUser?.id === driverId) {
      globalState.currentUser = {
        ...globalState.currentUser,
        status: 'AKTIF',
        rawStatus: 'approved',
        blockReason: undefined,
        isOnline: canBeOnline,
      } as DriverProfile;
    }

    notify();
  };

  const syncDriverSnapshot = (driverId: string, partial: Partial<DriverProfile>) => {
    const existing = globalState.drivers.find((d) => d.id === driverId);
    const merged: DriverProfile = existing
      ? { ...existing, ...partial, id: driverId }
      : ({ id: driverId, role: 'driver', ...partial } as DriverProfile);

    globalState.drivers = existing
      ? globalState.drivers.map((d) => (d.id === driverId ? merged : d))
      : [merged, ...globalState.drivers];

    if (globalState.currentUser?.id === driverId) {
      globalState.currentUser = merged;
    }
    notify();
  };

  // Driver toggles Online / Offline -> validates min balance & calls updateDoc in Firestore
  const setDriverOnlineStatus = async (
    driverId: string,
    isOnline: boolean
  ): Promise<{ success: boolean; needsTopUp?: boolean; message?: string }> => {
    const driver = globalState.drivers.find((d) => d.id === driverId);
    if (!driver) return { success: false, message: 'Data driver tidak ditemukan.' };

    if (driver.status !== 'AKTIF' && isOnline) {
      return { success: false, message: 'Hanya driver berstatus AKTIF yang dapat ONLINE.' };
    }

    const currentBal = Number(driver.saldo ?? driver.balance ?? 0);
    if (isOnline && currentBal < MIN_DRIVER_ACTIVE_BALANCE) {
      if (driver.isOnline) {
        updateDriverOnlineStatusInFirestore(driverId, false).catch(console.error);
      }
      return {
        success: false,
        needsTopUp: true,
        message: `Saldo Anda Rp ${currentBal.toLocaleString('id-ID')} (minimal Rp ${MIN_DRIVER_ACTIVE_BALANCE.toLocaleString('id-ID')}). Silakan ajukan Isi Saldo terlebih dahulu sebelum mengaktifkan status Siap Terima Order.`,
      };
    }

    const updatedDriver = { ...driver, isOnline };
    globalState.drivers = globalState.drivers.map((d) => (d.id === driverId ? updatedDriver : d));
    if (globalState.currentUser?.id === driverId) {
      globalState.currentUser = { ...globalState.currentUser, isOnline } as DriverProfile;
    }
    notify();

    try {
      await updateDriverOnlineStatusInFirestore(driverId, isOnline);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Gagal memperbarui status online ke Firestore.',
      };
    }
  };

  // Driver updates real-time GPS or area location -> directly calls updateDoc on drivers & active orders in Firestore
  const updateDriverLocation = async (
    driverId: string,
    location: { lat?: number; lng?: number; lokasi?: string }
  ): Promise<{ success: boolean; message?: string }> => {
    const driver = globalState.drivers.find((d) => d.id === driverId);
    const nowIso = new Date().toISOString();
    const lokasiStr =
      location.lokasi ||
      (location.lat !== undefined && location.lng !== undefined
        ? `GPS (${location.lat.toFixed(5)}, ${location.lng.toFixed(5)})`
        : '');

    if (driver) {
      const updatedDriver: DriverProfile = {
        ...driver,
        lat: location.lat ?? driver.lat,
        lng: location.lng ?? driver.lng,
        lokasi: lokasiStr || driver.lokasi,
        currentLocation: lokasiStr || driver.currentLocation,
        locationUpdatedAt: nowIso,
      };
      globalState.drivers = globalState.drivers.map((d) => (d.id === driverId ? updatedDriver : d));
      if (globalState.currentUser?.id === driverId) {
        globalState.currentUser = updatedDriver;
      }
      notify();
    }

    try {
      await updateDriverLocationInFirestore(driverId, {
        lat: location.lat,
        lng: location.lng,
        lokasi: lokasiStr,
      });

      // Also sync driver's live location to any active orders assigned to this driver
      const activeAssignedOrders = globalState.orders.filter(
        (o) =>
          !o.isDeleted &&
          o.driverId === driverId &&
          ['DRIVER_DITEMUKAN', 'DRIVER_OTW', 'SUDAH_JEMPUT', 'SUDAH_SAMPAI'].includes(o.status)
      );
      for (const ord of activeAssignedOrders) {
        await updateOrderInFirestore(ord.id, {
          driverLat: location.lat,
          driverLng: location.lng,
          driverLocationText: lokasiStr,
        });
      }
      return { success: true };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Gagal menyimpan lokasi ke Firestore.',
      };
    }
  };

  // Order Flow
  const createOrder = (orderData: {
    customerName: string;
    customerPhone: string;
    pickupLocation: string;
    destination: string;
    date: string;
    time: string;
    passengers: number;
    region?: RegionZone;
    pricePerPerson: number;
    totalPrice: number;
    route?: string;
    patokan?: string;
    pickupLat?: number;
    pickupLng?: number;
    mapsUrl?: string;
    dayName?: string;
    paymentMethod?: 'TUNAI' | 'TRANSFER_DRIVER' | 'QRIS_RTB' | 'M3CAR_PAY';
    isOutsideIndonesia?: boolean;
    country?: string;
    deviationKm?: number;
    deviationFee?: number;
    basePrice?: number;
  }) => {
    const isLongTrip = (orderData.region || 'jakarta') !== 'luar_jabodetabek';
    const rate = isLongTrip ? globalState.settings.commissionRates.longTrip : globalState.settings.commissionRates.shortTrip;
    const commissionAmount = Math.round(orderData.totalPrice * rate);
    const driverEarnings = orderData.totalPrice - commissionAmount;

    const geofence = checkIsOutsideIndonesia({
      address: orderData.pickupLocation,
      lat: orderData.pickupLat,
      lng: orderData.pickupLng,
      country: orderData.country,
    });
    const isOutsideIndonesia = orderData.isOutsideIndonesia ?? geofence.isOutsideIndonesia;
    const country = orderData.country || geofence.countryName;

    const dev = calculateCorridorDeviation({
      lat: orderData.pickupLat,
      lng: orderData.pickupLng,
      address: orderData.pickupLocation,
    });
    const deviationKm = orderData.deviationKm ?? dev.deviationKm;
    const deviationFee = orderData.deviationFee ?? dev.deviationFee;
    const basePrice = orderData.basePrice ?? orderData.passengers * (orderData.pricePerPerson || 270000);

    const derivedCustomerId =
      globalState.currentUser?.role === 'customer'
        ? globalState.currentUser.id
        : `cust-${orderData.customerPhone.replace(/\D/g, '')}`;

    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      orderNumber: `M3-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`,
      customerId: derivedCustomerId,
      customerName: orderData.customerName,
      customerPhone: orderData.customerPhone,
      pickupLocation: orderData.pickupLocation,
      dari: orderData.pickupLocation,
      pickupLat: orderData.pickupLat,
      pickupLng: orderData.pickupLng,
      destination: orderData.destination,
      ke: orderData.destination,
      route: orderData.route || `${orderData.pickupLocation} ➔ ${orderData.destination}`,
      patokan: orderData.patokan || '',
      mapsUrl:
        orderData.mapsUrl ||
        (orderData.pickupLat && orderData.pickupLng
          ? `https://www.google.com/maps?q=${orderData.pickupLat},${orderData.pickupLng}`
          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(orderData.pickupLocation)}`),
      dayName: orderData.dayName,
      date: orderData.date,
      time: orderData.time,
      passengers: orderData.passengers,
      region: orderData.region || 'jakarta',
      pricePerPerson: orderData.pricePerPerson,
      basePrice,
      deviationKm,
      deviationFee,
      totalPrice: orderData.totalPrice,
      harga: orderData.totalPrice,
      commissionRate: rate,
      commissionAmount,
      driverEarnings,
      tollRoute: 'Tol Jakarta-Merak + Tol Serang-Panimbang 83,6 km',
      eta: isOutsideIndonesia ? 'Di Luar Wilayah Layanan' : '6 jam 30 menit',
      status: 'MENCARI_DRIVER',
      isOutsideIndonesia,
      country,
      paymentMethod: orderData.paymentMethod || 'TUNAI',
      paymentStatus: 'BELUM_BAYAR',
      createdAt: new Date().toLocaleString('id-ID'),
      dispatchTimeRemaining: 60,
    };

    globalState.orders = [newOrder, ...globalState.orders];

    saveCustomerToFirestore({
      id: derivedCustomerId,
      nama: orderData.customerName,
      no_hp: orderData.customerPhone,
      alamat: orderData.pickupLocation,
      tanggal_daftar: new Date().toLocaleString('id-ID'),
    }).catch(console.error);

    saveOrderToFirestore(newOrder).catch(console.error);

    // Trigger throttled auto history cleanup when a new transaction is created
    void runAutoCleanupInternal(false);

    playOrderAlertChime();

    sendWhatsAppNotification(
      globalState.settings.adminPhone,
      'Admin M3Car',
      'admin',
      'Pesanan Baru Masuk!',
      `Order baru ${newOrder.orderNumber}: ${orderData.customerName} (${orderData.passengers} org) rute ${orderData.pickupLocation} -> ${orderData.destination}. Total: Rp ${orderData.totalPrice.toLocaleString('id-ID')}`,
      'order'
    );

    notify();
    return newOrder;
  };

  const cancelOrderByCustomer = (orderId: string) => {
    const order = globalState.orders.find((o) => o.id === orderId);
    if (!order) return { success: false, message: 'Pesanan tidak ditemukan.' };

    if (order.status !== 'MENCARI_DRIVER') {
      return { success: false, message: 'Pesanan sudah diterima oleh Driver dan tidak dapat dibatalkan otomatis.' };
    }

    const updatedOrder = { ...order, status: 'DIBATALKAN' as const };
    globalState.orders = globalState.orders.map((o) => (o.id === orderId ? updatedOrder : o));
    saveOrderToFirestore(updatedOrder).catch(console.error);

    notify();
    return { success: true };
  };

  const cancelOrderByAdmin = (orderId: string, reason?: string) => {
    const order = globalState.orders.find((o) => o.id === orderId);
    if (!order) return { success: false, message: 'Pesanan tidak ditemukan.' };

    const cancelReason = reason || 'Ditolak / Dibatalkan oleh Admin Pusat M3Car';
    const updatedOrder: Order = {
      ...order,
      status: 'DIBATALKAN' as const,
    };
    globalState.orders = globalState.orders.map((o) => (o.id === orderId ? updatedOrder : o));
    saveOrderToFirestore(updatedOrder).catch(console.error);

    sendWhatsAppNotification(
      order.customerPhone,
      order.customerName,
      'customer',
      'Pesanan Dibatalkan Admin',
      `Halo ${order.customerName}, pesanan ${order.orderNumber} telah DITOLAK / DIBATALKAN oleh Admin Pusat M3Car. Alasan: ${cancelReason}.`,
      'system'
    );

    notify();
    return { success: true };
  };

  const acceptOrderByDriver = (driverId: string, orderId: string) => {
    const driver = globalState.drivers.find((d) => d.id === driverId);
    const order = globalState.orders.find((o) => o.id === orderId);

    if (!driver || !order) return { success: false, message: 'Data tidak ditemukan.' };
    if (order.status !== 'MENCARI_DRIVER') {
      return { success: false, message: 'Order ini sudah diambil driver lain atau telah dibatalkan.' };
    }

    const geofence = checkIsOutsideIndonesia({
      address: order.pickupLocation,
      lat: order.pickupLat,
      lng: order.pickupLng,
      country: order.country,
    });
    if (order.isOutsideIndonesia || geofence.isOutsideIndonesia) {
      return {
        success: false,
        message: 'LOKASI DI LUAR JANGKAUAN! Order ini berada di luar wilayah Indonesia dan ditolak otomatis.',
      };
    }

    const currentBal = driver.saldo ?? driver.balance ?? 0;
    if (currentBal < order.commissionAmount) {
      return {
        success: false,
        isInsufficientBalance: true,
        required: order.commissionAmount,
        currentBalance: currentBal,
        message: `Saldo Kurang! Saldo Anda Rp ${currentBal.toLocaleString('id-ID')}, komisi yang dibutuhkan Rp ${order.commissionAmount.toLocaleString('id-ID')}. Silakan isi saldo M3Car Pay terlebih dahulu.`,
      };
    }

    const newBalance = currentBal - order.commissionAmount;
    const updatedDriver = {
      ...driver,
      balance: newBalance,
      saldo: newBalance,
      totalTrips: (driver.totalTrips || 0) + 1,
    };
    globalState.drivers = globalState.drivers.map((d) => (d.id === driverId ? updatedDriver : d));
    saveDriverToFirestore(updatedDriver).catch(console.error);

    const newTx: WalletTransaction = {
      id: `tx-${Date.now()}`,
      driverId: driver.id,
      date: new Date().toLocaleString('id-ID'),
      type: 'POTONGAN_KOMISI',
      amount: -order.commissionAmount,
      balanceAfter: newBalance,
      description: `Potongan Komisi ${((order.commissionRate || 0.12) * 100).toFixed(0)}% Order ${order.orderNumber} (${order.pickupLocation} -> ${order.destination})`,
      orderId: order.id,
      paymentMethod: 'SYSTEM_COMMISSION',
      status: 'BERHASIL',
    };
    globalState.transactions = [newTx, ...globalState.transactions];
    saveTransactionToFirestore(newTx, driver.phone).catch(console.error);

    const updatedOrder: Order = {
      ...order,
      status: 'DRIVER_OTW' as const,
      driverId: driver.id,
      driverName: driver.name,
      driverPhone: driver.phone,
      driverPlate: driver.plateNumber,
      driverCar: driver.carModel,
      driverLat: driver.lat,
      driverLng: driver.lng,
      driverLocationText: driver.lokasi || driver.currentLocation,
      driverLocationProgress: 15,
      acceptedAt: new Date().toLocaleString('id-ID'),
    };
    globalState.orders = globalState.orders.map((o) => (o.id === orderId ? updatedOrder : o));
    saveOrderToFirestore(updatedOrder).catch(console.error);

    if (globalState.currentUser?.id === driverId) {
      globalState.currentUser = {
        ...globalState.currentUser,
        balance: newBalance,
        saldo: newBalance,
      } as DriverProfile;
    }

    sendWhatsAppNotification(
      order.customerPhone,
      order.customerName,
      'customer',
      'Driver M3Car Ditemukan & Menuju Anda!',
      `Halo ${order.customerName}, pesanan ${order.orderNumber} telah DITERIMA oleh Driver ${driver.name} (Mobil ${driver.carModel}, Plat ${driver.plateNumber}). Driver sedang OTW menuju titik jemput Anda.`,
      'order'
    );

    playSuccessChime();
    notify();
    return { success: true };
  };

  const rejectOrderByDriver = (driverId: string, orderId: string) => {
    const onlineDrivers = globalState.drivers.filter((d) => d.status === 'AKTIF' && d.isOnline && d.id !== driverId);
    const order = globalState.orders.find((o) => o.id === orderId);
    if (!order || order.status !== 'MENCARI_DRIVER') return;

    if (onlineDrivers.length > 0) {
      const nextDriver = onlineDrivers[0];
      sendWhatsAppNotification(
        nextDriver.phone,
        nextDriver.name,
        'driver',
        'Pesanan Diteruskan ke Anda!',
        `Order ${order.orderNumber} dialihkan ke Anda. Segera buka aplikasi M3Car untuk menerima order!`,
        'order'
      );
      playOrderAlertChime();
    }

    notify();
  };

  const updateDriverProfile = (driverId: string, data: { avatarUrl?: string }) => {
    const driver = globalState.drivers.find((d) => d.id === driverId);
    if (!driver) return { success: false, message: 'Driver tidak ditemukan' };

    const updatedDriver: DriverProfile = {
      ...driver,
      avatarUrl: data.avatarUrl !== undefined ? data.avatarUrl : driver.avatarUrl,
    };

    globalState.drivers = globalState.drivers.map((d) => (d.id === driverId ? updatedDriver : d));
    saveDriverToFirestore(updatedDriver).catch(console.error);

    if (globalState.currentUser?.id === driverId) {
      globalState.currentUser = updatedDriver;
    }

    notify();
    return { success: true, driver: updatedDriver };
  };

  const adminUpdateDriver = (
    driverId: string,
    data: { name?: string; phone?: string; plateNumber?: string; carModel?: string }
  ) => {
    const driver = globalState.drivers.find((d) => d.id === driverId);
    if (!driver) return { success: false, message: 'Driver tidak ditemukan' };

    const updatedDriver: DriverProfile = {
      ...driver,
      name: data.name !== undefined ? data.name.trim() : driver.name,
      phone: data.phone !== undefined ? data.phone.trim() : driver.phone,
      plateNumber: data.plateNumber !== undefined ? data.plateNumber.trim().toUpperCase() : driver.plateNumber,
      carModel: data.carModel !== undefined ? data.carModel.trim() : driver.carModel,
    };

    globalState.drivers = globalState.drivers.map((d) => (d.id === driverId ? updatedDriver : d));
    saveDriverToFirestore(updatedDriver).catch(console.error);

    if (globalState.currentUser?.id === driverId) {
      globalState.currentUser = updatedDriver;
    }

    notify();
    return { success: true, driver: updatedDriver };
  };

  const updateCustomerProfile = (
    customerId: string,
    data: { name: string; phone: string; avatarUrl?: string }
  ) => {
    const cleanName = data.name.trim() || 'Penumpang M3Car';
    const cleanPhone = data.phone.trim();

    const updatedCustDoc: CustomerData = {
      id: customerId,
      nama: cleanName,
      no_hp: cleanPhone,
      name: cleanName,
      phone: cleanPhone,
      avatarUrl: data.avatarUrl,
      foto_profil: data.avatarUrl,
      tanggal_daftar: new Date().toLocaleString('id-ID'),
      role: 'customer',
    };

    saveCustomerToFirestore(updatedCustDoc).catch(console.error);

    const updatedCustomers = globalState.customers.map((c) =>
      c.id === customerId ? { ...c, ...updatedCustDoc } : c
    );
    if (!updatedCustomers.some((c) => c.id === customerId)) {
      updatedCustomers.unshift(updatedCustDoc);
    }
    globalState.customers = updatedCustomers;

    const custUser: User = {
      id: customerId,
      name: cleanName,
      phone: cleanPhone,
      role: 'customer',
      avatarUrl: data.avatarUrl,
    };
    globalState.currentUser = custUser;
    setStoredCustomerUser(custUser);

    notify();
    return { success: true, user: custUser };
  };

  const advanceOrderStatus = (orderId: string, nextStatus: OrderStatus) => {
    const target = globalState.orders.find((o) => o.id === orderId);
    if (!target) return;

    if (nextStatus === 'SUDAH_JEMPUT') {
      const updatedOrder: Order = {
        ...target,
        status: 'SUDAH_JEMPUT',
        driverLocationProgress: 50,
      };
      globalState.orders = globalState.orders.map((o) => (o.id === orderId ? updatedOrder : o));
      updateOrderInFirestore(orderId, {
        status: 'SUDAH_JEMPUT',
        status_db: 'dalam_perjalanan',
        driverLocationProgress: 50,
      }).catch(console.error);

      sendWhatsAppNotification(
        target.customerPhone,
        target.customerName,
        'customer',
        'Driver Sudah Jemput!',
        `Halo ${target.customerName}, Driver ${target.driverName || 'Mitra M3Car'} (${target.driverPlate || ''}) sudah menjemput Anda. Selamat menikmati perjalanan!`,
        'order'
      );
      playPassengerNotificationChime();
      notify();
      return;
    }

    if (nextStatus === 'SUDAH_SAMPAI') {
      const updatedOrder: Order = {
        ...target,
        status: 'SUDAH_SAMPAI',
        driverLocationProgress: 95,
      };
      globalState.orders = globalState.orders.map((o) => (o.id === orderId ? updatedOrder : o));
      updateOrderInFirestore(orderId, {
        status: 'SUDAH_SAMPAI',
        status_db: 'dalam_perjalanan',
        driverLocationProgress: 95,
      }).catch(console.error);

      sendWhatsAppNotification(
        target.customerPhone,
        target.customerName,
        'customer',
        'Sudah Sampai di Tujuan!',
        `Halo ${target.customerName}, Anda telah sampai di tujuan: ${target.destination}. Pastikan tidak ada barang bawaan Anda yang tertinggal.`,
        'order'
      );
      playPassengerNotificationChime();
      notify();
      return;
    }

    if (nextStatus === 'SELESAI') {
      if (target.driverId) {
        const driver = globalState.drivers.find((d) => d.id === target.driverId);
        if (driver) {
          const bonusEarnings =
            target.paymentMethod === 'QRIS_RTB' || target.paymentMethod === 'M3CAR_PAY'
              ? target.driverEarnings
              : 0;
          const updatedBalance = (driver.balance || 0) + bonusEarnings;
          const updatedDriver: DriverProfile = {
            ...driver,
            balance: updatedBalance,
            saldo: updatedBalance,
            totalTrips: (driver.totalTrips || 0) + 1,
          };
          globalState.drivers = globalState.drivers.map((d) => (d.id === driver.id ? updatedDriver : d));
          saveDriverToFirestore(updatedDriver).catch(console.error);

          if (bonusEarnings > 0) {
            const compTx: WalletTransaction = {
              id: `tx-earn-${Date.now()}`,
              driverId: driver.id,
              date: new Date().toLocaleString('id-ID'),
              type: 'ISI_SALDO',
              amount: bonusEarnings,
              balanceAfter: updatedBalance,
              description: `Pendapatan Bersih Order Selesai ${target.orderNumber}`,
              orderId: target.id,
              paymentMethod: 'SYSTEM_COMMISSION',
              status: 'BERHASIL',
            };
            globalState.transactions = [compTx, ...globalState.transactions];
            saveTransactionToFirestore(compTx, driver.phone).catch(console.error);
          }
        }
      }

      const now = new Date().toLocaleString('id-ID');
      const omsetItem: KeuanganAdminItem = {
        id: `tx-omset-${target.id}`,
        id_transaksi: `TX-OMSET-${target.orderNumber}`,
        tanggal: now,
        jenis: 'masuk',
        keterangan: `Omset Order Selesai ${target.orderNumber} (${target.pickupLocation} ➔ ${target.destination})`,
        jumlah_rp: target.totalPrice,
        id_order: target.id,
        nama_driver: target.driverName,
        nama_customer: target.customerName,
        createdAt: new Date().toISOString(),
      };

      const komisiItem: KeuanganAdminItem = {
        id: `tx-komisi-${target.id}`,
        id_transaksi: `TX-KOMISI-${target.orderNumber}`,
        tanggal: now,
        jenis: 'masuk',
        keterangan: `Komisi Admin ${Math.round((target.commissionRate || 0.12) * 100)}% Order ${target.orderNumber}`,
        jumlah_rp: target.commissionAmount,
        id_order: target.id,
        nama_driver: target.driverName,
        nama_customer: target.customerName,
        createdAt: new Date().toISOString(),
      };

      globalState.keuanganAdmin = [komisiItem, omsetItem, ...globalState.keuanganAdmin];
      saveKeuanganAdminToFirestore(omsetItem).catch(console.error);
      saveKeuanganAdminToFirestore(komisiItem).catch(console.error);

      sendWhatsAppNotification(
        target.customerPhone,
        target.customerName,
        'customer',
        'Perjalanan Selesai!',
        `Halo ${target.customerName}, perjalanan Anda (${target.orderNumber}) telah SELESAI. Terima kasih telah menggunakan layanan M3CAR!`,
        'order'
      );

      const completedAt = new Date().toISOString();
      const finishedOrder: Order = {
        ...target,
        status: 'SELESAI',
        completedAt,
      };

      globalState.orders = globalState.orders.map((o) => (o.id === orderId ? finishedOrder : o));
      updateOrderInFirestore(orderId, {
        status: 'SELESAI',
        status_db: 'selesai',
        completedAt,
        driverLocationProgress: 100,
      }).catch(console.error);

      // Archive completed order financial record into `laporan_keuangan` so 1-year reports stay intact
      archiveOrderToLaporanKeuangan(finishedOrder)
        .then((archivedItem) => {
          globalState.laporanKeuangan = [
            archivedItem,
            ...globalState.laporanKeuangan.filter((x) => x.id !== archivedItem.id),
          ];
          notify();
        })
        .catch(console.error);

      playSuccessChime();
      playPassengerNotificationChime();
      notify();
      return;
    }

    const nextProgress = Math.min(90, (target.driverLocationProgress || 20) + 30);
    const updatedOrder: Order = {
      ...target,
      status: nextStatus,
      driverLocationProgress: nextProgress,
    };
    globalState.orders = globalState.orders.map((o) => (o.id === orderId ? updatedOrder : o));
    updateOrderInFirestore(orderId, {
      status: nextStatus,
      driverLocationProgress: nextProgress,
    }).catch(console.error);
    notify();
  };

  const confirmOrderPayment = (
    orderId: string,
    paymentMethod?: 'TUNAI' | 'TRANSFER_DRIVER' | 'QRIS_RTB' | 'M3CAR_PAY'
  ) => {
    const order = globalState.orders.find((o) => o.id === orderId);
    if (!order) return;

    const method = paymentMethod || order.paymentMethod || 'TUNAI';
    const paidAt = new Date().toLocaleString('id-ID');
    const updatedOrder: Order = {
      ...order,
      paymentMethod: method,
      paymentStatus: 'LUNAS',
      paidAt,
    };

    globalState.orders = globalState.orders.map((o) => (o.id === orderId ? updatedOrder : o));
    updateOrderInFirestore(orderId, {
      paymentMethod: method,
      paymentStatus: 'LUNAS',
      paidAt,
    }).catch(console.error);

    archiveOrderToLaporanKeuangan(updatedOrder)
      .then((archivedItem) => {
        globalState.laporanKeuangan = [
          archivedItem,
          ...globalState.laporanKeuangan.filter((x) => x.id !== archivedItem.id),
        ];
        notify();
      })
      .catch(console.error);

    playSuccessChime();
    notify();
  };

  const topUpDriverSaldo = async (
    driverId: string,
    nominal: number,
    paymentMethod: 'WA_TRANSFER' | 'QRIS' = 'WA_TRANSFER'
  ): Promise<{ success: boolean; newBalance?: number; message?: string }> => {
    let driver = globalState.drivers.find((d) => d.id === driverId);
    if (!driver) {
      driver = (await fetchDriverByIdFromFirestore(driverId)) || undefined;
    }
    if (!driver) return { success: false, message: 'Driver tidak ditemukan.' };

    const addNominal = Number(nominal) || 0;
    const newBalance = Number(driver.saldo ?? driver.balance ?? 0) + addNominal;
    const updatedDriver = { ...driver, balance: newBalance, saldo: newBalance };
    globalState.drivers = globalState.drivers.some((d) => d.id === driverId)
      ? globalState.drivers.map((d) => (d.id === driverId ? updatedDriver : d))
      : [updatedDriver, ...globalState.drivers];

    try {
      await updateDriverBalanceInFirestore(driverId, newBalance);
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Gagal memperbarui saldo driver di Firestore.',
      };
    }

    const newTx: WalletTransaction = {
      id: `tx-${Date.now()}`,
      driverId: driver.id,
      date: new Date().toLocaleString('id-ID'),
      type: 'ISI_SALDO',
      amount: addNominal,
      balanceAfter: newBalance,
      description: `Top Up Saldo M3Car Pay Rp ${addNominal.toLocaleString('id-ID')}`,
      paymentMethod,
      status: 'BERHASIL',
    };
    globalState.transactions = [newTx, ...globalState.transactions];
    saveTransactionToFirestore(newTx, driver.phone).catch(console.error);

    if (globalState.currentUser?.id === driverId) {
      globalState.currentUser = {
        ...globalState.currentUser,
        balance: newBalance,
        saldo: newBalance,
      } as DriverProfile;
    }

    sendWhatsAppNotification(
      driver.phone,
      driver.name,
      'driver',
      'Top Up Saldo M3Car Pay Disetujui',
      `Pengajuan Isi Saldo Rp ${addNominal.toLocaleString('id-ID')} telah DISETUJUI Admin! Total saldo aktif Anda sekarang Rp ${newBalance.toLocaleString('id-ID')}.`,
      'system'
    );

    playSuccessChime();
    notify();
    return { success: true, newBalance };
  };

  const createTopUpRequest = async (
    driverId: string,
    amount: number,
    receiptPhotoUrl?: string,
    receiptAmount?: number,
    receiptTime?: string,
    receiptTimestamp?: number,
    timeDiffMinutes?: number,
    receiptStatus?: 'RESIT_BARU' | 'RESIT_LAMA',
    note?: string
  ): Promise<{ success: boolean; request?: DriverTopUpRequest; message?: string }> => {
    const driver = globalState.drivers.find((d) => d.id === driverId);
    const bank = globalState.settings.companyBank || {
      bankName: 'SeaBank',
      accountNumber: '901102051050',
      accountHolder: 'Ali Husen - CV. ROYAL TRANS BERKAH GROUP',
    };

    const nowMs = Date.now();
    const now = new Date(nowMs).toLocaleString('id-ID');
    const newReq: DriverTopUpRequest = {
      id: `topup-${nowMs}-${Math.random().toString(36).substring(2, 6)}`,
      driverId,
      driverName: driver?.name || 'Driver',
      driverPhone: driver?.phone || '',
      driverPlate: driver?.plateNumber || driver?.plate || '',
      amount: Number(amount) || 0,
      receiptPhotoUrl,
      receiptAmount: receiptAmount ?? amount,
      receiptTime: receiptTime || now.split(' ')[1] || 'Baru Saja',
      receiptTimestamp: receiptTimestamp || nowMs,
      submitTime: now,
      timeDiffMinutes: timeDiffMinutes ?? 0,
      receiptStatus: receiptStatus || 'RESIT_BARU',
      bankName: bank.bankName,
      accountNumber: bank.accountNumber,
      accountHolder: bank.accountHolder,
      createdAt: now,
      createdAtMs: nowMs,
      status: 'MENUNGGU',
      statusLabel: 'Menunggu Konfirmasi',
      note: note?.trim() || undefined,
    };

    try {
      await saveTopUpRequestToFirestore(newReq);
      globalState.topUpRequests = [newReq, ...globalState.topUpRequests.filter((r) => r.id !== newReq.id)];
      notify();
      return { success: true, request: newReq };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Gagal mengirim pengajuan isi saldo ke Cloud Firestore.',
      };
    }
  };

  const approveTopUpRequest = async (
    requestId: string
  ): Promise<{ success: boolean; message?: string }> => {
    const req = globalState.topUpRequests.find((r) => r.id === requestId);
    if (!req) return { success: false, message: 'Permintaan tidak ditemukan.' };
    if (req.status !== 'MENUNGGU') return { success: false, message: 'Permintaan sudah diproses.' };

    const confirmedAt = new Date().toLocaleString('id-ID');
    const updatedReq: DriverTopUpRequest = {
      ...req,
      status: 'BERHASIL',
      statusLabel: 'Disetujui',
      confirmedAt,
    };

    try {
      await saveTopUpRequestToFirestore(updatedReq);
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Gagal memperbarui status top-up di Firestore.',
      };
    }

    globalState.topUpRequests = globalState.topUpRequests.map((r) =>
      r.id === requestId ? updatedReq : r
    );

    const balanceResult = await topUpDriverSaldo(req.driverId, req.amount, 'WA_TRANSFER');
    if (!balanceResult.success) {
      return balanceResult;
    }

    const finTopUp: KeuanganAdminItem = {
      id: `tx-topup-${req.id}`,
      id_transaksi: `TX-TOPUP-${req.id.slice(-6)}`,
      tanggal: confirmedAt,
      jenis: 'masuk',
      keterangan: `Setoran Top Up Saldo Driver ${req.driverName} (${req.driverPlate})`,
      jumlah_rp: req.amount,
      nama_driver: req.driverName,
      createdAt: new Date().toISOString(),
    };
    globalState.keuanganAdmin = [finTopUp, ...globalState.keuanganAdmin];
    saveKeuanganAdminToFirestore(finTopUp).catch(console.error);

    playSuccessChime();
    notify();
    return {
      success: true,
      message: `Top up Rp ${req.amount.toLocaleString('id-ID')} untuk ${req.driverName} berhasil disetujui & saldo bertambah.`,
    };
  };

  const rejectTopUpRequest = (requestId: string, reason?: string) => {
    const req = globalState.topUpRequests.find((r) => r.id === requestId);
    if (!req) return { success: false, message: 'Permintaan tidak ditemukan.' };

    const updatedReq: DriverTopUpRequest = {
      ...req,
      status: 'DITOLAK',
      statusLabel: 'Ditolak',
      rejectionReason: reason || '',
      confirmedAt: new Date().toLocaleString('id-ID'),
    };

    globalState.topUpRequests = globalState.topUpRequests.map((r) =>
      r.id === requestId ? updatedReq : r
    );
    saveTopUpRequestToFirestore(updatedReq).catch(console.error);

    sendWhatsAppNotification(
      req.driverPhone,
      req.driverName,
      'driver',
      'Top Up Ditolak',
      `Mohon maaf, permohonan top up Rp ${req.amount.toLocaleString('id-ID')} Anda belum dapat dikonfirmasi. ${reason || 'Silakan cek bukti transfer Anda.'}`,
      'system'
    );

    notify();
    return { success: true };
  };

  const topUpDriverSaldoViaQrisTripay = (driverId: string, nominal: number) => {
    return topUpDriverSaldo(driverId, nominal, 'QRIS');
  };

  const addKeuanganTransaction = (item: {
    jenis: 'masuk' | 'keluar';
    keterangan: string;
    jumlah_rp: number;
    nama_driver?: string;
    nama_customer?: string;
  }) => {
    const now = new Date().toLocaleString('id-ID');
    const newFin: KeuanganAdminItem = {
      id: `tx-manual-${Date.now()}`,
      id_transaksi: `TX-M-${Date.now().toString().slice(-6)}`,
      tanggal: now,
      jenis: item.jenis,
      keterangan: item.keterangan,
      jumlah_rp: item.jumlah_rp,
      nama_driver: item.nama_driver || '',
      nama_customer: item.nama_customer || '',
      createdAt: new Date().toISOString(),
    };
    globalState.keuanganAdmin = [newFin, ...globalState.keuanganAdmin];
    saveKeuanganAdminToFirestore(newFin).catch(console.error);
    notify();
    return newFin;
  };

  const moveToTrash = (category: 'order' | 'driver' | 'customer' | 'finance' | 'keuangan', id: string) => {
    const now = new Date().toLocaleString('id-ID');
    if (category === 'order') {
      const target = globalState.orders.find((o) => o.id === id);
      if (!target) return;
      const updatedOrder = { ...target, isDeleted: true, deletedAt: now };
      globalState.orders = globalState.orders.map((o) => (o.id === id ? updatedOrder : o));
      saveOrderToFirestore(updatedOrder).catch(console.error);
    } else if (category === 'driver') {
      const target = globalState.drivers.find((d) => d.id === id);
      if (!target) return;
      const updatedDriver = { ...target, isDeleted: true, deletedAt: now };
      globalState.drivers = globalState.drivers.map((d) => (d.id === id ? updatedDriver : d));
      saveDriverToFirestore(updatedDriver).catch(console.error);
    } else if (category === 'customer') {
      const target = globalState.customers.find((c) => c.id === id || c.no_hp === id || c.phone === id);
      if (!target) return;
      const updatedCust = { ...target, isDeleted: true, deletedAt: now };
      globalState.customers = globalState.customers.map((c) => (c.id === target.id ? updatedCust : c));
      saveCustomerToFirestore(updatedCust).catch(console.error);
    } else if (category === 'finance' || category === 'keuangan') {
      const target = globalState.keuanganAdmin.find((k) => k.id === id);
      if (!target) return;
      const updatedItem = { ...target, isDeleted: true, deletedAt: now };
      globalState.keuanganAdmin = globalState.keuanganAdmin.map((k) => (k.id === id ? updatedItem : k));
      saveKeuanganAdminToFirestore(updatedItem).catch(console.error);
    }
    notify();
  };

  const restoreFromTrash = (category: 'order' | 'driver' | 'customer' | 'finance' | 'keuangan', id: string) => {
    if (category === 'order') {
      const target = globalState.orders.find((o) => o.id === id);
      if (!target) return;
      const updatedOrder = { ...target, isDeleted: false, deletedAt: undefined };
      globalState.orders = globalState.orders.map((o) => (o.id === id ? updatedOrder : o));
      saveOrderToFirestore(updatedOrder).catch(console.error);
    } else if (category === 'driver') {
      const target = globalState.drivers.find((d) => d.id === id);
      if (!target) return;
      const updatedDriver = { ...target, isDeleted: false, deletedAt: undefined };
      globalState.drivers = globalState.drivers.map((d) => (d.id === id ? updatedDriver : d));
      saveDriverToFirestore(updatedDriver).catch(console.error);
    } else if (category === 'customer') {
      const target = globalState.customers.find((c) => c.id === id || c.no_hp === id || c.phone === id);
      if (!target) return;
      const updatedCust = { ...target, isDeleted: false, deletedAt: undefined };
      globalState.customers = globalState.customers.map((c) => (c.id === target.id ? updatedCust : c));
      saveCustomerToFirestore(updatedCust).catch(console.error);
    } else if (category === 'finance' || category === 'keuangan') {
      const target = globalState.keuanganAdmin.find((k) => k.id === id);
      if (!target) return;
      const updatedItem = { ...target, isDeleted: false, deletedAt: undefined };
      globalState.keuanganAdmin = globalState.keuanganAdmin.map((k) => (k.id === id ? updatedItem : k));
      saveKeuanganAdminToFirestore(updatedItem).catch(console.error);
    }
    notify();
  };

  const permanentDelete = (category: 'order' | 'driver' | 'customer' | 'finance' | 'keuangan', id: string) => {
    if (category === 'order') {
      globalState.orders = globalState.orders.filter((o) => o.id !== id);
      deleteOrderFromFirestore(id).catch(console.error);
    } else if (category === 'driver') {
      globalState.drivers = globalState.drivers.filter((d) => d.id !== id);
      deleteDriverFromFirestore(id).catch(console.error);
    } else if (category === 'customer') {
      const target = globalState.customers.find((c) => c.id === id || c.no_hp === id || c.phone === id);
      const targetId = target ? target.id : id;
      globalState.customers = globalState.customers.filter((c) => c.id !== id && c.no_hp !== id && c.phone !== id);
      deleteCustomerFromFirestore(targetId).catch(console.error);
    } else if (category === 'finance' || category === 'keuangan') {
      globalState.keuanganAdmin = globalState.keuanganAdmin.filter((k) => k.id !== id);
      deleteKeuanganAdminFromFirestore(id).catch(console.error);
    }
    notify();
  };

  const emptyTrash = () => {
    const trashedOrders = globalState.orders.filter((o) => o.isDeleted);
    const trashedDrivers = globalState.drivers.filter((d) => d.isDeleted);
    const trashedCust = globalState.customers.filter((c) => c.isDeleted);
    const trashedFin = globalState.keuanganAdmin.filter((f) => f.isDeleted);

    trashedOrders.forEach((o) => deleteOrderFromFirestore(o.id).catch(console.error));
    trashedDrivers.forEach((d) => deleteDriverFromFirestore(d.id).catch(console.error));
    trashedCust.forEach((c) => deleteCustomerFromFirestore(c.id).catch(console.error));
    trashedFin.forEach((f) => deleteKeuanganAdminFromFirestore(f.id).catch(console.error));

    globalState.orders = globalState.orders.filter((o) => !o.isDeleted);
    globalState.drivers = globalState.drivers.filter((d) => !d.isDeleted);
    globalState.customers = globalState.customers.filter((c) => !c.isDeleted);
    globalState.keuanganAdmin = globalState.keuanganAdmin.filter((f) => !f.isDeleted);
    notify();
  };

  const updateSettings = (newSettings: Partial<AdminSettings>) => {
    const updated: AdminSettings = {
      ...globalState.settings,
      ...newSettings,
      pricePerPerson:
        newSettings.pricePerPerson !== undefined ? newSettings.pricePerPerson : globalState.settings.pricePerPerson,
      pricePerKm: newSettings.pricePerKm !== undefined ? newSettings.pricePerKm : globalState.settings.pricePerKm,
      receiptTimeLimitMinutes: newSettings.receiptTimeLimitMinutes || globalState.settings.receiptTimeLimitMinutes || 30,
      rates: {
        ...globalState.settings.rates,
        ...(newSettings.rates || {}),
      },
      commissionRates: {
        ...globalState.settings.commissionRates,
        ...(newSettings.commissionRates || {}),
      },
      siteContent: {
        ...globalState.settings.siteContent,
        ...(newSettings.siteContent || {}),
      },
      companyBank: newSettings.companyBank
        ? { ...globalState.settings.companyBank, ...newSettings.companyBank }
        : globalState.settings.companyBank,
    };
    globalState.settings = updated;
    saveAdminSettingsToFirestore(updated).catch(console.error);
    notify();
  };

  const updateCompanyBank = (bank: CompanyBankAccount) => {
    updateSettings({ companyBank: bank });
  };

  const updateQrisImage = async (
    qrisImageUrl: string
  ): Promise<{ success: boolean; message?: string }> => {
    const cleanUrl = (qrisImageUrl || '').trim() || DEFAULT_QRIS_IMAGE_URL;
    try {
      await savePaymentQrisToFirestore(cleanUrl);
      globalState.settings = {
        ...globalState.settings,
        qrisImageUrl: cleanUrl,
        qrisUpdatedAt: new Date().toISOString(),
      };
      notify();
      return { success: true, message: 'Gambar QRIS resmi berhasil diperbarui secara real-time di Firestore.' };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Gagal menyimpan gambar QRIS ke Firestore.',
      };
    }
  };

  const deleteOrder = (orderId: string) => {
    globalState.orders = globalState.orders.filter((o) => o.id !== orderId);
    deleteOrderFromFirestore(orderId).catch(console.error);
    notify();
  };

  const deleteDriver = (driverId: string) => {
    globalState.drivers = globalState.drivers.filter((d) => d.id !== driverId);
    deleteDriverFromFirestore(driverId).catch(console.error);
    notify();
  };

  const deleteCustomer = (customerId: string) => {
    const target = globalState.customers.find(
      (c) => c.id === customerId || c.no_hp === customerId || c.phone === customerId
    );
    const targetId = target ? target.id : customerId;
    globalState.customers = globalState.customers.filter(
      (c) => c.id !== customerId && c.no_hp !== customerId && c.phone !== customerId
    );
    deleteCustomerFromFirestore(targetId).catch(console.error);
    notify();
  };

  const clearAllCustomers = () => {
    const ids = globalState.customers.map((c) => c.id);
    globalState.customers = [];
    clearAllCustomersFromFirestore(ids).catch(console.error);
    notify();
  };

  const deleteTransaction = (txId: string) => {
    globalState.transactions = globalState.transactions.filter((t) => t.id !== txId);
    deleteTransactionFromFirestore(txId).catch(console.error);
    notify();
  };

  const clearAllTransactions = () => {
    const ids = globalState.transactions.map((t) => t.id);
    globalState.transactions = [];
    clearAllTransactionsFromFirestore(ids).catch(console.error);
    notify();
  };

  const deleteTopUpRequest = (reqId: string) => {
    globalState.topUpRequests = globalState.topUpRequests.filter((r) => r.id !== reqId);
    deleteTopUpRequestFromFirestore(reqId).catch(console.error);
    notify();
  };

  const clearAllTopUpRequests = () => {
    const ids = globalState.topUpRequests.map((r) => r.id);
    globalState.topUpRequests = [];
    clearAllTopUpRequestsFromFirestore(ids).catch(console.error);
    notify();
  };

  const deleteKeuanganItem = (id: string) => {
    globalState.keuanganAdmin = globalState.keuanganAdmin.filter((k) => k.id !== id);
    deleteKeuanganAdminFromFirestore(id).catch(console.error);
    notify();
  };

  const clearAllKeuangan = () => {
    const ids = globalState.keuanganAdmin.map((k) => k.id);
    globalState.keuanganAdmin = [];
    ids.forEach((id) => deleteKeuanganAdminFromFirestore(id).catch(console.error));
    notify();
  };

  const addRoute = (input: Omit<TravelRoute, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    const newRoute: TravelRoute = {
      id: `route-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      kotaAsal: input.kotaAsal.trim(),
      provinsiAsal: input.provinsiAsal.trim(),
      kotaTujuan: input.kotaTujuan.trim(),
      provinsiTujuan: input.provinsiTujuan.trim(),
      status: input.status || 'AKTIF',
      createdAt: now,
      updatedAt: now,
    };
    const nextRoutes = [newRoute, ...(globalState.settings.routes || [])];
    updateSettings({ routes: nextRoutes });
    return newRoute;
  };

  const updateRoute = (routeId: string, patch: Partial<TravelRoute>) => {
    const nextRoutes = (globalState.settings.routes || []).map((r) =>
      r.id === routeId ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r
    );
    updateSettings({ routes: nextRoutes });
  };

  const deleteRoute = (routeId: string) => {
    const nextRoutes = (globalState.settings.routes || []).filter((r) => r.id !== routeId);
    updateSettings({ routes: nextRoutes });
  };

  const toggleRouteStatus = (routeId: string) => {
    const nextRoutes = (globalState.settings.routes || []).map((r) =>
      r.id === routeId
        ? {
            ...r,
            status: (r.status === 'AKTIF' ? 'NONAKTIF' : 'AKTIF') as TravelRoute['status'],
            updatedAt: new Date().toISOString(),
          }
        : r
    );
    updateSettings({ routes: nextRoutes });
  };

  const addTariff = (input: Omit<PriceTariff, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    const newTariff: PriceTariff = {
      id: `tariff-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      routeId: input.routeId,
      namaRute: input.namaRute.trim(),
      hargaPerOrang: Number(input.hargaPerOrang) || 0,
      hargaSekaliJalan: Number(input.hargaSekaliJalan) || 0,
      hargaPulangPergi: Number(input.hargaPulangPergi) || 0,
      aktif: Boolean(input.aktif),
      createdAt: now,
      updatedAt: now,
    };
    const nextTariffs = [newTariff, ...(globalState.settings.tariffs || [])];
    updateSettings({ tariffs: nextTariffs });
    return newTariff;
  };

  const updateTariff = (tariffId: string, patch: Partial<PriceTariff>) => {
    const nextTariffs = (globalState.settings.tariffs || []).map((t) =>
      t.id === tariffId ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t
    );
    updateSettings({ tariffs: nextTariffs });
  };

  const deleteTariff = (tariffId: string) => {
    const nextTariffs = (globalState.settings.tariffs || []).filter((t) => t.id !== tariffId);
    updateSettings({ tariffs: nextTariffs });
  };

  const toggleTariffStatus = (tariffId: string) => {
    const nextTariffs = (globalState.settings.tariffs || []).map((t) =>
      t.id === tariffId ? { ...t, aktif: !t.aktif, updatedAt: new Date().toISOString() } : t
    );
    updateSettings({ tariffs: nextTariffs });
  };

  const updateOrderStatusAdmin = (orderId: string, nextStatus: OrderStatus, extra?: Partial<Order>) => {
    const target = globalState.orders.find((o) => o.id === orderId);
    if (!target) return;
    if (nextStatus === 'SELESAI' && target.status !== 'SELESAI') {
      advanceOrderStatus(orderId, 'SELESAI');
      return;
    }
    const updatedOrder: Order = {
      ...target,
      ...extra,
      status: nextStatus,
    };
    globalState.orders = globalState.orders.map((o) => (o.id === orderId ? updatedOrder : o));
    saveOrderToFirestore(updatedOrder).catch(console.error);
    notify();
  };

  const setOrderRetentionDays = (days: 7 | 30) => {
    const cleanDays: 7 | 30 = days === 30 ? 30 : 7;
    updateSettings({ orderRetentionDays: cleanDays });
  };

  const runAutoCleanup = async (force = false): Promise<CleanupSummary | null> => {
    return runAutoCleanupInternal(force);
  };

  const purgeAnnualFinancialData = async (
    mode: 'OLDER_THAN_1_YEAR' | 'PREVIOUS_YEARS' | number = 'OLDER_THAN_1_YEAR'
  ) => {
    const result = await purgeAnnualFinancialDataFromFirestore(mode);
    notify();
    return result;
  };

  return {
    currentUser: globalState.currentUser,
    isAdminAuthenticated: globalState.isAdminAuthenticated,
    isCheckingAdminSession: globalState.isCheckingAdminSession,
    customers: globalState.customers,
    drivers: globalState.drivers,
    orders: globalState.orders,
    transactions: globalState.transactions,
    topUpRequests: globalState.topUpRequests,
    keuanganAdmin: globalState.keuanganAdmin,
    laporanKeuangan: globalState.laporanKeuangan,
    lastCleanupSummary: globalState.lastCleanupSummary,
    settings: globalState.settings,
    notifications: globalState.notifications,
    isFirebaseConnected: globalState.isFirebaseConnected,
    firestoreError: globalState.firestoreError,
    verifyAdminSessionWithServer,
    loginAdminWithServer,
    logoutAdminWithServer,
    changeAdminCodeWithServer,
    login,
    logout,
    switchRole,
    registerCustomer,
    registerDriver,
    loginDriverWithPassword,
    setupFirstTimeDriverPassword,
    recoverDriverPassword,
    generateDriverRecoveryCode,
    resubmitDriverDocuments,
    approveDriver,
    rejectDriver,
    blockDriver,
    unblockDriver,
    syncDriverSnapshot,
    setDriverOnlineStatus,
    updateDriverLocation,
    createOrder,
    cancelOrderByCustomer,
    cancelOrderByAdmin,
    acceptOrderByDriver,
    rejectOrderByDriver,
    advanceOrderStatus,
    updateOrderStatusAdmin,
    confirmOrderPayment,
    topUpDriverSaldo,
    topUpDriverSaldoViaQrisTripay,
    createTopUpRequest,
    approveTopUpRequest,
    rejectTopUpRequest,
    updateCompanyBank,
    updateQrisImage,
    updateSettings,
    setOrderRetentionDays,
    runAutoCleanup,
    purgeAnnualFinancialData,
    addRoute,
    updateRoute,
    deleteRoute,
    toggleRouteStatus,
    addTariff,
    updateTariff,
    deleteTariff,
    toggleTariffStatus,
    addKeuanganTransaction,
    deleteOrder,
    deleteDriver,
    deleteCustomer,
    clearAllCustomers,
    deleteTransaction,
    clearAllTransactions,
    deleteTopUpRequest,
    clearAllTopUpRequests,
    deleteKeuanganItem,
    clearAllKeuangan,
    moveToTrash,
    restoreFromTrash,
    permanentDelete,
    emptyTrash,
    sendWhatsAppNotification,
    loginUnified,
    updateDriverProfile,
    adminUpdateDriver,
    updateCustomerProfile,
    fetchPaginatedOrders,
    fetchPaginatedCustomers,
    updateOrderInFirestore,
  };
}

async function runAutoCleanupInternal(force = false): Promise<CleanupSummary | null> {
  const nowMs = Date.now();
  const cooldownMs = 30 * 60 * 1000; // 30 minutes cooldown unless forced

  if (!force) {
    let lastSessionMs = lastCleanupAttemptMs;
    if (typeof window !== 'undefined') {
      try {
        const stored = Number(sessionStorage.getItem(SESSION_KEY_LAST_CLEANUP_MS) || 0);
        if (stored > lastSessionMs) lastSessionMs = stored;
      } catch {}
    }
    if (lastSessionMs && nowMs - lastSessionMs < cooldownMs) {
      return globalState.lastCleanupSummary;
    }
  }

  if (cleanupInFlightPromise) {
    return cleanupInFlightPromise;
  }

  lastCleanupAttemptMs = nowMs;
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(SESSION_KEY_LAST_CLEANUP_MS, String(nowMs));
    } catch {}
  }

  const retentionDays: 7 | 30 = globalState.settings.orderRetentionDays === 30 ? 30 : 7;
  cleanupInFlightPromise = runAutoHistoryCleanupFromFirestore(retentionDays)
    .then((summary) => {
      globalState.lastCleanupSummary = summary;
      globalState.settings = {
        ...globalState.settings,
        lastAutoCleanupAt: summary.ranAt,
      };
      notify();
      return summary;
    })
    .catch((err) => {
      console.warn('Auto history cleanup notice:', err);
      return null;
    })
    .finally(() => {
      cleanupInFlightPromise = null;
    });

  return cleanupInFlightPromise;
}
