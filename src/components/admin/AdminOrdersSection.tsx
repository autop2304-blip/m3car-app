import React, { useState, useMemo } from 'react';
import { useM3CarStore } from '../../store/m3carStore';
import { Order, OrderStatus } from '../../types';
import {
  ClipboardList,
  Search,
  Eye,
  UserPlus,
  CheckCircle2,
  XCircle,
  Phone,
  Trash2,
  X,
  CreditCard,
  MapPin,
} from 'lucide-react';

type OrderFilterTab =
  | 'SEMUA'
  | 'PESANAN_BARU'
  | 'MENUNGGU_DRIVER'
  | 'DITERIMA'
  | 'BERLANGSUNG'
  | 'SELESAI'
  | 'DIBATALKAN';

function getOrderStatusLabel(status: OrderStatus): string {
  switch (status) {
    case 'MENCARI_DRIVER':
      return 'Menunggu Driver';
    case 'DRIVER_DITEMUKAN':
      return 'Diterima';
    case 'DRIVER_OTW':
      return 'Driver Menjemput';
    case 'SUDAH_JEMPUT':
      return 'Dalam Perjalanan';
    case 'SUDAH_SAMPAI':
      return 'Tiba di Tujuan';
    case 'SELESAI':
      return 'Selesai';
    case 'DIBATALKAN':
      return 'Dibatalkan';
    default:
      return status;
  }
}

