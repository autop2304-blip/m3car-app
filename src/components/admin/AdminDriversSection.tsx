import React, { useState, useMemo } from 'react';
import { useM3CarStore } from '../../store/m3carStore';
import { DriverProfile } from '../../types';
import {
  Car,
  Search,
  Eye,
  CheckCircle2,
  XCircle,
  Ban,
  Unlock,
  PlusCircle,
  Phone,
  Trash2,
  X,
  KeyRound,
  Lock,
  Copy,
  Check,
  MapPin,
  ExternalLink,
} from 'lucide-react';

export const AdminDriversSection: React.FC = () => {
  const {
    drivers,
    approveDriver,
    rejectDriver,
    blockDriver,
    unblockDriver,
    topUpDriverSaldo,
    addKeuanganTransaction,
    deleteDriver,
    generateDriverRecoveryCode,
  } = useM3CarStore();

  const [filter, setFilter] = useState<'ALL' | 'MENUNGGU' | 'AKTIF' | 'DIBLOKIR'>('ALL');
  const [search, setSearch] = useState('');

  // Modals (NO window.prompt/alert, NO selfie — only KTP & SIM A)
  const [docsDriver, setDocsDriver] = useState<DriverProfile | null>(null);
  const [rejectModalDriver, setRejectModalDriver] = useState<DriverProfile | null>(null);
  const [rejectReason, setRejectReason] = useState('Foto KTP atau SIM A kurang jelas / tidak terbaca');
  const [blockModalDriver, setBlockModalDriver] = useState<DriverProfile | null>(null);
  const [blockReason, setBlockReason] = useState('Pelanggaran SOP layanan M3CAR');
  const [topUpDriverModal, setTopUpDriverModal] = useState<DriverProfile | null>(null);
  const [topUpAmount, setTopUpAmount] = useState(100000);
  const [driverToDelete, setDriverToDelete] = useState<DriverProfile | null>(null);
  const [recoveryModal, setRecoveryModal] = useState<{
    driver: DriverProfile;
    code?: string;
    expiresAt?: string;
    loading: boolean;
    error?: string;
    copied?: boolean;
  } | null>(null);

  const activeList = useMemo(() => drivers.filter((d) => !d.isDeleted), [drivers]);

  const filteredDrivers = useMemo(() => {
    return activeList.filter((d) => {
      if (filter === 'MENUNGGU' && d.status !== 'MENUNGGU') return false;
      if (filter === 'AKTIF' && d.status !== 'AKTIF') return false;
      if (filter === 'DIBLOKIR' && d.status !== 'DIBLOKIR' && d.status !== 'DITOLAK') return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          (d.name || '').toLowerCase().includes(q) ||
          (d.phone || '').toLowerCase().includes(q) ||
          (d.plateNumber || d.plate || '').toLowerCase().includes(q) ||
          (d.carModel || d.car || '').toLowerCase().includes(q) ||
          (d.lokasi || d.currentLocation || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [activeList, filter, search]);

  const handleConfirmReject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalDriver) return;
    rejectDriver(rejectModalDriver.id, rejectReason.trim() || 'Dokumen ditolak oleh Admin');
    setRejectModalDriver(null);
    setDocsDriver(null);
  };

  const handleConfirmBlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockModalDriver) return;
    blockDriver(blockModalDriver.id, blockReason.trim() || 'Diblokir oleh Admin Pusat');
    setBlockModalDriver(null);
  };

  const handleConfirmTopUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topUpDriverModal || topUpAmount <= 0) return;
    const res = await topUpDriverSaldo(topUpDriverModal.id, Number(topUpAmount), 'WA_TRANSFER');
    if (res.success) {
      addKeuanganTransaction({
        jenis: 'masuk',
        keterangan: `Tambah Saldo Manual Driver ${topUpDriverModal.name} (${topUpDriverModal.plateNumber})`,
        jumlah_rp: Number(topUpAmount),
        nama_driver: topUpDriverModal.name,
      });
    }
    setTopUpDriverModal(null);
    setTopUpAmount(100000);
  };

  const handleOpenRecoveryModal = async (driver: DriverProfile) => {
    setRecoveryModal({ driver, loading: true });
    const res = await generateDriverRecoveryCode(driver.id);
    if (!res.success || !res.recoveryCode) {
      setRecoveryModal({
        driver,
        loading: false,
        error: res.message || 'Gagal membuat kode pemulihan.',
      });
    } else {
      setRecoveryModal({
        driver,
        loading: false,
        code: res.recoveryCode,
        expiresAt: res.expiresAt,
      });
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Filter */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-extrabold text-slate-950 flex items-center gap-2">
              <Car className="w-5 h-5 text-[#0F294A]" />
              <span>Manajemen Mitra Driver</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Verifikasi KTP &amp; SIM A, persetujuan pendaftaran, blokir/buka blokir, dan saldo driver dari koleksi <span className="font-mono">drivers</span>.
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, HP, plat, kendaraan..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-950 focus:outline-none focus:border-[#0F294A]"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          {(
            [
              { id: 'ALL', label: `Semua (${activeList.length})` },
              {
                id: 'MENUNGGU',
                label: `Menunggu Persetujuan (${activeList.filter((d) => d.status === 'MENUNGGU').length})`,
              },
              {
                id: 'AKTIF',
                label: `Aktif (${activeList.filter((d) => d.status === 'AKTIF').length})`,
              },
              {
                id: 'DIBLOKIR',
                label: `Diblokir / Ditolak (${
                  activeList.filter((d) => d.status === 'DIBLOKIR' || d.status === 'DITOLAK').length
                })`,
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap transition-colors ${
                filter === tab.id
                  ? 'bg-[#0F294A] text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-950 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Drivers Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[11px] font-bold">
                <th className="py-3.5 px-4">Driver &amp; No HP</th>
                <th className="py-3.5 px-4">Kendaraan &amp; Plat Nomor</th>
                <th className="py-3.5 px-4">Lokasi Terkini</th>
                <th className="py-3.5 px-4 text-right">Saldo Driver</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Dokumen</th>
                <th className="py-3.5 px-4 text-right">Tindakan Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDrivers.map((d) => {
                const saldo = Number(d.saldo ?? d.balance ?? 0);
                return (
                  <tr key={d.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-950">{d.name}</div>
                      <div className="font-mono text-[11px] text-slate-500">{d.phone || '-'}</div>
                      <div className="mt-1">
                        {d.hasPassword ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold">
                            <Lock className="w-2.5 h-2.5 text-emerald-600" />
                            Sandi Pribadi Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold">
                            <KeyRound className="w-2.5 h-2.5 text-amber-600" />
                            Driver Lama (Belum Set Sandi)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-800">{d.carModel || d.car || '-'}</div>
                      <div className="font-mono text-[11px] font-bold text-[#0F294A]">
                        {d.plateNumber || d.plate || '-'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 max-w-[200px]">
                      {d.lokasi || d.currentLocation || (d.lat !== undefined && d.lng !== undefined) ? (
                        <div className="space-y-0.5">
                          <div className="font-semibold text-slate-800 flex items-start gap-1">
                            <MapPin className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                            <span className="truncate">
                              {d.lokasi || d.currentLocation || 'Koordinat GPS'}
                            </span>
                          </div>
                          {d.lat !== undefined && d.lng !== undefined && (
                            <a
                              href={`https://www.google.com/maps?q=${d.lat},${d.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-[#0F294A] hover:underline"
                            >
                              <span>
                                {Number(d.lat).toFixed(4)}, {Number(d.lng).toFixed(4)}
                              </span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                          {d.locationUpdatedAt && (
                            <div className="text-[10px] text-slate-400">
                              Update: {new Date(d.locationUpdatedAt).toLocaleTimeString('id-ID')}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">Belum ada lokasi</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-950 tabular-nums">
                      Rp {saldo.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block px-2.5 py-1 rounded text-[11px] font-bold ${
                          d.status === 'AKTIF'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : d.status === 'MENUNGGU'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}
                      >
                        {d.status === 'MENUNGGU'
                          ? 'Menunggu'
                          : d.status === 'AKTIF'
                          ? d.isOnline
                            ? 'Aktif (Online)'
                            : 'Aktif'
                          : d.status === 'DIBLOKIR'
                          ? 'Diblokir'
                          : 'Ditolak'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <button
                        type="button"
                        onClick={() => setDocsDriver(d)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#0F294A]" />
                        <span>KTP &amp; SIM A</span>
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {d.status === 'MENUNGGU' && (
                          <>
                            <button
                              type="button"
                              onClick={() => approveDriver(d.id)}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Setujui</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectReason('Foto KTP atau SIM A kurang jelas / tidak terbaca');
                                setRejectModalDriver(d);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Tolak</span>
                            </button>
                          </>
                        )}

                        {d.status === 'DITOLAK' && (
                          <button
                            type="button"
                            onClick={() => approveDriver(d.id)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Setujui</span>
                          </button>
                        )}

                        {d.status === 'AKTIF' && (
                          <button
                            type="button"
                            onClick={() => {
                              setBlockReason('Pelanggaran SOP layanan M3CAR');
                              setBlockModalDriver(d);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>Blokir</span>
                          </button>
                        )}

                        {d.status === 'DIBLOKIR' && (
                          <button
                            type="button"
                            onClick={() => unblockDriver(d.id)}
                            className="px-2.5 py-1.5 rounded-lg bg-[#0F294A] hover:bg-[#173B6B] text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            <span>Buka Blokir</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setTopUpAmount(100000);
                            setTopUpDriverModal(d);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                          title="Tambah Saldo Driver"
                        >
                          <PlusCircle className="w-3.5 h-3.5 text-emerald-700" />
                          <span>Saldo</span>
                        </button>

                        {d.phone && (
                          <a
                            href={`https://wa.me/${d.phone.replace(/\D/g, '').replace(/^0/, '62')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700"
                            title="Hubungi Driver via WhatsApp"
                          >
                            <Phone className="w-3.5 h-3.5" />
                          </a>
                        )}

                        <button
                          type="button"
                          onClick={() => handleOpenRecoveryModal(d)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 cursor-pointer"
                          title="Buat Kode Pemulihan Sandi Driver"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setDriverToDelete(d)}
                          className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 cursor-pointer"
                          title="Hapus Driver"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredDrivers.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-500">
                    Tidak ada data driver pada filter ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Periksa Dokumen Driver (Hanya 2 Foto: KTP & SIM A, Tanpa Selfie) */}
      {docsDriver && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="bg-[#0B162C] text-white px-6 py-4 flex items-center justify-between sticky top-0 z-10">
              <div>
                <h4 className="font-bold text-sm">Periksa Dokumen Driver — {docsDriver.name}</h4>
                <p className="text-[11px] text-slate-300 font-mono">
                  {docsDriver.carModel || docsDriver.car} &bull; {docsDriver.plateNumber || docsDriver.plate} &bull; {docsDriver.phone}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDocsDriver(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
                  <div className="text-xs font-bold text-slate-800">Foto KTP</div>
                  {docsDriver.ktpUrl || docsDriver.ktpPhotoUrl ? (
                    <img
                      src={docsDriver.ktpUrl || docsDriver.ktpPhotoUrl}
                      alt={`KTP ${docsDriver.name}`}
                      className="w-full h-56 object-contain bg-white rounded-lg border border-slate-200"
                    />
                  ) : (
                    <div className="h-56 flex items-center justify-center bg-white rounded-lg border border-dashed border-slate-300 text-xs text-slate-400">
                      Foto KTP belum diunggah
                    </div>
                  )}
                </div>

                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
                  <div className="text-xs font-bold text-slate-800">Foto SIM A</div>
                  {docsDriver.simUrl || docsDriver.simPhotoUrl ? (
                    <img
                      src={docsDriver.simUrl || docsDriver.simPhotoUrl}
                      alt={`SIM A ${docsDriver.name}`}
                      className="w-full h-56 object-contain bg-white rounded-lg border border-slate-200"
                    />
                  ) : (
                    <div className="h-56 flex items-center justify-center bg-white rounded-lg border border-dashed border-slate-300 text-xs text-slate-400">
                      Foto SIM A belum diunggah
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setRejectReason('Foto KTP atau SIM A kurang jelas / tidak terbaca');
                    setRejectModalDriver(docsDriver);
                  }}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
                >
                  Tolak Pendaftaran
                </button>
                <button
                  type="button"
                  onClick={() => {
                    approveDriver(docsDriver.id);
                    setDocsDriver(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                >
                  Setujui Driver
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModalDriver && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmReject}
            className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl"
          >
            <h4 className="text-base font-bold text-slate-950">
              Tolak Pendaftaran — {rejectModalDriver.name}
            </h4>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Alasan Penolakan</label>
              <textarea
                rows={3}
                required
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-950 focus:outline-none focus:border-[#0F294A]"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectModalDriver(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
              >
                Konfirmasi Tolak
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Block Modal */}
      {blockModalDriver && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmBlock}
            className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl"
          >
            <h4 className="text-base font-bold text-slate-950">
              Blokir Driver — {blockModalDriver.name}
            </h4>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Alasan Pemblokiran</label>
              <textarea
                rows={3}
                required
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-950 focus:outline-none focus:border-[#0F294A]"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setBlockModalDriver(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer"
              >
                Blokir Driver
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Manual Saldo Modal */}
      {topUpDriverModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmTopUp}
            className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl"
          >
            <h4 className="text-base font-bold text-slate-950">
              Tambah Saldo Driver — {topUpDriverModal.name}
            </h4>
            <p className="text-xs text-slate-500">
              Saldo saat ini:{' '}
              <span className="font-mono font-bold text-slate-900">
                Rp {Number(topUpDriverModal.saldo ?? topUpDriverModal.balance ?? 0).toLocaleString('id-ID')}
              </span>
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nominal Top Up (Rp)</label>
              <input
                type="number"
                required
                min={1000}
                step={1000}
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono font-bold text-slate-950 focus:outline-none focus:border-[#0F294A]"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setTopUpDriverModal(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173B6B] text-white text-xs font-bold cursor-pointer"
              >
                Tambahkan Saldo
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Driver Confirmation Modal */}
      {driverToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h4 className="text-base font-bold text-slate-950">Hapus Driver Permanen?</h4>
            <p className="text-xs text-slate-600">
              Data driver <span className="font-bold text-slate-950">{driverToDelete.name}</span> ({driverToDelete.plateNumber}) akan dihapus dari Firebase collection <span className="font-mono">drivers</span>.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDriverToDelete(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteDriver(driverToDelete.id);
                  setDriverToDelete(null);
                }}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
              >
                Hapus Driver
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recovery Code Modal */}
      {recoveryModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-bold text-slate-950 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#0F294A]" />
                <span>Kode Pemulihan Akun Driver</span>
              </h4>
              <button
                type="button"
                onClick={() => setRecoveryModal(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Driver: <span className="font-bold text-slate-950">{recoveryModal.driver.name}</span> ({recoveryModal.driver.phone})
            </p>

            {recoveryModal.loading ? (
              <div className="py-6 text-center text-xs text-slate-500 font-semibold">
                Membuat kode pemulihan terenkripsi di server...
              </div>
            ) : recoveryModal.error ? (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold">
                {recoveryModal.error}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">
                    Kode Pemulihan 1x Pakai (Berlaku 24 Jam)
                  </span>
                  <div className="text-2xl font-mono font-black tracking-widest text-[#0F294A]">
                    {recoveryModal.code}
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Hanya hash terenkripsi yang disimpan di Firebase. Berikan kode ini ke driver untuk membuka menu <strong>Lupa Kata Sandi &rarr; Pakai Kode Pemulihan Admin</strong>.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (recoveryModal.code && navigator.clipboard) {
                        navigator.clipboard.writeText(recoveryModal.code);
                        setRecoveryModal((prev) => (prev ? { ...prev, copied: true } : prev));
                      }
                    }}
                    className="flex-1 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {recoveryModal.copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Kode</span>
                      </>
                    )}
                  </button>
                  {recoveryModal.driver.phone && (
                    <a
                      href={`https://wa.me/${recoveryModal.driver.phone
                        .replace(/\D/g, '')
                        .replace(/^0/, '62')}?text=${encodeURIComponent(
                        `Halo ${recoveryModal.driver.name}, berikut Kode Pemulihan akun Driver M3CAR Anda: ${recoveryModal.code} (berlaku 24 jam). Gunakan di menu Lupa Kata Sandi > Pakai Kode Pemulihan Admin.`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>Kirim WhatsApp</span>
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
