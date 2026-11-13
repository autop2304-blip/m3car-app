import React, { useState, useMemo } from 'react';
import { useM3CarStore } from '../../store/m3carStore';
import { CustomerData } from '../../services/firestoreService';
import { Users, Search, History, Phone, Trash2, X, ArrowRight } from 'lucide-react';

export const AdminPassengersSection: React.FC = () => {
  const { customers, orders, deleteCustomer, clearAllCustomers } = useM3CarStore();

  const [search, setSearch] = useState('');
  const [historyPassenger, setHistoryPassenger] = useState<CustomerData | null>(null);
  const [passengerToDelete, setPassengerToDelete] = useState<CustomerData | null>(null);
  const [isClearAllOpen, setIsClearAllOpen] = useState(false);

  const activeCustomers = useMemo(() => customers.filter((c) => !c.isDeleted), [customers]);

  const filteredCustomers = useMemo(() => {
    if (!search.trim()) return activeCustomers;
    const q = search.toLowerCase();
    return activeCustomers.filter(
      (c) =>
        (c.nama || c.name || '').toLowerCase().includes(q) ||
        (c.no_hp || c.phone || '').toLowerCase().includes(q) ||
        (c.alamat || '').toLowerCase().includes(q)
    );
  }, [activeCustomers, search]);

  const getOrdersForPassenger = (c: CustomerData) => {
    const cPhone = (c.no_hp || c.phone || '').replace(/\D/g, '');
    const cName = (c.nama || c.name || '').trim().toLowerCase();
    return orders.filter((o) => {
      if (o.isDeleted) return false;
      if (o.customerId && o.customerId === c.id) return true;
      const oPhone = (o.customerPhone || '').replace(/\D/g, '');
      if (cPhone && oPhone && oPhone === cPhone) return true;
      if (cName && (o.customerName || '').trim().toLowerCase() === cName) return true;
      return false;
    });
  };

  const selectedPassengerOrders = useMemo(() => {
    if (!historyPassenger) return [];
    return getOrdersForPassenger(historyPassenger);
  }, [historyPassenger, orders]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div>
          <h3 className="text-lg font-extrabold text-slate-950 flex items-center gap-2">
            <Users className="w-5 h-5 text-[#0F294A]" />
            <span>Data Penumpang</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Daftar penumpang dari Firebase collection <span className="font-mono">customers</span> beserta riwayat perjalanan &amp; pesanannya.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama atau nomor HP..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-950 focus:outline-none focus:border-[#0F294A]"
            />
          </div>
          {activeCustomers.length > 0 && (
            <button
              type="button"
              onClick={() => setIsClearAllOpen(true)}
              className="px-3 py-2 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-bold cursor-pointer shrink-0"
            >
              Hapus Semua
            </button>
          )}
        </div>
      </div>

      {/* Passengers Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[11px] font-bold">
                <th className="py-3.5 px-4">Nama Penumpang</th>
                <th className="py-3.5 px-4">Nomor HP</th>
                <th className="py-3.5 px-4">Alamat</th>
                <th className="py-3.5 px-4">Tanggal Daftar</th>
                <th className="py-3.5 px-4 text-right">Total Pesanan</th>
                <th className="py-3.5 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCustomers.map((c) => {
                const passengerOrders = getOrdersForPassenger(c);
                const phone = c.no_hp || c.phone || '-';
                return (
                  <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-950">{c.nama || c.name || 'Penumpang'}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-700">{phone}</td>
                    <td className="py-3.5 px-4 text-slate-600 max-w-xs truncate">{c.alamat || '-'}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-500">{c.tanggal_daftar || '-'}</td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-[#0F294A] tabular-nums">
                      {passengerOrders.length} Pesanan
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setHistoryPassenger(c)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <History className="w-3.5 h-3.5 text-[#0F294A]" />
                          <span>Riwayat &amp; Pesanan</span>
                        </button>

                        {phone !== '-' && (
                          <a
                            href={`https://wa.me/${phone.replace(/\D/g, '').replace(/^0/, '62')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700"
                            title="Hubungi via WhatsApp"
                          >
                            <Phone className="w-3.5 h-3.5" />
                          </a>
                        )}

                        <button
                          type="button"
                          onClick={() => setPassengerToDelete(c)}
                          className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 cursor-pointer"
                          title="Hapus Penumpang"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-500">
                    Belum ada data penumpang.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Riwayat Perjalanan & Pesanan Penumpang */}
      {historyPassenger && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className="bg-[#0B162C] text-white px-6 py-4 flex items-center justify-between sticky top-0 z-10">
              <div>
                <h4 className="font-bold text-sm">
                  Riwayat Perjalanan &amp; Pesanan — {historyPassenger.nama || historyPassenger.name}
                </h4>
                <p className="text-[11px] text-slate-300 font-mono">
                  {historyPassenger.no_hp || historyPassenger.phone} &bull; {selectedPassengerOrders.length} Pesanan Tercatat
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryPassenger(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              {selectedPassengerOrders.map((o) => (
                <div
                  key={o.id}
                  className="border border-slate-200 rounded-xl p-4 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#0F294A]">
                        {o.orderNumber || o.id}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {o.date} {o.time || ''}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                      <span>{o.pickupLocation || o.dari}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                      <span>{o.destination || o.ke}</span>
                    </div>
                    <div className="text-[11px] text-slate-600">
                      {o.passengers || 1} Penumpang &bull; Driver:{' '}
                      <span className="font-semibold text-slate-800">{o.driverName || 'Belum Ada Driver'}</span>
                    </div>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <div className="font-mono text-sm font-extrabold text-slate-950 tabular-nums">
                      Rp {Number(o.totalPrice ?? o.harga ?? 0).toLocaleString('id-ID')}
                    </div>
                    <div className="text-[11px] font-bold text-slate-600 mt-0.5">
                      {o.status.replace(/_/g, ' ')} &bull; {o.paymentStatus || 'BELUM_BAYAR'}
                    </div>
                  </div>
                </div>
              ))}
              {selectedPassengerOrders.length === 0 && (
                <div className="text-center py-8 text-xs text-slate-500">
                  Penumpang ini belum memiliki riwayat pesanan di koleksi <span className="font-mono">orders</span>.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Single Passenger Modal */}
      {passengerToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h4 className="text-base font-bold text-slate-950">Hapus Data Penumpang?</h4>
            <p className="text-xs text-slate-600">
              Data penumpang <span className="font-bold text-slate-950">{passengerToDelete.nama || passengerToDelete.name}</span> akan dihapus permanen dari Firebase.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPassengerToDelete(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteCustomer(passengerToDelete.id);
                  setPassengerToDelete(null);
                }}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Passengers Modal */}
      {isClearAllOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h4 className="text-base font-bold text-slate-950">Hapus Semua Data Penumpang?</h4>
            <p className="text-xs text-slate-600">
              Seluruh <span className="font-bold text-slate-950">{activeCustomers.length}</span> data penumpang di Firebase akan dihapus permanen.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsClearAllOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  clearAllCustomers();
                  setIsClearAllOpen(false);
                }}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
              >
                Hapus Semua
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
