import React, { useState, useMemo } from 'react';
import { useM3CarStore } from '../../store/m3carStore';
import { TravelRoute, RouteStatus } from '../../types';
import { MapPin, Plus, Pencil, Trash2, Search, Power, X, ArrowRight } from 'lucide-react';

export const AdminRoutesSection: React.FC = () => {
  const { settings, addRoute, updateRoute, deleteRoute, toggleRouteStatus } = useM3CarStore();
  const routes = settings.routes || [];

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'AKTIF' | 'NONAKTIF'>('ALL');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<TravelRoute | null>(null);
  const [routeToDelete, setRouteToDelete] = useState<TravelRoute | null>(null);

  const [formState, setFormState] = useState({
    kotaAsal: '',
    provinsiAsal: '',
    kotaTujuan: '',
    provinsiTujuan: '',
    status: 'AKTIF' as RouteStatus,
  });

  const filteredRoutes = useMemo(() => {
    return routes.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          r.kotaAsal.toLowerCase().includes(q) ||
          r.provinsiAsal.toLowerCase().includes(q) ||
          r.kotaTujuan.toLowerCase().includes(q) ||
          r.provinsiTujuan.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [routes, statusFilter, searchQuery]);

  const openCreateModal = () => {
    setEditingRoute(null);
    setFormState({
      kotaAsal: '',
      provinsiAsal: '',
      kotaTujuan: '',
      provinsiTujuan: '',
      status: 'AKTIF',
    });
    setIsFormOpen(true);
  };

  const openEditModal = (route: TravelRoute) => {
    setEditingRoute(route);
    setFormState({
      kotaAsal: route.kotaAsal,
      provinsiAsal: route.provinsiAsal,
      kotaTujuan: route.kotaTujuan,
      provinsiTujuan: route.provinsiTujuan,
      status: route.status,
    });
    setIsFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.kotaAsal.trim() || !formState.kotaTujuan.trim()) return;

    if (editingRoute) {
      updateRoute(editingRoute.id, {
        kotaAsal: formState.kotaAsal.trim(),
        provinsiAsal: formState.provinsiAsal.trim(),
        kotaTujuan: formState.kotaTujuan.trim(),
        provinsiTujuan: formState.provinsiTujuan.trim(),
        status: formState.status,
      });
    } else {
      addRoute(formState);
    }
    setIsFormOpen(false);
    setEditingRoute(null);
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div>
          <h3 className="text-lg font-extrabold text-slate-950 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[#0F294A]" />
            <span>Rute Perjalanan Antarkota &amp; Antarprovinsi</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Kelola rute resmi yang aktif di sistem dan tersinkron ke Firebase (<span className="font-mono">setting_admin/config</span>).
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="px-4 py-2.5 rounded-lg bg-[#0F294A] hover:bg-[#173B6B] text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Rute Baru</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {(['ALL', 'AKTIF', 'NONAKTIF'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors whitespace-nowrap ${
                statusFilter === key
                  ? 'bg-[#0F294A] text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-950 hover:bg-slate-200'
              }`}
            >
              {key === 'ALL' && `Semua (${routes.length})`}
              {key === 'AKTIF' && `Aktif (${routes.filter((r) => r.status === 'AKTIF').length})`}
              {key === 'NONAKTIF' && `Nonaktif (${routes.filter((r) => r.status === 'NONAKTIF').length})`}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari kota atau provinsi..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-[#0F294A]"
          />
        </div>
      </div>

      {/* Routes Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[11px] font-bold">
                <th className="py-3.5 px-4">Rute Perjalanan</th>
                <th className="py-3.5 px-4">Kota &amp; Provinsi Asal</th>
                <th className="py-3.5 px-4">Kota &amp; Provinsi Tujuan</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRoutes.map((route) => (
                <tr key={route.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-slate-950">
                    <div className="flex items-center gap-1.5">
                      <span>{route.kotaAsal}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-[#0F294A] shrink-0" />
                      <span>{route.kotaTujuan}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-slate-800">{route.kotaAsal}</div>
                    <div className="text-[11px] text-slate-500">{route.provinsiAsal}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-slate-800">{route.kotaTujuan}</div>
                    <div className="text-[11px] text-slate-500">{route.provinsiTujuan}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-block px-2.5 py-1 rounded text-[11px] font-bold ${
                        route.status === 'AKTIF'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {route.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => toggleRouteStatus(route.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border flex items-center gap-1 cursor-pointer transition-colors ${
                          route.status === 'AKTIF'
                            ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{route.status === 'AKTIF' ? 'Nonaktifkan' : 'Aktifkan'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditModal(route)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setRouteToDelete(route)}
                        className="px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRoutes.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-slate-500">
                    Belum ada rute perjalanan yang ditambahkan. Klik &ldquo;Tambah Rute Baru&rdquo; untuk membuat rute.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Route Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="bg-[#0B162C] text-white px-6 py-4 flex items-center justify-between">
              <h4 className="font-bold text-sm">
                {editingRoute ? 'Edit Rute Perjalanan' : 'Tambah Rute Perjalanan Baru'}
              </h4>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Kota Asal</label>
                  <input
                    type="text"
                    required
                    value={formState.kotaAsal}
                    onChange={(e) => setFormState({ ...formState, kotaAsal: e.target.value })}
                    placeholder="Contoh: Jakarta"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-950 focus:outline-none focus:border-[#0F294A]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Provinsi Asal</label>
                  <input
                    type="text"
                    required
                    value={formState.provinsiAsal}
                    onChange={(e) => setFormState({ ...formState, provinsiAsal: e.target.value })}
                    placeholder="Contoh: DKI Jakarta"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-950 focus:outline-none focus:border-[#0F294A]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Kota Tujuan</label>
                  <input
                    type="text"
                    required
                    value={formState.kotaTujuan}
                    onChange={(e) => setFormState({ ...formState, kotaTujuan: e.target.value })}
                    placeholder="Contoh: Ujung Kulon"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-950 focus:outline-none focus:border-[#0F294A]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Provinsi Tujuan</label>
                  <input
                    type="text"
                    required
                    value={formState.provinsiTujuan}
                    onChange={(e) => setFormState({ ...formState, provinsiTujuan: e.target.value })}
                    placeholder="Contoh: Banten"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-950 focus:outline-none focus:border-[#0F294A]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Status Rute</label>
                <select
                  value={formState.status}
                  onChange={(e) => setFormState({ ...formState, status: e.target.value as RouteStatus })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-950 focus:outline-none focus:border-[#0F294A]"
                >
                  <option value="AKTIF">AKTIF</option>
                  <option value="NONAKTIF">NONAKTIF</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173B6B] text-white text-xs font-bold cursor-pointer"
                >
                  {editingRoute ? 'Simpan Perubahan' : 'Simpan Rute'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Route Confirmation Modal */}
      {routeToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h4 className="text-base font-bold text-slate-950">Hapus Rute Perjalanan?</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Anda yakin ingin menghapus rute{' '}
              <span className="font-bold text-slate-950">
                {routeToDelete.kotaAsal} &rarr; {routeToDelete.kotaTujuan}
              </span>{' '}
              dari Firebase?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRouteToDelete(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteRoute(routeToDelete.id);
                  setRouteToDelete(null);
                }}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
              >
                Hapus Rute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
