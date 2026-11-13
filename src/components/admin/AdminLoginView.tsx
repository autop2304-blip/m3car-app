import React, { useState } from 'react';
import { useM3CarStore } from '../../store/m3carStore';
import { Shield, Lock, AlertCircle, ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';

interface AdminLoginViewProps {
  onLoginSuccess: () => void;
}

export const AdminLoginView: React.FC<AdminLoginViewProps> = ({ onLoginSuccess }) => {
  const { loginAdminWithServer } = useM3CarStore();
  const [adminCode, setAdminCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmed = adminCode.trim();
    if (!trimmed) {
      setErrorMessage('Kode Salah');
      return;
    }

    setIsSubmitting(true);
    const result = await loginAdminWithServer(trimmed);
    setIsSubmitting(false);

    if (result.success) {
      setAdminCode('');
      onLoginSuccess();
    } else {
      setErrorMessage(result.message || 'Kode Salah');
    }
  };

  return (
    <div className="min-h-[calc(100vh-10rem)] bg-[#070B14] flex flex-col justify-center items-center px-4 py-10 relative overflow-hidden">
      {/* Subtle architectural grid lines */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #94a3b8 1px, transparent 1px), linear-gradient(to bottom, #94a3b8 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
        {/* Top Navy Header Strip */}
        <div className="bg-[#0B162C] px-7 py-6 text-white border-b border-slate-800">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#1D4ED8] flex items-center justify-center shrink-0 shadow-md">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-white uppercase">
                M3CAR ADMIN PANEL
              </h1>
              <p className="text-xs text-slate-300 font-medium mt-0.5">
                Sistem Kendali Operasional &bull; CV. Royal Trans Berkah Group
              </p>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-7 space-y-5 bg-white text-slate-900">
          {errorMessage && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-semibold flex items-center gap-2.5"
            >
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="kode-admin-input"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2"
              >
                KODE ADMIN
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="kode-admin-input"
                  type={showCode ? 'text' : 'password'}
                  value={adminCode}
                  onChange={(e) => {
                    setAdminCode(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="Masukkan Kode Admin"
                  autoComplete="off"
                  autoFocus
                  required
                  className="w-full pl-10 pr-11 py-3 bg-slate-50 border border-slate-300 focus:border-[#0F294A] focus:bg-white rounded-xl text-slate-950 text-sm font-mono tracking-wider focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowCode((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                  aria-label={showCode ? 'Sembunyikan kode' : 'Lihat kode'}
                >
                  {showCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Akses dilindungi validasi Kode Admin &amp; Firebase Cloud Firestore.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 px-5 bg-[#0F294A] hover:bg-[#173B6B] active:bg-[#0B1F3A] text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-60 shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Memverifikasi Kode...</span>
                </>
              ) : (
                <>
                  <span>Masuk ke Dashboard Admin</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-100 text-center text-[11px] text-slate-500">
            <span className="font-semibold text-slate-700">Portal Khusus Manajemen Internal</span> &middot; Tidak tersedia pendaftaran akun admin.
          </div>
        </div>
      </div>
    </div>
  );
};
