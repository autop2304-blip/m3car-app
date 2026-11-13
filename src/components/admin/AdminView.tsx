import React, { useState, useMemo, useEffect } from 'react';
import { useM3CarStore, startFirestoreRealtimeSync } from '../../store/m3carStore';
import { AdminHeader } from './AdminHeader';
import { AdminRoutesSection } from './AdminRoutesSection';
import { AdminPricingSection } from './AdminPricingSection';
import { AdminDriversSection } from './AdminDriversSection';
import { AdminPassengersSection } from './AdminPassengersSection';
import { AdminOrdersSection } from './AdminOrdersSection';
import { AdminFinanceSection } from './AdminFinanceSection';
import { mergeCompletedTripFinancials } from '../../utils/financeReport';
import {
  LayoutDashboard,
  MapPin,
  Tags,
  Car,
  Users,
  ClipboardList,
  Wallet,
  LogOut,
  Shield,
  ArrowUpRight,
  X,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
} from 'lucide-react';

type AdminMenuKey =
  | 'dashboard'
  | 'routes'
  | 'pricing'
  | 'drivers'
  | 'passengers'
  | 'orders'
  | 'finance';

interface AdminViewProps {
  onOpenWhatsAppInbox?: () => void;
  onLogout?: () => void;
}

const MENU_ITEMS: { key: AdminMenuKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'routes', label: 'Rute Perjalanan', icon: MapPin },
  { key: 'pricing', label: 'Pengaturan Harga', icon: Tags },
  { key: 'drivers', label: 'Driver', icon: Car },
  { key: 'passengers', label: 'Penumpang', icon: Users },
  { key: 'orders', label: 'Pesanan', icon: ClipboardList },
  { key: 'finance', label: 'Keuangan', icon: Wallet },
];

