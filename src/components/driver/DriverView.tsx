import React, { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useM3CarStore, normalizePhone, MIN_DRIVER_ACTIVE_BALANCE } from '../../store/m3carStore';
import { DriverProfile, Order } from '../../types';
import {
  db,
  uploadDriverDocumentToStorage,
  compressImageFile,
  normalizeDriverStatusFromDb,
  DEFAULT_QRIS_IMAGE_URL,
  subscribePaymentConfig,
} from '../../services/firestoreService';
import { formatWaUrl } from '../../utils/routePricing';
import { playDriverAcceptedSound } from '../../utils/audio';
import {
  Car,
  Phone,
  User,
  Upload,
  CheckCircle2,
  XCircle,
  Clock,
  Shield,
  Wallet,
  Power,
  MapPin,
  Navigation,
  Users,
  AlertCircle,
  Loader2,
  FileText,
  LogOut,
  PlusCircle,
  ArrowRight,
  Ban,
  QrCode,
  CreditCard,
  RefreshCw,
  Lock,
  Eye,
  EyeOff,
  KeyRound,
  LocateFixed,
  Copy,
  Check,
  Download,
  Home,
} from 'lucide-react';

export const DriverView: React.FC = () => {
  const {
    currentUser,
    drivers,
    orders,
    transactions,
    topUpRequests,
    settings,
    firestoreError,
    logout,
    registerDriver,
    loginDriverWithPassword,
    setupFirstTimeDriverPassword,
    recoverDriverPassword,
    resubmitDriverDocuments,
    setDriverOnlineStatus,
    updateDriverLocation,
    acceptOrderByDriver,
    rejectOrderByDriver,
    advanceOrderStatus,
    confirmOrderPayment,
    createTopUpRequest,
    syncDriverSnapshot,
  } = useM3CarStore();

  const loggedDriverId = currentUser && currentUser.role === 'driver' ? currentUser.id : null;
  const [liveDriverDoc, setLiveDriverDoc] = useState<Partial<DriverProfile> | null>(null);
  const [liveQrisUrl, setLiveQrisUrl] = useState<string>(
    settings.qrisImageUrl || DEFAULT_QRIS_IMAGE_URL
  );
  const [qrisDownloaded, setQrisDownloaded] = useState(false);
  const prevRawStatusRef = useRef<string | null>(null);
  const ordersSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsub = subscribePaymentConfig((data) => {
      if (data.qrisImageUrl) {
        setLiveQrisUrl(data.qrisImageUrl);
      }
    });
    return () => unsub();
  }, []);

  const resolvedQrisUrl = liveQrisUrl || settings.qrisImageUrl || DEFAULT_QRIS_IMAGE_URL;

  const handleDownloadDriverQris = async () => {
    const src = resolvedQrisUrl;
    try {
      let downloadHref = src;
      let objectUrl: string | null = null;
      if (!src.startsWith('data:')) {
        const resp = await fetch(src);
        if (resp.ok) {
          const blob = await resp.blob();
          objectUrl = URL.createObjectURL(blob);
          downloadHref = objectUrl;
        }
      }
      const link = document.createElement('a');
      link.href = downloadHref;
      link.download = `QRIS-Resmi-M3CAR-${new Date().toISOString().slice(0, 10)}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      if (objectUrl) {
        setTimeout(() => URL.revokeObjectURL(objectUrl!), 1500);
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

  const baseLoggedDriver: DriverProfile | null =
    currentUser && currentUser.role === 'driver'
      ? drivers.find((d) => d.id === currentUser.id) || (currentUser as DriverProfile)
      : null;

  const loggedDriver: DriverProfile | null = baseLoggedDriver
    ? ({ ...baseLoggedDriver, ...(liveDriverDoc || {}) } as DriverProfile)
    : null;

  // Auth / Registration / Recovery Mode
  const [authMode, setAuthMode] = useState<
    'register' | 'login' | 'first-password' | 'recover' | 'pending-status'
  >('register');
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  // Driver Registration Form State (KTP & SIM A only, TANPA SELFIE + Kata Sandi Pribadi)
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [carModel, setCarModel] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  const [ktpFile, setKtpFile] = useState<File | null>(null);
  const [ktpPreview, setKtpPreview] = useState<string>('');
  const [simFile, setSimFile] = useState<File | null>(null);
  const [simPreview, setSimPreview] = useState<string>('');
  const [isSubmittingReg, setIsSubmittingReg] = useState(false);
  const [uploadStepText, setUploadStepText] = useState('');

  // Pending registration real-time preview (Rules 7 & 8)
  const [pendingRegDriver, setPendingRegDriver] = useState<DriverProfile | null>(null);

  // Legacy Driver First-Time Password State (Rule 10)
  const [legacyPhone, setLegacyPhone] = useState('');
  const [legacyPlate, setLegacyPlate] = useState('');
  const [legacyPassword, setLegacyPassword] = useState('');
  const [legacyConfirmPassword, setLegacyConfirmPassword] = useState('');
  const [showLegacyPw, setShowLegacyPw] = useState(false);
  const [isSubmittingLegacy, setIsSubmittingLegacy] = useState(false);

  // Forgot Password / Account Recovery State (Rule 9)
  const [recoverMethod, setRecoverMethod] = useState<'identity' | 'code'>('identity');
  const [recoverPhone, setRecoverPhone] = useState('');
  const [recoverPlate, setRecoverPlate] = useState('');
  const [recoverName, setRecoverName] = useState('');
  const [recoverCode, setRecoverCode] = useState('');
  const [recoverNewPassword, setRecoverNewPassword] = useState('');
  const [recoverConfirmPassword, setRecoverConfirmPassword] = useState('');
  const [showRecoverPw, setShowRecoverPw] = useState(false);
  const [isSubmittingRecover, setIsSubmittingRecover] = useState(false);

  // Re-upload docs state if rejected
  const [reKtpFile, setReKtpFile] = useState<File | null>(null);
  const [reKtpPreview, setReKtpPreview] = useState('');
  const [reSimFile, setReSimFile] = useState<File | null>(null);
  const [reSimPreview, setReSimPreview] = useState('');
  const [isResubmitting, setIsResubmitting] = useState(false);

  // Dashboard tabs ('home' = Beranda, 'orders' = Orderan, 'wallet' = Dompet, 'profile' = Profil)
  const [driverTab, setDriverTab] = useState<'home' | 'orders' | 'wallet' | 'profile'>('home');
  const [actionAlert, setActionAlert] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Topup form & modal state
  const [topUpAmount, setTopUpAmount] = useState(100000);
  const [topUpNote, setTopUpNote] = useState('');
  const [receiptPreview, setReceiptPreview] = useState('');
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
  const [isSubmittingTopUp, setIsSubmittingTopUp] = useState(false);
  const [copiedBank, setCopiedBank] = useState(false);
  const [showQrisModal, setShowQrisModal] = useState(false);

  // Real-time Driver Location state (synced to Firestore drivers & active orders)
  const [lokasiInput, setLokasiInput] = useState('');
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);
  const [isLiveGpsOn, setIsLiveGpsOn] = useState(false);
  const gpsWatchIdRef = useRef<number | null>(null);
  const lastGpsSyncAtRef = useRef<number>(0);

  // Realtime listener untuk driver baru mendaftar yang menunggu persetujuan admin
  useEffect(() => {
    if (!pendingRegDriver?.id || loggedDriverId) return;
    const pendingRef = doc(db, 'drivers', pendingRegDriver.id);
    const unsub = onSnapshot(
      pendingRef,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        const rawStatus = String(data.status || 'waiting_approval').toLowerCase().trim();
        const normalizedStatus = normalizeDriverStatusFromDb(rawStatus);
        setPendingRegDriver((prev) =>
          prev
            ? {
                ...prev,
                status: normalizedStatus,
                rawStatus,
                rejectionReason: data.rejectionReason || prev.rejectionReason,
              }
            : prev
        );
        if (rawStatus === 'approved') {
          playDriverAcceptedSound();
        }
      },
      () => {}
    );
    return () => unsub();
  }, [pendingRegDriver?.id, loggedDriverId]);

  // Firebase Realtime Listener langsung pada doc(db, "drivers", driverId)
  // Otomatis berubah status (waiting_approval -> approved / rejected) tanpa perlu refresh halaman!
  useEffect(() => {
    if (!loggedDriverId) {
      setLiveDriverDoc(null);
      prevRawStatusRef.current = null;
      return;
    }

    const driverRef = doc(db, 'drivers', loggedDriverId);
    const unsubscribe = onSnapshot(
      driverRef,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        const rawStatus = String(data.status || 'waiting_approval').toLowerCase().trim();
        const normalizedStatus = normalizeDriverStatusFromDb(rawStatus);
        const ktpUrl = data.ktpUrl || data.ktpPhotoUrl || '';
        const simUrl = data.simUrl || data.simPhotoUrl || '';
        const plateVal = data.plate || data.plateNumber || data.plat_mobil || '';
        const carVal = data.car || data.carModel || '';

        const resolvedBal =
          data.balance !== undefined
            ? Number(data.balance)
            : data.saldo !== undefined
            ? Number(data.saldo)
            : undefined;

        const patch: Partial<DriverProfile> = {
          name: data.name || data.nama || undefined,
          phone: data.phone || data.no_hp || undefined,
          plate: plateVal || undefined,
          plateNumber: plateVal || undefined,
          car: carVal || undefined,
          carModel: carVal || undefined,
          ktpUrl: ktpUrl || undefined,
          ktpPhotoUrl: ktpUrl || undefined,
          simUrl: simUrl || undefined,
          simPhotoUrl: simUrl || undefined,
          status: normalizedStatus,
          rawStatus,
          rejectionReason: data.rejectionReason || '',
          blockReason: data.blockReason || '',
          balance: resolvedBal,
          saldo: resolvedBal,
          lokasi: data.lokasi || data.currentLocation || undefined,
          currentLocation: data.currentLocation || data.lokasi || undefined,
          lat: data.lat !== undefined ? Number(data.lat) : undefined,
          lng: data.lng !== undefined ? Number(data.lng) : undefined,
          locationUpdatedAt: data.locationUpdatedAt || undefined,
          isOnline:
            rawStatus === 'approved' &&
            (resolvedBal === undefined || resolvedBal >= MIN_DRIVER_ACTIVE_BALANCE)
              ? data.isOnline !== undefined
                ? Boolean(data.isOnline)
                : false
              : false,
        };

        setLiveDriverDoc(patch);
        syncDriverSnapshot(loggedDriverId, patch);

        if (
          prevRawStatusRef.current &&
          prevRawStatusRef.current !== 'approved' &&
          rawStatus === 'approved'
        ) {
          playDriverAcceptedSound();
          setActionAlert({
            type: 'success',
            text: 'Selamat! Akun Anda telah DISETUJUI Admin. Akun Aktif & Siap Menerima Order!',
          });
        } else if (
          prevRawStatusRef.current &&
          prevRawStatusRef.current !== 'rejected' &&
          rawStatus === 'rejected'
        ) {
          setActionAlert({
            type: 'error',
            text: `Pendaftaran ditolak Admin. Alasan: ${data.rejectionReason || 'Dokumen KTP atau SIM A belum sesuai.'}`,
          });
        }
        prevRawStatusRef.current = rawStatus;
      },
      (err) => {
        console.warn('Listener dokumen driver:', err);
      }
    );

    return () => unsubscribe();
  }, [loggedDriverId]);

  useEffect(() => {
    if (loggedDriver?.lokasi || loggedDriver?.currentLocation) {
      setLokasiInput((prev) => prev || loggedDriver.lokasi || loggedDriver.currentLocation || '');
    }
  }, [loggedDriver?.id, loggedDriver?.lokasi, loggedDriver?.currentLocation]);

  useEffect(() => {
    if (!isLiveGpsOn || !loggedDriverId || loggedDriver?.status !== 'AKTIF') {
      if (gpsWatchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
        gpsWatchIdRef.current = null;
      }
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setActionAlert({ type: 'error', text: 'Browser/perangkat ini tidak mendukung GPS.' });
      setIsLiveGpsOn(false);
      return;
    }

    gpsWatchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const now = Date.now();
        if (now - lastGpsSyncAtRef.current < 15000) return;
        lastGpsSyncAtRef.current = now;
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const label = lokasiInput.trim() || `GPS (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
        await updateDriverLocation(loggedDriverId, { lat, lng, lokasi: label });
      },
      (err) => {
        setActionAlert({
          type: 'error',
          text: `GPS Live terhenti: ${err.message || 'Pastikan izin lokasi aktif.'}`,
        });
        setIsLiveGpsOn(false);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    return () => {
      if (gpsWatchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
        gpsWatchIdRef.current = null;
      }
    };
  }, [isLiveGpsOn, loggedDriverId, loggedDriver?.status]);

  const handleSelectDocFile = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'ktp' | 'sim',
    isResubmit = false
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAuthError('Mohon pilih file gambar (JPG / PNG / WEBP).');
      return;
    }
    setAuthError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      if (isResubmit) {
        if (type === 'ktp') {
          setReKtpFile(file);
          setReKtpPreview(result);
        } else {
          setReSimFile(file);
          setReSimPreview(result);
        }
      } else {
        if (type === 'ktp') {
          setKtpFile(file);
          setKtpPreview(result);
        } else {
          setSimFile(file);
          setSimPreview(result);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthNotice(null);

    if (!fullName.trim()) {
      setAuthError('Nama Lengkap wajib diisi.');
      return;
    }
    if (!phone.trim()) {
      setAuthError('No HP wajib diisi.');
      return;
    }
    if (!plateNumber.trim()) {
      setAuthError('No Polisi wajib diisi.');
      return;
    }
    if (!carModel.trim()) {
      setAuthError('Merk Mobil wajib diisi.');
      return;
    }
    if (!regPassword || regPassword.length < 6) {
      setAuthError('Kata sandi pribadi wajib diisi (minimal 6 karakter).');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setAuthError('Ulangi kata sandi tidak cocok dengan kata sandi pribadi Anda.');
      return;
    }
    if (!ktpFile) {
      setAuthError('Foto KTP wajib diupload.');
      return;
    }
    if (!simFile) {
      setAuthError('Foto SIM A wajib diupload.');
      return;
    }

    setIsSubmittingReg(true);
    try {
      setUploadStepText('Mengunggah Foto KTP ke penyimpanan (/drivers/ktp/)...');
      const ktpUpload = await uploadDriverDocumentToStorage(ktpFile, 'ktp', phone);

      setUploadStepText('Mengunggah Foto SIM A ke penyimpanan (/drivers/sim/)...');
      const simUpload = await uploadDriverDocumentToStorage(simFile, 'sim', phone);

      setUploadStepText('Mengenkripsi kata sandi di server & menyimpan pendaftaran...');
      const res = await registerDriver({
        name: fullName.trim(),
        phone: phone.trim(),
        plateNumber: plateNumber.trim().toUpperCase(),
        carModel: carModel.trim(),
        ktpPhotoUrl: ktpUpload.url,
        simPhotoUrl: simUpload.url,
        password: regPassword,
        confirmPassword: regConfirmPassword,
      });

      if (!res.success) {
        setAuthError(res.message || 'Gagal mendaftar sebagai driver.');
        if (res.needsFirstPassword) {
          setLegacyPhone(phone.trim());
        }
      } else {
        setPendingRegDriver(res.driver || null);
        setLoginPhone(res.driver?.phone || phone.trim());
        setRegPassword('');
        setRegConfirmPassword('');
        setAuthNotice(
          res.message ||
            'Pendaftaran berhasil! Akun Anda berstatus MENUNGGU PERSETUJUAN ADMIN.'
        );
        setAuthMode('pending-status');
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Terjadi kesalahan saat mengunggah dokumen.');
    } finally {
      setIsSubmittingReg(false);
      setUploadStepText('');
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthNotice(null);

    if (!loginPhone.trim()) {
      setAuthError('Nomor HP wajib diisi.');
      return;
    }
    if (!loginPassword) {
      setAuthError('Kata sandi pribadi wajib diisi.');
      return;
    }

    setIsLoggingIn(true);
    try {
      const res = await loginDriverWithPassword(loginPhone, loginPassword);
      if (!res.success) {
        setAuthError(res.message || 'Gagal masuk.');
        if (res.needsFirstPassword) {
          setLegacyPhone(res.driverPhone || loginPhone);
        }
      } else {
        setLoginPassword('');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleFirstPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthNotice(null);

    if (!legacyPhone.trim() || !legacyPlate.trim()) {
      setAuthError('Nomor HP dan Nomor Polisi (Plat Mobil) wajib diisi untuk verifikasi driver lama.');
      return;
    }
    if (!legacyPassword || legacyPassword.length < 6) {
      setAuthError('Kata sandi pribadi minimal 6 karakter.');
      return;
    }
    if (legacyPassword !== legacyConfirmPassword) {
      setAuthError('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    setIsSubmittingLegacy(true);
    try {
      const res = await setupFirstTimeDriverPassword({
        phone: legacyPhone.trim(),
        plateNumber: legacyPlate.trim().toUpperCase(),
        password: legacyPassword,
        confirmPassword: legacyConfirmPassword,
      });
      if (!res.success) {
        setAuthError(res.message);
      } else {
        setLoginPhone(legacyPhone.trim());
        setLegacyPassword('');
        setLegacyConfirmPassword('');
        setAuthNotice(res.message);
        setAuthMode('login');
      }
    } finally {
      setIsSubmittingLegacy(false);
    }
  };

  const handleRecoverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthNotice(null);

    if (!recoverPhone.trim()) {
      setAuthError('Nomor HP terdaftar wajib diisi.');
      return;
    }
    if (recoverMethod === 'identity' && (!recoverPlate.trim() || !recoverName.trim())) {
      setAuthError('Nomor Polisi dan Nama Lengkap pendaftaran wajib diisi.');
      return;
    }
    if (recoverMethod === 'code' && !recoverCode.trim()) {
      setAuthError('Kode Pemulihan 6-digit dari Admin wajib diisi.');
      return;
    }
    if (!recoverNewPassword || recoverNewPassword.length < 6) {
      setAuthError('Kata sandi baru minimal 6 karakter.');
      return;
    }
    if (recoverNewPassword !== recoverConfirmPassword) {
      setAuthError('Konfirmasi kata sandi baru tidak cocok.');
      return;
    }

    setIsSubmittingRecover(true);
    try {
      const res = await recoverDriverPassword({
        phone: recoverPhone.trim(),
        plateNumber: recoverMethod === 'identity' ? recoverPlate.trim().toUpperCase() : undefined,
        fullName: recoverMethod === 'identity' ? recoverName.trim() : undefined,
        recoveryCode: recoverMethod === 'code' ? recoverCode.trim() : undefined,
        newPassword: recoverNewPassword,
        confirmPassword: recoverConfirmPassword,
      });
      if (!res.success) {
        setAuthError(res.message);
      } else {
        setLoginPhone(recoverPhone.trim());
        setRecoverNewPassword('');
        setRecoverConfirmPassword('');
        setRecoverCode('');
        setAuthNotice(res.message);
        setAuthMode('login');
      }
    } finally {
      setIsSubmittingRecover(false);
    }
  };

  const handleResubmitDocs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loggedDriver) return;
    if (!reKtpFile || !reSimFile) {
      setActionAlert({ type: 'error', text: 'Upload ulang Foto KTP dan Foto SIM A wajib dilengkapi.' });
      return;
    }
    setIsResubmitting(true);
    try {
      const ktpUpload = await uploadDriverDocumentToStorage(reKtpFile, 'ktp', loggedDriver.phone);
      const simUpload = await uploadDriverDocumentToStorage(reSimFile, 'sim', loggedDriver.phone);
      await resubmitDriverDocuments(loggedDriver.id, ktpUpload.url, simUpload.url);
      setReKtpFile(null);
      setReKtpPreview('');
      setReSimFile(null);
      setReSimPreview('');
      setActionAlert({
        type: 'success',
        text: 'Foto KTP & SIM A berhasil dikirim ulang! Status kembali ke Menunggu Persetujuan Admin.',
      });
    } catch {
      setActionAlert({ type: 'error', text: 'Gagal mengunggah ulang dokumen.' });
    } finally {
      setIsResubmitting(false);
    }
  };

  const handleSaveManualLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loggedDriver) return;
    if (!lokasiInput.trim()) {
      setActionAlert({ type: 'error', text: 'Masukkan area/lokasi Anda saat ini sebelum menyimpan.' });
      return;
    }
    setIsUpdatingLocation(true);
    try {
      const res = await updateDriverLocation(loggedDriver.id, {
        lat: loggedDriver.lat,
        lng: loggedDriver.lng,
        lokasi: lokasiInput.trim(),
      });
      if (!res.success) {
        setActionAlert({ type: 'error', text: res.message || 'Gagal menyimpan lokasi ke Firestore.' });
      } else {
        setActionAlert({
          type: 'success',
          text: `Lokasi diperbarui ke "${lokasiInput.trim()}" dan langsung tampil di Admin.`,
        });
      }
    } finally {
      setIsUpdatingLocation(false);
    }
  };

  const handleUpdateGpsOnce = () => {
    if (!loggedDriver) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setActionAlert({ type: 'error', text: 'Perangkat tidak mendukung fitur GPS.' });
      return;
    }
    setIsUpdatingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const label = lokasiInput.trim() || `GPS (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
          const res = await updateDriverLocation(loggedDriver.id, { lat, lng, lokasi: label });
          if (!res.success) {
            setActionAlert({ type: 'error', text: res.message || 'Gagal memperbarui GPS ke Firestore.' });
          } else {
            setLokasiInput(label);
            setActionAlert({
              type: 'success',
              text: `Koordinat GPS (${lat.toFixed(5)}, ${lng.toFixed(5)}) berhasil disimpan ke Cloud Firestore.`,
            });
          }
        } finally {
          setIsUpdatingLocation(false);
        }
      },
      (err) => {
        setIsUpdatingLocation(false);
        setActionAlert({
          type: 'error',
          text: `Gagal mengambil GPS: ${err.message || 'Pastikan izin lokasi browser diaktifkan.'}`,
        });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSelectReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { dataUrl } = await compressImageFile(file, 720, 0.72);
      setReceiptPreview(dataUrl);
    } catch {
      setActionAlert({ type: 'error', text: 'Gagal membaca file bukti transfer.' });
    }
  };

  const handleCopyBankAccount = async (accNumber: string) => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(accNumber);
        setCopiedBank(true);
        setTimeout(() => setCopiedBank(false), 2000);
      }
    } catch {
      // Ignore clipboard failures on restricted contexts
    }
  };

  const handleSubmitTopUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loggedDriver || isSubmittingTopUp) return;
    const nominal = Number(topUpAmount) || 0;
    if (nominal < MIN_DRIVER_ACTIVE_BALANCE) {
      setActionAlert({
        type: 'error',
        text: `Minimal pengisian saldo adalah Rp ${MIN_DRIVER_ACTIVE_BALANCE.toLocaleString('id-ID')}.`,
      });
      return;
    }

    setIsSubmittingTopUp(true);
    try {
      const res = await createTopUpRequest(
        loggedDriver.id,
        nominal,
        receiptPreview || undefined,
        nominal,
        undefined,
        undefined,
        undefined,
        undefined,
        topUpNote
      );
      if (!res.success) {
        setActionAlert({
          type: 'error',
          text: res.message || 'Gagal mengirim pengajuan isi saldo ke Admin.',
        });
        return;
      }

      setReceiptPreview('');
      setTopUpNote('');
      setIsTopUpModalOpen(false);
      setDriverTab('wallet');
      setActionAlert({
        type: 'success',
        text: `Pengajuan isi saldo Rp ${nominal.toLocaleString('id-ID')} berhasil dikirim ke Admin (Menunggu Konfirmasi).`,
      });
    } finally {
      setIsSubmittingTopUp(false);
    }
  };

  // =========================================================================
  // NOT LOGGED IN AS DRIVER -> REGISTRATION, LOGIN, RECOVERY & LEGACY PASSWORD
  // =========================================================================
  if (!loggedDriver) {
    const activePending = pendingRegDriver
      ? drivers.find((d) => d.id === pendingRegDriver.id) || pendingRegDriver
      : null;

    return (
      <div className="w-full max-w-md mx-auto md:max-w-3xl px-3.5 sm:px-4 py-4 sm:py-8 space-y-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-6 shadow-2xl space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-red-600/15 border border-red-600/40 flex items-center justify-center shrink-0">
                <Car className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Mitra Driver <span className="text-red-500">M3CAR</span>
                </h1>
                <p className="text-xs sm:text-sm text-neutral-400">
                  Akun Terproteksi Kata Sandi &bull; Dokumen KTP &amp; SIM A
                </p>
              </div>
            </div>

            {/* Segmented Switch: Daftar Baru / Masuk Driver */}
            <div className="grid grid-cols-2 w-full md:w-auto items-center p-1 bg-neutral-950 border border-neutral-800 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setAuthError(null);
                  setAuthNotice(null);
                }}
                className={`min-h-[48px] px-4 py-3 rounded-xl text-sm font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  authMode === 'register'
                    ? 'bg-red-600 text-white'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Daftar Driver
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthError(null);
                  setAuthNotice(null);
                }}
                className={`min-h-[48px] px-4 py-3 rounded-xl text-sm font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  authMode === 'login'
                    ? 'bg-red-600 text-white'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Masuk Driver
              </button>
            </div>
          </div>

          {authError && (
            <div className="p-4 bg-red-950/70 border border-red-700 rounded-2xl text-red-200 text-sm font-semibold flex flex-col gap-2.5">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
              {(authError.includes('Driver lama') || authError.includes('driver lama')) && (
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthError(null);
                      setAuthMode('first-password');
                    }}
                    className="w-full sm:w-auto min-h-[48px] px-4 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-sm font-bold cursor-pointer"
                  >
                    Buat Kata Sandi Pertama Kali Sekarang
                  </button>
                </div>
              )}
            </div>
          )}

          {authNotice && (
            <div className="p-4 bg-emerald-950/70 border border-emerald-700 rounded-2xl text-emerald-200 text-sm font-semibold flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <span>{authNotice}</span>
            </div>
          )}

          {/* MODE: PENDING STATUS AFTER REGISTRATION */}
          {authMode === 'pending-status' && activePending && (
            <div className="space-y-4">
              {activePending.status === 'AKTIF' ? (
                <div className="bg-emerald-950/50 border-2 border-emerald-600 rounded-2xl p-4 sm:p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <h2 className="text-base font-black text-white">
                        Pendaftaran Disetujui Admin!
                      </h2>
                      <p className="text-sm text-emerald-200 mt-1">
                        Akun <span className="font-bold">{activePending.name}</span> ({activePending.plateNumber}) sudah AKTIF. Silakan masuk menggunakan Nomor HP dan Kata Sandi pribadi yang Anda buat.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginPhone(activePending.phone);
                      setAuthNotice('Akun Anda sudah disetujui! Silakan masukkan Kata Sandi pribadi Anda.');
                      setAuthMode('login');
                    }}
                    className="w-full min-h-[48px] py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm sm:text-base font-black flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Masuk dengan Nomor HP &amp; Kata Sandi</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="bg-amber-950/30 border border-amber-700/70 rounded-2xl p-4 sm:p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <Clock className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <h2 className="text-base font-black text-white">
                        MENUNGGU PERSETUJUAN ADMIN
                      </h2>
                      <p className="text-sm text-neutral-300 mt-1 leading-relaxed">
                        Data pendaftaran atas nama <span className="font-bold text-white">{activePending.name}</span> ({activePending.phone} &bull; {activePending.plateNumber}) telah tersimpan ke Firebase dan kata sandi pribadi Anda telah dienkripsi aman di server. Setelah Admin menyetujui, Anda dapat masuk dengan Nomor HP dan kata sandi pribadi Anda.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 space-y-1.5">
                      <span className="text-xs font-bold text-neutral-400 block">Foto KTP</span>
                      {activePending.ktpUrl || activePending.ktpPhotoUrl ? (
                        <img
                          src={activePending.ktpUrl || activePending.ktpPhotoUrl}
                          alt="KTP"
                          className="w-full h-36 object-contain rounded-lg"
                        />
                      ) : null}
                    </div>
                    <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 space-y-1.5">
                      <span className="text-xs font-bold text-neutral-400 block">Foto SIM A</span>
                      {activePending.simUrl || activePending.simPhotoUrl ? (
                        <img
                          src={activePending.simUrl || activePending.simPhotoUrl}
                          alt="SIM A"
                          className="w-full h-36 object-contain rounded-lg"
                        />
                      ) : null}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setLoginPhone(activePending.phone);
                      setAuthNotice(null);
                      setAuthError(null);
                      setAuthMode('login');
                    }}
                    className="w-full min-h-[48px] py-3.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-sm font-bold cursor-pointer"
                  >
                    Ke Halaman Masuk Driver
                  </button>
                </div>
              )}
            </div>
          )}

          {/* MODE: REGISTER DRIVER */}
          {authMode === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-3.5 text-xs sm:text-sm text-neutral-300 flex items-start gap-2.5">
                <Shield className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span>
                  Satu Nomor HP hanya untuk satu akun. Buat <strong className="text-white">Kata Sandi Pribadi</strong> pilihan Anda &amp; unggah <strong className="text-white">Foto KTP + SIM A</strong> (tanpa selfie).
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-neutral-200 mb-1.5">
                    Nama Lengkap <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Contoh: Ega Sumarna"
                      className="w-full min-h-[48px] pl-10 pr-4 py-3 bg-neutral-950 border border-neutral-800 focus:border-red-500 rounded-xl text-base text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-neutral-200 mb-1.5">
                    No HP / WhatsApp (+62) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="0812xxxxxxxx"
                      className="w-full min-h-[48px] pl-10 pr-4 py-3 bg-neutral-950 border border-neutral-800 focus:border-red-500 rounded-xl text-base font-mono text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-neutral-200 mb-1.5">
                    No Polisi (Plat Nomor) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={plateNumber}
                    onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                    placeholder="Contoh: A 1842 KL"
                    className="w-full min-h-[48px] px-4 py-3 bg-neutral-950 border border-neutral-800 focus:border-red-500 rounded-xl text-base font-mono uppercase text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-neutral-200 mb-1.5">
                    Merk Mobil <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={carModel}
                    onChange={(e) => setCarModel(e.target.value)}
                    placeholder="Contoh: Toyota Avanza Hitam"
                    className="w-full min-h-[48px] px-4 py-3 bg-neutral-950 border border-neutral-800 focus:border-red-500 rounded-xl text-base text-white focus:outline-none"
                  />
                </div>

                {/* Kata Sandi Pribadi + Konfirmasi */}
                <div>
                  <label className="block text-sm font-bold text-neutral-200 mb-1.5">
                    Kata Sandi Pribadi (Min. 6 Karakter) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Buat kata sandi pribadi"
                      className="w-full min-h-[48px] pl-10 pr-12 py-3 bg-neutral-950 border border-neutral-800 focus:border-red-500 rounded-xl text-base text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-neutral-400 hover:text-white cursor-pointer"
                      aria-label="Lihat kata sandi"
                    >
                      {showRegPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-neutral-200 mb-1.5">
                    Ulangi Kata Sandi (Konfirmasi) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showRegConfirmPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      placeholder="Ketik ulang kata sandi"
                      className={`w-full min-h-[48px] pl-10 pr-12 py-3 bg-neutral-950 border rounded-xl text-base text-white focus:outline-none ${
                        regConfirmPassword && regPassword !== regConfirmPassword
                          ? 'border-red-500'
                          : 'border-neutral-800 focus:border-red-500'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegConfirmPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-neutral-400 hover:text-white cursor-pointer"
                      aria-label="Lihat konfirmasi kata sandi"
                    >
                      {showRegConfirmPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                  {regConfirmPassword && regPassword !== regConfirmPassword && (
                    <p className="text-xs text-red-400 mt-1">Kata sandi belum sama.</p>
                  )}
                </div>
              </div>

              {/* 2 Upload Dokumen Wajib: FOTO KTP & FOTO SIM A (TANPA SELFIE) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-neutral-200">
                    Foto KTP (Wajib) <span className="text-red-500">*</span>
                  </label>
                  <label className="block cursor-pointer group">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleSelectDocFile(e, 'ktp')}
                      className="hidden"
                    />
                    {ktpPreview ? (
                      <div className="relative h-44 rounded-2xl overflow-hidden border-2 border-emerald-600/80 bg-neutral-950">
                        <img
                          src={ktpPreview}
                          alt="Preview Foto KTP"
                          className="w-full h-full object-contain"
                        />
                        <div className="absolute bottom-2 right-2 px-3 py-1.5 bg-neutral-950/90 border border-neutral-700 rounded-xl text-xs font-bold text-white">
                          Ganti Foto KTP
                        </div>
                      </div>
                    ) : (
                      <div className="h-44 rounded-2xl border-2 border-dashed border-neutral-700 group-hover:border-red-500 bg-neutral-950 flex flex-col items-center justify-center p-4 text-center transition-colors">
                        <Upload className="w-7 h-7 text-red-500 mb-2" />
                        <span className="text-sm font-bold text-white">Unggah Foto KTP</span>
                        <span className="text-xs text-neutral-400 mt-1">
                          Format JPG / PNG · Tersimpan ke Firebase
                        </span>
                      </div>
                    )}
                  </label>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-bold text-neutral-200">
                    Foto SIM A (Wajib) <span className="text-red-500">*</span>
                  </label>
                  <label className="block cursor-pointer group">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleSelectDocFile(e, 'sim')}
                      className="hidden"
                    />
                    {simPreview ? (
                      <div className="relative h-44 rounded-2xl overflow-hidden border-2 border-emerald-600/80 bg-neutral-950">
                        <img
                          src={simPreview}
                          alt="Pratinjau Foto SIM A"
                          className="w-full h-full object-contain"
                        />
                        <div className="absolute bottom-2 right-2 px-3 py-1.5 bg-neutral-950/90 border border-neutral-700 rounded-xl text-xs font-bold text-white">
                          Ganti Foto SIM A
                        </div>
                      </div>
                    ) : (
                      <div className="h-44 rounded-2xl border-2 border-dashed border-neutral-700 group-hover:border-red-500 bg-neutral-950 flex flex-col items-center justify-center p-4 text-center transition-colors">
                        <Upload className="w-7 h-7 text-red-500 mb-2" />
                        <span className="text-sm font-bold text-white">Unggah Foto SIM A</span>
                        <span className="text-xs text-neutral-400 mt-1">
                          Format JPG / PNG · Tersimpan ke Firebase
                        </span>
                      </div>
                    )}
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmittingReg}
                className="w-full min-h-[52px] py-3.5 px-6 bg-red-600 hover:bg-red-500 text-white rounded-xl font-black text-base shadow-xl shadow-red-900/40 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-60"
              >
                {isSubmittingReg ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{uploadStepText || 'Mengunggah dokumen & mendaftar...'}</span>
                  </>
                ) : (
                  <>
                    <span>Daftar Sebagai Mitra Driver</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>

              <div className="pt-2 border-t border-neutral-800 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setAuthError(null);
                    setAuthNotice(null);
                    setAuthMode('first-password');
                  }}
                  className="text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1.5 cursor-pointer py-1"
                >
                  <KeyRound className="w-4 h-4 shrink-0" />
                  <span>Driver Lama? Buat Kata Sandi Pertama Kali</span>
                </button>
              </div>
            </form>
          )}

          {/* MODE: LOGIN DRIVER DENGAN NOMOR HP & KATA SANDI */}
          {authMode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-neutral-200 mb-1.5">
                  Nomor HP Driver Terdaftar
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(e.target.value)}
                    placeholder="Contoh: 081298765432"
                    className="w-full min-h-[48px] pl-10 pr-4 py-3 bg-neutral-950 border border-neutral-800 focus:border-red-500 rounded-xl text-base font-mono text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-bold text-neutral-200">
                    Kata Sandi Pribadi
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setRecoverPhone(loginPhone);
                      setAuthError(null);
                      setAuthNotice(null);
                      setAuthMode('recover');
                    }}
                    className="text-xs font-bold text-red-400 hover:text-red-300 cursor-pointer"
                  >
                    Lupa Kata Sandi?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Masukkan kata sandi pribadi Anda"
                    className="w-full min-h-[48px] pl-10 pr-12 py-3 bg-neutral-950 border border-neutral-800 focus:border-red-500 rounded-xl text-base text-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-neutral-400 hover:text-white cursor-pointer"
                    aria-label="Lihat kata sandi"
                  >
                    {showLoginPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full min-h-[52px] py-3.5 px-6 bg-red-600 hover:bg-red-500 text-white rounded-xl font-black text-base shadow-xl shadow-red-900/40 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-60"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Memverifikasi Akun...</span>
                  </>
                ) : (
                  <>
                    <span>Masuk Portal Driver</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>

              <div className="pt-3 border-t border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs sm:text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setLegacyPhone(loginPhone);
                    setAuthError(null);
                    setAuthNotice(null);
                    setAuthMode('first-password');
                  }}
                  className="text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1.5 cursor-pointer text-left py-1"
                >
                  <KeyRound className="w-4 h-4 shrink-0" />
                  <span>Driver Lama? Buat Kata Sandi Pertama Kali</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRecoverPhone(loginPhone);
                    setAuthError(null);
                    setAuthNotice(null);
                    setAuthMode('recover');
                  }}
                  className="text-neutral-400 hover:text-white font-semibold cursor-pointer text-left py-1"
                >
                  Pemulihan Akun Driver
                </button>
              </div>
            </form>
          )}

          {/* MODE: LEGACY DRIVER BUAT KATA SANDI PERTAMA KALI (ATURAN 10) */}
          {authMode === 'first-password' && (
            <form onSubmit={handleFirstPasswordSubmit} className="space-y-4">
              <div className="bg-amber-950/30 border border-amber-700/60 rounded-2xl p-4 space-y-1">
                <div className="text-sm font-black text-white flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-amber-400" />
                  <span>Buat Kata Sandi Pertama Kali (Driver Lama)</span>
                </div>
                <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
                  Untuk driver yang sudah terdaftar sebelumnya: Anda <strong className="text-white">tidak perlu mendaftar ulang</strong>. Cukup verifikasi Nomor HP &amp; Nomor Polisi kendaraan Anda.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-neutral-200 mb-1.5">
                    Nomor HP Terdaftar <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={legacyPhone}
                    onChange={(e) => setLegacyPhone(e.target.value)}
                    placeholder="0812xxxxxxxx"
                    className="w-full min-h-[48px] px-4 py-3 bg-neutral-950 border border-neutral-800 focus:border-red-500 rounded-xl text-base font-mono text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-neutral-200 mb-1.5">
                    Nomor Polisi (Plat Kendaraan) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={legacyPlate}
                    onChange={(e) => setLegacyPlate(e.target.value.toUpperCase())}
                    placeholder="Contoh: A 1852 JW"
                    className="w-full min-h-[48px] px-4 py-3 bg-neutral-950 border border-neutral-800 focus:border-red-500 rounded-xl text-base font-mono uppercase text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-neutral-200 mb-1.5">
                    Kata Sandi Pribadi Baru (Min. 6 Karakter) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showLegacyPw ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={legacyPassword}
                      onChange={(e) => setLegacyPassword(e.target.value)}
                      placeholder="Buat kata sandi pribadi"
                      className="w-full min-h-[48px] pl-4 pr-12 py-3 bg-neutral-950 border border-neutral-800 focus:border-red-500 rounded-xl text-base text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLegacyPw((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-neutral-400 hover:text-white cursor-pointer"
                    >
                      {showLegacyPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-neutral-200 mb-1.5">
                    Ulangi Kata Sandi <span className="text-red-500">*</span>
                  </label>
                  <input
                    type={showLegacyPw ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={legacyConfirmPassword}
                    onChange={(e) => setLegacyConfirmPassword(e.target.value)}
                    placeholder="Ketik ulang kata sandi"
                    className="w-full min-h-[48px] px-4 py-3 bg-neutral-950 border border-neutral-800 focus:border-red-500 rounded-xl text-base text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setAuthError(null);
                    setAuthMode('login');
                  }}
                  className="min-h-[48px] px-5 py-3.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-sm font-bold cursor-pointer"
                >
                  Kembali ke Login
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingLegacy}
                  className="min-h-[48px] py-3.5 px-6 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-black flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {isSubmittingLegacy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyimpan Kata Sandi...</span>
                    </>
                  ) : (
                    <>
                      <span>Simpan Kata Sandi &amp; Login</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* MODE: LUPA KATA SANDI & PEMULIHAN AKUN (ATURAN 9) */}
          {authMode === 'recover' && (
            <form onSubmit={handleRecoverSubmit} className="space-y-4">
              <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 space-y-2.5">
                <div className="text-sm font-black text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-red-500" />
                  <span>Lupa Kata Sandi &amp; Pemulihan Akun Driver</span>
                </div>
                <p className="text-xs sm:text-sm text-neutral-400">
                  Verifikasi kepemilikan akun Anda menggunakan data kendaraan &amp; nama terdaftar, atau masukkan Kode Pemulihan 6-digit dari Admin.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setRecoverMethod('identity')}
                    className={`min-h-[44px] px-3 py-2.5 rounded-xl text-xs font-bold cursor-pointer ${
                      recoverMethod === 'identity'
                        ? 'bg-red-600 text-white'
                        : 'bg-neutral-900 text-neutral-400 border border-neutral-800'
                    }`}
                  >
                    Verifikasi Plat &amp; Nama
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecoverMethod('code')}
                    className={`min-h-[44px] px-3 py-2.5 rounded-xl text-xs font-bold cursor-pointer ${
                      recoverMethod === 'code'
                        ? 'bg-red-600 text-white'
                        : 'bg-neutral-900 text-neutral-400 border border-neutral-800'
                    }`}
                  >
                    Pakai Kode Pemulihan Admin
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={recoverMethod === 'code' ? '' : 'md:col-span-2'}>
                  <label className="block text-sm font-bold text-neutral-200 mb-1.5">
                    Nomor HP Terdaftar <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={recoverPhone}
                    onChange={(e) => setRecoverPhone(e.target.value)}
                    placeholder="0812xxxxxxxx"
                    className="w-full min-h-[48px] px-4 py-3 bg-neutral-950 border border-neutral-800 focus:border-red-500 rounded-xl text-base font-mono text-white focus:outline-none"
                  />
                </div>

                {recoverMethod === 'identity' ? (
                  <>
                    <div>
                      <label className="block text-sm font-bold text-neutral-200 mb-1.5">
                        Nomor Polisi Terdaftar <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={recoverPlate}
                        onChange={(e) => setRecoverPlate(e.target.value.toUpperCase())}
                        placeholder="Contoh: A 1852 JW"
                        className="w-full min-h-[48px] px-4 py-3 bg-neutral-950 border border-neutral-800 focus:border-red-500 rounded-xl text-base font-mono uppercase text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-neutral-200 mb-1.5">
                        Nama Lengkap Terdaftar <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={recoverName}
                        onChange={(e) => setRecoverName(e.target.value)}
                        placeholder="Sesuai pendaftaran"
                        className="w-full min-h-[48px] px-4 py-3 bg-neutral-950 border border-neutral-800 focus:border-red-500 rounded-xl text-base text-white focus:outline-none"
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-sm font-bold text-neutral-200 mb-1.5">
                      Kode Pemulihan 6-Digit dari Admin <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={recoverCode}
                      onChange={(e) => setRecoverCode(e.target.value)}
                      placeholder="Contoh: 482910"
                      className="w-full min-h-[48px] px-4 py-3 bg-neutral-950 border border-neutral-800 focus:border-red-500 rounded-xl text-base font-mono text-white focus:outline-none"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-bold text-neutral-200 mb-1.5">
                    Kata Sandi Baru (Min. 6 Karakter) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showRecoverPw ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={recoverNewPassword}
                      onChange={(e) => setRecoverNewPassword(e.target.value)}
                      placeholder="Buat kata sandi baru"
                      className="w-full min-h-[48px] pl-4 pr-12 py-3 bg-neutral-950 border border-neutral-800 focus:border-red-500 rounded-xl text-base text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRecoverPw((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-neutral-400 hover:text-white cursor-pointer"
                    >
                      {showRecoverPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-neutral-200 mb-1.5">
                    Ulangi Kata Sandi Baru <span className="text-red-500">*</span>
                  </label>
                  <input
                    type={showRecoverPw ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={recoverConfirmPassword}
                    onChange={(e) => setRecoverConfirmPassword(e.target.value)}
                    placeholder="Ketik ulang kata sandi baru"
                    className="w-full min-h-[48px] px-4 py-3 bg-neutral-950 border border-neutral-800 focus:border-red-500 rounded-xl text-base text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setAuthError(null);
                    setAuthMode('login');
                  }}
                  className="min-h-[48px] px-5 py-3.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-sm font-bold cursor-pointer"
                >
                  Kembali ke Login
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRecover}
                  className="min-h-[48px] py-3.5 px-6 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-black flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {isSubmittingRecover ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Memulihkan Akun...</span>
                    </>
                  ) : (
                    <>
                      <span>Simpan Kata Sandi Baru</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Fixed Mobile Bottom Navigation Bar (Driver Auth) */}
        <nav
          aria-label="Navigasi Bawah Driver"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-neutral-950/95 backdrop-blur-md border-t border-neutral-800"
        >
          <div className="grid grid-cols-3 h-16 max-w-md mx-auto px-1">
            <button
              type="button"
              onClick={() => {
                setAuthMode('register');
                setAuthError(null);
                setAuthNotice(null);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
                authMode === 'register' || authMode === 'pending-status'
                  ? 'text-red-500'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Upload className="w-5 h-5" />
              <span className="text-[11px] font-bold leading-none">Daftar</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setAuthError(null);
                setAuthNotice(null);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
                authMode === 'login' || authMode === 'first-password' || authMode === 'recover'
                  ? 'text-red-500'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Lock className="w-5 h-5" />
              <span className="text-[11px] font-bold leading-none">Masuk</span>
            </button>

            <a
              href={formatWaUrl(
                settings.adminPhone || '085811594114',
                'Halo Admin M3CAR, saya butuh bantuan pendaftaran/akun Driver.'
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center justify-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              <Phone className="w-5 h-5" />
              <span className="text-[11px] font-bold leading-none">Admin WA</span>
            </a>
          </div>
        </nav>
      </div>
    );
  }

  // =========================================================================
  // LOGGED IN DRIVER DASHBOARD
  // =========================================================================
  const availableOrders = orders
    .filter((o) => !o.isDeleted && o.status === 'MENCARI_DRIVER' && !o.isOutsideIndonesia)
    .slice(0, 30);
  const myActiveOrders = orders
    .filter(
      (o) =>
        !o.isDeleted &&
        o.driverId === loggedDriver.id &&
        (o.status === 'DRIVER_DITEMUKAN' ||
          o.status === 'DRIVER_OTW' ||
          o.status === 'SUDAH_JEMPUT' ||
          o.status === 'SUDAH_SAMPAI')
    )
    .slice(0, 30);
  const myCompletedOrders = orders
    .filter((o) => !o.isDeleted && o.driverId === loggedDriver.id && o.status === 'SELESAI')
    .slice(0, 30);
  const myTransactions = transactions.filter((t) => !t.isDeleted && t.driverId === loggedDriver.id);
  const myTopUpReqs = topUpRequests.filter((r) => !r.isDeleted && r.driverId === loggedDriver.id);

  const driverKtpUrl = loggedDriver.ktpUrl || loggedDriver.ktpPhotoUrl || '';
  const driverSimUrl = loggedDriver.simUrl || loggedDriver.simPhotoUrl || '';

  const currentSaldo = loggedDriver.saldo ?? loggedDriver.balance ?? 0;

  return (
    <div className="w-full max-w-md mx-auto md:max-w-5xl lg:max-w-6xl px-3.5 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
      {/* Driver Top Status Strip (Always visible on desktop, Home tab on mobile, or when not yet AKTIF) */}
      <div
        className={`bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-6 flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl ${
          driverTab === 'home' || loggedDriver.status !== 'AKTIF' ? 'flex' : 'hidden md:flex'
        }`}
      >
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-red-600/15 border border-red-600/40 flex items-center justify-center shrink-0">
            <Car className="w-6 h-6 sm:w-7 sm:h-7 text-red-500" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-white truncate">{loggedDriver.name}</h1>
              <span className="text-xs font-mono font-bold text-red-400">
                {loggedDriver.plateNumber || loggedDriver.plate}
              </span>
            </div>
            <div className="text-xs sm:text-sm text-neutral-400 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>{loggedDriver.carModel || loggedDriver.car}</span>
              <span>&middot;</span>
              <span className="font-mono">{loggedDriver.phone}</span>
              <span>&middot;</span>
              <span
                className={`font-bold ${
                  loggedDriver.status === 'AKTIF'
                    ? 'text-emerald-400'
                    : loggedDriver.status === 'MENUNGGU'
                    ? 'text-amber-400'
                    : 'text-red-400'
                }`}
              >
                {loggedDriver.status === 'MENUNGGU'
                  ? 'Menunggu Persetujuan Admin'
                  : loggedDriver.status === 'AKTIF'
                  ? 'Akun Aktif'
                  : loggedDriver.status === 'DITOLAK'
                  ? 'Ditolak'
                  : 'Diblokir'}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:flex md:flex-wrap items-center gap-2.5 sm:gap-3 w-full md:w-auto">
          <div
            className={`rounded-2xl px-4 py-3 flex md:block items-center justify-between md:text-right border ${
              currentSaldo < MIN_DRIVER_ACTIVE_BALANCE
                ? 'bg-amber-950/60 border-amber-600/70'
                : loggedDriver.status === 'AKTIF'
                ? 'bg-emerald-950/70 border-emerald-600/70 shadow-lg shadow-emerald-950/40'
                : 'bg-neutral-950 border-neutral-800'
            }`}
          >
            <span className="text-xs text-emerald-300/90 uppercase font-bold block">
              {loggedDriver.status === 'AKTIF' ? 'Saldo Aktif' : 'Saldo Dompet'}
            </span>
            <span
              className={`text-lg sm:text-xl font-black tabular-nums ${
                currentSaldo < MIN_DRIVER_ACTIVE_BALANCE ? 'text-amber-400' : 'text-emerald-400'
              }`}
            >
              Rp {currentSaldo.toLocaleString('id-ID')}
            </span>
          </div>

          {loggedDriver.status === 'AKTIF' && (
            <>
              <button
                type="button"
                onClick={() => setIsTopUpModalOpen(true)}
                className="min-h-[48px] px-4 py-3.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-black flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-lg shadow-red-950/50"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Isi Saldo</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  const res = await setDriverOnlineStatus(loggedDriver.id, !loggedDriver.isOnline);
                  if (!res.success && res.message) {
                    setActionAlert({ type: 'error', text: res.message });
                    if (res.needsTopUp) {
                      setIsTopUpModalOpen(true);
                    }
                  } else {
                    setActionAlert({
                      type: 'success',
                      text: !loggedDriver.isOnline
                        ? 'Status diubah ke ONLINE — Siap menerima order!'
                        : 'Status diubah ke ISTIRAHAT (Offline).',
                    });
                  }
                }}
                className={`min-h-[48px] px-4 py-3.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                  loggedDriver.isOnline
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                }`}
              >
                <Power className="w-4 h-4" />
                <span>{loggedDriver.isOnline ? 'SIAP TERIMA ORDER' : 'SEDANG ISTIRAHAT'}</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={logout}
            className={`${
              loggedDriver.status === 'AKTIF' ? 'hidden md:flex' : 'flex'
            } min-h-[48px] px-4 py-3.5 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 rounded-xl text-sm font-bold items-center justify-center gap-1.5 cursor-pointer transition-colors`}
          >
            <LogOut className="w-4 h-4 text-red-400" />
            <span>Keluar</span>
          </button>
        </div>
      </div>

      {/* Informasi Perusahaan Tersinkron Dari Admin */}
      {settings.siteContent?.announcement && driverTab === 'home' && (
        <div className="bg-neutral-900 border border-red-900/50 rounded-2xl p-4 text-xs sm:text-sm text-neutral-300 flex items-start gap-3">
          <Shield className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-white">{settings.siteContent.appName || 'M3CAR'}: </span>
            <span>{settings.siteContent.announcement}</span>
          </div>
        </div>
      )}

      {firestoreError && (
        <div className="p-4 rounded-2xl text-sm font-bold bg-red-950 border border-red-700 text-red-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{firestoreError}</span>
        </div>
      )}

      {actionAlert && (
        <div
          className={`p-4 rounded-2xl text-sm font-bold flex items-center justify-between gap-2 ${
            actionAlert.type === 'success'
              ? 'bg-emerald-950 border border-emerald-700 text-emerald-200'
              : 'bg-red-950 border border-red-700 text-red-200'
          }`}
        >
          <span>{actionAlert.text}</span>
          <button
            type="button"
            onClick={() => setActionAlert(null)}
            className="p-1 text-neutral-300 hover:text-white cursor-pointer"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* STATUS: MENUNGGU PERSETUJUAN ADMIN (waiting_approval) */}
      {loggedDriver.status === 'MENUNGGU' && (
        <div className="bg-neutral-900 border border-amber-700/60 rounded-2xl p-4 sm:p-6 space-y-4 shadow-xl">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-amber-950 border border-amber-700 rounded-2xl shrink-0">
              <Clock className="w-6 h-6 text-amber-400" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base sm:text-lg font-black text-white">
                Menunggu Persetujuan Admin
              </h2>
              <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
                Dokumen Foto KTP &amp; Foto SIM A yang Anda unggah telah tersimpan dan sedang diperiksa oleh Admin. Halaman ini otomatis aktif seketika saat Admin menekan tombol Setujui.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="space-y-1.5">
              <span className="text-sm font-bold text-neutral-300 block">Foto KTP yang Diunggah</span>
              <div className="h-44 bg-neutral-950 rounded-2xl border border-neutral-800 overflow-hidden flex items-center justify-center">
                {driverKtpUrl ? (
                  <img src={driverKtpUrl} alt="Foto KTP" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-xs text-neutral-500">Tidak ada foto</span>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="text-sm font-bold text-neutral-300 block">Foto SIM A yang Diunggah</span>
              <div className="h-44 bg-neutral-950 rounded-2xl border border-neutral-800 overflow-hidden flex items-center justify-center">
                {driverSimUrl ? (
                  <img src={driverSimUrl} alt="Foto SIM A" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-xs text-neutral-500">Tidak ada foto</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STATUS: DITOLAK (rejected) */}
      {loggedDriver.status === 'DITOLAK' && (
        <div className="bg-neutral-900 border border-red-700 rounded-2xl p-4 sm:p-6 space-y-4 shadow-xl">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-red-950 border border-red-700 rounded-2xl shrink-0">
              <XCircle className="w-6 h-6 text-red-400" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base sm:text-lg font-black text-white">Pendaftaran Ditolak</h2>
              <p className="text-xs sm:text-sm text-red-300">
                Alasan Penolakan: {loggedDriver.rejectionReason || 'Foto KTP atau SIM A kurang jelas.'}
              </p>
            </div>
          </div>

          <form onSubmit={handleResubmitDocs} className="space-y-4 pt-3 border-t border-neutral-800">
            <div className="text-sm font-bold text-neutral-200">
              Unggah Ulang Foto KTP &amp; Foto SIM A:
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleSelectDocFile(e, 'ktp', true)}
                  className="hidden"
                />
                <div className="h-40 rounded-2xl border-2 border-dashed border-neutral-700 hover:border-red-500 bg-neutral-950 flex flex-col items-center justify-center overflow-hidden">
                  {reKtpPreview ? (
                    <img src={reKtpPreview} alt="KTP Baru" className="w-full h-full object-contain" />
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-red-500 mb-1.5" />
                      <span className="text-sm font-bold text-white">Pilih Foto KTP Baru</span>
                    </>
                  )}
                </div>
              </label>

              <label className="block cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleSelectDocFile(e, 'sim', true)}
                  className="hidden"
                />
                <div className="h-40 rounded-2xl border-2 border-dashed border-neutral-700 hover:border-red-500 bg-neutral-950 flex flex-col items-center justify-center overflow-hidden">
                  {reSimPreview ? (
                    <img src={reSimPreview} alt="SIM Baru" className="w-full h-full object-contain" />
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-red-500 mb-1.5" />
                      <span className="text-sm font-bold text-white">Pilih Foto SIM A Baru</span>
                    </>
                  )}
                </div>
              </label>
            </div>

            <button
              type="submit"
              disabled={isResubmitting}
              className="w-full sm:w-auto min-h-[48px] px-6 py-3.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-black flex items-center justify-center gap-2 cursor-pointer"
            >
              {isResubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span>Kirim Ulang Dokumen KTP &amp; SIM A</span>
            </button>
          </form>
        </div>
      )}

      {/* STATUS GATE: BLOCKED */}
      {loggedDriver.status === 'DIBLOKIR' && (
        <div className="bg-neutral-900 border border-red-700 rounded-2xl p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 text-red-400 font-black text-base">
            <Ban className="w-5 h-5" />
            <span>Akun Driver Diblokir</span>
          </div>
          <p className="text-sm text-neutral-300">
            Alasan: {loggedDriver.blockReason || 'Pelanggaran operasional M3CAR.'}
          </p>
          <a
            href={formatWaUrl(
              settings.adminPhone || '085811594114',
              `Halo Admin M3CAR, saya driver ${loggedDriver.name} (${loggedDriver.plateNumber}) ingin klarifikasi status akun.`
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-bold"
          >
            <Phone className="w-4 h-4" />
            <span>Hubungi Admin Pusat</span>
          </a>
        </div>
      )}

      {/* AREA KERJA DRIVER AKTIF (approved) */}
      {loggedDriver.status === 'AKTIF' && (
        <>
          {/* Desktop Tab Navigasi Driver (hidden on mobile because mobile uses Fixed Bottom Nav) */}
          <div className="hidden md:flex items-center gap-2 overflow-x-auto pb-1">
            {[
              { id: 'home', label: 'Beranda & GPS', icon: Home },
              { id: 'orders', label: `Order Masuk (${availableOrders.length})`, icon: Navigation },
              { id: 'wallet', label: 'Dompet & Isi Saldo', icon: Wallet },
              { id: 'profile', label: 'Profil & Dokumen', icon: User },
            ].map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDriverTab(t.id as any)}
                  className={`min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap ${
                    driverTab === t.id
                      ? 'bg-red-600 text-white shadow'
                      : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* BERANDA DRIVER: Kartu Status Akun + Saldo + Lokasi GPS + Ringkasan Order */}
          {driverTab === 'home' && (
            <div className="space-y-4">
              {/* Kartu Status Akun Aktif Siap Menerima Order + Saldo + Tombol Isi Saldo & MULAI TERIMA ORDER */}
              <div
                className={`rounded-2xl p-4 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xl border-2 ${
                  currentSaldo < MIN_DRIVER_ACTIVE_BALANCE
                    ? 'bg-amber-950/30 border-amber-600/70'
                    : 'bg-emerald-950/40 border-emerald-600/80'
                }`}
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className={`p-3 rounded-2xl border shrink-0 ${
                      currentSaldo < MIN_DRIVER_ACTIVE_BALANCE
                        ? 'bg-amber-600/20 border-amber-500/50'
                        : 'bg-emerald-600/20 border-emerald-500/50'
                    }`}
                  >
                    {currentSaldo < MIN_DRIVER_ACTIVE_BALANCE ? (
                      <Wallet className="w-7 h-7 text-amber-400" />
                    ) : (
                      <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-base sm:text-lg font-black text-white">
                      {currentSaldo < MIN_DRIVER_ACTIVE_BALANCE
                        ? 'Saldo Kosong — Isi Saldo untuk Terima Order'
                        : 'Akun Aktif Siap Menerima Order'}
                    </h2>
                    <div className="text-sm text-emerald-300 font-bold">
                      Saldo Aktif:{' '}
                      <span
                        className={`text-base font-black tabular-nums ${
                          currentSaldo < MIN_DRIVER_ACTIVE_BALANCE
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        Rp {currentSaldo.toLocaleString('id-ID')}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
                      {currentSaldo < MIN_DRIVER_ACTIVE_BALANCE
                        ? `Minimal saldo aktif Rp ${MIN_DRIVER_ACTIVE_BALANCE.toLocaleString('id-ID')} diperlukan sebelum mengaktifkan status Siap Terima Order.`
                        : 'Dokumen KTP & SIM A telah diverifikasi Admin. Klik tombol MULAI TERIMA ORDER untuk membuka orderan masuk.'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex items-center gap-2.5 shrink-0 w-full lg:w-auto">
                  <button
                    type="button"
                    onClick={() => setIsTopUpModalOpen(true)}
                    className="w-full lg:w-auto min-h-[48px] px-5 py-3.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-black uppercase tracking-wide shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Isi Saldo</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      if (!loggedDriver.isOnline) {
                        const res = await setDriverOnlineStatus(loggedDriver.id, true);
                        if (!res.success && res.message) {
                          setActionAlert({ type: 'error', text: res.message });
                          if (res.needsTopUp) {
                            setIsTopUpModalOpen(true);
                          }
                          return;
                        }
                      }
                      setDriverTab('orders');
                      setActionAlert({
                        type: 'success',
                        text: 'Driver aktif! Menampilkan daftar order masuk siap diambil.',
                      });
                    }}
                    className="w-full lg:w-auto min-h-[48px] px-6 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-black uppercase tracking-wide shadow-lg shadow-emerald-950/60 flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <Navigation className="w-4 h-4" />
                    <span>MULAI TERIMA ORDER</span>
                  </button>
                </div>
              </div>

              {/* Kartu Lokasi Driver Real-Time (Tersimpan ke Cloud Firestore) */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-6 space-y-4 shadow-xl">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-2xl bg-red-600/15 border border-red-600/40 shrink-0">
                      <MapPin className="w-5 h-5 text-red-500" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-white">Lokasi Driver Real-Time</h3>
                      <p className="text-xs sm:text-sm text-neutral-400">
                        Posisi saat ini:{' '}
                        <span className="font-bold text-white">
                          {loggedDriver.lokasi || loggedDriver.currentLocation || 'Belum diperbarui'}
                        </span>
                        {loggedDriver.lat !== undefined && loggedDriver.lng !== undefined && (
                          <span className="font-mono text-emerald-400 block sm:inline sm:ml-2">
                            ({loggedDriver.lat.toFixed(5)}, {loggedDriver.lng.toFixed(5)})
                          </span>
                        )}
                      </p>
                      {loggedDriver.locationUpdatedAt && (
                        <p className="text-xs text-neutral-500 mt-0.5">
                          Diperbarui: {new Date(loggedDriver.locationUpdatedAt).toLocaleString('id-ID')}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full md:w-auto">
                    <button
                      type="button"
                      onClick={handleUpdateGpsOnce}
                      disabled={isUpdatingLocation}
                      className="min-h-[48px] px-4 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      {isUpdatingLocation ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <LocateFixed className="w-4 h-4 text-emerald-400" />
                      )}
                      <span>Perbarui GPS</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsLiveGpsOn((prev) => !prev)}
                      className={`min-h-[48px] px-4 py-3 rounded-xl text-sm font-black flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                        isLiveGpsOn
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-neutral-300'
                      }`}
                    >
                      <Navigation className="w-4 h-4" />
                      <span>{isLiveGpsOn ? 'GPS Live: Aktif' : 'Aktifkan GPS Live'}</span>
                    </button>
                  </div>
                </div>

                <form onSubmit={handleSaveManualLocation} className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    value={lokasiInput}
                    onChange={(e) => setLokasiInput(e.target.value)}
                    placeholder="Ketik area saat ini (misal: Sumur / Tol Merak)"
                    className="flex-1 min-h-[48px] px-4 py-3 bg-neutral-950 border border-neutral-800 focus:border-red-500 rounded-xl text-base text-white focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isUpdatingLocation}
                    className="min-h-[48px] px-5 py-3.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-black cursor-pointer disabled:opacity-60 shrink-0"
                  >
                    Simpan Lokasi
                  </button>
                </form>
              </div>

              {/* Ringkasan Cepat Order Masuk / Perjalanan Aktif */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-sm font-black text-white">
                    {myActiveOrders.length > 0
                      ? `Anda memiliki ${myActiveOrders.length} perjalanan aktif`
                      : `${availableOrders.length} order penumpang siap diambil`}
                  </div>
                  <div className="text-xs sm:text-sm text-neutral-400">
                    Buka menu Orderan untuk mengambil order dan memperbarui status antar-jemput.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDriverTab('orders')}
                  className="w-full sm:w-auto min-h-[48px] px-5 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-black flex items-center justify-center gap-2 cursor-pointer shrink-0"
                >
                  <Navigation className="w-4 h-4" />
                  <span>Lihat Orderan ({myActiveOrders.length + availableOrders.length})</span>
                </button>
              </div>
            </div>
          )}

          {driverTab === 'orders' && (
            <div ref={ordersSectionRef} className="space-y-4 sm:space-y-6">
              {/* Mobile Quick Status Bar di Tab Orderan */}
              <div className="md:hidden bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-neutral-400 block">Saldo Aktif</span>
                    <span
                      className={`text-lg font-black tabular-nums ${
                        currentSaldo < MIN_DRIVER_ACTIVE_BALANCE ? 'text-amber-400' : 'text-emerald-400'
                      }`}
                    >
                      Rp {currentSaldo.toLocaleString('id-ID')}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsTopUpModalOpen(true)}
                    className="min-h-[44px] px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Isi Saldo</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    const res = await setDriverOnlineStatus(loggedDriver.id, !loggedDriver.isOnline);
                    if (!res.success && res.message) {
                      setActionAlert({ type: 'error', text: res.message });
                      if (res.needsTopUp) {
                        setIsTopUpModalOpen(true);
                      }
                    } else {
                      setActionAlert({
                        type: 'success',
                        text: !loggedDriver.isOnline
                          ? 'Status diubah ke ONLINE — Siap menerima order!'
                          : 'Status diubah ke ISTIRAHAT (Offline).',
                      });
                    }
                  }}
                  className={`w-full min-h-[48px] px-4 py-3.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                    loggedDriver.isOnline
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200'
                  }`}
                >
                  <Power className="w-4 h-4" />
                  <span>{loggedDriver.isOnline ? 'SIAP TERIMA ORDER (ONLINE)' : 'SEDANG ISTIRAHAT (KETUK AKTIFKAN)'}</span>
                </button>
              </div>

              {/* Perjalanan Aktif */}
              {myActiveOrders.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-black text-white uppercase tracking-wide">
                    Perjalanan Sedang Berjalan ({myActiveOrders.length})
                  </h2>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {myActiveOrders.map((order: Order) => (
                      <div
                        key={order.id}
                        className="bg-neutral-900 border border-red-700/60 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs sm:text-sm font-bold text-red-400">
                            {order.orderNumber}
                          </span>
                          <span className="text-xs sm:text-sm font-bold text-emerald-400">{order.status}</span>
                        </div>

                        <div className="space-y-1.5 text-sm">
                          <div className="font-black text-white text-lg">{order.customerName}</div>
                          <div className="text-neutral-300">
                            Jemput: <span className="font-semibold text-white">{order.pickupLocation}</span>
                          </div>
                          <div className="text-neutral-300">
                            Tujuan: <span className="font-semibold text-white">{order.destination}</span>
                          </div>
                          <div className="text-xs sm:text-sm text-neutral-400">
                            {order.date} &middot; {order.time} &middot; {order.passengers} Penumpang
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-neutral-800 text-sm">
                          <span className="text-neutral-400 font-semibold">Total Tarif</span>
                          <span className="font-black text-emerald-400 text-lg tabular-nums">
                            Rp {(order.totalPrice || 270000).toLocaleString('id-ID')}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <a
                            href={formatWaUrl(
                              order.customerPhone,
                              `Halo ${order.customerName}, saya Driver M3CAR (${loggedDriver.name} - ${loggedDriver.plateNumber}) untuk order ${order.orderNumber}.`
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-h-[48px] px-4 py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                          >
                            <Phone className="w-4 h-4 text-emerald-400" />
                            <span>Chat Penumpang</span>
                          </a>

                          {order.paymentStatus !== 'LUNAS' && (
                            <button
                              type="button"
                              onClick={() => confirmOrderPayment(order.id)}
                              className="min-h-[48px] px-4 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-sm font-bold cursor-pointer"
                            >
                              Konfirmasi Lunas
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              const nextStatus =
                                order.status === 'DRIVER_OTW' || order.status === 'DRIVER_DITEMUKAN'
                                  ? 'SUDAH_JEMPUT'
                                  : order.status === 'SUDAH_JEMPUT'
                                  ? 'SUDAH_SAMPAI'
                                  : 'SELESAI';
                              advanceOrderStatus(order.id, nextStatus);
                            }}
                            className="sm:col-span-2 min-h-[48px] px-4 py-3.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm sm:text-base font-black cursor-pointer"
                          >
                            {order.status === 'DRIVER_OTW' || order.status === 'DRIVER_DITEMUKAN'
                              ? 'Sudah Jemput Penumpang'
                              : order.status === 'SUDAH_JEMPUT'
                              ? 'Sudah Sampai Tujuan'
                              : 'Selesaikan Order'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Available Incoming Orders */}
              <div className="space-y-3">
                <h2 className="text-sm font-black text-white uppercase tracking-wide">
                  Order Penumpang Tersedia ({availableOrders.length})
                </h2>

                {!loggedDriver.isOnline ? (
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 sm:p-8 text-center space-y-3">
                    <Power className="w-8 h-8 text-neutral-500 mx-auto" />
                    <div className="text-base font-bold text-white">Status Anda Sedang Istirahat (Nonaktif)</div>
                    <p className="text-xs sm:text-sm text-neutral-400 max-w-md mx-auto">
                      Ketuk tombol Siap Terima Order untuk mulai mengambil order travel Jakarta - Ujung Kulon.
                    </p>
                  </div>
                ) : availableOrders.length === 0 ? (
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 sm:p-8 text-center text-sm text-neutral-400">
                    Belum ada order baru saat ini. Order baru akan muncul otomatis secara langsung.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {availableOrders.map((order) => (
                      <div
                        key={order.id}
                        className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-5 space-y-4 hover:border-red-700/60 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs sm:text-sm font-bold text-red-400">
                            {order.orderNumber}
                          </span>
                          <span className="text-xs sm:text-sm text-neutral-400">
                            {order.date} &middot; {order.time}
                          </span>
                        </div>

                        <div className="space-y-2 text-sm">
                          <div className="flex items-start gap-2.5">
                            <MapPin className="w-4 h-4 text-red-500 shrink-0 mt-1" />
                            <div>
                              <span className="text-neutral-400 block text-xs">Titik Jemput:</span>
                              <span className="font-bold text-white">{order.pickupLocation}</span>
                            </div>
                          </div>
                          <div className="flex items-start gap-2.5">
                            <Navigation className="w-4 h-4 text-emerald-500 shrink-0 mt-1" />
                            <div>
                              <span className="text-neutral-400 block text-xs">Tujuan:</span>
                              <span className="font-bold text-white">{order.destination}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-neutral-300 pt-1 text-xs sm:text-sm">
                            <Users className="w-4 h-4 text-neutral-400" />
                            <span>{order.passengers} Penumpang</span>
                            <span>&middot;</span>
                            <span className="font-semibold text-white">{order.customerName}</span>
                          </div>
                        </div>

                        <div className="bg-neutral-950 rounded-2xl p-3.5 border border-neutral-800 flex items-center justify-between">
                          <div>
                            <span className="text-xs text-neutral-400 block">Tarif Order</span>
                            <span className="font-black text-emerald-400 text-lg tabular-nums">
                              Rp {(order.totalPrice || 270000).toLocaleString('id-ID')}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-neutral-400 block">Potongan Komisi</span>
                            <span className="font-bold text-amber-400 text-sm tabular-nums">
                              -Rp {(order.commissionAmount || 32400).toLocaleString('id-ID')}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <button
                            type="button"
                            onClick={() => {
                              const res = acceptOrderByDriver(loggedDriver.id, order.id);
                              if (!res.success && res.message) {
                                setActionAlert({ type: 'error', text: res.message });
                              } else {
                                setActionAlert({
                                  type: 'success',
                                  text: `Order ${order.orderNumber} berhasil diambil!`,
                                });
                              }
                            }}
                            className="sm:col-span-2 min-h-[48px] py-3.5 px-4 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm sm:text-base font-black cursor-pointer transition-colors"
                          >
                            Ambil Order
                          </button>
                          <button
                            type="button"
                            onClick={() => rejectOrderByDriver(loggedDriver.id, order.id)}
                            className="min-h-[48px] px-4 py-3.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-sm font-bold cursor-pointer"
                          >
                            Lewati
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Completed History */}
              {myCompletedOrders.length > 0 && (
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-5 space-y-3">
                  <h3 className="text-xs sm:text-sm font-black uppercase text-neutral-300">
                    Riwayat Perjalanan Selesai ({myCompletedOrders.length})
                  </h3>
                  <div className="space-y-2.5">
                    {myCompletedOrders.slice(0, 5).map((o) => (
                      <div
                        key={o.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs sm:text-sm py-2.5 border-b border-neutral-800 last:border-0"
                      >
                        <div>
                          <span className="font-mono font-bold text-red-400">{o.orderNumber}</span>
                          <span className="text-neutral-300 ml-2">
                            {o.pickupLocation} &rarr; {o.destination}
                          </span>
                        </div>
                        <span className="font-bold text-emerald-400 tabular-nums">
                          Rp {(o.totalPrice || 0).toLocaleString('id-ID')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {driverTab === 'wallet' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {/* Topup Form */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-6 space-y-4">
                {/* Ringkasan Saldo Dompet Mobile */}
                <div className="md:hidden bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-neutral-400 block">Saldo M3Car Pay Anda</span>
                    <span
                      className={`text-xl font-black tabular-nums ${
                        currentSaldo < MIN_DRIVER_ACTIVE_BALANCE ? 'text-amber-400' : 'text-emerald-400'
                      }`}
                    >
                      Rp {currentSaldo.toLocaleString('id-ID')}
                    </span>
                  </div>
                  <Wallet className="w-7 h-7 text-red-500" />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                    <PlusCircle className="w-5 h-5 text-red-500" />
                    <span>Isi Saldo M3Car Pay</span>
                  </h2>
                  <div className="grid grid-cols-2 sm:flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsTopUpModalOpen(true)}
                      className="min-h-[44px] px-3.5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>Formulir Pop-up</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowQrisModal(true)}
                      className="min-h-[44px] px-3.5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <QrCode className="w-4 h-4 text-red-400" />
                      <span>Lihat QRIS</span>
                    </button>
                  </div>
                </div>

                <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 text-xs sm:text-sm space-y-2.5">
                  <div className="text-neutral-400">Transfer Rekening / E-Wallet Tujuan Admin:</div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-black text-white flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-red-500 shrink-0" />
                      <span>
                        {settings.companyBank?.bankName || 'SeaBank'} &middot;{' '}
                        {settings.companyBank?.accountNumber || '901102051050'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyBankAccount(settings.companyBank?.accountNumber || '901102051050')
                      }
                      className="min-h-[38px] px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-white flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      {copiedBank ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Disalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Salin</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="text-neutral-300">
                    a.n {settings.companyBank?.accountHolder || 'Ali Husen - CV. ROYAL TRANS BERKAH GROUP'}
                  </div>
                  {settings.adminPhone && (
                    <div className="text-xs text-neutral-400 pt-1.5 border-t border-neutral-800">
                      E-Wallet / WhatsApp Admin:{' '}
                      <span className="font-mono font-bold text-emerald-400">{settings.adminPhone}</span>
                    </div>
                  )}
                  <div className="pt-2.5 border-t border-neutral-800 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <button
                        type="button"
                        onClick={() => setShowQrisModal(true)}
                        className="w-12 h-12 bg-white rounded-xl p-1 shrink-0 cursor-pointer border border-neutral-300"
                        aria-label="Perbesar QRIS Admin"
                      >
                        <img
                          src={resolvedQrisUrl}
                          alt="QRIS Admin M3CAR"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = DEFAULT_QRIS_IMAGE_URL;
                          }}
                          className="w-full h-full object-contain"
                        />
                      </button>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white">QRIS Resmi M3CAR</div>
                        <div className="text-xs text-neutral-400 truncate">
                          Otomatis diperbarui dari Admin
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleDownloadDriverQris}
                      className="min-h-[40px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{qrisDownloaded ? 'Diunduh' : 'Unduh'}</span>
                    </button>
                  </div>
                </div>

                <form onSubmit={handleSubmitTopUp} className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-neutral-200 mb-2">
                      Pilih atau Ketik Nominal Pengisian Saldo (Rp)
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2.5">
                      {[50000, 100000, 200000, 500000].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setTopUpAmount(val)}
                          className={`min-h-[48px] py-3 rounded-xl text-sm font-bold cursor-pointer border ${
                            topUpAmount === val
                              ? 'bg-red-600 border-red-500 text-white'
                              : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                          }`}
                        >
                          Rp {(val / 1000).toLocaleString('id-ID')}rb
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min={MIN_DRIVER_ACTIVE_BALANCE}
                      step={5000}
                      value={topUpAmount}
                      onChange={(e) => setTopUpAmount(Number(e.target.value))}
                      placeholder="Atau masukkan nominal bebas (min. Rp 10.000)"
                      className="w-full min-h-[48px] px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-xl text-base font-mono font-bold text-white focus:border-red-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-neutral-200 mb-1.5">
                      Catatan Transfer / Nama Pengirim (Opsional)
                    </label>
                    <input
                      type="text"
                      value={topUpNote}
                      onChange={(e) => setTopUpNote(e.target.value)}
                      placeholder="Contoh: Transfer via SeaBank a.n Budi"
                      className="w-full min-h-[48px] px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-xl text-base text-white focus:border-red-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-neutral-200 mb-1.5">
                      Upload Bukti Transfer (Opsional)
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleSelectReceipt}
                      className="w-full text-sm text-neutral-400 file:mr-3 file:min-h-[44px] file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:bg-neutral-800 file:text-white file:font-bold cursor-pointer"
                    />
                    {receiptPreview && (
                      <img
                        src={receiptPreview}
                        alt="Bukti Transfer"
                        className="mt-2 h-32 rounded-xl border border-neutral-800 object-contain bg-neutral-950"
                      />
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingTopUp}
                    className="w-full min-h-[52px] py-3.5 px-4 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white rounded-xl text-sm sm:text-base font-black cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isSubmittingTopUp && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>Kirim Pengajuan Top-Up</span>
                  </button>
                </form>
              </div>

              {/* Top Up Requests & Wallet History */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-6 space-y-4">
                <h3 className="text-base font-black text-white">Riwayat Isi Saldo &amp; Mutasi</h3>
                {myTopUpReqs.length > 0 && (
                  <div className="space-y-2.5">
                    <div className="text-xs font-bold text-neutral-400 uppercase">Permintaan Isi Saldo</div>
                    {myTopUpReqs.slice(0, 6).map((r) => (
                      <div
                        key={r.id}
                        className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5 flex items-center justify-between gap-2 text-xs sm:text-sm"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-white tabular-nums">
                            Rp {r.amount.toLocaleString('id-ID')}
                          </div>
                          <div className="text-xs text-neutral-400">{r.createdAt}</div>
                          {r.note && (
                            <div className="text-xs text-neutral-500 truncate">{r.note}</div>
                          )}
                          {r.status === 'DITOLAK' && r.rejectionReason && (
                            <div className="text-xs text-red-400 mt-0.5">{r.rejectionReason}</div>
                          )}
                        </div>
                        <span
                          className={`text-xs font-bold px-3 py-1.5 rounded-xl shrink-0 ${
                            r.status === 'BERHASIL'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-700/60'
                              : r.status === 'MENUNGGU'
                              ? 'bg-amber-950 text-amber-400 border border-amber-700/60'
                              : 'bg-red-950 text-red-400 border border-red-700/60'
                          }`}
                        >
                          {r.status === 'BERHASIL'
                            ? 'Disetujui'
                            : r.status === 'MENUNGGU'
                            ? 'Menunggu'
                            : 'Ditolak'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2 pt-2">
                  <div className="text-xs font-bold text-neutral-400 uppercase">Mutasi Saldo</div>
                  {myTransactions.length === 0 ? (
                    <div className="text-sm text-neutral-500">Belum ada transaksi saldo.</div>
                  ) : (
                    myTransactions.slice(0, 8).map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between text-xs sm:text-sm py-2.5 border-b border-neutral-800 last:border-0"
                      >
                        <div className="pr-2">
                          <div className="font-semibold text-white">{tx.description}</div>
                          <div className="text-xs text-neutral-400">{tx.date}</div>
                        </div>
                        <div
                          className={`font-black tabular-nums shrink-0 ${
                            tx.amount >= 0 ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {tx.amount >= 0 ? '+' : ''}Rp {tx.amount.toLocaleString('id-ID')}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {driverTab === 'profile' && (
            <div className="space-y-4">
              {/* Kartu Identitas Mitra Driver */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-6 space-y-4">
                <div className="flex items-center gap-3.5 pb-4 border-b border-neutral-800">
                  <div className="w-14 h-14 rounded-2xl bg-red-600/15 border border-red-600/40 flex items-center justify-center shrink-0">
                    <User className="w-7 h-7 text-red-500" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-black text-white truncate">{loggedDriver.name}</h2>
                    <div className="text-xs sm:text-sm text-neutral-400 font-mono">
                      {loggedDriver.phone} &bull; {loggedDriver.plateNumber || loggedDriver.plate}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5">
                    <span className="text-xs text-neutral-400 block">Kendaraan Terdaftar</span>
                    <span className="font-bold text-white">{loggedDriver.carModel || loggedDriver.car}</span>
                  </div>
                  <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5">
                    <span className="text-xs text-neutral-400 block">Status Akun</span>
                    <span className="font-bold text-emerald-400">Terverifikasi Aktif</span>
                  </div>
                  <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5">
                    <span className="text-xs text-neutral-400 block">Saldo M3Car Pay</span>
                    <span className="font-black text-emerald-400 tabular-nums">
                      Rp {currentSaldo.toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Dokumen KTP & SIM A */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-6 space-y-4">
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <FileText className="w-5 h-5 text-red-500" />
                    <span>Dokumen Verifikasi Driver (KTP &amp; SIM A)</span>
                  </h3>
                  <p className="text-xs sm:text-sm text-neutral-400 mt-0.5">
                    Dokumen resmi yang tersimpan aman di sistem M3CAR.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <span className="text-sm font-bold text-neutral-300 block">1. Foto KTP</span>
                    <div className="h-52 bg-neutral-950 rounded-2xl border border-neutral-800 overflow-hidden flex items-center justify-center">
                      {driverKtpUrl ? (
                        <img src={driverKtpUrl} alt="Foto KTP" className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-xs text-neutral-500">Tidak ada foto KTP</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <span className="text-sm font-bold text-neutral-300 block">2. Foto SIM A</span>
                    <div className="h-52 bg-neutral-950 rounded-2xl border border-neutral-800 overflow-hidden flex items-center justify-center">
                      {driverSimUrl ? (
                        <img src={driverSimUrl} alt="Foto SIM A" className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-xs text-neutral-500">Tidak ada foto SIM A</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-neutral-800">
                  <a
                    href={formatWaUrl(
                      settings.adminPhone || '085811594114',
                      `Halo Admin M3CAR, saya Driver ${loggedDriver.name} (${loggedDriver.plateNumber}) ingin berkonsultasi.`
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[48px] px-4 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-black flex items-center justify-center gap-2"
                  >
                    <Phone className="w-4 h-4" />
                    <span>Hubungi Admin Pusat</span>
                  </a>
                  <button
                    type="button"
                    onClick={logout}
                    className="min-h-[48px] px-4 py-3.5 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-red-400 rounded-xl text-sm font-black flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Keluar Akun Driver</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal Pengajuan Isi Saldo Driver -> Admin Firestore */}
      {isTopUpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-6 max-w-md w-full space-y-4 shadow-2xl my-auto">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-red-600/20 border border-red-600/40 flex items-center justify-center">
                  <PlusCircle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white">Pengajuan Isi Saldo M3Car Pay</h3>
                  <p className="text-xs text-neutral-400">
                    Saldo saat ini:{' '}
                    <span className="font-bold text-emerald-400 tabular-nums">
                      Rp {currentSaldo.toLocaleString('id-ID')}
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTopUpModalOpen(false)}
                className="p-2 bg-neutral-800 hover:bg-neutral-700 rounded-full text-neutral-400 hover:text-white cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Rekening / E-Wallet Tujuan Admin dari Firestore */}
            <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 text-xs sm:text-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-400 uppercase">
                  Rekening / E-Wallet Tujuan Admin
                </span>
                <button
                  type="button"
                  onClick={() => setShowQrisModal(true)}
                  className="text-xs font-bold text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer"
                >
                  <QrCode className="w-4 h-4" />
                  <span>QRIS</span>
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="font-black text-white flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-red-500 shrink-0" />
                  <span>
                    {settings.companyBank?.bankName || 'SeaBank'} &middot;{' '}
                    {settings.companyBank?.accountNumber || '901102051050'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleCopyBankAccount(settings.companyBank?.accountNumber || '901102051050')
                  }
                  className="min-h-[36px] px-3 py-1 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-white flex items-center gap-1 cursor-pointer shrink-0"
                >
                  {copiedBank ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Disalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Salin</span>
                    </>
                  )}
                </button>
              </div>
              <div className="text-neutral-300 text-xs">
                a.n {settings.companyBank?.accountHolder || 'Ali Husen - CV. ROYAL TRANS BERKAH GROUP'}
              </div>
              {settings.adminPhone && (
                <div className="text-xs text-neutral-400 pt-1 border-t border-neutral-800">
                  E-Wallet / WA Konfirmasi Admin:{' '}
                  <span className="font-mono font-bold text-emerald-400">{settings.adminPhone}</span>
                </div>
              )}
              <div className="pt-2 border-t border-neutral-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => setShowQrisModal(true)}
                    className="w-12 h-12 bg-white rounded-xl p-1 shrink-0 cursor-pointer border border-neutral-300"
                    aria-label="Perbesar QRIS Admin"
                  >
                    <img
                      src={resolvedQrisUrl}
                      alt="QRIS Admin M3CAR"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = DEFAULT_QRIS_IMAGE_URL;
                      }}
                      className="w-full h-full object-contain"
                    />
                  </button>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white">QRIS Resmi M3CAR</div>
                    <div className="text-xs text-neutral-400 truncate">
                      Klik gambar untuk perbesar
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadDriverQris}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{qrisDownloaded ? 'Diunduh' : 'Unduh'}</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmitTopUp} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-neutral-200 mb-2">
                  Pilih Nominal atau Ketik Nominal Bebas (Rp)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2.5">
                  {[50000, 100000, 200000, 500000].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setTopUpAmount(val)}
                      className={`min-h-[48px] py-3 rounded-xl text-sm font-bold cursor-pointer border ${
                        topUpAmount === val
                          ? 'bg-red-600 border-red-500 text-white'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                      }`}
                    >
                      Rp {(val / 1000).toLocaleString('id-ID')}rb
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  required
                  min={MIN_DRIVER_ACTIVE_BALANCE}
                  step={5000}
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(Number(e.target.value))}
                  placeholder="Nominal bebas (min. Rp 10.000)"
                  className="w-full min-h-[48px] px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-xl text-base font-mono font-bold text-white focus:border-red-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-neutral-200 mb-1.5">
                  Catatan / Nama Pengirim Rekening (Opsional)
                </label>
                <input
                  type="text"
                  value={topUpNote}
                  onChange={(e) => setTopUpNote(e.target.value)}
                  placeholder="Misal: Transfer BCA a.n Ahmad"
                  className="w-full min-h-[48px] px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-xl text-base text-white focus:border-red-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-neutral-200 mb-1.5">
                  Upload Bukti Transfer (Opsional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleSelectReceipt}
                  className="w-full text-sm text-neutral-400 file:mr-3 file:min-h-[44px] file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:bg-neutral-800 file:text-white file:font-bold cursor-pointer"
                />
                {receiptPreview && (
                  <img
                    src={receiptPreview}
                    alt="Bukti Transfer"
                    className="mt-2 h-28 rounded-xl border border-neutral-800 object-contain bg-neutral-950"
                  />
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setIsTopUpModalOpen(false)}
                  className="min-h-[48px] px-4 py-3.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-sm font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTopUp}
                  className="sm:col-span-2 min-h-[48px] py-3.5 px-4 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white rounded-xl text-sm font-black cursor-pointer flex items-center justify-center gap-2"
                >
                  {isSubmittingTopUp && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Ajukan Top-Up Saldo</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QRIS Modal (Real-Time Firestore setting_admin/payment_config) */}
      {showQrisModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 max-w-sm w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-white">QRIS Resmi M3CAR (RTB Group)</h3>
              <button
                type="button"
                onClick={() => setShowQrisModal(false)}
                className="p-2 bg-neutral-800 rounded-full text-neutral-400 hover:text-white cursor-pointer"
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
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handleDownloadDriverQris}
                className="min-h-[48px] py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-black inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>{qrisDownloaded ? 'Diunduh' : 'Unduh QRIS'}</span>
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

      {/* Fixed Mobile Bottom Navigation Bar (Driver Dashboard) */}
      {loggedDriver.status === 'AKTIF' ? (
        <nav
          aria-label="Navigasi Bawah Driver"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-neutral-950/95 backdrop-blur-md border-t border-neutral-800"
        >
          <div className="grid grid-cols-4 h-16 max-w-md mx-auto px-1">
            <button
              type="button"
              onClick={() => {
                setDriverTab('home');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
                driverTab === 'home' ? 'text-red-500' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Home className="w-5 h-5" />
              <span className="text-[11px] font-bold leading-none">Beranda</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setDriverTab('orders');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`relative flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
                driverTab === 'orders' ? 'text-red-500' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Navigation className="w-5 h-5" />
              <span className="text-[11px] font-bold leading-none">Orderan</span>
              {availableOrders.length + myActiveOrders.length > 0 && (
                <span className="absolute top-1.5 right-3 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center tabular-nums">
                  {availableOrders.length + myActiveOrders.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setDriverTab('wallet');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
                driverTab === 'wallet' ? 'text-red-500' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Wallet className="w-5 h-5" />
              <span className="text-[11px] font-bold leading-none">Dompet</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setDriverTab('profile');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
                driverTab === 'profile' ? 'text-red-500' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <User className="w-5 h-5" />
              <span className="text-[11px] font-bold leading-none">Profil</span>
            </button>
          </div>
        </nav>
      ) : (
        <nav
          aria-label="Navigasi Status Driver"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-neutral-950/95 backdrop-blur-md border-t border-neutral-800"
        >
          <div className="grid grid-cols-2 h-16 max-w-md mx-auto px-1">
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="flex flex-col items-center justify-center gap-1 text-red-500 cursor-pointer"
            >
              <Clock className="w-5 h-5" />
              <span className="text-[11px] font-bold leading-none">Status Akun</span>
            </button>
            <a
              href={formatWaUrl(
                settings.adminPhone || '085811594114',
                `Halo Admin M3CAR, saya Driver ${loggedDriver.name} (${loggedDriver.plateNumber}) mohon bantuannya.`
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center justify-center gap-1 text-emerald-400 hover:text-emerald-300"
            >
              <Phone className="w-5 h-5" />
              <span className="text-[11px] font-bold leading-none">Hubungi Admin</span>
            </a>
          </div>
        </nav>
      )}
    </div>
  );
};
