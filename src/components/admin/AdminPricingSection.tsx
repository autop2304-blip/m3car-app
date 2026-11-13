import React, { useState, useMemo, useEffect } from 'react';
import { useM3CarStore } from '../../store/m3carStore';
import { PriceTariff } from '../../types';
import {
  compressImageFile,
  DEFAULT_QRIS_IMAGE_URL,
} from '../../services/firestoreService';
import {
  Tags,
  Plus,
  Pencil,
  Trash2,
  Power,
  X,
  CheckCircle2,
  Sliders,
  Lock,
  Building2,
  QrCode,
  Upload,
  Loader2,
  RotateCcw,
} from 'lucide-react';

export const AdminPricingSection: React.FC = () => {
  const {
    settings,
    addTariff,
    updateTariff,
    deleteTariff,
    toggleTariffStatus,
    updateSettings,
    updateCompanyBank,
    updateQrisImage,
    changeAdminCodeWithServer,
  } = useM3CarStore();

  const routes = settings.routes || [];
  const tariffs = settings.tariffs || [];

  // Modal & Form state for tariffs
  const [isTariffModalOpen, setIsTariffModalOpen] = useState(false);
  const [editingTariff, setEditingTariff] = useState<PriceTariff | null>(null);
  const [tariffToDelete, setTariffToDelete] = useState<PriceTariff | null>(null);
  const [tariffForm, setTariffForm] = useState({
    routeId: '',
    namaRute: '',
    hargaPerOrang: 270000,
    hargaSekaliJalan: 270000,
    hargaPulangPergi: 520000,
    aktif: true,
  });

  // Global pricing & operational config form
  const [opsForm, setOpsForm] = useState({
    pricePerPerson: settings.pricePerPerson ?? 270000,
    pricePerKm: settings.pricePerKm ?? 3500,
    commissionLongTrip: Math.round((settings.commissionRates?.longTrip ?? 0.12) * 100),
    commissionShortTrip: Math.round((settings.commissionRates?.shortTrip ?? 0.15) * 100),
    adminPhone: settings.adminPhone || '085811594114',
    bankName: settings.companyBank?.bankName || 'SeaBank',
    accountNumber: settings.companyBank?.accountNumber || '901102051050',
    accountHolder: settings.companyBank?.accountHolder || 'Ali Husen - CV. ROYAL TRANS BERKAH GROUP',
  });
  const [opsSavedMsg, setOpsSavedMsg] = useState<string | null>(null);

  // Server Access Code change state
  const [codeForm, setCodeForm] = useState({ currentCode: '', newCode: '', confirmCode: '' });
  const [codeStatus, setCodeStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  // Official QRIS Image state (synced with Firestore setting_admin/payment_config)
  const [qrisDraftUrl, setQrisDraftUrl] = useState(settings.qrisImageUrl || DEFAULT_QRIS_IMAGE_URL);
  const [hasQrisDraft, setHasQrisDraft] = useState(false);
  const [isProcessingQrisFile, setIsProcessingQrisFile] = useState(false);
  const [isSavingQris, setIsSavingQris] = useState(false);
  const [qrisStatusMsg, setQrisStatusMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    setOpsForm({
      pricePerPerson: settings.pricePerPerson ?? 270000,
      pricePerKm: settings.pricePerKm ?? 3500,
      commissionLongTrip: Math.round((settings.commissionRates?.longTrip ?? 0.12) * 100),
      commissionShortTrip: Math.round((settings.commissionRates?.shortTrip ?? 0.15) * 100),
      adminPhone: settings.adminPhone || '085811594114',
      bankName: settings.companyBank?.bankName || 'SeaBank',
      accountNumber: settings.companyBank?.accountNumber || '901102051050',
      accountHolder: settings.companyBank?.accountHolder || 'Ali Husen - CV. ROYAL TRANS BERKAH GROUP',
    });
    if (!hasQrisDraft) {
      setQrisDraftUrl(settings.qrisImageUrl || DEFAULT_QRIS_IMAGE_URL);
    }
  }, [settings, hasQrisDraft]);

  const activeTariffCount = useMemo(() => tariffs.filter((t) => t.aktif).length, [tariffs]);

  const openCreateTariff = () => {
    setEditingTariff(null);
    const firstRoute = routes.find((r) => r.status === 'AKTIF') || routes[0];
    setTariffForm({
      routeId: firstRoute?.id || '',
      namaRute: firstRoute ? `${firstRoute.kotaAsal} - ${firstRoute.kotaTujuan}` : '',
      hargaPerOrang: settings.pricePerPerson || 270000,
      hargaSekaliJalan: settings.pricePerPerson || 270000,
      hargaPulangPergi: (settings.pricePerPerson || 270000) * 2,
      aktif: true,
    });
    setIsTariffModalOpen(true);
  };

  const openEditTariff = (tariff: PriceTariff) => {
    setEditingTariff(tariff);
    setTariffForm({
      routeId: tariff.routeId || '',
      namaRute: tariff.namaRute,
      hargaPerOrang: tariff.hargaPerOrang,
      hargaSekaliJalan: tariff.hargaSekaliJalan,
      hargaPulangPergi: tariff.hargaPulangPergi,
      aktif: tariff.aktif,
    });
    setIsTariffModalOpen(true);
  };

  const handleTariffSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tariffForm.namaRute.trim()) return;

    if (editingTariff) {
      updateTariff(editingTariff.id, {
        routeId: tariffForm.routeId || undefined,
        namaRute: tariffForm.namaRute.trim(),
        hargaPerOrang: Number(tariffForm.hargaPerOrang) || 0,
        hargaSekaliJalan: Number(tariffForm.hargaSekaliJalan) || 0,
        hargaPulangPergi: Number(tariffForm.hargaPulangPergi) || 0,
        aktif: tariffForm.aktif,
      });
    } else {
      addTariff({
        routeId: tariffForm.routeId || undefined,
        namaRute: tariffForm.namaRute.trim(),
        hargaPerOrang: Number(tariffForm.hargaPerOrang) || 0,
        hargaSekaliJalan: Number(tariffForm.hargaSekaliJalan) || 0,
        hargaPulangPergi: Number(tariffForm.hargaPulangPergi) || 0,
        aktif: tariffForm.aktif,
      });
    }
    setIsTariffModalOpen(false);
    setEditingTariff(null);
  };

  const handleSaveOps = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      pricePerPerson: Number(opsForm.pricePerPerson) || 270000,
      pricePerKm: Number(opsForm.pricePerKm) || 3500,
      adminPhone: opsForm.adminPhone.trim(),
      commissionRates: {
        longTrip: (Number(opsForm.commissionLongTrip) || 12) / 100,
        shortTrip: (Number(opsForm.commissionShortTrip) || 15) / 100,
      },
    });
    updateCompanyBank({
      bankName: opsForm.bankName.trim(),
      accountNumber: opsForm.accountNumber.trim(),
      accountHolder: opsForm.accountHolder.trim(),
    });
    setOpsSavedMsg('Pengaturan tarif global & rekening berhasil disimpan ke Firebase.');
    setTimeout(() => setOpsSavedMsg(null), 4000);
  };

  const handleChangeCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeStatus(null);
    if (codeForm.newCode.trim().length < 6) {
      setCodeStatus({ ok: false, msg: 'Kode baru minimal 6 karakter.' });
      return;
    }
    if (codeForm.newCode !== codeForm.confirmCode) {
      setCodeStatus({ ok: false, msg: 'Konfirmasi kode baru tidak cocok.' });
      return;
    }
    const res = await changeAdminCodeWithServer(codeForm.currentCode, codeForm.newCode);
    setCodeStatus({ ok: res.success, msg: res.message });
    if (res.success) {
      setCodeForm({ currentCode: '', newCode: '', confirmCode: '' });
    }
  };

  const handleSelectQrisFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrisStatusMsg(null);
    setIsProcessingQrisFile(true);
    try {
      const { dataUrl } = await compressImageFile(file, 860, 0.85);
      setQrisDraftUrl(dataUrl);
      setHasQrisDraft(true);
    } catch (err) {
      setQrisStatusMsg({
        ok: false,
        msg: err instanceof Error ? err.message : 'Gagal memproses file gambar QRIS.',
      });
    } finally {
      setIsProcessingQrisFile(false);
    }
  };

  const handleSaveQris = async () => {
    const target = qrisDraftUrl.trim() || DEFAULT_QRIS_IMAGE_URL;
    setIsSavingQris(true);
    setQrisStatusMsg(null);
    const res = await updateQrisImage(target);
    setIsSavingQris(false);
    setQrisStatusMsg({
      ok: res.success,
      msg:
        res.message ||
        (res.success
          ? 'Gambar QRIS berhasil disimpan & otomatis tersinkron ke halaman Penumpang dan Driver.'
          : 'Gagal menyimpan QRIS.'),
    });
    if (res.success) {
      setHasQrisDraft(false);
    }
  };

  const handleResetQris = async () => {
    setIsSavingQris(true);
    setQrisStatusMsg(null);
    const res = await updateQrisImage(DEFAULT_QRIS_IMAGE_URL);
    setIsSavingQris(false);
    setQrisDraftUrl(DEFAULT_QRIS_IMAGE_URL);
    setHasQrisDraft(false);
    setQrisStatusMsg({
      ok: res.success,
      msg: res.success
        ? 'Gambar QRIS dikembalikan ke QRIS bawaan M3CAR.'
        : res.message || 'Gagal mereset QRIS.',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div>
          <h3 className="text-lg font-extrabold text-slate-950 flex items-center gap-2">
            <Tags className="w-5 h-5 text-[#0F294A]" />
            <span>Pengaturan Harga &amp; Tarif Rute</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Atur harga per orang, sekali jalan, dan pulang-pergi kapan saja. Semua tarif disimpan di Firebase ({activeTariffCount} tarif aktif).
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateTariff}
          className="px-4 py-2.5 rounded-lg bg-[#0F294A] hover:bg-[#173B6B] text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Tarif Baru</span>
        </button>
      </div>

      {/* Tariffs Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[11px] font-bold">
                <th className="py-3.5 px-4">Nama Rute</th>
                <th className="py-3.5 px-4 text-right">Harga / Orang</th>
                <th className="py-3.5 px-4 text-right">Harga Sekali Jalan</th>
                <th className="py-3.5 px-4 text-right">Harga Pulang-Pergi</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tariffs.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-slate-950">{t.namaRute}</td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                    Rp {Number(t.hargaPerOrang || 0).toLocaleString('id-ID')}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-800 tabular-nums">
                    Rp {Number(t.hargaSekaliJalan || 0).toLocaleString('id-ID')}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-semibold text-[#0F294A] tabular-nums">
                    Rp {Number(t.hargaPulangPergi || 0).toLocaleString('id-ID')}
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-block px-2.5 py-1 rounded text-[11px] font-bold ${
                        t.aktif
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {t.aktif ? 'AKTIF' : 'NONAKTIF'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => toggleTariffStatus(t.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border flex items-center gap-1 cursor-pointer ${
                          t.aktif
                            ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{t.aktif ? 'Nonaktifkan' : 'Aktifkan'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditTariff(t)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setTariffToDelete(t)}
                        className="px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {tariffs.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-500">
                    Belum ada tarif khusus rute. Klik &ldquo;Tambah Tarif Baru&rdquo; untuk menetapkan harga perjalanan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Global Operational Rates & Security Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Global Base Rates & Bank */}
        <form
          onSubmit={handleSaveOps}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Sliders className="w-4 h-4 text-[#0F294A]" />
            <h4 className="text-sm font-bold text-slate-950">Tarif Dasar, Komisi &amp; Rekening</h4>
          </div>

          {opsSavedMsg && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{opsSavedMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Harga Default / Orang (Rp)</label>
              <input
                type="number"
                value={opsForm.pricePerPerson}
                onChange={(e) => setOpsForm({ ...opsForm, pricePerPerson: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-950 focus:outline-none focus:border-[#0F294A]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tarif Tambahan / KM (Rp)</label>
              <input
                type="number"
                value={opsForm.pricePerKm}
                onChange={(e) => setOpsForm({ ...opsForm, pricePerKm: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-950 focus:outline-none focus:border-[#0F294A]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Komisi Perjalanan Jauh (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={opsForm.commissionLongTrip}
                onChange={(e) => setOpsForm({ ...opsForm, commissionLongTrip: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-950 focus:outline-none focus:border-[#0F294A]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Komisi Perjalanan Lokal (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={opsForm.commissionShortTrip}
                onChange={(e) => setOpsForm({ ...opsForm, commissionShortTrip: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-950 focus:outline-none focus:border-[#0F294A]"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <Building2 className="w-3.5 h-3.5 text-[#0F294A]" />
              <span>Rekening Resmi &amp; Kontak Pusat</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">WhatsApp Admin</label>
                <input
                  type="text"
                  value={opsForm.adminPhone}
                  onChange={(e) => setOpsForm({ ...opsForm, adminPhone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-950 focus:outline-none focus:border-[#0F294A]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Bank</label>
                <input
                  type="text"
                  value={opsForm.bankName}
                  onChange={(e) => setOpsForm({ ...opsForm, bankName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-950 focus:outline-none focus:border-[#0F294A]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">No. Rekening</label>
                <input
                  type="text"
                  value={opsForm.accountNumber}
                  onChange={(e) => setOpsForm({ ...opsForm, accountNumber: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-950 focus:outline-none focus:border-[#0F294A]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Atas Nama</label>
                <input
                  type="text"
                  value={opsForm.accountHolder}
                  onChange={(e) => setOpsForm({ ...opsForm, accountHolder: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-950 focus:outline-none focus:border-[#0F294A]"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="px-4 py-2.5 rounded-lg bg-[#0F294A] hover:bg-[#173B6B] text-white text-xs font-bold cursor-pointer transition-colors"
          >
            Simpan Tarif &amp; Rekening ke Firebase
          </button>
        </form>

        {/* Server Access Code Update */}
        <form
          onSubmit={handleChangeCode}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Lock className="w-4 h-4 text-[#0F294A]" />
            <h4 className="text-sm font-bold text-slate-950">Keamanan Kode Admin (Cloud Firestore)</h4>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Kode akses admin disimpan pada dokumen pengaturan admin di Firebase Cloud Firestore sehingga dapat digunakan langsung dari seluruh perangkat.
          </p>

          {codeStatus && (
            <div
              className={`p-3 rounded-lg border text-xs font-semibold ${
                codeStatus.ok
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              {codeStatus.msg}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Kode Admin Saat Ini</label>
              <input
                type="password"
                required
                value={codeForm.currentCode}
                onChange={(e) => setCodeForm({ ...codeForm, currentCode: e.target.value })}
                placeholder="Masukkan kode saat ini"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-950 focus:outline-none focus:border-[#0F294A]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Kode Admin Baru</label>
              <input
                type="password"
                required
                value={codeForm.newCode}
                onChange={(e) => setCodeForm({ ...codeForm, newCode: e.target.value })}
                placeholder="Minimal 6 karakter"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-950 focus:outline-none focus:border-[#0F294A]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Konfirmasi Kode Baru</label>
              <input
                type="password"
                required
                value={codeForm.confirmCode}
                onChange={(e) => setCodeForm({ ...codeForm, confirmCode: e.target.value })}
                placeholder="Ulangi kode baru"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-950 focus:outline-none focus:border-[#0F294A]"
              />
            </div>
          </div>

          <button
            type="submit"
            className="px-4 py-2.5 rounded-lg bg-[#070B14] hover:bg-[#0F294A] text-white text-xs font-bold cursor-pointer transition-colors"
          >
            Perbarui Kode Admin di Firestore
          </button>
        </form>
      </div>

      {/* Pengaturan Gambar QRIS Resmi (Real-Time Firestore) */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h4 className="text-sm font-bold text-slate-950 flex items-center gap-2">
              <QrCode className="w-4 h-4 text-[#0F294A]" />
              <span>Pengaturan Gambar QRIS Resmi (Real-Time Firestore)</span>
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Gambar QRIS disimpan di <span className="font-mono text-slate-700">setting_admin/payment_config</span> dan langsung tampil otomatis di Dashboard Penumpang &amp; Driver.
            </p>
          </div>
          {settings.qrisUpdatedAt && (
            <span className="text-[11px] font-medium text-slate-500 shrink-0">
              Terakhir diperbarui: {new Date(settings.qrisUpdatedAt).toLocaleString('id-ID')}
            </span>
          )}
        </div>

        {qrisStatusMsg && (
          <div
            className={`p-3 rounded-lg border text-xs font-semibold flex items-center gap-2 ${
              qrisStatusMsg.ok
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{qrisStatusMsg.msg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
          {/* Live Preview */}
          <div className="md:col-span-4 bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col items-center gap-2.5">
            <span className="text-[11px] font-bold uppercase text-slate-500 tracking-wide">
              Pratinjau QRIS Aktif
            </span>
            <div className="w-48 h-48 sm:w-52 sm:h-52 bg-white border border-slate-200 rounded-xl p-2 flex items-center justify-center overflow-hidden shadow-xs">
              <img
                src={qrisDraftUrl || DEFAULT_QRIS_IMAGE_URL}
                alt="Pratinjau QRIS Resmi M3CAR"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = DEFAULT_QRIS_IMAGE_URL;
                }}
                className="w-full h-full object-contain"
              />
            </div>
            {hasQrisDraft && (
              <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded">
                Draf belum disimpan
              </span>
            )}
          </div>

          {/* Upload & URL Controls */}
          <div className="md:col-span-8 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Unggah Gambar QRIS Baru (PNG / JPG)
              </label>
              <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-900 text-xs font-bold cursor-pointer transition-colors">
                {isProcessingQrisFile ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#0F294A]" />
                ) : (
                  <Upload className="w-4 h-4 text-[#0F294A]" />
                )}
                <span>{isProcessingQrisFile ? 'Memproses gambar...' : 'Pilih File Gambar QRIS'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleSelectQrisFile}
                  className="hidden"
                />
              </label>
              <p className="text-[11px] text-slate-500 mt-1">
                Gambar otomatis dikompresi dengan latar putih agar kode QR tetap tajam saat diunduh &amp; dipindai penumpang.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Atau Tempel Tautan Gambar QRIS (Opsional)
              </label>
              <input
                type="text"
                value={qrisDraftUrl.startsWith('data:') ? '' : qrisDraftUrl}
                onChange={(e) => {
                  setQrisDraftUrl(e.target.value);
                  setHasQrisDraft(true);
                }}
                placeholder={
                  qrisDraftUrl.startsWith('data:')
                    ? 'Gambar terunggah dari perangkat siap disimpan'
                    : 'https://... atau /assets/...'
                }
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-950 focus:outline-none focus:border-[#0F294A]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleSaveQris}
                disabled={isSavingQris || isProcessingQrisFile}
                className="px-4 py-2.5 rounded-lg bg-[#0F294A] hover:bg-[#173B6B] disabled:opacity-60 text-white text-xs font-bold cursor-pointer transition-colors inline-flex items-center gap-2"
              >
                {isSavingQris && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Simpan Gambar QRIS ke Firestore</span>
              </button>

              <button
                type="button"
                onClick={handleResetQris}
                disabled={isSavingQris}
                className="px-3.5 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset QRIS Bawaan</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Add / Edit Tariff Modal */}
      {isTariffModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="bg-[#0B162C] text-white px-6 py-4 flex items-center justify-between">
              <h4 className="font-bold text-sm">
                {editingTariff ? 'Edit Tarif Perjalanan' : 'Tambah Tarif Perjalanan'}
              </h4>
              <button
                type="button"
                onClick={() => setIsTariffModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleTariffSubmit} className="p-6 space-y-4">
              {routes.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Pilih dari Rute Tersedia (Opsional)
                  </label>
                  <select
                    value={tariffForm.routeId}
                    onChange={(e) => {
                      const selected = routes.find((r) => r.id === e.target.value);
                      setTariffForm({
                        ...tariffForm,
                        routeId: e.target.value,
                        namaRute: selected
                          ? `${selected.kotaAsal} - ${selected.kotaTujuan}`
                          : tariffForm.namaRute,
                      });
                    }}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-950 focus:outline-none focus:border-[#0F294A]"
                  >
                    <option value="">-- Input Nama Rute Manual --</option>
                    {routes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.kotaAsal} ({r.provinsiAsal}) &rarr; {r.kotaTujuan} ({r.provinsiTujuan})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Rute</label>
                <input
                  type="text"
                  required
                  value={tariffForm.namaRute}
                  onChange={(e) => setTariffForm({ ...tariffForm, namaRute: e.target.value })}
                  placeholder="Contoh: Jakarta - Ujung Kulon"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-950 focus:outline-none focus:border-[#0F294A]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Harga / Orang (Rp)</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={tariffForm.hargaPerOrang}
                    onChange={(e) =>
                      setTariffForm({ ...tariffForm, hargaPerOrang: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-950 focus:outline-none focus:border-[#0F294A]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Sekali Jalan (Rp)</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={tariffForm.hargaSekaliJalan}
                    onChange={(e) =>
                      setTariffForm({ ...tariffForm, hargaSekaliJalan: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-950 focus:outline-none focus:border-[#0F294A]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Pulang-Pergi (Rp)</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={tariffForm.hargaPulangPergi}
                    onChange={(e) =>
                      setTariffForm({ ...tariffForm, hargaPulangPergi: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-950 focus:outline-none focus:border-[#0F294A]"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tariffForm.aktif}
                  onChange={(e) => setTariffForm({ ...tariffForm, aktif: e.target.checked })}
                  className="rounded border-slate-300 text-[#0F294A] focus:ring-[#0F294A]"
                />
                <span>Aktifkan tarif ini sekarang</span>
              </label>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsTariffModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173B6B] text-white text-xs font-bold cursor-pointer"
                >
                  {editingTariff ? 'Simpan Perubahan' : 'Simpan Tarif'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Tariff Modal */}
      {tariffToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h4 className="text-base font-bold text-slate-950">Hapus Tarif?</h4>
            <p className="text-xs text-slate-600">
              Anda yakin ingin menghapus tarif <span className="font-bold text-slate-950">{tariffToDelete.namaRute}</span>?
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setTariffToDelete(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteTariff(tariffToDelete.id);
                  setTariffToDelete(null);
                }}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
              >
                Hapus Tarif
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
