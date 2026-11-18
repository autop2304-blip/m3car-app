import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useM3CarStore, normalizePhone } from '../../store/m3carStore';
import { Order, OrderStatus, RegionZone } from '../../types';
import {
  checkIsOutsideIndonesia,
  calculateCorridorDeviation,
  calculateOrderPricing,
  formatWaUrl,
} from '../../utils/routePricing';
import { playPassengerNotificationChime } from '../../utils/audio';
import {
  DEFAULT_QRIS_IMAGE_URL,
  subscribePaymentConfig,
} from '../../services/firestoreService';
import fleetHeroImg from '../../assets/images/m3car_fleet_hero_1794509944554.jpg';
import {
  MapPin,
  Navigation,
  Calendar,
  Clock,
  Users,
  Phone,
  PhoneCall,
  User,
  Car,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Shield,
  ArrowRight,
  Compass,
  LogOut,
  QrCode,
  CreditCard,
  Banknote,
  LocateFixed,
  Star,
  Plus,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  MessageCircle,
  Loader2,
  Route,
  History,
  Download,
} from 'lucide-react';

const ACTIVE_TRIP_STATUSES: OrderStatus[] = [
  'MENCARI_DRIVER',
  'DRIVER_DITEMUKAN',
  'DRIVER_OTW',
  'SUDAH_JEMPUT',
  'SUDAH_SAMPAI',
];

interface TripStepDef {
  key: string;
  label: string;
  shortLabel: string;
}

const TRIP_STEPS: TripStepDef[] = [
  { key: 'waiting', label: 'Menunggu Driver', shortLabel: 'Menunggu' },
  { key: 'confirmed', label: 'Driver Dikonfirmasi', shortLabel: 'Dikonfirmasi' },
  { key: 'pickup', label: 'Menuju Penjemputan', shortLabel: 'Menuju Jemput' },
  { key: 'ontrip', label: 'Dalam Perjalanan', shortLabel: 'Perjalanan' },
  { key: 'done', label: 'Selesai', shortLabel: 'Selesai' },
];

function resolveTripStepIndex(status: OrderStatus): number {
  switch (status) {
    case 'MENCARI_DRIVER':
      return 0;
    case 'DRIVER_DITEMUKAN':
      return 1;
    case 'DRIVER_OTW':
      return 2;
    case 'SUDAH_JEMPUT':
    case 'SUDAH_SAMPAI':
      return 3;
    case 'SELESAI':
      return 4;
    default:
      return 0;
  }
}

function resolveTripStatusMeta(status: OrderStatus, driverName?: string) {
  switch (status) {
    case 'MENCARI_DRIVER':
      return {
        headline: 'Mencari Driver Terdekat...',
        subtext:
          'Pesanan Anda telah masuk ke sistem M3CAR. Driver aktif terdekat akan segera mengonfirmasi penjemputan Anda.',
        headerBg: 'bg-amber-950/80 border-amber-700/70',
        accentText: 'text-amber-300',
        barFill: 'bg-amber-500',
        progressPct: 16,
      };
    case 'DRIVER_DITEMUKAN':
      return {
        headline: 'Driver Dikonfirmasi!',
        subtext: `${driverName || 'Driver M3CAR'} telah menerima pesanan Anda dan sedang bersiap menjemput.`,
        headerBg: 'bg-emerald-950/80 border-emerald-600/70',
        accentText: 'text-emerald-300',
        barFill: 'bg-emerald-500',
        progressPct: 38,
      };
    case 'DRIVER_OTW':
      return {
        headline: 'Driver Menuju Lokasi Jemput',
        subtext: `${driverName || 'Driver M3CAR'} sedang dalam perjalanan menuju titik penjemputan Anda.`,
        headerBg: 'bg-emerald-950/90 border-emerald-500/80',
        accentText: 'text-emerald-300',
        barFill: 'bg-emerald-500',
        progressPct: 62,
      };
    case 'SUDAH_JEMPUT':
      return {
        headline: 'Dalam Perjalanan ke Tujuan',
        subtext: 'Anda sudah dijemput dan sedang dalam perjalanan aman menuju lokasi tujuan.',
        headerBg: 'bg-blue-950/90 border-blue-500/80',
        accentText: 'text-blue-300',
        barFill: 'bg-blue-500',
        progressPct: 82,
      };
    case 'SUDAH_SAMPAI':
      return {
        headline: 'Tiba di Lokasi Tujuan',
        subtext: 'Driver telah mengonfirmasi kedatangan Anda. Pastikan seluruh barang bawaan tidak tertinggal.',
        headerBg: 'bg-emerald-950/90 border-emerald-500/80',
        accentText: 'text-emerald-300',
        barFill: 'bg-emerald-500',
        progressPct: 95,
      };
    case 'SELESAI':
      return {
        headline: 'Perjalanan Selesai',
        subtext: 'Terima kasih telah bepergian bersama M3CAR.',
        headerBg: 'bg-emerald-950/80 border-emerald-600/70',
        accentText: 'text-emerald-300',
        barFill: 'bg-emerald-500',
        progressPct: 100,
      };
    default:
      return {
        headline: 'Pesanan Dibatalkan',
        subtext: 'Pesanan ini telah dibatalkan.',
        headerBg: 'bg-red-950/80 border-red-700/70',
        accentText: 'text-red-300',
        barFill: 'bg-red-500',
        progressPct: 0,
      };
  }
}

function getPaymentLabel(method?: Order['paymentMethod']): string {
  if (method === 'TRANSFER_DRIVER') return 'Transfer Bank';
  if (method === 'QRIS_RTB') return 'QRIS RTB';
  if (method === 'M3CAR_PAY') return 'M3Car Pay';
  return 'Tunai ke Driver';
}

