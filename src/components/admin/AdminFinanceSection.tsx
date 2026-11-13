import React, { useState, useMemo } from 'react';
import { useM3CarStore } from '../../store/m3carStore';
import { DriverTopUpRequest, KeuanganAdminItem, WalletTransaction } from '../../types';
import {
  Wallet,
  Banknote,
  ArrowLeftRight,
  Percent,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  Eye,
  X,
  Loader2,
  Printer,
  FileText,
  Table,
  Calendar,
  AlertTriangle,
  Sparkles,
  ShieldAlert,
  Download,
} from 'lucide-react';
import {
  ReportPeriod,
  ReportYearFilter,
  buildFinanceReportData,
  exportFinanceReportPdf,
  exportFinanceReportCsv,
  formatRupiahSigned,
  mergeCompletedTripFinancials,
  parseFlexibleDateMs,
} from '../../utils/financeReport';

export const AdminFinanceSection: React.FC = () => {
  const {
    orders,
    drivers,
    transactions,
    topUpRequests,
    keuanganAdmin,
    laporanKeuangan,
    lastCleanupSummary,
    settings,
    approveTopUpRequest,
    rejectTopUpRequest,
    deleteTopUpRequest,
    deleteTransaction,
    deleteKeuanganItem,
    addKeuanganTransaction,
    setOrderRetentionDays,
    runAutoCleanup,
    purgeAnnualFinancialData,
  } = useM3CarStore();

  const [subTab, setSubTab] = useState<'ringkasan' | 'topup' | 'riwayat'>('ringkasan');
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'TUNAI' | 'TRANSFER'>('ALL');
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('ALL');
  const [yearFilter, setYearFilter] = useState<ReportYearFilter>('ALL');
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Retention & Annual Purge state
  const [isCleaningNow, setIsCleaningNow] = useState(false);
  const [cleanupNotice, setCleanupNotice] = useState<string | null>(null);
  const [annualPurgeStep, setAnnualPurgeStep] = useState<0 | 1 | 2>(0);
  const [annualPurgeMode, setAnnualPurgeMode] = useState<'OLDER_THAN_1_YEAR' | 'PREVIOUS_YEARS'>(
    'OLDER_THAN_1_YEAR'
  );
  const [annualPurgeConfirmedCheck, setAnnualPurgeConfirmedCheck] = useState(false);
  const [isPurgingAnnual, setIsPurgingAnnual] = useState(false);

  // Modals
  const [receiptPreview, setReceiptPreview] = useState<DriverTopUpRequest | null>(null);
  const [rejectTopUpTarget, setRejectTopUpTarget] = useState<DriverTopUpRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('Bukti transfer tidak valid / dana belum masuk');
  const [isAddKasOpen, setIsAddKasOpen] = useState(false);
  const [kasForm, setKasForm] = useState<{ jenis: 'masuk' | 'keluar'; jumlah: number; keterangan: string }>({
    jenis: 'masuk',
    jumlah: 100000,
    keterangan: 'Pencatatan Kas M3CAR',
  });
  const [txToDelete, setTxToDelete] = useState<WalletTransaction | null>(null);
  const [keuanganToDelete, setKeuanganToDelete] = useState<KeuanganAdminItem | null>(null);
  const [processingTopUpId, setProcessingTopUpId] = useState<string | null>(null);
  const [topUpFeedback, setTopUpFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const activeDrivers = useMemo(() => drivers.filter((d) => !d.isDeleted), [drivers]);
  const allMergedTrips = useMemo(
    () => mergeCompletedTripFinancials(orders, laporanKeuangan),
    [orders, laporanKeuangan]
  );

  // Build available years dropdown options dynamically
  const currentYear = new Date().getFullYear();
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>([currentYear, currentYear - 1]);
    for (const trip of allMergedTrips) {
      if (trip.year > 2000) yearsSet.add(trip.year);
    }
    for (const r of topUpRequests) {
      const ms = parseFlexibleDateMs(r.createdAt, r.createdAtMs);
      if (ms > 0) yearsSet.add(new Date(ms).getFullYear());
    }
    for (const k of keuanganAdmin) {
      const ms = parseFlexibleDateMs(k.tanggal || k.createdAt, k.createdAtMs);
      if (ms > 0) yearsSet.add(new Date(ms).getFullYear());
    }
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [allMergedTrips, topUpRequests, keuanganAdmin, currentYear]);

  const matchesYear = (ms: number, explicitYear?: number) => {
    if (yearFilter === 'ALL') return true;
    if (typeof explicitYear === 'number' && explicitYear > 2000) {
      return explicitYear === yearFilter;
    }
    if (!ms) return false;
    return new Date(ms).getFullYear() === yearFilter;
  };

  const activeKeuangan = useMemo(
    () =>
      keuanganAdmin.filter((k) => {
        if (k.isDeleted) return false;
        const ms = parseFlexibleDateMs(k.tanggal || k.createdAt, k.createdAtMs);
        return matchesYear(ms);
      }),
    [keuanganAdmin, yearFilter]
  );
  const activeTopUps = useMemo(
    () =>
      topUpRequests.filter((r) => {
        if (r.isDeleted) return false;
        const ms = parseFlexibleDateMs(r.createdAt, r.createdAtMs);
        return matchesYear(ms);
      }),
    [topUpRequests, yearFilter]
  );
  const filteredTransactions = useMemo(
    () =>
      transactions.filter((tx) => {
        if (tx.isDeleted) return false;
        const ms = parseFlexibleDateMs(tx.date);
        return matchesYear(ms);
      }),
    [transactions, yearFilter]
  );

  // Real financial metrics from Firebase collections + preserved `laporan_keuangan` archive
  const completedOrPaidOrders = useMemo(
    () => allMergedTrips.filter((t) => matchesYear(t.sortTime, t.year)),
    [allMergedTrips, yearFilter]
  );

  const totalTransaksiNominal = useMemo(
    () => completedOrPaidOrders.reduce((sum, o) => sum + (Number(o.totalPrice) || 0), 0),
    [completedOrPaidOrders]
  );

  const pendapatanAplikasiKomisi = useMemo(
    () => completedOrPaidOrders.reduce((sum, o) => sum + (Number(o.commissionAmount) || 0), 0),
    [completedOrPaidOrders]
  );

  const totalSaldoDriver = useMemo(
    () => activeDrivers.reduce((sum, d) => sum + Number(d.saldo ?? d.balance ?? 0), 0),
    [activeDrivers]
  );

  const pembayaranTunai = useMemo(
    () =>
      completedOrPaidOrders
        .filter((o) => (o.paymentMethod || 'TUNAI') === 'TUNAI')
        .reduce((sum, o) => sum + (Number(o.totalPrice) || 0), 0),
    [completedOrPaidOrders]
  );

  const pembayaranTransfer = useMemo(() => {
    const orderTransfers = completedOrPaidOrders
      .filter((o) =>
        ['TRANSFER_DRIVER', 'QRIS_RTB', 'M3CAR_PAY'].includes(o.paymentMethod || '')
      )
      .reduce((sum, o) => sum + (Number(o.totalPrice) || 0), 0);
    const approvedTopUps = activeTopUps
      .filter((r) => r.status === 'BERHASIL')
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    return orderTransfers + approvedTopUps;
  }, [completedOrPaidOrders, activeTopUps]);

  const filteredOrderTransactions = useMemo(() => {
    return completedOrPaidOrders.filter((o) => {
      const m = o.paymentMethod || 'TUNAI';
      if (paymentFilter === 'TUNAI') return m === 'TUNAI';
      if (paymentFilter === 'TRANSFER') return m !== 'TUNAI';
      return true;
    });
  }, [completedOrPaidOrders, paymentFilter]);

  // Count records eligible for annual purge (> 1 year or previous years)
  const annualPurgePreview = useMemo(() => {
    const oneYearAgoMs = Date.now() - 365 * 24 * 60 * 60 * 1000;
    const isEligible = (ms: number, explicitYear?: number) => {
      const y =
        typeof explicitYear === 'number' && explicitYear > 2000
          ? explicitYear
          : ms > 0
          ? new Date(ms).getFullYear()
          : 0;
      if (annualPurgeMode === 'PREVIOUS_YEARS') {
        return y > 0 && y < currentYear;
      }
      return ms > 0 && ms < oneYearAgoMs;
    };

    const laporanCount = laporanKeuangan.filter((lk) => {
      const ms = parseFlexibleDateMs(lk.createdAt || lk.createdAtIso || lk.date, lk.createdAtMs);
      return isEligible(ms, lk.year);
    }).length;

    const topUpCount = topUpRequests.filter((r) => {
      const ms = parseFlexibleDateMs(r.createdAt, r.createdAtMs);
      return isEligible(ms);
    }).length;

    const kasCount = keuanganAdmin.filter((k) => {
      const ms = parseFlexibleDateMs(k.tanggal || k.createdAt, k.createdAtMs);
      return isEligible(ms);
    }).length;

    const saldoCount = transactions.filter((t) => {
      const ms = parseFlexibleDateMs(t.date);
      return isEligible(ms);
    }).length;

    return {
      laporanCount,
      topUpCount,
      kasCount,
      saldoCount,
      total: laporanCount + topUpCount + kasCount + saldoCount,
    };
  }, [laporanKeuangan, topUpRequests, keuanganAdmin, transactions, annualPurgeMode, currentYear]);



  const handleApproveTopUp = async (reqId: string) => {
    if (processingTopUpId) return;
    setProcessingTopUpId(reqId);
    setTopUpFeedback(null);
    try {
      const res = await approveTopUpRequest(reqId);
      setTopUpFeedback({
        ok: res.success,
        text:
          res.message ||
          (res.success
            ? 'Top-up disetujui dan saldo driver otomatis bertambah.'
            : 'Gagal menyetujui permintaan top-up.'),
      });
    } finally {
      setProcessingTopUpId(null);
    }
  };

  const handleConfirmRejectTopUp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTopUpTarget) return;
    rejectTopUpRequest(rejectTopUpTarget.id, rejectReason.trim() || 'Bukti transfer ditolak');
    setTopUpFeedback({
      ok: true,
      text: `Pengajuan top-up ${rejectTopUpTarget.driverName} ditolak.`,
    });
    setRejectTopUpTarget(null);
  };

  const handleAddKas = (e: React.FormEvent) => {
    e.preventDefault();
    if (kasForm.jumlah <= 0) return;
    addKeuanganTransaction({
      jenis: kasForm.jenis,
      jumlah_rp: Number(kasForm.jumlah),
      keterangan: kasForm.keterangan.trim() || 'Transaksi Manual Admin',
    });
    setIsAddKasOpen(false);
    setKasForm({ jenis: 'masuk', jumlah: 100000, keterangan: 'Pencatatan Kas M3CAR' });
  };

  const reportData = useMemo(
    () =>
      buildFinanceReportData({
        orders,
        laporanKeuangan,
        topUpRequests,
        keuanganAdmin,
        drivers,
        period: reportPeriod,
        yearFilter,
      }),
    [orders, laporanKeuangan, topUpRequests, keuanganAdmin, drivers, reportPeriod, yearFilter]
  );

  const handleManualCleanupNow = async () => {
    if (isCleaningNow) return;
    setIsCleaningNow(true);
    setCleanupNotice(null);
    try {
      const res = await runAutoCleanup(true);
      if (res) {
        setCleanupNotice(
          `Pembersihan otomatis (${res.retentionDays} hari) selesai: ${res.deletedOrders} pesanan lama & ${res.deletedLogs} log WA dihapus (${res.archivedOrders} pendapatan order diarsipkan aman ke laporan_keuangan).`
        );
      } else {
        setCleanupNotice('Pembersihan selesai dijalankan.');
      }
    } finally {
      setIsCleaningNow(false);
    }
  };

  const handleOpenAnnualPurgeModal = () => {
    setAnnualPurgeConfirmedCheck(false);
    setAnnualPurgeStep(1);
  };

  const handleExecuteAnnualPurge = async () => {
    if (isPurgingAnnual) return;
    setIsPurgingAnnual(true);
    try {
      const res = await purgeAnnualFinancialData(annualPurgeMode);
      setCleanupNotice(
        `Tutup buku selesai: ${res.totalDeleted} data keuangan lama dihapus permanen (${res.deletedLaporan} arsip order, ${res.deletedTopUps} top-up, ${res.deletedKeuangan} buku kas, ${res.deletedSaldoHistory} mutasi saldo).`
      );
      setAnnualPurgeStep(0);
      setAnnualPurgeConfirmedCheck(false);
    } finally {
      setIsPurgingAnnual(false);
    }
  };

  const handlePrintReport = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    setIsExportingPdf(true);
    try {
      exportFinanceReportPdf(reportData);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleDownloadCsv = () => {
    exportFinanceReportCsv(reportData);
  };

  const retentionDays = settings.orderRetentionDays === 30 ? 30 : 7;

  return (
    <div className="space-y-6">
      {/* Interactive Screen Dashboard (Hidden automatically when printing) */}
      <div className="space-y-6 print:hidden">
        {/* Top Official Financial Report Export & Print Action Bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm sm:text-base font-extrabold text-slate-950">
              Rekap Laporan Keuangan M3CAR
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span>{reportData.periodeLabel}</span>
              <span aria-hidden="true">&middot;</span>
              <span className="font-mono font-semibold tabular-nums text-slate-800">
                {reportData.totalTransaksiCount.toLocaleString('id-ID')} Transaksi Siap Rekap
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex items-center">
              <Calendar className="w-3.5 h-3.5 text-slate-500 absolute left-3 pointer-events-none" />
              <select
                aria-label="Filter Tahun Laporan"
                value={String(yearFilter)}
                onChange={(e) => {
                  const val = e.target.value;
                  setYearFilter(val === 'ALL' ? 'ALL' : Number(val));
                }}
                className="min-h-[40px] pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-[#0F294A] cursor-pointer"
              >
                <option value="ALL">Semua Tahun</option>
                {availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    Tahun {yr}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative flex items-center">
              <Calendar className="w-3.5 h-3.5 text-slate-500 absolute left-3 pointer-events-none" />
              <select
                aria-label="Filter Periode Laporan"
                value={reportPeriod}
                onChange={(e) => setReportPeriod(e.target.value as ReportPeriod)}
                className="min-h-[40px] pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-[#0F294A] cursor-pointer"
              >
                <option value="ALL">Semua Periode</option>
                <option value="TODAY">Hari Ini</option>
                <option value="WEEK">7 Hari Terakhir</option>
                <option value="MONTH">Bulan Ini</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handlePrintReport}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173B6B] text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span>Cetak Laporan (Print)</span>
            </button>

            <button
              type="button"
              disabled={isExportingPdf}
              onClick={handleDownloadPdf}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              {isExportingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              ) : (
                <FileText className="w-4 h-4 shrink-0" />
              )}
              <span>Unduh PDF</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadCsv}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              <Table className="w-4 h-4 shrink-0" />
              <span>Unduh CSV</span>
            </button>
          </div>
        </div>

        {/* Auto-Cleanup Policy & Annual Financial Data Purge Control Bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm space-y-3">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#0F294A] shrink-0" />
                <h4 className="text-xs sm:text-sm font-extrabold text-slate-950">
                  Pembersihan Riwayat Otomatis &amp; Tutup Buku Tahunan
                </h4>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Pesanan berstatus <strong>Selesai / Dibatalkan</strong> dan log WA otomatis dibersihkan setiap{' '}
                <strong>{retentionDays} hari</strong> (pendapatan tetap diarsipkan ke{' '}
                <span className="font-mono">laporan_keuangan</span>). Data keuangan &amp; top-up disimpan utuh{' '}
                <strong>1 tahun (365 hari)</strong>.
              </p>
              {(lastCleanupSummary || settings.lastAutoCleanupAt) && (
                <div className="text-[11px] text-emerald-700 font-semibold">
                  Pembersihan terakhir:{' '}
                  {new Date(
                    lastCleanupSummary?.ranAt || settings.lastAutoCleanupAt || ''
                  ).toLocaleString('id-ID')}
                  {lastCleanupSummary
                    ? ` (${lastCleanupSummary.deletedOrders} pesanan, ${lastCleanupSummary.deletedLogs} log WA dibersihkan)`
                    : ''}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-lg border border-slate-300 bg-slate-50 p-0.5">
                <button
                  type="button"
                  onClick={() => setOrderRetentionDays(7)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer transition-colors ${
                    retentionDays === 7
                      ? 'bg-[#0F294A] text-white'
                      : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  7 Hari
                </button>
                <button
                  type="button"
                  onClick={() => setOrderRetentionDays(30)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer transition-colors ${
                    retentionDays === 30
                      ? 'bg-[#0F294A] text-white'
                      : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  30 Hari
                </button>
              </div>

              <button
                type="button"
                disabled={isCleaningNow}
                onClick={handleManualCleanupNow}
                className="min-h-[38px] px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-800 border border-slate-300 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                {isCleaningNow ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-[#0F294A]" />
                )}
                <span>Bersihkan Riwayat ({retentionDays} Hari)</span>
              </button>

              <button
                type="button"
                onClick={handleOpenAnnualPurgeModal}
                className="min-h-[38px] px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span>Hapus Data Keuangan (&gt; 1 Tahun / Tutup Buku Tahunan)</span>
              </button>
            </div>
          </div>

          {cleanupNotice && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between gap-2">
              <span>{cleanupNotice}</span>
              <button
                type="button"
                onClick={() => setCleanupNotice(null)}
                className="text-emerald-700 hover:text-emerald-950 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* 5 Real Financial KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Total Transaksi</span>
            <Wallet className="w-4 h-4 text-[#0F294A]" />
          </div>
          <div className="text-xl font-extrabold text-slate-950 font-mono tabular-nums mt-2">
            Rp {totalTransaksiNominal.toLocaleString('id-ID')}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {completedOrPaidOrders.length} pesanan selesai / lunas
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Pendapatan Aplikasi</span>
            <Percent className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-extrabold text-emerald-700 font-mono tabular-nums mt-2">
            Rp {pendapatanAplikasiKomisi.toLocaleString('id-ID')}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Akumulasi komisi aplikasi</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Total Saldo Driver</span>
            <Wallet className="w-4 h-4 text-[#0F294A]" />
          </div>
          <div className="text-xl font-extrabold text-[#0F294A] font-mono tabular-nums mt-2">
            Rp {totalSaldoDriver.toLocaleString('id-ID')}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">{activeDrivers.length} akun driver</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Pembayaran Tunai</span>
            <Banknote className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl font-extrabold text-slate-950 font-mono tabular-nums mt-2">
            Rp {pembayaranTunai.toLocaleString('id-ID')}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Transaksi tunai order</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Pembayaran Transfer</span>
            <ArrowLeftRight className="w-4 h-4 text-blue-700" />
          </div>
          <div className="text-xl font-extrabold text-slate-950 font-mono tabular-nums mt-2">
            Rp {pembayaranTransfer.toLocaleString('id-ID')}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Transfer order &amp; top-up</div>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="bg-white border border-slate-200 rounded-xl p-2 flex items-center justify-between flex-wrap gap-2 shadow-sm">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setSubTab('ringkasan')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap ${
              subTab === 'ringkasan'
                ? 'bg-[#0F294A] text-white'
                : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100'
            }`}
          >
            Ringkasan Transaksi &amp; Saldo Driver
          </button>
          <button
            type="button"
            onClick={() => setSubTab('topup')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap ${
              subTab === 'topup'
                ? 'bg-[#0F294A] text-white'
                : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100'
            }`}
          >
            Permintaan Top Up ({activeTopUps.filter((r) => r.status === 'MENUNGGU').length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('riwayat')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap ${
              subTab === 'riwayat'
                ? 'bg-[#0F294A] text-white'
                : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100'
            }`}
          >
            Riwayat Mutasi &amp; Buku Kas
          </button>
        </div>

        <button
          type="button"
          onClick={() => setIsAddKasOpen(true)}
          className="px-3.5 py-2 rounded-lg bg-[#070B14] hover:bg-[#0F294A] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Catat Transaksi Kas</span>
        </button>
      </div>

      {/* Sub-Tab 1: Ringkasan Order Transaksi + Saldo Driver */}
      {subTab === 'ringkasan' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Order Transactions & Payment Filter */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-slate-950">Transaksi Pesanan &amp; Komisi</h4>
              <div className="flex items-center gap-1 text-[11px] font-bold">
                {(['ALL', 'TUNAI', 'TRANSFER'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setPaymentFilter(k)}
                    className={`px-2.5 py-1 rounded-md cursor-pointer ${
                      paymentFilter === k
                        ? 'bg-[#0F294A] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {k === 'ALL' ? 'Semua' : k === 'TUNAI' ? 'Tunai' : 'Transfer / QRIS'}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[11px] font-bold">
                    <th className="py-3 px-4">Order</th>
                    <th className="py-3 px-4">Penumpang &amp; Driver</th>
                    <th className="py-3 px-4">Metode</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-4 text-right">Komisi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrderTransactions.map((o) => {
                    const price = Number(o.totalPrice || 0);
                    const comm = Number(o.commissionAmount || 0);
                    return (
                      <tr key={o.key} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-mono font-bold text-slate-900 flex items-center gap-1.5">
                            <span>{o.orderNumber}</span>
                            {o.isArchivedOnly && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-sans font-semibold">
                                Arsip
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">{o.date}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{o.customerName}</div>
                          <div className="text-[11px] text-slate-500">Driver: {o.driverName || '-'}</div>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] font-bold text-slate-700">
                          {o.paymentMethod || 'TUNAI'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-950 tabular-nums">
                          Rp {price.toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700 tabular-nums">
                          Rp {comm.toLocaleString('id-ID')}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredOrderTransactions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-slate-500">
                        Belum ada transaksi pesanan selesai atau lunas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Driver Balance Breakdown */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <h4 className="text-sm font-bold text-slate-950">Saldo per Driver</h4>
            </div>
            <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
              {activeDrivers.map((d) => (
                <div key={d.id} className="px-4 py-3 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 truncate">{d.name}</div>
                    <div className="font-mono text-[11px] text-slate-500">{d.plateNumber}</div>
                  </div>
                  <div className="font-mono font-bold text-[#0F294A] tabular-nums shrink-0">
                    Rp {Number(d.saldo ?? d.balance ?? 0).toLocaleString('id-ID')}
                  </div>
                </div>
              ))}
              {activeDrivers.length === 0 && (
                <div className="text-center py-8 text-xs text-slate-500">Belum ada data driver.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab 2: Top Up Requests */}
      {subTab === 'topup' && (
        <div className="space-y-3">
          {topUpFeedback && (
            <div
              className={`p-3.5 rounded-xl text-xs font-bold flex items-center justify-between gap-2 border ${
                topUpFeedback.ok
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              <span>{topUpFeedback.text}</span>
              <button
                type="button"
                onClick={() => setTopUpFeedback(null)}
                className="text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[11px] font-bold">
                    <th className="py-3.5 px-4">Waktu</th>
                    <th className="py-3.5 px-4">Driver</th>
                    <th className="py-3.5 px-4">Tujuan Transfer</th>
                    <th className="py-3.5 px-4 text-right">Nominal</th>
                    <th className="py-3.5 px-4">Bukti Transfer</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeTopUps.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50/70">
                      <td className="py-3.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                        {req.createdAt}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-950">{req.driverName}</div>
                        <div className="font-mono text-[11px] text-slate-500">{req.driverPlate}</div>
                        {req.note && (
                          <div className="text-[11px] text-slate-600 mt-0.5 italic">{req.note}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-700">
                        <div className="font-semibold text-slate-900">{req.bankName || 'SeaBank'}</div>
                        <div className="font-mono text-[11px] text-slate-500">
                          {req.accountNumber || '901102051050'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-950 tabular-nums whitespace-nowrap">
                        Rp {Number(req.amount || 0).toLocaleString('id-ID')}
                      </td>
                      <td className="py-3.5 px-4">
                        {req.receiptPhotoUrl ? (
                          <button
                            type="button"
                            onClick={() => setReceiptPreview(req)}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-[#0F294A]" />
                            <span>Lihat Bukti</span>
                          </button>
                        ) : (
                          <span className="text-slate-400">Tanpa Bukti</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-bold whitespace-nowrap ${
                            req.status === 'BERHASIL'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : req.status === 'MENUNGGU'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-red-50 text-red-700 border border-red-200'
                          }`}
                        >
                          {req.status === 'BERHASIL'
                            ? 'Disetujui'
                            : req.status === 'MENUNGGU'
                            ? 'Menunggu Konfirmasi'
                            : 'Ditolak'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {req.status === 'MENUNGGU' && (
                            <>
                              <button
                                type="button"
                                disabled={processingTopUpId === req.id}
                                onClick={() => handleApproveTopUp(req.id)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                              >
                                {processingTopUpId === req.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                )}
                                <span>Setujui / Konfirmasi</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectReason('Bukti transfer tidak valid / dana belum masuk');
                                  setRejectTopUpTarget(req);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Tolak</span>
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => deleteTopUpRequest(req.id)}
                            className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 cursor-pointer"
                            title="Hapus"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {activeTopUps.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-500">
                        Belum ada permintaan top-up saldo driver.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab 3: Riwayat Mutasi Saldo & Buku Kas */}
      {subTab === 'riwayat' && (
        <div className="space-y-6">
          {/* Buku Kas Admin */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <h4 className="text-sm font-bold text-slate-950">Buku Kas Keuangan (keuangan_admin)</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[11px] font-bold">
                    <th className="py-3 px-4">ID Transaksi</th>
                    <th className="py-3 px-4">Tanggal</th>
                    <th className="py-3 px-4">Jenis</th>
                    <th className="py-3 px-4">Keterangan</th>
                    <th className="py-3 px-4 text-right">Jumlah (Rp)</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeKeuangan.map((k) => (
                    <tr key={k.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">{k.id_transaksi || k.id}</td>
                      <td className="py-3 px-4 text-slate-600">{k.tanggal}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            k.jenis === 'masuk'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-red-50 text-red-700 border border-red-200'
                          }`}
                        >
                          {k.jenis}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-800">{k.keterangan}</td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold tabular-nums ${
                          k.jenis === 'masuk' ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {k.jenis === 'masuk' ? '+' : '-'} Rp {Number(k.jumlah_rp || 0).toLocaleString('id-ID')}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setKeuanganToDelete(k)}
                          className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {activeKeuangan.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-500">
                        Belum ada catatan buku kas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mutasi Saldo Driver */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <h4 className="text-sm font-bold text-slate-950">Riwayat Mutasi Saldo Driver (saldo_history)</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[11px] font-bold">
                    <th className="py-3 px-4">Waktu</th>
                    <th className="py-3 px-4">Driver</th>
                    <th className="py-3 px-4">Jenis</th>
                    <th className="py-3 px-4">Keterangan</th>
                    <th className="py-3 px-4 text-right">Nominal</th>
                    <th className="py-3 px-4 text-right">Saldo Akhir</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTransactions.map((tx) => {
                    const drv = drivers.find((d) => d.id === tx.driverId);
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-mono text-slate-600">{tx.date}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{drv?.name || tx.driverId}</td>
                        <td className="py-3 px-4 font-mono text-[11px]">{tx.type}</td>
                        <td className="py-3 px-4 text-slate-700">{tx.description}</td>
                        <td
                          className={`py-3 px-4 text-right font-mono font-bold tabular-nums ${
                            tx.amount >= 0 ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {tx.amount >= 0 ? '+' : ''}Rp {tx.amount.toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                          Rp {Number(tx.balanceAfter || 0).toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => setTxToDelete(tx)}
                            className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredTransactions.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-500">
                        Belum ada mutasi saldo driver.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Preview Modal */}
      {receiptPreview && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="bg-[#0B162C] text-white px-5 py-4 flex items-center justify-between">
              <h4 className="font-bold text-sm">Bukti Transfer — {receiptPreview.driverName}</h4>
              <button
                type="button"
                onClick={() => setReceiptPreview(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {receiptPreview.receiptPhotoUrl && (
                <img
                  src={receiptPreview.receiptPhotoUrl}
                  alt="Bukti Transfer"
                  className="w-full max-h-96 object-contain rounded-lg border border-slate-200 bg-slate-50"
                />
              )}
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Nominal Permintaan:</span>
                <span className="font-mono font-extrabold text-slate-950">
                  Rp {Number(receiptPreview.amount || 0).toLocaleString('id-ID')}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Top Up Modal */}
      {rejectTopUpTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmRejectTopUp}
            className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl"
          >
            <h4 className="text-base font-bold text-slate-950">Tolak Permintaan Top Up</h4>
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
                onClick={() => setRejectTopUpTarget(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
              >
                Tolak Top Up
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Manual Kas Modal */}
      {isAddKasOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleAddKas}
            className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl"
          >
            <h4 className="text-base font-bold text-slate-950">Catat Transaksi Kas Manual</h4>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Jenis Transaksi</label>
              <select
                value={kasForm.jenis}
                onChange={(e) => setKasForm({ ...kasForm, jenis: e.target.value as 'masuk' | 'keluar' })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-950"
              >
                <option value="masuk">Kas Masuk</option>
                <option value="keluar">Kas Keluar</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Jumlah (Rp)</label>
              <input
                type="number"
                required
                min={1000}
                value={kasForm.jumlah}
                onChange={(e) => setKasForm({ ...kasForm, jumlah: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono font-bold text-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Keterangan</label>
              <input
                type="text"
                required
                value={kasForm.keterangan}
                onChange={(e) => setKasForm({ ...kasForm, keterangan: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-950"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddKasOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173B6B] text-white text-xs font-bold cursor-pointer"
              >
                Simpan Transaksi
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Kas / Transaction Confirmation Modals */}
      {keuanganToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h4 className="text-base font-bold text-slate-950">Hapus Catatan Kas?</h4>
            <p className="text-xs text-slate-600">{keuanganToDelete.keterangan}</p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setKeuanganToDelete(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteKeuanganItem(keuanganToDelete.id);
                  setKeuanganToDelete(null);
                }}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-bold cursor-pointer"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {txToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h4 className="text-base font-bold text-slate-950">Hapus Mutasi Saldo?</h4>
            <p className="text-xs text-slate-600">{txToDelete.description}</p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setTxToDelete(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteTransaction(txToDelete.id);
                  setTxToDelete(null);
                }}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-bold cursor-pointer"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Double-Confirmation Modal: Tutup Buku Tahunan / Hapus Data Keuangan (> 1 Tahun) */}
      {annualPurgeStep > 0 && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="bg-red-700 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 shrink-0" />
                <h4 className="font-bold text-sm">
                  {annualPurgeStep === 1
                    ? 'Tutup Buku Tahunan — Cadangkan Laporan Sebelum Hapus'
                    : 'Konfirmasi Ganda Penghapusan Data Keuangan'}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setAnnualPurgeStep(0)}
                className="p-1 rounded-lg hover:bg-red-800 text-white/90 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {annualPurgeStep === 1 && (
              <div className="p-5 space-y-4 text-xs text-slate-700">
                <div className="space-y-2">
                  <label className="block font-bold text-slate-900">
                    Pilih Rentang Data Keuangan yang Akan Dihapus:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAnnualPurgeMode('OLDER_THAN_1_YEAR')}
                      className={`p-3 rounded-xl border text-left cursor-pointer ${
                        annualPurgeMode === 'OLDER_THAN_1_YEAR'
                          ? 'border-red-600 bg-red-50 text-red-900 font-bold'
                          : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div>Lebih dari 1 Tahun</div>
                      <div className="text-[11px] font-normal text-slate-500 mt-0.5">
                        Usia data &gt; 365 hari dari hari ini
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnnualPurgeMode('PREVIOUS_YEARS')}
                      className={`p-3 rounded-xl border text-left cursor-pointer ${
                        annualPurgeMode === 'PREVIOUS_YEARS'
                          ? 'border-red-600 bg-red-50 text-red-900 font-bold'
                          : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div>Semua Data Tahun Lalu</div>
                      <div className="text-[11px] font-normal text-slate-500 mt-0.5">
                        Seluruh transaksi sebelum tahun {currentYear}
                      </div>
                    </button>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5">
                  <div className="font-bold text-slate-900">
                    Ringkasan Data yang Akan Dihapus ({annualPurgePreview.total} dokumen):
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    <div>Arsip Perjalanan (laporan_keuangan): <strong>{annualPurgePreview.laporanCount}</strong></div>
                    <div>Pengajuan Top-Up (topup_requests): <strong>{annualPurgePreview.topUpCount}</strong></div>
                    <div>Buku Kas (keuangan_admin): <strong>{annualPurgePreview.kasCount}</strong></div>
                    <div>Mutasi Saldo (saldo_history): <strong>{annualPurgePreview.saldoCount}</strong></div>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-start gap-2 text-amber-900 font-bold">
                    <Download className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Wajib/Disarankan Unduh Cadangan Laporan Terlebih Dahulu:</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadPdf}
                      className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Unduh Laporan PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadCsv}
                      className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Table className="w-3.5 h-3.5" />
                      <span>Unduh Laporan CSV</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setAnnualPurgeStep(0)}
                    className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={annualPurgePreview.total === 0}
                    onClick={() => {
                      setAnnualPurgeConfirmedCheck(false);
                      setAnnualPurgeStep(2);
                    }}
                    className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                  >
                    Lanjutkan ke Konfirmasi Akhir
                  </button>
                </div>
              </div>
            )}

            {annualPurgeStep === 2 && (
              <div className="p-5 space-y-4 text-xs text-slate-700">
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="text-sm font-extrabold text-red-900">
                      Apakah Anda yakin ingin menghapus data keuangan tahun lalu?
                    </div>
                    <p className="text-xs text-red-800 leading-relaxed">
                      Sebanyak <strong>{annualPurgePreview.total}</strong> dokumen keuangan akan dihapus secara permanen dari Firebase Cloud Firestore dan tidak dapat dipulihkan kembali.
                    </p>
                  </div>
                </div>

                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={annualPurgeConfirmedCheck}
                    onChange={(e) => setAnnualPurgeConfirmedCheck(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-red-600 cursor-pointer"
                  />
                  <span className="font-semibold text-slate-900">
                    Ya, saya sudah mengunduh salinan laporan PDF/CSV dan yakin ingin menghapus data keuangan lama tersebut.
                  </span>
                </label>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setAnnualPurgeStep(1)}
                    className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    Kembali
                  </button>
                  <button
                    type="button"
                    disabled={!annualPurgeConfirmedCheck || isPurgingAnnual}
                    onClick={handleExecuteAnnualPurge}
                    className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    {isPurgingAnnual && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Ya, Hapus Permanen Sekarang</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </div>

      {/* Dedicated Printable Report Sheet (@media print) */}
      <section
        aria-label="Lembar Cetak Laporan Keuangan Resmi"
        className="hidden print:block bg-white text-slate-950 space-y-5"
      >
        {/* Kop Laporan */}
        <header className="border-b-2 border-[#0F294A] pb-4 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-lg font-extrabold tracking-tight text-[#0F294A] uppercase">
              {reportData.kopTitle}
            </h1>
            <p className="text-xs text-slate-600">{reportData.kopSubtitle}</p>
          </div>
          <div className="text-right text-xs text-slate-700 space-y-0.5 shrink-0">
            <div>
              <span className="font-semibold text-slate-500">Tanggal Cetak: </span>
              <span className="font-bold text-slate-900">{reportData.printedAtLabel}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-500">Periode Laporan: </span>
              <span className="font-bold text-slate-900">{reportData.periodeLabel}</span>
            </div>
          </div>
        </header>

        {/* Ringkasan Total (3 Kotak Sejajar) */}
        <div className="grid grid-cols-3 gap-3 print-avoid-break">
          <div className="border border-slate-300 rounded-lg p-3 bg-slate-50">
            <div className="text-[10px] font-bold uppercase text-slate-600">
              Total Pendapatan Perjalanan
            </div>
            <div className="text-base font-extrabold text-[#0F294A] font-mono tabular-nums mt-1">
              {formatRupiahSigned(reportData.totalPendapatanPerjalanan)}
            </div>
            <div className="text-[11px] text-slate-600 mt-0.5">
              {reportData.jumlahOrderPerjalanan} Pesanan Selesai / Lunas
            </div>
          </div>

          <div className="border border-slate-300 rounded-lg p-3 bg-slate-50">
            <div className="text-[10px] font-bold uppercase text-slate-600">
              Total Isi Saldo (Top-Up) Driver
            </div>
            <div className="text-base font-extrabold text-emerald-700 font-mono tabular-nums mt-1">
              {formatRupiahSigned(reportData.totalTopUpDriver)}
            </div>
            <div className="text-[11px] text-slate-600 mt-0.5">
              {reportData.jumlahTopUpDisetujui} Pengajuan Top-Up Disetujui
            </div>
          </div>

          <div className="border border-slate-300 rounded-lg p-3 bg-slate-50">
            <div className="text-[10px] font-bold uppercase text-slate-600">
              Total Transaksi
            </div>
            <div className="text-base font-extrabold text-red-700 font-mono tabular-nums mt-1">
              {reportData.totalTransaksiCount.toLocaleString('id-ID')} Transaksi
            </div>
            <div className="text-[11px] text-slate-600 mt-0.5 tabular-nums">
              Akumulasi Nilai: {formatRupiahSigned(reportData.totalNilaiGabungan)}
            </div>
          </div>
        </div>

        {/* Tabel Rekap Otomatis */}
        <table className="w-full border-collapse text-left text-[11px]">
          <thead>
            <tr className="bg-[#0F294A] text-white">
              <th className="border border-slate-300 py-2 px-2 text-center w-9">No</th>
              <th className="border border-slate-300 py-2 px-2.5 w-28">Tanggal</th>
              <th className="border border-slate-300 py-2 px-2.5 w-36">Jenis Transaksi</th>
              <th className="border border-slate-300 py-2 px-2.5 w-44">Nama Driver/Pelanggan</th>
              <th className="border border-slate-300 py-2 px-2.5">Rute/Keterangan</th>
              <th className="border border-slate-300 py-2 px-2.5 text-right w-28">Nominal Rp</th>
              <th className="border border-slate-300 py-2 px-2.5 text-center w-28">Status</th>
            </tr>
          </thead>
          <tbody>
            {reportData.rows.map((row) => (
              <tr key={`${row.no}-${row.jenisTransaksi}-${row.tanggal}`} className="even:bg-slate-50">
                <td className="border border-slate-300 py-1.5 px-2 text-center font-mono tabular-nums">
                  {row.no}
                </td>
                <td className="border border-slate-300 py-1.5 px-2.5 font-mono">
                  {row.tanggal}
                </td>
                <td className="border border-slate-300 py-1.5 px-2.5 font-semibold">
                  {row.jenisTransaksi}
                </td>
                <td className="border border-slate-300 py-1.5 px-2.5">{row.namaPihak}</td>
                <td className="border border-slate-300 py-1.5 px-2.5">{row.ruteKeterangan}</td>
                <td className="border border-slate-300 py-1.5 px-2.5 text-right font-mono font-bold tabular-nums whitespace-nowrap">
                  {formatRupiahSigned(row.nominalRp)}
                </td>
                <td className="border border-slate-300 py-1.5 px-2.5 text-center font-semibold">
                  {row.status}
                </td>
              </tr>
            ))}
            {reportData.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="border border-slate-300 py-6 text-center text-slate-500">
                  Belum ada data transaksi pada periode ini.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 font-bold text-slate-950">
              <td colSpan={3} className="border border-slate-300 py-2 px-2.5">
                REKAP KESELURUHAN
              </td>
              <td className="border border-slate-300 py-2 px-2.5 tabular-nums">
                {reportData.totalTransaksiCount.toLocaleString('id-ID')} Transaksi
              </td>
              <td className="border border-slate-300 py-2 px-2.5">
                Komisi Aplikasi: {formatRupiahSigned(reportData.totalKomisiAplikasi)}
              </td>
              <td className="border border-slate-300 py-2 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                {formatRupiahSigned(reportData.totalNilaiGabungan)}
              </td>
              <td className="border border-slate-300 py-2 px-2.5 text-center">Terverifikasi</td>
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
};