export const AdminView: React.FC<AdminViewProps> = ({ onOpenWhatsAppInbox, onLogout }) => {
  const {
    drivers,
    customers,
    orders,
    topUpRequests,
    laporanKeuangan,
    firestoreError,
    logoutAdminWithServer,
    approveTopUpRequest,
    runAutoCleanup,
  } = useM3CarStore();

  const [activeMenu, setActiveMenu] = useState<AdminMenuKey>('dashboard');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [processingTopUpId, setProcessingTopUpId] = useState<string | null>(null);
  const [topUpAlert, setTopUpAlert] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    startFirestoreRealtimeSync();
    void runAutoCleanup(false);
  }, []);

  const handleLogout = async () => {
    await logoutAdminWithServer();
    if (onLogout) onLogout();
  };

  // Real metrics computed strictly from Firebase state (+ preserved `laporan_keuangan` archive)
  const activeDrivers = useMemo(() => drivers.filter((d) => !d.isDeleted), [drivers]);
  const activeCustomers = useMemo(() => customers.filter((c) => !c.isDeleted), [customers]);
  const activeOrders = useMemo(() => orders.filter((o) => !o.isDeleted).slice(0, 30), [orders]);
  const mergedTrips = useMemo(
    () => mergeCompletedTripFinancials(activeOrders, laporanKeuangan),
    [activeOrders, laporanKeuangan]
  );

  const metrics = useMemo(() => {
    const totalDriver = activeDrivers.length;
    const totalPenumpang = activeCustomers.length;
    const totalPesanan = activeOrders.length;
    const pesananBaru = activeOrders.filter((o) => o.status === 'MENCARI_DRIVER').length;
    const pesananDiproses = activeOrders.filter((o) =>
      ['DRIVER_DITEMUKAN', 'DRIVER_OTW', 'SUDAH_JEMPUT', 'SUDAH_SAMPAI'].includes(o.status)
    ).length;
    const pesananSelesai = activeOrders.filter((o) => o.status === 'SELESAI').length;
    const pesananDibatalkan = activeOrders.filter((o) => o.status === 'DIBATALKAN').length;
    const totalPendapatan = mergedTrips.reduce((acc, t) => acc + (Number(t.totalPrice) || 0), 0);

    return {
      totalDriver,
      totalPenumpang,
      totalPesanan,
      pesananBaru,
      pesananDiproses,
      pesananSelesai,
      pesananDibatalkan,
      totalPendapatan,
    };
  }, [activeDrivers, activeCustomers, activeOrders, mergedTrips]);

  const pendingDriversCount = useMemo(
    () => activeDrivers.filter((d) => d.status === 'MENUNGGU').length,
    [activeDrivers]
  );
  const pendingTopUps = useMemo(
    () => topUpRequests.filter((r) => !r.isDeleted && r.status === 'MENUNGGU'),
    [topUpRequests]
  );
  const pendingTopUpCount = pendingTopUps.length;

  const handleQuickApproveTopUp = async (reqId: string) => {
    if (processingTopUpId) return;
    setProcessingTopUpId(reqId);
    setTopUpAlert(null);
    try {
      const res = await approveTopUpRequest(reqId);
      setTopUpAlert({
        ok: res.success,
        text:
          res.message ||
          (res.success
            ? 'Pengajuan top-up disetujui dan saldo driver otomatis bertambah.'
            : 'Gagal menyetujui pengajuan top-up.'),
      });
    } finally {
      setProcessingTopUpId(null);
    }
  };

  // Real 7-day breakdown (no fallback / fake values, includes archived laporan_keuangan)
  const last7DaysRevenue = useMemo(() => {
    const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    const result: { label: string; dateKey: string; total: number; count: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const isoKey = d.toISOString().split('T')[0];
      const idLocaleDate = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
      const label = `${dayNames[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;

      const matching = mergedTrips.filter((t) => {
        const dField = t.date || '';
        const cField = t.createdAt || '';
        return (
          dField === isoKey ||
          dField.includes(isoKey) ||
          cField.includes(isoKey) ||
          cField.includes(idLocaleDate)
        );
      });

      const total = matching.reduce((sum, t) => sum + (Number(t.totalPrice) || 0), 0);
      result.push({ label, dateKey: isoKey, total, count: matching.length });
    }
    return result;
  }, [mergedTrips]);

  const maxDayRevenue = useMemo(
    () => Math.max(...last7DaysRevenue.map((d) => d.total), 1),
    [last7DaysRevenue]
  );

  const recentOrders = useMemo(() => activeOrders.slice(0, 10), [activeOrders]);

  const currentMenuLabel = MENU_ITEMS.find((m) => m.key === activeMenu)?.label || 'Dashboard';

  const getMenuBadge = (key: AdminMenuKey): number => {
    if (key === 'drivers') return pendingDriversCount;
    if (key === 'orders') return metrics.pesananBaru;
    if (key === 'finance') return pendingTopUpCount;
    return 0;
  };

  const renderSidebarContent = (isMobile = false) => (
    <div className="flex flex-col h-full bg-[#070B14] text-slate-200 select-none">
      {/* Brand Block */}
      <div className="h-16 px-5 border-b border-slate-800/80 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#1D4ED8] flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-extrabold tracking-tight text-white">M3CAR ADMIN</div>
            <div className="text-[10px] text-slate-400 font-medium">Panel Kendali Pusat</div>
          </div>
        </div>
        {isMobile && (
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            aria-label="Tutup menu"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {MENU_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeMenu === item.key;
          const badgeCount = getMenuBadge(item.key);
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setActiveMenu(item.key);
                if (isMobile) setIsMobileSidebarOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 rounded-lg text-xs font-bold flex items-center justify-between transition-colors cursor-pointer ${
                isActive
                  ? 'bg-[#0F294A] text-white border border-blue-700/40'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </span>
              {badgeCount > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-blue-600 text-white font-mono text-[10px] font-bold tabular-nums">
                  {badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Logout Block */}
      <div className="p-3 border-t border-slate-800/80 shrink-0">
        <button
          type="button"
          onClick={handleLogout}
          className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 hover:text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 print:bg-white text-slate-950 flex print:block">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-16 h-[calc(100vh-4rem)] border-r border-slate-800 print:hidden">
        {renderSidebarContent(false)}
      </aside>

      {/* Mobile Sidebar Drawer */}
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex print:hidden">
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
          <aside className="relative w-64 max-w-[80vw] h-full z-10 shadow-2xl">
            {renderSidebarContent(true)}
          </aside>
        </div>
      )}

      {/* Right Main Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <AdminHeader
          pageTitle={currentMenuLabel}
          onLogout={handleLogout}
          onOpenWhatsAppInbox={onOpenWhatsAppInbox}
          onToggleMobileMenu={() => setIsMobileSidebarOpen(true)}
        />

        <main className="flex-1 p-4 sm:p-6 print:p-0 max-w-7xl print:max-w-none w-full mx-auto space-y-6">
          {firestoreError && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{firestoreError}</span>
            </div>
          )}
          {/* MENU 1: DASHBOARD ADMIN (8 REAL METRICS FROM FIREBASE) */}
          {activeMenu === 'dashboard' && (
            <div className="space-y-6">
              {/* 8 Key Statistics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500">Total Driver</div>
                  <div className="text-2xl font-extrabold text-slate-950 font-mono tabular-nums mt-1.5">
                    {metrics.totalDriver.toLocaleString('id-ID')}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500">Total Penumpang</div>
                  <div className="text-2xl font-extrabold text-slate-950 font-mono tabular-nums mt-1.5">
                    {metrics.totalPenumpang.toLocaleString('id-ID')}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500">Total Pesanan</div>
                  <div className="text-2xl font-extrabold text-[#0F294A] font-mono tabular-nums mt-1.5">
                    {metrics.totalPesanan.toLocaleString('id-ID')}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500">Pesanan Baru</div>
                  <div className="text-2xl font-extrabold text-amber-700 font-mono tabular-nums mt-1.5">
                    {metrics.pesananBaru.toLocaleString('id-ID')}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500">Pesanan Diproses</div>
                  <div className="text-2xl font-extrabold text-blue-700 font-mono tabular-nums mt-1.5">
                    {metrics.pesananDiproses.toLocaleString('id-ID')}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500">Pesanan Selesai</div>
                  <div className="text-2xl font-extrabold text-emerald-700 font-mono tabular-nums mt-1.5">
                    {metrics.pesananSelesai.toLocaleString('id-ID')}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500">Pesanan Dibatalkan</div>
                  <div className="text-2xl font-extrabold text-red-700 font-mono tabular-nums mt-1.5">
                    {metrics.pesananDibatalkan.toLocaleString('id-ID')}
                  </div>
                </div>

                <div className="bg-[#0B162C] border border-slate-800 rounded-xl p-4 shadow-sm text-white">
                  <div className="text-xs font-semibold text-slate-300">Total Pendapatan</div>
                  <div className="text-xl sm:text-2xl font-extrabold text-white font-mono tabular-nums mt-1.5 truncate">
                    Rp {metrics.totalPendapatan.toLocaleString('id-ID')}
                  </div>
                </div>
              </div>

              {/* Real 7-Day Revenue Breakdown */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-950 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-[#0F294A]" />
                      <span>Pendapatan 7 Hari Terakhir (Data Real Firebase)</span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Dihitung langsung dari pesanan berstatus Selesai.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-2 sm:gap-4 items-end h-44 border-b border-slate-200 pb-3 pt-4">
                  {last7DaysRevenue.map((day) => {
                    const heightPct = day.total > 0 ? Math.max(10, Math.round((day.total / maxDayRevenue) * 100)) : 4;
                    return (
                      <div key={day.dateKey} className="flex flex-col items-center justify-end h-full gap-1.5 group">
                        <div className="text-[10px] font-mono font-bold text-slate-600 tabular-nums">
                          {day.total > 0 ? `Rp ${(day.total / 1000).toFixed(0)}k` : 'Rp 0'}
                        </div>
                        <div className="w-full flex justify-center items-end flex-1">
                          <div
                            style={{ height: `${heightPct}%` }}
                            className={`w-full max-w-[40px] rounded-t-md transition-all ${
                              day.total > 0 ? 'bg-[#0F294A] group-hover:bg-[#1D4ED8]' : 'bg-slate-200'
                            }`}
                          />
                        </div>
                        <div className="text-[10px] sm:text-xs font-semibold text-slate-600 text-center">
                          {day.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Real-time Top-Up Requests Panel on Admin Dashboard */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-950 flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-[#0F294A]" />
                      <span>Pengajuan Isi Saldo Driver (Real-Time Firestore)</span>
                      {pendingTopUpCount > 0 && (
                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-mono text-[11px] font-bold">
                          {pendingTopUpCount} Menunggu Konfirmasi
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Setiap pengajuan isi saldo dari driver muncul otomatis di sini dan pada menu Keuangan.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveMenu('finance')}
                    className="text-xs font-bold text-[#0F294A] hover:underline flex items-center gap-1 cursor-pointer self-start sm:self-auto"
                  >
                    <span>Kelola Semua di Keuangan</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {topUpAlert && (
                  <div
                    className={`mx-4 mt-3 p-3 rounded-lg text-xs font-bold flex items-center justify-between gap-2 border ${
                      topUpAlert.ok
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-red-50 border-red-200 text-red-800'
                    }`}
                  >
                    <span>{topUpAlert.text}</span>
                    <button
                      type="button"
                      onClick={() => setTopUpAlert(null)}
                      className="text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className="divide-y divide-slate-100">
                  {pendingTopUps.slice(0, 5).map((req) => (
                    <div
                      key={req.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm text-slate-950">{req.driverName}</span>
                          {req.driverPlate && (
                            <span className="font-mono text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                              {req.driverPlate}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-bold">
                            <Clock className="w-3 h-3" />
                            <span>Menunggu Konfirmasi</span>
                          </span>
                        </div>
                        <div className="text-xs text-slate-600">
                          Nominal:{' '}
                          <span className="font-mono font-extrabold text-emerald-700">
                            Rp {Number(req.amount || 0).toLocaleString('id-ID')}
                          </span>{' '}
                          &middot; Tujuan: {req.bankName || 'SeaBank'} ({req.accountNumber || '901102051050'}) &middot;{' '}
                          <span className="font-mono text-[11px] text-slate-500">{req.createdAt}</span>
                        </div>
                        {req.note && <div className="text-[11px] text-slate-500 italic">Catatan: {req.note}</div>}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={processingTopUpId === req.id}
                          onClick={() => handleQuickApproveTopUp(req.id)}
                          className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          {processingTopUpId === req.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          <span>Setujui / Konfirmasi</span>
                        </button>
                      </div>
                    </div>
                  ))}
                  {pendingTopUps.length === 0 && (
                    <div className="p-5 text-center text-xs text-slate-500">
                      Tidak ada pengajuan isi saldo driver yang menunggu konfirmasi saat ini.
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Orders Table */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-950">Pesanan Terbaru</h3>
                    <p className="text-xs text-slate-500">10 pesanan terakhir dari koleksi orders</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveMenu('orders')}
                    className="text-xs font-bold text-[#0F294A] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>Kelola Semua Pesanan</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[11px] font-bold">
                        <th className="py-3 px-4">Penumpang</th>
                        <th className="py-3 px-4">Driver</th>
                        <th className="py-3 px-4">Rute</th>
                        <th className="py-3 px-4 text-right">Harga</th>
                        <th className="py-3 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {recentOrders.map((o) => (
                        <tr key={o.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-950">{o.customerName}</div>
                            <div className="font-mono text-[11px] text-slate-500">{o.customerPhone}</div>
                          </td>
                          <td className="py-3 px-4 text-slate-800 font-medium">
                            {o.driverName || <span className="text-slate-400 italic">Menunggu Driver</span>}
                          </td>
                          <td className="py-3 px-4 text-slate-700 max-w-xs truncate">
                            {o.pickupLocation || o.dari} &rarr; {o.destination || o.ke}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-950 tabular-nums">
                            Rp {Number(o.totalPrice ?? o.harga ?? 0).toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                                o.status === 'SELESAI'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : o.status === 'MENCARI_DRIVER'
                                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                  : o.status === 'DIBATALKAN'
                                  ? 'bg-red-50 text-red-700 border border-red-200'
                                  : 'bg-blue-50 text-[#0F294A] border border-blue-200'
                              }`}
                            >
                              {o.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {recentOrders.length === 0 && (
                        <tr>
                          <td colSpan={5} className="text-center py-8 text-slate-500">
                            Belum ada data pesanan di Firebase.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeMenu === 'routes' && <AdminRoutesSection />}
          {activeMenu === 'pricing' && <AdminPricingSection />}
          {activeMenu === 'drivers' && <AdminDriversSection />}
          {activeMenu === 'passengers' && <AdminPassengersSection />}
          {activeMenu === 'orders' && <AdminOrdersSection />}
          {activeMenu === 'finance' && <AdminFinanceSection />}
        </main>
      </div>
    </div>
  );
};
