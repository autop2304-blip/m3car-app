import React from 'react';
import { useM3CarStore } from '../../store/m3carStore';
import { Shield, LogOut, MessageSquare, Menu } from 'lucide-react';

interface AdminHeaderProps {
  pageTitle?: string;
  onLogout: () => void;
  onOpenWhatsAppInbox?: () => void;
  onToggleMobileMenu?: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  pageTitle = 'Dashboard',
  onLogout,
  onOpenWhatsAppInbox,
  onToggleMobileMenu,
}) => {
  const { isFirebaseConnected, notifications } = useM3CarStore();

  return (
    <header className="sticky top-0 sm:top-16 z-30 h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-3 print:hidden">
      <div className="flex items-center gap-3 min-w-0">
        {onToggleMobileMenu && (
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="lg:hidden p-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
            aria-label="Buka menu navigasi"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div className="flex items-center gap-2.5 lg:hidden shrink-0">
          <div className="w-8 h-8 rounded-lg bg-[#0F294A] flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="font-extrabold text-sm tracking-tight text-slate-950 whitespace-nowrap">
            M3CAR ADMIN
          </span>
        </div>
        <div className="hidden lg:block min-w-0">
          <h2 className="text-base font-bold text-slate-950 truncate">{pageTitle}</h2>
          <p className="text-[11px] text-slate-500 truncate">
            CV. Royal Trans Berkah Group &middot; Kendali Operasional Real-Time
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <div
          className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
            isFirebaseConnected
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          <span>{isFirebaseConnected ? 'Firebase Tersambung' : 'Mode Offline'}</span>
        </div>

        {onOpenWhatsAppInbox && (
          <button
            type="button"
            onClick={onOpenWhatsAppInbox}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
            title="Riwayat Notifikasi WhatsApp"
          >
            <MessageSquare className="w-3.5 h-3.5 text-[#0F294A]" />
            <span className="hidden sm:inline">Log WA ({notifications.length})</span>
          </button>
        )}

        <button
          type="button"
          onClick={onLogout}
          className="px-3.5 py-1.5 rounded-lg bg-[#070B14] hover:bg-[#0F294A] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
          title="Logout dari Panel Admin"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
};
