/**
 * M3CAR - Type Definitions
 * Jemput Cepat, Sampai Selamat
 */

export type UserRole = 'customer' | 'driver' | 'admin';

export type DriverStatus = 'MENUNGGU' | 'AKTIF' | 'DIBLOKIR' | 'DITOLAK';

export type OrderStatus =
  | 'MENCARI_DRIVER'
  | 'DRIVER_DITEMUKAN'
  | 'DRIVER_OTW'
  | 'SUDAH_JEMPUT'
  | 'SUDAH_SAMPAI'
  | 'SELESAI'
  | 'DIBATALKAN';

export interface User {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  avatarUrl?: string;
  password?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  createdAt?: string;
}

export interface DriverProfile extends User {
  role: 'driver';
  status: DriverStatus;
  rawStatus?: string; // e.g., 'waiting_approval' | 'approved' | 'rejected' | 'blocked'
  rejectionReason?: string;
  blockReason?: string;
  carModel: string;
  plateNumber: string;
  car?: string;
  plate?: string;
  isOnline: boolean;
  lokasi?: string;
  currentLocation?: string;
  lat?: number;
  lng?: number;
  locationUpdatedAt?: string;
  balance: number;
  saldo?: number;
  rating: number;
  totalTrips: number;
  ktpPhotoUrl: string;
  simPhotoUrl: string;
  ktpUrl?: string;
  simUrl?: string;
  carPhotoUrl?: string;
  registeredAt: string;
  hasPassword?: boolean;
  passwordHash?: string;
  passwordUpdatedAt?: string;
  recoveryCodeHash?: string;
  recoveryCodeExpiresAt?: string;
  isDeleted?: boolean;
  deletedAt?: string;
}

export type RegionZone = 'jakarta' | 'tangerang_depok' | 'bogor_bekasi' | 'luar_jabodetabek';

export interface Order {
  id: string;
  orderNumber: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  pickupLocation: string;
  dari?: string;
  pickupLat?: number;
  pickupLng?: number;
  destination: string;
  ke?: string;
  route?: string; // 'Ujung Kulon -> Jakarta' | 'Jakarta -> Ujung Kulon'
  patokan?: string;
  mapsUrl?: string;
  dayName?: string;
  date: string;
  time: string;
  passengers: number;
  region: RegionZone;
  pricePerPerson: number;
  totalPrice: number;
  harga?: number;
  commissionRate: number; // 0.12 (12%) or 0.15 (15%)
  commissionAmount: number;
  driverEarnings: number;
  tollRoute: string; // Tol Jakarta-Merak + Tol Serang-Panimbang 83,6 km
  eta: string; // 6 jam 30 menit
  status: OrderStatus;
  paymentMethod?: 'TUNAI' | 'TRANSFER_DRIVER' | 'QRIS_RTB' | 'M3CAR_PAY';
  paymentStatus?: 'BELUM_BAYAR' | 'LUNAS';
  paidAt?: string;
  isOutsideIndonesia?: boolean;
  country?: string;
  deviationKm?: number;
  deviationFee?: number;
  basePrice?: number;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  driverPlate?: string;
  driverCar?: string;
  driverLat?: number;
  driverLng?: number;
  driverLocationText?: string;
  driverLocationProgress?: number; // 0 to 100% along route
  createdAt: string;
  updatedAt?: string;
  acceptedAt?: string;
  completedAt?: string;
  currentDispatchDriverIndex?: number;
  dispatchTimeRemaining?: number;
  isDeleted?: boolean;
  deletedAt?: string;
}

export type TransactionType = 'ISI_SALDO' | 'POTONGAN_KOMISI' | 'REFUND';

export interface WalletTransaction {
  id: string;
  driverId: string;
  date: string;
  type: TransactionType;
  amount: number; // positive for topup, negative for deduction
  gatewayFee?: number;
  balanceAfter: number;
  description: string;
  orderId?: string;
  paymentMethod: 'WA_TRANSFER' | 'QRIS' | 'SYSTEM_COMMISSION' | 'ADJUSTMENT' | 'QRIS_TRIPAY';
  status: 'BERHASIL' | 'MENUNGGU';
  isDeleted?: boolean;
  deletedAt?: string;
}