export const AdminOrdersSection: React.FC = () => {
  const {
    orders,
    drivers,
    acceptOrderByDriver,
    updateOrderStatusAdmin,
    confirmOrderPayment,
    cancelOrderByAdmin,
    deleteOrder,
  } = useM3CarStore();

  const [filterTab, setFilterTab] = useState<OrderFilterTab>('SEMUA');
  const [search, setSearch] = useState('');

  // Modals
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [assignOrder, setAssignOrder] = useState<Order | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [cancelOrderTarget, setCancelOrderTarget] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState('Dibatalkan oleh Admin Pusat');
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [payOrderTarget, setPayOrderTarget] = useState<Order | null>(null);
  const [payMethod, setPayMethod] = useState<'TUNAI' | 'TRANSFER_DRIVER' | 'QRIS_RTB'>('TUNAI');

  const activeOrders = useMemo(() => orders.filter((o) => !o.isDeleted), [orders]);
  const eligibleDrivers = useMemo(
    () => drivers.filter((d) => !d.isDeleted && d.status === 'AKTIF'),
    [drivers]
  );

  const counts = useMemo(() => {
    return {
      SEMUA: activeOrders.length,
      PESANAN_BARU: activeOrders.filter((o) => o.status === 'MENCARI_DRIVER').length,
      MENUNGGU_DRIVER: activeOrders.filter((o) => o.status === 'MENCARI_DRIVER' && !o.driverId).length,
      DITERIMA: activeOrders.filter((o) => o.status === 'DRIVER_DITEMUKAN').length,
      BERLANGSUNG: activeOrders.filter((o) =>
        ['DRIVER_OTW', 'SUDAH_JEMPUT', 'SUDAH_SAMPAI'].includes(o.status)
      ).length,
      SELESAI: activeOrders.filter((o) => o.status === 'SELESAI').length,
      DIBATALKAN: activeOrders.filter((o) => o.status === 'DIBATALKAN').length,
    };
  }, [activeOrders]);

  const filteredOrders = useMemo(() => {
    return activeOrders
      .filter((o) => {
        if (filterTab === 'PESANAN_BARU' && o.status !== 'MENCARI_DRIVER') return false;
        if (filterTab === 'MENUNGGU_DRIVER' && (o.status !== 'MENCARI_DRIVER' || Boolean(o.driverId)))
          return false;
        if (filterTab === 'DITERIMA' && o.status !== 'DRIVER_DITEMUKAN') return false;
        if (
          filterTab === 'BERLANGSUNG' &&
          !['DRIVER_OTW', 'SUDAH_JEMPUT', 'SUDAH_SAMPAI'].includes(o.status)
        )
          return false;
        if (filterTab === 'SELESAI' && o.status !== 'SELESAI') return false;
        if (filterTab === 'DIBATALKAN' && o.status !== 'DIBATALKAN') return false;

        if (search.trim()) {
          const q = search.toLowerCase();
          return (
            (o.customerName || '').toLowerCase().includes(q) ||
            (o.customerPhone || '').toLowerCase().includes(q) ||
            (o.driverName || '').toLowerCase().includes(q) ||
            (o.pickupLocation || o.dari || '').toLowerCase().includes(q) ||
            (o.destination || o.ke || '').toLowerCase().includes(q) ||
            (o.orderNumber || o.id || '').toLowerCase().includes(q)
          );
        }
        return true;
      })
      .slice(0, 30);
  }, [activeOrders, filterTab, search]);

  const openAssignModal = (o: Order) => {
    setAssignOrder(o);
    setSelectedDriverId(eligibleDrivers[0]?.id || '');
  };

  const handleConfirmAssign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignOrder) return;
    if (selectedDriverId) {
      const res = acceptOrderByDriver(selectedDriverId, assignOrder.id);
      if (!res?.success) {
        const drv = eligibleDrivers.find((d) => d.id === selectedDriverId);
        updateOrderStatusAdmin(assignOrder.id, 'DRIVER_DITEMUKAN', {
          driverId: drv?.id,
          driverName: drv?.name,
          driverPhone: drv?.phone,
          driverPlate: drv?.plateNumber || drv?.plate,
          driverCar: drv?.carModel || drv?.car,
        });
      }
    } else {
      updateOrderStatusAdmin(assignOrder.id, 'DRIVER_DITEMUKAN');
    }
    setAssignOrder(null);
  };

  const handleConfirmCancel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelOrderTarget) return;
    cancelOrderByAdmin(cancelOrderTarget.id, cancelReason.trim() || 'Dibatalkan oleh Admin');
    setCancelOrderTarget(null);
  };

  const handleConfirmPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payOrderTarget) return;
    confirmOrderPayment(payOrderTarget.id, payMethod);
    setPayOrderTarget(null);
  };

  return (
    <div className="space-y-5">
      {/* Header & Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-extrabold text-slate-950 flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-[#0F294A]" />
              <span>Manajemen Pesanan Travel</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Pantau dan kendalikan seluruh pesanan dari Firebase collection <span className="font-mono">orders</span>.
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari penumpang, driver, kota, order..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-950 focus:outline-none focus:border-[#0F294A]"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {(
            [
              { id: 'SEMUA', label: `Semua (${counts.SEMUA})` },
              { id: 'PESANAN_BARU', label: `Pesanan Baru (${counts.PESANAN_BARU})` },
              { id: 'MENUNGGU_DRIVER', label: `Menunggu Driver (${counts.MENUNGGU_DRIVER})` },
              { id: 'DITERIMA', label: `Diterima (${counts.DITERIMA})` },
              { id: 'BERLANGSUNG', label: `Perjalanan Berlangsung (${counts.BERLANGSUNG})` },
              { id: 'SELESAI', label: `Selesai (${counts.SELESAI})` },
              { id: 'DIBATALKAN', label: `Dibatalkan (${counts.DIBATALKAN})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap transition-colors ${
                filterTab === tab.id
                  ? 'bg-[#0F294A] text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-950 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[11px] font-bold">
                <th className="py-3.5 px-3">Nama Penumpang</th>
                <th className="py-3.5 px-3">Nama Driver</th>
                <th className="py-3.5 px-3">Kota Asal</th>
                <th className="py-3.5 px-3">Kota Tujuan</th>
                <th className="py-3.5 px-3">Tanggal Keberangkatan</th>
                <th className="py-3.5 px-3 text-center">Penumpang</th>
                <th className="py-3.5 px-3 text-right">Harga</th>
                <th className="py-3.5 px-3">Status Pembayaran</th>
                <th className="py-3.5 px-3">Status Perjalanan</th>
                <th className="py-3.5 px-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.map((o) => {
                const harga = Number(o.totalPrice ?? o.harga ?? 0);
                const isPaid = o.paymentStatus === 'LUNAS';
                return (
                  <tr key={o.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-3">
                      <div className="font-bold text-slate-950">{o.customerName}</div>
                      <div className="font-mono text-[11px] text-slate-500">{o.customerPhone}</div>
                    </td>
                    <td className="py-3.5 px-3">
                      {o.driverName ? (
                        <div>
                          <div className="font-semibold text-slate-900">{o.driverName}</div>
                          <div className="font-mono text-[11px] text-slate-500">{o.driverPlate || ''}</div>
                          {o.driverLocationText && (
                            <div className="text-[10px] text-emerald-700 font-medium flex items-center gap-0.5 mt-0.5 max-w-[150px] truncate">
                              <MapPin className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate">{o.driverLocationText}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Belum Ditugaskan</span>
                      )}
                    </td>
                    <td className="py-3.5 px-3 font-medium text-slate-800 max-w-[160px] truncate">
                      {o.pickupLocation || o.dari || '-'}
                    </td>
                    <td className="py-3.5 px-3 font-medium text-slate-800 max-w-[160px] truncate">
                      {o.destination || o.ke || '-'}
                    </td>
                    <td className="py-3.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                      {o.date || '-'} {o.time ? `• ${o.time}` : ''}
                    </td>
                    <td className="py-3.5 px-3 text-center font-mono font-bold text-slate-900 tabular-nums">
                      {o.passengers || 1} Org
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono font-bold text-slate-950 tabular-nums whitespace-nowrap">
                      Rp {harga.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className={`inline-block w-fit px-2 py-0.5 rounded text-[11px] font-bold ${
                            isPaid
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {isPaid ? 'Lunas' : 'Belum Bayar'}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {o.paymentMethod || 'TUNAI'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <span
                        className={`inline-block px-2.5 py-1 rounded text-[11px] font-bold ${
                          o.status === 'SELESAI'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : o.status === 'MENCARI_DRIVER'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : o.status === 'DIBATALKAN'
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : 'bg-blue-50 text-[#0F294A] border border-blue-200'
                        }`}
                      >
                        {getOrderStatusLabel(o.status)}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        {o.status === 'MENCARI_DRIVER' && (
                          <button
                            type="button"
                            onClick={() => openAssignModal(o)}
                            className="px-2 py-1 rounded-lg bg-[#0F294A] hover:bg-[#173B6B] text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                            title="Tugaskan Driver"
                          >
                            <UserPlus className="w-3 h-3" />
                            <span>Driver</span>
                          </button>
                        )}

                        {['DRIVER_DITEMUKAN', 'DRIVER_OTW', 'SUDAH_JEMPUT', 'SUDAH_SAMPAI'].includes(
                          o.status
                        ) && (
                          <button
                            type="button"
                            onClick={() => updateOrderStatusAdmin(o.id, 'SELESAI')}
                            className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                            title="Selesaikan Pesanan"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Selesai</span>
                          </button>
                        )}

                        {!isPaid && o.status !== 'DIBATALKAN' && (
                          <button
                            type="button"
                            onClick={() => {
                              setPayMethod((o.paymentMethod as any) || 'TUNAI');
                              setPayOrderTarget(o);
                            }}
                            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                            title="Konfirmasi Pembayaran Lunas"
                          >
                            <CreditCard className="w-3 h-3 text-emerald-700" />
                            <span>Bayar</span>
                          </button>
                        )}

                        {o.status !== 'SELESAI' && o.status !== 'DIBATALKAN' && (
                          <button
                            type="button"
                            onClick={() => {
                              setCancelReason('Dibatalkan oleh Admin Pusat');
                              setCancelOrderTarget(o);
                            }}
                            className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 cursor-pointer"
                            title="Batalkan Pesanan"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setDetailOrder(o)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                          title="Lihat Detail"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {o.customerPhone && (
                          <a
                            href={`https://wa.me/${o.customerPhone.replace(/\D/g, '').replace(/^0/, '62')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700"
                            title="Hubungi Penumpang via WhatsApp"
                          >
                            <Phone className="w-3.5 h-3.5" />
                          </a>
                        )}

                        <button
                          type="button"
                          onClick={() => setOrderToDelete(o)}
                          className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 cursor-pointer"
                          title="Hapus Pesanan"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-10 text-slate-500">
                    Tidak ada pesanan pada kategori ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Detail Order */}
      {detailOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="bg-[#0B162C] text-white px-6 py-4 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm">Detail Pesanan {detailOrder.orderNumber}</h4>
                <p className="text-[11px] text-slate-300">{detailOrder.createdAt}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailOrder(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <div className="text-slate-500">Penumpang</div>
                  <div className="font-bold text-slate-950">{detailOrder.customerName}</div>
                  <div className="font-mono text-slate-600">{detailOrder.customerPhone}</div>
                </div>
                <div>
                  <div className="text-slate-500">Driver</div>
                  <div className="font-bold text-slate-950">{detailOrder.driverName || 'Belum Ada'}</div>
                  <div className="font-mono text-slate-600">{detailOrder.driverPlate || '-'}</div>
                  {(detailOrder.driverLocationText || (detailOrder.driverLat !== undefined && detailOrder.driverLng !== undefined)) && (
                    <div className="mt-1 text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span>
                        {detailOrder.driverLocationText || `${detailOrder.driverLat?.toFixed(4)}, ${detailOrder.driverLng?.toFixed(4)}`}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <div>
                  <span className="text-slate-500">Kota Asal / Jemput:</span>{' '}
                  <span className="font-semibold text-slate-900">{detailOrder.pickupLocation || detailOrder.dari}</span>
                </div>
                <div>
                  <span className="text-slate-500">Kota Tujuan:</span>{' '}
                  <span className="font-semibold text-slate-900">{detailOrder.destination || detailOrder.ke}</span>
                </div>
                <div>
                  <span className="text-slate-500">Keberangkatan:</span>{' '}
                  <span className="font-mono font-semibold text-slate-900">
                    {detailOrder.date} {detailOrder.time} ({detailOrder.passengers} Penumpang)
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Total Harga:</span>{' '}
                  <span className="font-mono font-extrabold text-[#0F294A]">
                    Rp {Number(detailOrder.totalPrice ?? detailOrder.harga ?? 0).toLocaleString('id-ID')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Pembayaran:</span>{' '}
                  <span className="font-bold text-slate-900">
                    {detailOrder.paymentStatus || 'BELUM_BAYAR'} ({detailOrder.paymentMethod || 'TUNAI'})
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Status Perjalanan:</span>{' '}
                  <span className="font-bold text-slate-900">{getOrderStatusLabel(detailOrder.status)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Assign Driver */}
      {assignOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmAssign}
            className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl"
          >
            <h4 className="text-base font-bold text-slate-950">
              Tugaskan Driver — {assignOrder.orderNumber}
            </h4>
            <p className="text-xs text-slate-600">
              Rute: {assignOrder.pickupLocation || assignOrder.dari} &rarr;{' '}
              {assignOrder.destination || assignOrder.ke}
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Pilih Mitra Driver Aktif</label>
              <select
                value={selectedDriverId}
                onChange={(e) => setSelectedDriverId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-950 focus:outline-none focus:border-[#0F294A]"
              >
                {eligibleDrivers.length === 0 && <option value="">Tidak ada driver aktif tersedia</option>}
                {eligibleDrivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.plateNumber}) — Saldo Rp {Number(d.saldo ?? d.balance ?? 0).toLocaleString('id-ID')}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setAssignOrder(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173B6B] text-white text-xs font-bold cursor-pointer"
              >
                Terima &amp; Tugaskan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Payment Confirmation */}
      {payOrderTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmPayment}
            className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl"
          >
            <h4 className="text-base font-bold text-slate-950">
              Konfirmasi Pembayaran — {payOrderTarget.orderNumber}
            </h4>
            <p className="text-xs text-slate-600">
              Total Tagihan:{' '}
              <span className="font-mono font-bold text-slate-950">
                Rp {Number(payOrderTarget.totalPrice ?? payOrderTarget.harga ?? 0).toLocaleString('id-ID')}
              </span>
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Metode Pembayaran</label>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as any)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-950 focus:outline-none focus:border-[#0F294A]"
              >
                <option value="TUNAI">Pembayaran Tunai</option>
                <option value="TRANSFER_DRIVER">Pembayaran Transfer (Rekening/Driver)</option>
                <option value="QRIS_RTB">Pembayaran Transfer / QRIS Perusahaan</option>
              </select>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPayOrderTarget(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
              >
                Tandai Lunas
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Cancel Order */}
      {cancelOrderTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmCancel}
            className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl"
          >
            <h4 className="text-base font-bold text-slate-950">
              Batalkan Pesanan — {cancelOrderTarget.orderNumber}
            </h4>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Alasan Pembatalan</label>
              <textarea
                rows={3}
                required
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-950 focus:outline-none focus:border-[#0F294A]"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelOrderTarget(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Kembali
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
              >
                Batalkan Pesanan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Delete Order */}
      {orderToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h4 className="text-base font-bold text-slate-950">Hapus Pesanan Permanen?</h4>
            <p className="text-xs text-slate-600">
              Pesanan <span className="font-mono font-bold text-slate-950">{orderToDelete.orderNumber}</span> atas nama{' '}
              <span className="font-bold text-slate-950">{orderToDelete.customerName}</span> akan dihapus dari Firebase.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOrderToDelete(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteOrder(orderToDelete.id);
                  setOrderToDelete(null);
                }}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
              >
                Hapus Pesanan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