export const CustomerView: React.FC = () => {
  const {
    currentUser,
    orders,
    drivers,
    settings,
    firestoreError,
    registerCustomer,
    logout,
    createOrder,
    cancelOrderByCustomer,
  } = useM3CarStore();

  const loggedCustomer =
    currentUser && currentUser.role === 'customer' ? currentUser : null;

  // Quick Auth State (if not logged in)
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  // Booking Form State
  const [direction, setDirection] = useState<'UK_JKT' | 'JKT_UK'>('UK_JKT');
  const [pickupLocation, setPickupLocation] = useState('');
  const [destination, setDestination] = useState('Jakarta (Gambir / Jabodetabek)');
  const [patokan, setPatokan] = useState('');
  const [region, setRegion] = useState<RegionZone>('jakarta');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('07:00');
  const [passengers, setPassengers] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<'TUNAI' | 'TRANSFER_DRIVER' | 'QRIS_RTB'>('TUNAI');
  const [pickupLat, setPickupLat] = useState<number | undefined>(undefined);
  const [pickupLng, setPickupLng] = useState<number | undefined>(undefined);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const [bookingAlert, setBookingAlert] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showQrisModal, setShowQrisModal] = useState(false);

  // Real-time QRIS Image directly subscribed from setting_admin/payment_config (onSnapshot)
  const [liveQrisUrl, setLiveQrisUrl] = useState<string>(
    settings.qrisImageUrl || DEFAULT_QRIS_IMAGE_URL
  );
  const [liveQrisUpdatedAt, setLiveQrisUpdatedAt] = useState<string | undefined>(
    settings.qrisUpdatedAt
  );
  const [qrisDownloaded, setQrisDownloaded] = useState(false);

  // Active Ride Grab-Style Screen Controls
  const [selectedActiveOrderId, setSelectedActiveOrderId] = useState<string | null>(null);
  const [showSecondaryBookingForm, setShowSecondaryBookingForm] = useState(false);
  const [confirmCancelOrderId, setConfirmCancelOrderId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'pesan' | 'perjalanan' | 'bantuan'>('pesan');

  const prevPrimaryOrderStatusRef = useRef<string | null>(null);
  const prevHasActiveOrderRef = useRef<boolean>(false);

  useEffect(() => {
    const unsub = subscribePaymentConfig((data) => {
      if (data.qrisImageUrl) {
        setLiveQrisUrl(data.qrisImageUrl);
      }
      if (data.updatedAt) {
        setLiveQrisUpdatedAt(data.updatedAt);
      }
    });
    return () => unsub();
  }, []);

  const resolvedQrisUrl = liveQrisUrl || settings.qrisImageUrl || DEFAULT_QRIS_IMAGE_URL;

  const handleDownloadQris = async () => {
    const src = resolvedQrisUrl;
    try {
      let downloadHref = src;
      let objectUrlToRevoke: string | null = null;

      if (!src.startsWith('data:')) {
        const resp = await fetch(src);
        if (resp.ok) {
          const blob = await resp.blob();
          objectUrlToRevoke = URL.createObjectURL(blob);
          downloadHref = objectUrlToRevoke;
        }
      }

      const link = document.createElement('a');
      link.href = downloadHref;
      link.download = `QRIS-Resmi-M3CAR-${new Date().toISOString().slice(0, 10)}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      if (objectUrlToRevoke) {
        setTimeout(() => URL.revokeObjectURL(objectUrlToRevoke!), 1500);
      }
      setQrisDownloaded(true);
      setTimeout(() => setQrisDownloaded(false), 3000);
    } catch {
      const link = document.createElement('a');
      link.href = src;
      link.download = 'QRIS-Resmi-M3CAR.jpg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Direction switch helper
  const handleSelectDirection = (dir: 'UK_JKT' | 'JKT_UK') => {
    setDirection(dir);
    if (dir === 'UK_JKT') {
      setDestination('Jakarta (Jabodetabek Door-to-Door)');
    } else {
      setDestination('Ujung Kulon (Sumur / Tunggaljaya / Tamanjaya)');
    }
  };

  // Geofence & Deviation Calculation
  const geofenceCheck = useMemo(
    () =>
      checkIsOutsideIndonesia({
        address: pickupLocation,
        lat: pickupLat,
        lng: pickupLng,
      }),
    [pickupLocation, pickupLat, pickupLng]
  );

  const deviationInfo = useMemo(
    () =>
      calculateCorridorDeviation({
        address: pickupLocation,
        lat: pickupLat,
        lng: pickupLng,
      }),
    [pickupLocation, pickupLat, pickupLng]
  );

  const pricing = useMemo(() => {
    const basePerPerson = settings.pricePerPerson || 270000;
    const calc = calculateOrderPricing(passengers, deviationInfo.deviationKm);
    const customBase = Math.max(1, passengers) * basePerPerson;
    return {
      ...calc,
      pricePerPerson: basePerPerson,
      basePrice: customBase,
      totalPrice: customBase + calc.deviationFee,
    };
  }, [passengers, deviationInfo.deviationKm, settings.pricePerPerson]);

  const handleUseGps = () => {
  if (!navigator.geolocation) {
    setGpsStatus('Browser tidak mendukung GPS.');
    return;
  }
  setGpsStatus('Mengambil koordinat GPS...');
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = Number(pos.coords.latitude.toFixed(5));
      const lng = Number(pos.coords.longitude.toFixed(5));
      setPickupLat(lat);
      setPickupLng(lng);
      setPickupLocation('Mencari nama alamat...');
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
        const data = await res.json();
        const alamat = data.display_name || `${data.address?.road || ''} ${data.address?.village || data.address?.suburb || ''}, ${data.address?.city || data.address?.town || ''}`.trim();
        if (alamat && alamat.length > 5) {
          setPickupLocation(alamat);
          setGpsStatus(`Lokasi ditemukan`);
        } else {
          setPickupLocation(`${lat}, ${lng}`);
          setGpsStatus(`Koordinat GPS aktif (${lat}, ${lng})`);
        }
      } catch (err) {
        setPickupLocation(`${lat}, ${lng}`);
        setGpsStatus(`Koordinat GPS aktif (${lat}, ${lng})`);
      }
    },
    () => {
      setGpsStatus('Gagal mengambil lokasi GPS. Silakan ketik alamat manual.');
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
};

  const handleCustomerAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!custName.trim()) {
      setAuthError('Nama lengkap wajib diisi.');
      return;
    }
    const res = registerCustomer({
      name: custName.trim(),
      phone: custPhone.trim(),
    });
    if (!res.success) {
      setAuthError(res.message || 'Gagal masuk.');
    }
  };

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setBookingAlert(null);

    const activeName = loggedCustomer?.name || custName.trim();
    const activePhone = loggedCustomer?.phone || custPhone.trim();

    if (!activeName || !activePhone) {
      setBookingAlert({ type: 'error', text: 'Silakan isi Nama dan No HP WhatsApp (+62) terlebih dahulu.' });
      return;
    }

    if (!loggedCustomer) {
      const regRes = registerCustomer({ name: activeName, phone: activePhone });
      if (!regRes.success) {
        setBookingAlert({ type: 'error', text: regRes.message || 'Nomor HP harus nomor Indonesia (+62).' });
        return;
      }
    }

    if (!pickupLocation.trim()) {
      setBookingAlert({ type: 'error', text: 'Titik jemput wajib diisi.' });
      return;
    }

    if (geofenceCheck.isOutsideIndonesia) {
      setBookingAlert({ type: 'error', text: geofenceCheck.warningText });
      return;
    }

    const created = createOrder({
      customerName: activeName,
      customerPhone: activePhone,
      pickupLocation: pickupLocation.trim(),
      destination: destination.trim(),
      route: direction === 'UK_JKT' ? 'Ujung Kulon -> Jakarta' : 'Jakarta -> Ujung Kulon',
      patokan: patokan.trim(),
      date,
      time,
      passengers,
      region,
      pricePerPerson: pricing.pricePerPerson,
      basePrice: pricing.basePrice,
      deviationKm: pricing.deviationKm,
      deviationFee: pricing.deviationFee,
      totalPrice: pricing.totalPrice,
      pickupLat,
      pickupLng,
      paymentMethod,
    });

    setPickupLocation('');
    setPatokan('');
    setSelectedActiveOrderId(created.id);
    setShowSecondaryBookingForm(false);
    setMobileTab('perjalanan');
    setBookingAlert({
      type: 'success',
      text: `Pesanan ${created.orderNumber} berhasil dibuat! Sistem sedang mencari driver terdekat.`,
    });
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const myOrders = useMemo(() => {
    if (!loggedCustomer) return [];
    const normCustPhone = normalizePhone(loggedCustomer.phone);
    return orders
      .filter((o) => !o.isDeleted && normalizePhone(o.customerPhone) === normCustPhone)
      .slice(0, 30);
  }, [orders, loggedCustomer]);

  const activeOrders = useMemo(
    () => myOrders.filter((o) => ACTIVE_TRIP_STATUSES.includes(o.status)),
    [myOrders]
  );

  const pastOrders = useMemo(
    () => myOrders.filter((o) => !ACTIVE_TRIP_STATUSES.includes(o.status)),
    [myOrders]
  );

  const primaryActiveOrder = useMemo(() => {
    if (activeOrders.length === 0) return null;
    if (selectedActiveOrderId) {
      const match = activeOrders.find((o) => o.id === selectedActiveOrderId);
      if (match) return match;
    }
    return activeOrders[0];
  }, [activeOrders, selectedActiveOrderId]);

  const liveDriver = useMemo(() => {
    if (!primaryActiveOrder?.driverId) return null;
    return drivers.find((d) => d.id === primaryActiveOrder.driverId) || null;
  }, [drivers, primaryActiveOrder?.driverId]);

  useEffect(() => {
    const hasActive = Boolean(primaryActiveOrder);
    if (hasActive && !prevHasActiveOrderRef.current) {
      setMobileTab('perjalanan');
    }
    prevHasActiveOrderRef.current = hasActive;
  }, [primaryActiveOrder]);

  // Play subtle audio chime when passenger's active trip advances in Firestore
  useEffect(() => {
    if (!primaryActiveOrder) {
      prevPrimaryOrderStatusRef.current = null;
      return;
    }
    const statusKey = `${primaryActiveOrder.id}:${primaryActiveOrder.status}`;
    if (
      prevPrimaryOrderStatusRef.current &&
      prevPrimaryOrderStatusRef.current.startsWith(`${primaryActiveOrder.id}:`) &&
      prevPrimaryOrderStatusRef.current !== statusKey
    ) {
      playPassengerNotificationChime();
    }
    prevPrimaryOrderStatusRef.current = statusKey;
  }, [primaryActiveOrder?.id, primaryActiveOrder?.status]);

  // Resolved real-time driver fields (prefer live drivers/{id} doc synced via onSnapshot)
  const activeDriverName = liveDriver?.name || primaryActiveOrder?.driverName || '';
  const activeDriverPhone = liveDriver?.phone || primaryActiveOrder?.driverPhone || '';
  const activeDriverCar =
    liveDriver?.carModel || liveDriver?.car || primaryActiveOrder?.driverCar || 'Armada M3CAR';
  const activeDriverPlate =
    liveDriver?.plateNumber || liveDriver?.plate || primaryActiveOrder?.driverPlate || '';
  const activeDriverRating = liveDriver?.rating ?? 5.0;
  const activeDriverTrips = liveDriver?.totalTrips ?? 0;
  const activeDriverAvatar = liveDriver?.avatarUrl || '';
  const activeDriverLocation =
    liveDriver?.lokasi ||
    liveDriver?.currentLocation ||
    primaryActiveOrder?.driverLocationText ||
    '';
  const activeDriverLat = liveDriver?.lat ?? primaryActiveOrder?.driverLat;
  const activeDriverLng = liveDriver?.lng ?? primaryActiveOrder?.driverLng;
  const activeDriverLocUpdatedAt = liveDriver?.locationUpdatedAt || primaryActiveOrder?.updatedAt;

  const hasAssignedDriver = Boolean(
    primaryActiveOrder &&
      (activeDriverName || primaryActiveOrder.status !== 'MENCARI_DRIVER')
  );

  // Reusable Booking Form Component (Android-style 1-col Mobile-First)
  const renderBookingFormCard = () => (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-6 space-y-4 shadow-xl">
      <div className="flex items-center justify-between border-b border-neutral-800 pb-3.5">
        <div>
          <h2 className="text-lg sm:text-xl font-black text-white">Pesan Travel Door-to-Door</h2>
          <p className="text-sm text-neutral-400 mt-0.5">
            Isi titik jemput &amp; tujuan untuk memanggil driver terdekat
          </p>
        </div>
      </div>

      {bookingAlert && (
        <div
          className={`p-4 rounded-xl text-sm font-bold flex items-start gap-2.5 ${
            bookingAlert.type === 'success'
              ? 'bg-emerald-950 border border-emerald-700 text-emerald-200'
              : 'bg-red-950 border border-red-700 text-red-200'
          }`}
        >
          {bookingAlert.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          )}
          <span>{bookingAlert.text}</span>
        </div>
      )}

      {/* Direction Selector (1-column on mobile, 2-column on md+) */}
      <div className="space-y-2">
        <label className="block text-sm font-bold text-neutral-200">Pilih Arah Rute</label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => handleSelectDirection('UK_JKT')}
            className={`min-h-[48px] py-3.5 px-4 rounded-xl border text-sm sm:text-base font-bold cursor-pointer transition-colors flex items-center justify-center ${
              direction === 'UK_JKT'
                ? 'bg-red-600 border-red-500 text-white shadow-md'
                : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:text-white'
            }`}
          >
            Ujung Kulon &rarr; Jakarta
          </button>
          <button
            type="button"
            onClick={() => handleSelectDirection('JKT_UK')}
            className={`min-h-[48px] py-3.5 px-4 rounded-xl border text-sm sm:text-base font-bold cursor-pointer transition-colors flex items-center justify-center ${
              direction === 'JKT_UK'
                ? 'bg-red-600 border-red-500 text-white shadow-md'
                : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:text-white'
            }`}
          >
            Jakarta &rarr; Ujung Kulon
          </button>
        </div>
      </div>

      <form onSubmit={handleCreateOrder} className="space-y-4">
        {!loggedCustomer && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-neutral-200 mb-1.5">Nama Penumpang</label>
              <input
                type="text"
                required
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
                placeholder="Nama Lengkap"
                className="w-full min-h-[48px] px-4 py-3 bg-neutral-950 border border-neutral-800 focus:border-red-500 rounded-xl text-base text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-neutral-200 mb-1.5">No HP WhatsApp</label>
              <input
                type="tel"
                required
                value={custPhone}
                onChange={(e) => setCustPhone(e.target.value)}
                placeholder="0812xxxxxxxx"
                className="w-full min-h-[48px] px-4 py-3 bg-neutral-950 border border-neutral-800 focus:border-red-500 rounded-xl text-base font-mono text-white focus:outline-none"
              />
            </div>
          </div>
        )}

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
            <label className="text-sm font-bold text-neutral-200">Alamat Titik Jemput (Door-to-Door)</label>
            <button
              type="button"
              onClick={handleUseGps}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-neutral-950 border border-neutral-800 text-xs sm:text-sm font-bold text-red-400 hover:text-red-300 flex items-center gap-1.5 cursor-pointer"
            >
              <LocateFixed className="w-4 h-4" />
              <span>Gunakan GPS</span>
            </button>
          </div>
          <input
            type="text"
            required
            value={pickupLocation}
            onChange={(e) => setPickupLocation(e.target.value)}
            placeholder="Contoh: Desa Tunggaljaya, Sumur / Stasiun Gambir Jakarta Pusat"
            className="w-full min-h-[48px] px-4 py-3 bg-neutral-950 border border-neutral-800 focus:border-red-500 rounded-xl text-base text-white focus:outline-none"
          />
          {gpsStatus && <p className="text-xs sm:text-sm text-neutral-400 mt-1.5">{gpsStatus}</p>}
          {geofenceCheck.isOutsideIndonesia && (
            <p className="text-xs sm:text-sm font-bold text-red-400 mt-1.5">{geofenceCheck.warningText}</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-neutral-200 mb-1.5">Alamat Tujuan</label>
            <input
              type="text"
              required
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="w-full min-h-[48px] px-4 py-3 bg-neutral-950 border border-neutral-800 focus:border-red-500 rounded-xl text-base text-white focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-neutral-200 mb-1.5">Wilayah Layanan</label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value as RegionZone)}
              className="w-full min-h-[48px] px-4 py-3 bg-neutral-950 border border-neutral-800 focus:border-red-500 rounded-xl text-base text-white focus:outline-none"
            >
              <option value="jakarta">DKI Jakarta</option>
              <option value="tangerang_depok">Tangerang / Depok</option>
              <option value="bogor_bekasi">Bogor / Bekasi</option>
              <option value="luar_jabodetabek">Banten / Ujung Kulon</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-neutral-200 mb-1.5">Patokan Rumah / Catatan (Opsional)</label>
          <input
            type="text"
            value={patokan}
            onChange={(e) => setPatokan(e.target.value)}
            placeholder="Contoh: Depan Masjid Al-Ikhlas, pagar hitam"
            className="w-full min-h-[48px] px-4 py-3 bg-neutral-950 border border-neutral-800 focus:border-red-500 rounded-xl text-base text-white focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-bold text-neutral-200 mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-red-500" />
              <span>Tanggal Berangkat</span>
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full min-h-[48px] px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-xl text-base text-white focus:border-red-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-neutral-200 mb-1.5 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-red-500" />
              <span>Jam Jemput</span>
            </label>
            <input
              type="time"
              required
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full min-h-[48px] px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-xl text-base text-white focus:border-red-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-neutral-200 mb-1.5 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-red-500" />
              <span>Jumlah Kursi</span>
            </label>
            <select
              value={passengers}
              onChange={(e) => setPassengers(Number(e.target.value))}
              className="w-full min-h-[48px] px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-xl text-base text-white focus:outline-none focus:border-red-500"
            >
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n} Orang
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Payment Method (1-column vertical on mobile, 3-column on md+) */}
        <div className="space-y-2.5">
          <label className="block text-sm font-bold text-neutral-200">Metode Pembayaran</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {[
              { id: 'TUNAI', label: 'Tunai ke Driver', icon: Banknote },
              { id: 'TRANSFER_DRIVER', label: 'Transfer Bank', icon: CreditCard },
              { id: 'QRIS_RTB', label: 'QRIS Resmi M3CAR', icon: QrCode },
            ].map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id as 'TUNAI' | 'TRANSFER_DRIVER' | 'QRIS_RTB')}
                  className={`min-h-[48px] py-3.5 px-4 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                    paymentMethod === m.id
                      ? 'bg-red-600 border-red-500 text-white shadow-md'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>
          {(paymentMethod === 'QRIS_RTB' || paymentMethod === 'TRANSFER_DRIVER') && (
            <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 space-y-3">
              <div className="flex flex-col gap-3">
                <div>
                  <div className="text-sm font-black text-white flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-red-400 shrink-0" />
                    <span>
                      {paymentMethod === 'QRIS_RTB'
                        ? 'QRIS Resmi M3CAR (Sinkron Real-Time)'
                        : 'Info Pembayaran Transfer & QRIS M3CAR'}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-neutral-400 mt-1 leading-relaxed">
                    {paymentMethod === 'TRANSFER_DRIVER'
                      ? `${settings.companyBank?.bankName || 'SeaBank'} ${
                          settings.companyBank?.accountNumber || '901102051050'
                        } a.n ${settings.companyBank?.accountHolder || 'Ali Husen - CV. ROYAL TRANS BERKAH GROUP'}`
                      : 'Pindai atau unduh kode QRIS resmi di bawah ini untuk menyelesaikan pembayaran.'}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowQrisModal(true)}
                    className="min-h-[48px] px-4 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-bold cursor-pointer inline-flex items-center justify-center gap-2"
                  >
                    <QrCode className="w-4 h-4 text-red-400" />
                    <span>Perbesar QRIS</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadQris}
                    className="min-h-[48px] px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold cursor-pointer inline-flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>{qrisDownloaded ? 'Tersimpan' : 'Unduh QRIS'}</span>
                  </button>
                </div>
              </div>

              {paymentMethod === 'QRIS_RTB' && (
                <div className="flex justify-center pt-1">
                  <button
                    type="button"
                    onClick={() => setShowQrisModal(true)}
                    className="bg-white p-2.5 rounded-2xl border border-neutral-300 shadow-md cursor-pointer hover:opacity-95 transition-opacity"
                    aria-label="Perbesar Gambar QRIS M3CAR"
                  >
                    <img
                      src={resolvedQrisUrl}
                      alt="QRIS Resmi M3CAR"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = DEFAULT_QRIS_IMAGE_URL;
                      }}
                      className="w-48 h-48 sm:w-52 sm:h-52 object-contain"
                    />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Price Summary */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 space-y-2.5 text-sm">
          <div className="flex items-center justify-between text-neutral-400 gap-2">
            <span>
              Tarif Normal ({passengers} x Rp {pricing.pricePerPerson.toLocaleString('id-ID')})
            </span>
            <span className="font-bold text-white tabular-nums shrink-0">
              Rp {pricing.basePrice.toLocaleString('id-ID')}
            </span>
          </div>
          {pricing.deviationKm > 0 && (
            <div className="flex items-center justify-between text-amber-400 gap-2">
              <span>Deviasi Jalur ({pricing.deviationKm} km)</span>
              <span className="font-bold tabular-nums shrink-0">
                +Rp {pricing.deviationFee.toLocaleString('id-ID')}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between pt-2.5 border-t border-neutral-800 gap-2">
            <span className="font-black text-white text-base">Total Pembayaran</span>
            <span className="font-black text-emerald-400 text-xl sm:text-2xl tabular-nums">
              Rp {pricing.totalPrice.toLocaleString('id-ID')}
            </span>
          </div>
        </div>

        <button
          type="submit"
          disabled={geofenceCheck.isOutsideIndonesia}
          className="w-full min-h-[52px] py-3.5 px-6 bg-red-600 hover:bg-red-500 text-white rounded-xl font-black text-base shadow-xl shadow-red-900/40 cursor-pointer transition-colors disabled:opacity-40"
        >
          Pesan Travel Sekarang
        </button>
      </form>
    </div>
  );

  return (
    <div className="w-full max-w-md mx-auto md:max-w-5xl lg:max-w-6xl px-3.5 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
      {firestoreError && (
        <div className="p-4 rounded-2xl text-sm font-bold bg-red-950 border border-red-700 text-red-200 flex items-center gap-2.5">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{firestoreError}</span>
        </div>
      )}

      {/* =====================================================================
          LAYAR STATUS PERJALANAN BESAR ALA GRAB (TOP PRIORITY WHEN ORDER ACTIVE)
         ===================================================================== */}
      {primaryActiveOrder && (() => {
        const currentStepIdx = resolveTripStepIndex(primaryActiveOrder.status);
        const statusMeta = resolveTripStatusMeta(primaryActiveOrder.status, activeDriverName);
        const hasDriverGps = activeDriverLat !== undefined && activeDriverLng !== undefined;
        const mapsTrackingUrl = hasDriverGps
          ? `https://www.google.com/maps?q=${activeDriverLat},${activeDriverLng}`
          : undefined;

        return (
          <section
            aria-label="Layar Status Perjalanan Aktif"
            className={`${
              mobileTab === 'perjalanan' ? 'block' : 'hidden md:block'
            } bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl`}
          >
            {/* Top Color-Coded Real-Time Status Banner */}
            <div className={`px-5 py-5 sm:px-8 sm:py-6 border-b ${statusMeta.headerBg}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-neutral-300">
                    <span className="font-mono text-white font-extrabold tabular-nums">
                      {primaryActiveOrder.orderNumber}
                    </span>
                    <span aria-hidden="true">&middot;</span>
                    <span>
                      {primaryActiveOrder.date} &middot; {primaryActiveOrder.time}
                    </span>
                    <span aria-hidden="true">&middot;</span>
                    <span className={statusMeta.accentText}>Pembaruan Real-Time</span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight [text-wrap:balance]">
                    {statusMeta.headline}
                  </h1>
                  <p className="text-sm sm:text-base text-neutral-200 leading-relaxed max-w-2xl">
                    {statusMeta.subtext}
                  </p>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/10">
                  <span className="text-xs text-neutral-300 font-semibold">Total Tarif</span>
                  <span className="text-xl sm:text-2xl font-black text-emerald-400 font-mono tabular-nums">
                    Rp {(primaryActiveOrder.totalPrice || 270000).toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              {/* Multi-active-order switcher if passenger created >1 active booking */}
              {activeOrders.length > 1 && (
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/10 overflow-x-auto pb-1">
                  <span className="text-xs font-semibold text-neutral-300 whitespace-nowrap">
                    Pesanan Aktif ({activeOrders.length}):
                  </span>
                  {activeOrders.map((ord) => (
                    <button
                      key={ord.id}
                      type="button"
                      onClick={() => setSelectedActiveOrderId(ord.id)}
                      className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                        ord.id === primaryActiveOrder.id
                          ? 'bg-white text-neutral-950'
                          : 'bg-black/30 text-neutral-200 hover:bg-black/50'
                      }`}
                    >
                      {ord.orderNumber}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Step-by-Step Progress Bar */}
            <div className="px-5 py-5 sm:px-8 bg-neutral-950/60 border-b border-neutral-800 space-y-4">
              <div className="w-full h-2.5 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${statusMeta.barFill}`}
                  style={{ width: `${statusMeta.progressPct}%` }}
                />
              </div>

              <div className="grid grid-cols-5 gap-1.5 sm:gap-3">
                {TRIP_STEPS.map((step, idx) => {
                  const isDone = idx < currentStepIdx;
                  const isCurrent = idx === currentStepIdx;
                  return (
                    <div key={step.key} className="flex flex-col items-center text-center gap-1.5">
                      <div
                        className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-xs sm:text-sm font-black border transition-colors ${
                          isDone
                            ? 'bg-emerald-600 border-emerald-500 text-white'
                            : isCurrent
                            ? 'bg-white border-white text-neutral-950 shadow-lg'
                            : 'bg-neutral-900 border-neutral-700 text-neutral-500'
                        }`}
                      >
                        {isDone ? <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" /> : idx + 1}
                      </div>
                      <span
                        className={`text-[11px] sm:text-xs leading-tight font-bold ${
                          isCurrent
                            ? 'text-white'
                            : isDone
                            ? 'text-emerald-400'
                            : 'text-neutral-500'
                        }`}
                      >
                        <span className="sm:hidden">{step.shortLabel}</span>
                        <span className="hidden sm:inline">{step.label}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Main Grab-Style Two-Column Detail Grid */}
            <div className="p-5 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column (7 cols): Driver & Vehicle Profile + Live Position + Big Touch Actions */}
              <div className="lg:col-span-7 space-y-5">
                {!hasAssignedDriver ? (
                  <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 sm:p-8 text-center space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-amber-950/80 border border-amber-700/60 flex items-center justify-center mx-auto">
                      <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
                    </div>
                    <div className="space-y-1.5">
                      <h2 className="text-lg sm:text-xl font-black text-white">
                        Menghubungkan ke Driver M3CAR Terdekat
                      </h2>
                      <p className="text-sm text-neutral-300 max-w-md mx-auto leading-relaxed">
                        Halaman ini terhubung langsung ke sistem dispatch. Begitu driver mengambil pesanan Anda, profil driver, nomor plat, dan lokasi langsung tampil di layar ini.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 pt-2">
                      {confirmCancelOrderId === primaryActiveOrder.id ? (
                        <div className="flex flex-wrap items-center justify-center gap-2 bg-red-950/60 border border-red-700 rounded-2xl p-3 w-full">
                          <span className="text-xs sm:text-sm font-bold text-red-200 mr-2">
                            Yakin batalkan pesanan {primaryActiveOrder.orderNumber}?
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              cancelOrderByCustomer(primaryActiveOrder.id);
                              setConfirmCancelOrderId(null);
                            }}
                            className="min-h-[44px] px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs sm:text-sm font-black cursor-pointer"
                          >
                            Ya, Batalkan
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmCancelOrderId(null)}
                            className="min-h-[44px] px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs sm:text-sm font-bold cursor-pointer"
                          >
                            Tidak
                          </button>
                        </div>
                      ) : (
                        <>
                          <a
                            href={formatWaUrl(
                              settings.adminPhone || '085811594114',
                              `Halo Admin M3CAR, saya penumpang ${primaryActiveOrder.customerName} menunggu konfirmasi driver untuk order ${primaryActiveOrder.orderNumber}.`
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-h-[48px] px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-sm font-black flex items-center justify-center gap-2 transition-colors"
                          >
                            <MessageCircle className="w-4 h-4" />
                            <span>Hubungi Admin 24 Jam</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => setConfirmCancelOrderId(primaryActiveOrder.id)}
                            className="min-h-[48px] px-5 py-3 bg-neutral-900 hover:bg-red-950 border border-neutral-700 hover:border-red-700 text-neutral-200 hover:text-red-200 rounded-2xl text-sm font-bold cursor-pointer transition-colors"
                          >
                            Batalkan Pesanan
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-5 sm:p-6 space-y-5">
                    {/* Driver Profile + License Plate Hero */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-neutral-800">
                      <div className="flex items-center gap-4">
                        {activeDriverAvatar ? (
                          <img
                            src={activeDriverAvatar}
                            alt={activeDriverName}
                            referrerPolicy="no-referrer"
                            className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border border-neutral-700 bg-neutral-800 shrink-0"
                          />
                        ) : (
                          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-neutral-800 border border-neutral-700 flex items-center justify-center shrink-0">
                            <User className="w-8 h-8 sm:w-9 sm:h-9 text-red-400" />
                          </div>
                        )}
                        <div className="min-w-0 space-y-1">
                          <div className="text-xs font-semibold text-emerald-400">
                            Driver Resmi M3CAR
                          </div>
                          <h2 className="text-xl sm:text-2xl font-black text-white leading-tight truncate">
                            {activeDriverName}
                          </h2>
                          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-neutral-300">
                            <span className="inline-flex items-center gap-1 font-bold text-amber-400 tabular-nums">
                              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                              {Number(activeDriverRating).toFixed(1)}
                            </span>
                            {activeDriverTrips > 0 && (
                              <>
                                <span aria-hidden="true">&middot;</span>
                                <span className="tabular-nums">{activeDriverTrips} perjalanan</span>
                              </>
                            )}
                            {activeDriverPhone && (
                              <>
                                <span aria-hidden="true">&middot;</span>
                                <span className="font-mono">{activeDriverPhone}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Vehicle & License Plate Display */}
                      <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 pt-3 sm:pt-0 border-t sm:border-t-0 border-neutral-800 shrink-0">
                        <div className="bg-white text-neutral-950 font-mono text-lg sm:text-2xl font-black tracking-wider px-4 py-1.5 rounded-xl border-2 border-neutral-300 shadow-sm uppercase">
                          {activeDriverPlate || 'PLAT TERDAFTAR'}
                        </div>
                        <div className="text-sm sm:text-base font-bold text-neutral-100 flex items-center gap-1.5">
                          <Car className="w-4 h-4 text-red-400 shrink-0" />
                          <span>{activeDriverCar}</span>
                        </div>
                      </div>
                    </div>

                    {/* Live Driver Location & GPS Tracking */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs sm:text-sm font-bold text-neutral-300 flex items-center gap-2">
                          <Navigation className="w-4 h-4 text-emerald-400" />
                          <span>Posisi Driver Saat Ini (Live Firestore)</span>
                        </span>
                        {mapsTrackingUrl && (
                          <a
                            href={mapsTrackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs sm:text-sm font-bold text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 min-h-[36px]"
                          >
                            <span>Buka Google Maps</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>

                      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-1.5">
                        <div className="text-sm sm:text-base font-bold text-white leading-snug">
                          {activeDriverLocation ||
                            (primaryActiveOrder.status === 'DRIVER_OTW'
                              ? 'Driver sedang menuju titik penjemputan Anda'
                              : primaryActiveOrder.status === 'SUDAH_JEMPUT'
                              ? 'Dalam perjalanan menuju tujuan'
                              : 'Menunggu pembaruan GPS driver')}
                        </div>
                        {hasDriverGps && (
                          <div className="text-xs font-mono text-emerald-400 tabular-nums">
                            Koordinat GPS: {Number(activeDriverLat).toFixed(5)}, {Number(activeDriverLng).toFixed(5)}
                          </div>
                        )}
                        {activeDriverLocUpdatedAt && (
                          <div className="text-xs text-neutral-400">
                            Diperbarui: {new Date(activeDriverLocUpdatedAt).toLocaleString('id-ID')}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Primary Thumb-Friendly Driver Contact Buttons (min 48px) */}
                    {activeDriverPhone && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                        <a
                          href={formatWaUrl(
                            activeDriverPhone,
                            `Halo Pak ${activeDriverName}, saya penumpang M3CAR (${primaryActiveOrder.orderNumber}) di ${primaryActiveOrder.pickupLocation}.`
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[50px] px-5 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-base font-black flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-950/50 transition-colors"
                        >
                          <MessageCircle className="w-5 h-5" />
                          <span>Chat WhatsApp Driver</span>
                        </a>
                        <a
                          href={`tel:${activeDriverPhone}`}
                          className="min-h-[50px] px-5 py-3.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white rounded-xl text-base font-bold flex items-center justify-center gap-2.5 transition-colors"
                        >
                          <PhoneCall className="w-5 h-5 text-emerald-400" />
                          <span>Telepon Driver</span>
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right Column (5 cols): Route Timeline & Trip Breakdown */}
              <div className="lg:col-span-5 flex flex-col justify-between bg-neutral-950 border border-neutral-800 rounded-2xl p-5 sm:p-6 space-y-5">
                <div className="space-y-4">
                  <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                    <Route className="w-4 h-4 text-red-500" />
                    <span>Detail Rute Penjemputan</span>
                  </div>

                  {/* Origin -> Destination Route Timeline */}
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-full bg-red-600/20 border border-red-500/50 flex items-center justify-center shrink-0 mt-0.5">
                        <MapPin className="w-4 h-4 text-red-400" />
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-xs font-semibold text-neutral-400">Titik Jemput</div>
                        <div className="text-sm sm:text-base font-bold text-white leading-snug">
                          {primaryActiveOrder.pickupLocation}
                        </div>
                        {primaryActiveOrder.patokan && (
                          <div className="text-xs text-neutral-400">
                            Patokan: {primaryActiveOrder.patokan}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-full bg-emerald-600/20 border border-emerald-500/50 flex items-center justify-center shrink-0 mt-0.5">
                        <Navigation className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-xs font-semibold text-neutral-400">Tujuan Akhir</div>
                        <div className="text-sm sm:text-base font-bold text-white leading-snug">
                          {primaryActiveOrder.destination}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Clean Metadata Grid */}
                  <div className="pt-4 border-t border-neutral-800 space-y-2.5 text-xs sm:text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-neutral-400">Penumpang</span>
                      <span className="font-bold text-white text-right">
                        {primaryActiveOrder.customerName} &middot; {primaryActiveOrder.passengers} Kursi
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-neutral-400">Jadwal Jemput</span>
                      <span className="font-bold text-white tabular-nums">
                        {primaryActiveOrder.date} &middot; {primaryActiveOrder.time}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-neutral-400">Pembayaran</span>
                      <span className="font-bold text-white">
                        {getPaymentLabel(primaryActiveOrder.paymentMethod)} &middot;{' '}
                        <span
                          className={
                            primaryActiveOrder.paymentStatus === 'LUNAS'
                              ? 'text-emerald-400'
                              : 'text-amber-400'
                          }
                        >
                          {primaryActiveOrder.paymentStatus === 'LUNAS' ? 'Lunas' : 'Bayar di Perjalanan'}
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-neutral-400">Jalur Resmi</span>
                      <span className="font-semibold text-neutral-200 text-right">
                        {primaryActiveOrder.eta || '6 jam 30 menit'}
                      </span>
                    </div>
                  </div>

                  {/* Info Pembayaran & QRIS Real-Time di Layar Perjalanan Penumpang */}
                  {(primaryActiveOrder.paymentMethod === 'QRIS_RTB' ||
                    primaryActiveOrder.paymentMethod === 'TRANSFER_DRIVER') && (
                    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-3.5 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <QrCode className="w-4 h-4 text-red-400" />
                          <span>Pembayaran QRIS Resmi M3CAR</span>
                        </span>
                        <button
                          type="button"
                          onClick={handleDownloadQris}
                          className="min-h-[36px] px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>{qrisDownloaded ? 'Tersimpan' : 'Unduh QRIS'}</span>
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setShowQrisModal(true)}
                          className="w-20 h-20 bg-white rounded-xl p-1.5 shrink-0 cursor-pointer border border-neutral-300"
                          aria-label="Lihat QRIS Resmi M3CAR"
                        >
                          <img
                            src={resolvedQrisUrl}
                            alt="QRIS Resmi M3CAR"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = DEFAULT_QRIS_IMAGE_URL;
                            }}
                            className="w-full h-full object-contain"
                          />
                        </button>
                        <div className="text-xs text-neutral-300 space-y-1 min-w-0">
                          <div className="font-semibold text-white">
                            {settings.companyBank?.bankName || 'SeaBank'} &middot;{' '}
                            <span className="font-mono">
                              {settings.companyBank?.accountNumber || '901102051050'}
                            </span>
                          </div>
                          <div className="text-[11px] text-neutral-400 truncate">
                            a.n {settings.companyBank?.accountHolder || 'Ali Husen - CV. ROYAL TRANS BERKAH GROUP'}
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowQrisModal(true)}
                            className="text-xs font-bold text-red-400 hover:text-red-300 underline cursor-pointer"
                          >
                            Perbesar Kode QRIS
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Admin Support Link */}
                <div className="pt-4 border-t border-neutral-800 flex items-center justify-between gap-2">
                  <span className="text-xs text-neutral-400">Butuh bantuan?</span>
                  <a
                    href={formatWaUrl(
                      settings.adminPhone || '085811594114',
                      `Halo Admin M3CAR, saya ingin menanyakan status order ${primaryActiveOrder.orderNumber}.`
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[40px] px-3.5 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                    <span>WhatsApp Admin</span>
                  </a>
                </div>
              </div>
            </div>
          </section>
        );
      })()}

      {/* Customer Identity Bar or Quick Sign-In */}
      {loggedCustomer ? (
        <div
          className={`${
            mobileTab !== 'bantuan' ? 'flex' : 'hidden md:flex'
          } bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex-col sm:flex-row sm:items-center justify-between gap-3`}
        >
          <div className="flex items-center gap-3 text-sm">
            <div className="w-11 h-11 rounded-xl bg-red-600/15 border border-red-600/40 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <span className="font-black text-white text-base block">{loggedCustomer.name}</span>
              <span className="text-neutral-400 font-mono text-xs sm:text-sm">{loggedCustomer.phone}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2.5 w-full sm:w-auto">
            {primaryActiveOrder && (
              <button
                type="button"
                onClick={() => {
                  setShowSecondaryBookingForm((prev) => !prev);
                  setMobileTab('pesan');
                }}
                className="hidden md:flex min-h-[48px] px-4 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-bold items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Pesan Travel Baru</span>
                {showSecondaryBookingForm ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            )}

            <button
              type="button"
              onClick={logout}
              className="min-h-[48px] px-4 py-3 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 rounded-xl text-sm font-bold text-neutral-300 flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-red-400" />
              <span>Ganti Akun</span>
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`${
            mobileTab !== 'bantuan' ? 'block' : 'hidden md:block'
          } bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-6 space-y-4`}
        >
          <div className="flex items-center gap-2 text-base font-black text-white">
            <User className="w-5 h-5 text-red-500 shrink-0" />
            <span>Identitas Penumpang (Masuk Cepat / Lacak)</span>
          </div>
          {authError && (
            <div className="p-3.5 bg-red-950/70 border border-red-700 rounded-xl text-sm font-bold text-red-200">
              {authError}
            </div>
          )}
          <form onSubmit={handleCustomerAuth} className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <input
              type="text"
              value={custName}
              onChange={(e) => setCustName(e.target.value)}
              placeholder="Nama Lengkap Penumpang"
              className="min-h-[48px] px-4 py-3 bg-neutral-950 border border-neutral-800 focus:border-red-500 rounded-xl text-base text-white focus:outline-none"
            />
            <input
              type="tel"
              value={custPhone}
              onChange={(e) => setCustPhone(e.target.value)}
              placeholder="No WhatsApp (+62 / 08...)"
              className="min-h-[48px] px-4 py-3 bg-neutral-950 border border-neutral-800 focus:border-red-500 rounded-xl text-base font-mono text-white focus:outline-none"
            />
            <button
              type="submit"
              className="min-h-[48px] py-3.5 px-5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm sm:text-base font-black cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Masuk / Lacak Pesanan</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Mobile "Perjalanan Saya" Empty State when user taps Perjalanan tab without active order */}
      {!primaryActiveOrder && mobileTab === 'perjalanan' && (
        <div className="md:hidden bg-neutral-900 border border-neutral-800 rounded-2xl p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-red-600/15 border border-red-600/40 flex items-center justify-center mx-auto">
            <Route className="w-7 h-7 text-red-500" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-black text-white">Belum Ada Perjalanan Aktif</h2>
            <p className="text-sm text-neutral-400">
              Buat pesanan travel baru atau masuk dengan nomor HP Anda untuk melacak perjalanan secara real-time.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMobileTab('pesan')}
            className="w-full min-h-[48px] py-3.5 px-5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-base font-black cursor-pointer"
          >
            Pesan Travel Sekarang
          </button>
        </div>
      )}

      {/* Mobile Direct Booking Screen when Active Order Exists & User Taps "Pesan" Tab */}
      {primaryActiveOrder && (
        <div
          className={`${
            mobileTab === 'pesan'
              ? 'block'
              : showSecondaryBookingForm
              ? 'hidden md:block'
              : 'hidden'
          } space-y-4`}
        >
          {renderBookingFormCard()}
        </div>
      )}

      {/* Standard Hero + Split Booking Layout when NO Active Order Exists */}
      {!primaryActiveOrder && (
        <>
          {/* Hero Section */}
          <div
            className={`${
              mobileTab === 'pesan' ? 'grid' : 'hidden md:grid'
            } grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-stretch`}
          >
            <div className="lg:col-span-7 bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-8 flex flex-col justify-between space-y-4 shadow-xl">
              <div className="space-y-2.5">
                <div className="text-xs sm:text-sm font-bold text-red-400 uppercase tracking-wider flex items-center gap-2">
                  <Compass className="w-4 h-4 shrink-0" />
                  <span>{settings.siteContent?.subTagline || 'Travel Antar Jemput Ujung Kulon - Jakarta 24 Jam'}</span>
                </div>
                <h1 className="text-2xl sm:text-4xl font-black text-white leading-tight [text-wrap:balance]">
                  {settings.siteContent?.tagline || 'Jemput Cepat, Sampai Selamat'}
                </h1>
                <p className="text-sm text-neutral-300 leading-relaxed max-w-2xl">
                  {settings.siteContent?.welcomeText ||
                    'CV. ROYAL TRANS BERKAH GROUP melayani antar jemput door-to-door rute Jakarta - Ujung Kulon via Tol Tangerang-Merak & Tol Serang-Panimbang dengan armada prima dan mitra driver terverifikasi KTP & SIM A.'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-neutral-800 text-sm">
                <div className="flex sm:block items-center justify-between">
                  <span className="text-xs text-neutral-400 block">Tarif Normal</span>
                  <span className="text-lg sm:text-xl font-black text-white tabular-nums">
                    Rp {(settings.pricePerPerson || 270000).toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="flex sm:block items-center justify-between">
                  <span className="text-xs text-neutral-400 block">Estimasi Tol</span>
                  <span className="text-base sm:text-lg font-black text-red-400">
                    {settings.siteContent?.travelTimeEta || '6 Jam 30 Menit'}
                  </span>
                </div>
                <div className="flex sm:block items-center justify-between">
                  <span className="text-xs text-neutral-400 block">Layanan</span>
                  <span className="text-base sm:text-lg font-black text-emerald-400">24 Jam</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-900 relative min-h-[200px] shadow-xl">
              <img
                src={settings.siteContent?.bannerUrl || fleetHeroImg}
                alt="Armada Eksekutif M3CAR Travel"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover lg:h-full"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent flex flex-col justify-end p-4 sm:p-5">
                <div className="text-xs font-bold text-red-400 uppercase tracking-wider">
                  Door to Door Service
                </div>
                <div className="text-sm sm:text-base font-black text-white mt-0.5">
                  {settings.siteContent?.tollRouteDesc || 'Tol Jakarta-Merak + Tol Serang-Panimbang 83,6 km'}
                </div>
              </div>
            </div>
          </div>

          {/* Main Content Split: Booking Form + Trip History / Support */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
            <div className={`${mobileTab === 'pesan' ? 'block' : 'hidden md:block'} lg:col-span-7`}>
              {renderBookingFormCard()}
            </div>

            <div className="lg:col-span-5 space-y-4">
              <div
                className={`${
                  mobileTab === 'perjalanan' ? 'block' : 'hidden md:block'
                } bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-6 space-y-4 shadow-xl`}
              >
                <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                  <History className="w-5 h-5 text-red-500" />
                  <span>Riwayat Perjalanan Saya ({pastOrders.length})</span>
                </h2>

                {!loggedCustomer ? (
                  <div className="text-sm text-neutral-400 py-6 text-center">
                    Masuk atau buat pesanan terlebih dahulu untuk memantau posisi driver secara real-time di layar utama.
                  </div>
                ) : pastOrders.length === 0 ? (
                  <div className="text-sm text-neutral-400 py-6 text-center">
                    Belum ada riwayat perjalanan atas nomor{' '}
                    <span className="font-mono text-white">{loggedCustomer.phone}</span>.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pastOrders.slice(0, 5).map((order) => (
                      <div
                        key={order.id}
                        className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 space-y-2.5"
                      >
                        <div className="flex items-center justify-between text-xs sm:text-sm">
                          <span className="font-mono font-bold text-red-400">{order.orderNumber}</span>
                          <span
                            className={`font-bold ${
                              order.status === 'SELESAI' ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            {order.status === 'SELESAI' ? 'Selesai' : 'Dibatalkan'}
                          </span>
                        </div>
                        <div className="text-sm space-y-1">
                          <div className="font-bold text-white">{order.pickupLocation}</div>
                          <div className="text-neutral-400 text-xs sm:text-sm">
                            Ke: <span className="text-neutral-200">{order.destination}</span>
                          </div>
                          <div className="text-neutral-400 text-xs sm:text-sm flex flex-wrap items-center justify-between gap-2 pt-1">
                            <span>
                              {order.date} &middot; {order.time} &middot; {order.passengers} Kursi
                            </span>
                            <span className="text-emerald-400 text-base font-black tabular-nums">
                              Rp {(order.totalPrice || 270000).toLocaleString('id-ID')}
                            </span>
                          </div>
                          {order.driverName && (
                            <div className="text-xs sm:text-sm text-neutral-300 pt-1.5 border-t border-neutral-800/80">
                              Driver: <span className="font-bold text-white">{order.driverName}</span>
                              {order.driverPlate && (
                                <span className="font-mono text-neutral-400"> &middot; {order.driverPlate}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div
                className={`${
                  mobileTab === 'bantuan' ? 'block' : 'hidden md:block'
                } bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-5 text-sm space-y-4`}
              >
                <div className="font-black text-white text-base flex items-center gap-2">
                  <Shield className="w-5 h-5 text-red-500" />
                  <span>Bantuan Admin 24 Jam</span>
                </div>
                <p className="text-neutral-300 text-sm leading-relaxed">
                  Butuh bantuan cepat atau jadwal khusus? Hubungi Admin Pusat CV. Royal Trans Berkah Group.
                </p>
                <a
                  href={formatWaUrl(
                    settings.adminPhone || '085811594114',
                    'Halo Admin M3CAR, saya ingin menanyakan jadwal travel Ujung Kulon - Jakarta.'
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-4 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm sm:text-base font-black transition-colors"
                >
                  <Phone className="w-4 h-4" />
                  <span>WhatsApp Admin ({settings.adminPhone || '085811594114'})</span>
                </a>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Past Trip History below active order if any */}
      {primaryActiveOrder && pastOrders.length > 0 && (
        <div
          className={`${
            mobileTab === 'perjalanan' ? 'block' : 'hidden md:block'
          } bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-6 space-y-3`}
        >
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <History className="w-5 h-5 text-red-500" />
            <span>Riwayat Perjalanan Sebelumnya ({pastOrders.length})</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pastOrders.slice(0, 4).map((order) => (
              <div
                key={order.id}
                className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 space-y-1.5 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-red-400">{order.orderNumber}</span>
                  <span
                    className={`font-bold ${
                      order.status === 'SELESAI' ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {order.status === 'SELESAI' ? 'Selesai' : 'Dibatalkan'}
                  </span>
                </div>
                <div className="font-semibold text-white truncate">
                  {order.pickupLocation} &rarr; {order.destination}
                </div>
                <div className="flex items-center justify-between text-neutral-400">
                  <span>
                    {order.date} &middot; {order.time}
                  </span>
                  <span className="font-black text-emerald-400 tabular-nums text-base">
                    Rp {(order.totalPrice || 270000).toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mobile Bantuan Tab Full Support + Official QRIS Card (when active order exists or dedicated mobile Bantuan view) */}
      {mobileTab === 'bantuan' && (
        <div className="md:hidden space-y-4">
          {primaryActiveOrder && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-4">
              <div className="font-black text-white text-base flex items-center gap-2">
                <Shield className="w-5 h-5 text-red-500" />
                <span>Bantuan Admin 24 Jam</span>
              </div>
              <p className="text-neutral-300 text-sm leading-relaxed">
                Butuh bantuan cepat terkait penjemputan atau pembayaran? Hubungi Admin Pusat M3CAR.
              </p>
              <a
                href={formatWaUrl(
                  settings.adminPhone || '085811594114',
                  `Halo Admin M3CAR, saya penumpang ${primaryActiveOrder.customerName} (${primaryActiveOrder.orderNumber}) membutuhkan bantuan.`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-4 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-base font-black"
              >
                <Phone className="w-4 h-4" />
                <span>WhatsApp Admin ({settings.adminPhone || '085811594114'})</span>
              </a>
            </div>
          )}

          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-4">
            <div className="flex items-center gap-2 text-base font-black text-white">
              <QrCode className="w-5 h-5 text-red-500" />
              <span>Pembayaran QRIS &amp; Rekening Resmi</span>
            </div>
            <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-2 text-sm">
              <div className="text-neutral-400 text-xs">Rekening Resmi Perusahaan</div>
              <div className="font-black text-white">
                {settings.companyBank?.bankName || 'SeaBank'} &middot;{' '}
                <span className="font-mono">{settings.companyBank?.accountNumber || '901102051050'}</span>
              </div>
              <div className="text-neutral-300 text-xs">
                a.n {settings.companyBank?.accountHolder || 'Ali Husen - CV. ROYAL TRANS BERKAH GROUP'}
              </div>
            </div>
            <div className="flex justify-center">
              <div className="bg-white p-2.5 rounded-2xl border border-neutral-300">
                <img
                  src={resolvedQrisUrl}
                  alt="QRIS Resmi M3CAR"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = DEFAULT_QRIS_IMAGE_URL;
                  }}
                  className="w-48 h-48 object-contain"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleDownloadQris}
              className="w-full min-h-[48px] py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-base font-black flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{qrisDownloaded ? 'QRIS Berhasil Diunduh' : 'Unduh QRIS Resmi'}</span>
            </button>
          </div>
        </div>
      )}

      {/* QRIS Modal (Real-Time Firestore setting_admin/payment_config) */}
      {showQrisModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-5 max-w-sm w-full space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-black text-white">QRIS Resmi M3CAR (RTB Group)</h3>
                {liveQrisUpdatedAt && (
                  <p className="text-xs text-neutral-400">
                    Diperbarui: {new Date(liveQrisUpdatedAt).toLocaleString('id-ID')}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowQrisModal(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center bg-neutral-800 rounded-full text-neutral-400 hover:text-white cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-white rounded-2xl p-3 border border-neutral-300 flex items-center justify-center">
              <img
                src={resolvedQrisUrl}
                alt="QRIS RTB Group Travel Sumur"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = DEFAULT_QRIS_IMAGE_URL;
                }}
                className="w-full max-h-80 object-contain rounded-xl"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handleDownloadQris}
                className="min-h-[48px] py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-black inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>{qrisDownloaded ? 'QRIS Diunduh' : 'Unduh QRIS'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowQrisModal(false)}
                className="min-h-[48px] px-4 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-sm font-bold cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Bottom Navigation Bar (Mobile Android App Nav - md:hidden) */}
      <nav
        aria-label="Navigasi Bawah Penumpang"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-neutral-950/95 backdrop-blur-md border-t border-neutral-800"
      >
        <div className="grid grid-cols-3 items-center h-16 max-w-md mx-auto px-2">
          <button
            type="button"
            onClick={() => {
              setMobileTab('pesan');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl cursor-pointer transition-colors ${
              mobileTab === 'pesan' ? 'text-red-500 font-black' : 'text-neutral-400 hover:text-white font-semibold'
            }`}
          >
            <Car className="w-5 h-5" />
            <span className="text-[11px] tracking-tight">Pesan</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMobileTab('perjalanan');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl cursor-pointer transition-colors relative ${
              mobileTab === 'perjalanan'
                ? 'text-red-500 font-black'
                : 'text-neutral-400 hover:text-white font-semibold'
            }`}
          >
            <div className="relative">
              <Route className="w-5 h-5" />
              {activeOrders.length > 0 && (
                <span className="absolute -top-1.5 -right-2.5 px-1.5 py-0.2 bg-emerald-600 text-white text-[10px] font-black rounded-full leading-tight tabular-nums">
                  {activeOrders.length}
                </span>
              )}
            </div>
            <span className="text-[11px] tracking-tight">Perjalanan Saya</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMobileTab('bantuan');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl cursor-pointer transition-colors ${
              mobileTab === 'bantuan'
                ? 'text-red-500 font-black'
                : 'text-neutral-400 hover:text-white font-semibold'
            }`}
          >
            <PhoneCall className="w-5 h-5" />
            <span className="text-[11px] tracking-tight">Bantuan</span>
          </button>
        </div>
      </nav>
    </div>
  );
};