export interface KeuanganAdminItem {
  id: string;
  id_transaksi: string;
  tanggal: string;
  jenis: 'masuk' | 'keluar';
  keterangan: string;
  jumlah_rp: number;
  id_order?: string;
  nama_driver?: string;
  nama_customer?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  createdAt?: string;
  createdAtMs?: number;
}

export interface LaporanKeuanganItem {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone?: string;
  driverId?: string;
  driverName?: string;
  driverPlate?: string;
  pickupLocation: string;
  destination: string;
  date: string;
  time?: string;
  passengers?: number;
  paymentMethod: 'TUNAI' | 'TRANSFER_DRIVER' | 'QRIS_RTB' | 'M3CAR_PAY';
  paymentStatus: 'BELUM_BAYAR' | 'LUNAS';
  totalPrice: number;
  commissionAmount: number;
  driverEarnings: number;
  year: number;
  createdAt: string;
  createdAtIso: string;
  createdAtMs: number;
  completedAt?: string;
  archivedAt?: string;
  isDeleted?: boolean;
}

export interface CleanupSummary {
  deletedOrders: number;
  deletedLogs: number;
  archivedOrders: number;
  retentionDays: 7 | 30;
  ranAt: string;
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface CompanyBankAccount {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

export interface DriverTopUpRequest {
  id: string;
  driverId: string;
  driverName: string;
  driverPhone: string;
  driverPlate: string;
  amount: number; // Nominal Terkunci yang dipilih
  receiptPhotoUrl?: string; // Foto Bukti Transfer
  receiptAmount?: number; // Nominal yang ada di bukti transfer
  receiptTime?: string; // Jam & Tanggal di Resit (e.g. "14:15")
  receiptTimestamp?: number; // Timestamp di Resit
  submitTime?: string; // Jam saat Driver Submit
  timeDiffMinutes?: number; // Selisih waktu (menit)
  receiptStatus?: 'RESIT_BARU' | 'RESIT_LAMA';
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  createdAt: string;
  createdAtMs?: number;
  status: 'MENUNGGU' | 'BERHASIL' | 'DITOLAK';
  statusLabel?: string;
  note?: string;
  confirmedAt?: string;
  rejectionReason?: string;
  isDeleted?: boolean;
  deletedAt?: string;
}

export type RouteStatus = 'AKTIF' | 'NONAKTIF';

export interface TravelRoute {
  id: string;
  kotaAsal: string;
  provinsiAsal: string;
  kotaTujuan: string;
  provinsiTujuan: string;
  status: RouteStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface PriceTariff {
  id: string;
  routeId?: string;
  namaRute: string;
  hargaPerOrang: number;
  hargaSekaliJalan: number;
  hargaPulangPergi: number;
  aktif: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface AdminSettings {
  adminPhone: string;
  adminPasswordHash?: string;
  adminAccessCode?: string;
  waDirekturPhone?: string;
  pricePerPerson?: number;
  pricePerKm?: number;
  receiptTimeLimitMinutes?: 30 | 60;
  orderRetentionDays?: 7 | 30;
  lastAutoCleanupAt?: string;
  companyBank?: CompanyBankAccount;
  routes?: TravelRoute[];
  tariffs?: PriceTariff[];
  rates: {
    jakarta: number;
    tangerang_depok: number;
    bogor_bekasi: number;
  };
  commissionRates: {
    longTrip: number;
    shortTrip: number;
  };
  tripayQrisFeeFlat?: number;
  tripayQrisFeePercent?: number;
  qrisImageUrl?: string;
  qrisUpdatedAt?: string;
  firebaseConfig?: FirebaseConfig;
  siteContent?: {
    appName?: string;
    tagline?: string;
    subTagline?: string;
    announcement?: string;
    welcomeText?: string;
    tollRouteDesc?: string;
    travelTimeEta?: string;
    bannerUrl?: string;
    headerPromo?: string;
    themeColor?: string;
    route1Name?: string;
    route2Name?: string;
    route1Desc?: string;
    route2Desc?: string;
  };
}

export interface WhatsAppNotification {
  id: string;
  recipientPhone: string;
  recipientName: string;
  recipientRole: 'driver' | 'customer' | 'admin';
  title: string;
  message: string;
  timestamp: string;
  type: 'acc' | 'reject' | 'block' | 'unblock' | 'order' | 'system';
}
