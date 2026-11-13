/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * M3CAR - Aplikasi Travel Penumpang, Driver, & Admin Panel
 */

import React, { useState, useEffect } from 'react';
import { useM3CarStore } from './store/m3carStore';
import { CustomerView } from './components/customer/CustomerView';
import { DriverView } from './components/driver/DriverView';
import { AdminLoginView } from './components/admin/AdminLoginView';
import { AdminView } from './components/admin/AdminView';
import { WhatsAppModal } from './components/common/WhatsAppModal';
import { User, Car, Shield, LogOut, MessageSquare, Loader2 } from 'lucide-react';

type PortalMode = 'customer' | 'driver' | 'admin';

function isSpecialAdminUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.toLowerCase();
  if (path === '/admin' || path.startsWith('/admin/')) return true;

  try {
    const searchParams = new URLSearchParams(window.location.search);
    const adminParam = (searchParams.get('admin') || '').toLowerCase().trim();
    if (adminParam === 'true' || adminParam === '1') return true;
  } catch {
    // Ignore malformed query strings
  }

  const hash = window.location.hash.toLowerCase().trim();
  if (
    hash === '#admin' ||
    hash === '#/admin' ||
    hash.startsWith('#admin?') ||
    hash.startsWith('#/admin?')
  ) {
    return true;
  }

  return false;
}

function resolveInitialPortal(userRole?: string): PortalMode {
  if (typeof window !== 'undefined') {
    if (isSpecialAdminUrl()) return 'admin';
    const path = window.location.pathname.toLowerCase();
    if (path.startsWith('/driver')) return 'driver';
    if (path.startsWith('/penumpang') || path.startsWith('/customer')) return 'customer';
  }
  if (userRole === 'driver') return 'driver';
  return 'customer';
}

export default function App() {
  const {
    currentUser,
    isAdminAuthenticated,
    isCheckingAdminSession,
    verifyAdminSessionWithServer,
    logoutAdminWithServer,
    logout,
    notifications,
  } = useM3CarStore();

  const [portalMode, setPortalMode] = useState<PortalMode>(() =>
    resolveInitialPortal(currentUser?.role)
  );
  const [isWhatsAppInboxOpen, setIsWhatsAppInboxOpen] = useState(false);

  useEffect(() => {
    verifyAdminSessionWithServer();

    const syncPortalFromUrl = () => {
      setPortalMode(resolveInitialPortal(currentUser?.role));
    };
    window.addEventListener('popstate', syncPortalFromUrl);
    window.addEventListener('hashchange', syncPortalFromUrl);
    return () => {
      window.removeEventListener('popstate', syncPortalFromUrl);
      window.removeEventListener('hashchange', syncPortalFromUrl);
    };
  }, []);

  const switchPortal = (mode: PortalMode) => {
    setPortalMode(mode);
    if (typeof window !== 'undefined') {
      const targetPath = mode === 'admin' ? '/admin' : mode === 'driver' ? '/driver' : '/';
      if (
        window.location.pathname !== targetPath ||
        window.location.search ||
        window.location.hash
      ) {
        window.history.pushState({}, '', targetPath);
      }
    }
  };

  const handleLogout = async () => {
    if (portalMode === 'admin' || isAdminAuthenticated) {
      await logoutAdminWithServer();
    } else {
      logout();
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 print:bg-white print:text-slate-950 flex flex-col font-sans selection:bg-red-600 selection:text-white overflow-x-clip">
      {/* Top Navigation Bar (Mobile-First Android App Header) */}
      <header className="sticky top-0 z-40 bg-neutral-950/95 backdrop-blur-md border-b border-neutral-800/90 print:hidden">
        <div className="max-w-7xl mx-auto px-4 py-2 sm:py-0 sm:h-16 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 sm:gap-6">
          {/* Wordmark Logo (Protected with shrink-0 & safe side spacing) */}
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              switchPortal('customer');
            }}
            className="order-1 flex items-center gap-2.5 pr-2 py-1 whitespace-nowrap shrink-0"
          >
            <img
              src="/assets/aistudio/IMG-20261104-WA0203_0c4b3898.jpg"
              alt="Logo M3CAR"
              className="w-8 h-8 rounded-xl object-cover bg-white p-0.5 shrink-0"
            />
            <span className="text-lg font-black tracking-tight text-white shrink-0">
              M3<span className="text-red-500">CAR</span>
            </span>
          </a>

          {/* Portal Navigation Tabs: Hanya Penumpang & Driver (Admin disembunyikan, diakses via URL khusus) */}
          <nav
            aria-label="Navigasi Portal"
            className="order-3 w-full sm:w-auto sm:order-2 grid grid-cols-2 sm:flex items-center gap-1 p-1 bg-neutral-900 border border-neutral-800 rounded-xl"
          >
            <button
              type="button"
              onClick={() => switchPortal('customer')}
              className={`min-h-[42px] sm:min-h-[38px] px-3 sm:px-5 py-1.5 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                portalMode === 'customer'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <User className="w-4 h-4 shrink-0" />
              <span>Penumpang</span>
            </button>
            <button
              type="button"
              onClick={() => switchPortal('driver')}
              className={`min-h-[42px] sm:min-h-[38px] px-3 sm:px-5 py-1.5 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                portalMode === 'driver'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Car className="w-4 h-4 shrink-0" />
              <span>Driver</span>
            </button>
          </nav>

          {/* Contextual Action */}
          <div className="order-2 sm:order-3 flex items-center gap-2 shrink-0">
            {portalMode === 'admin' && isAdminAuthenticated ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsWhatsAppInboxOpen(true)}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  title="WhatsApp Gateway"
                >
                  <MessageSquare className="w-4 h-4 text-emerald-400" />
                  <span className="hidden sm:inline">WA Log ({notifications.length})</span>
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="min-h-[40px] px-3.5 sm:px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </button>
              </div>
            ) : currentUser && currentUser.role !== 'admin' ? (
              <button
                type="button"
                onClick={logout}
                className="min-h-[40px] px-3.5 sm:px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <LogOut className="w-4 h-4 text-red-400" />
                <span>Keluar</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => switchPortal(portalMode === 'driver' ? 'customer' : 'driver')}
                className="min-h-[40px] px-3.5 sm:px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
              >
                {portalMode === 'driver' ? 'Pesan Travel' : 'Daftar Driver'}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content (includes safe bottom clearance on mobile for fixed Bottom Nav) */}
      <main className={`flex-1 w-full ${portalMode !== 'admin' ? 'pb-24 md:pb-6' : ''}`}>
        {portalMode === 'customer' && <CustomerView />}
        {portalMode === 'driver' && <DriverView />}
        {portalMode === 'admin' && (
          isCheckingAdminSession ? (
            <div className="min-h-[calc(100vh-10rem)] bg-[#070B14] text-white flex flex-col items-center justify-center gap-3 px-4">
              <div className="w-12 h-12 rounded-xl bg-[#0F294A] flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Memverifikasi sesi M3CAR Admin Panel...</span>
              </div>
            </div>
          ) : isAdminAuthenticated ? (
            <AdminView
              onOpenWhatsAppInbox={() => setIsWhatsAppInboxOpen(true)}
              onLogout={handleLogout}
            />
          ) : (
            <AdminLoginView onLoginSuccess={() => verifyAdminSessionWithServer()} />
          )
        )}
      </main>

      {/* Footer (desktop & tablet only so mobile bottom navigation bar remains uncluttered) */}
      {portalMode !== 'admin' && (
        <footer className="hidden md:block mt-auto border-t border-neutral-900 bg-neutral-950 py-5 text-center text-xs text-neutral-400 space-y-1">
          <div className="font-bold text-neutral-300">
            M3CAR &middot; CV. ROYAL TRANS BERKAH GROUP
          </div>
          <div className="text-[11px] text-neutral-500">
            Desa Tunggaljaya, Kec. Sumur, Kab. Pandeglang, Banten - 42284 &middot; Travel Jakarta - Ujung Kulon 24 Jam
          </div>
        </footer>
      )}

      {/* WhatsApp Notification Gateway Modal */}
      <WhatsAppModal
        isOpen={isWhatsAppInboxOpen}
        onClose={() => setIsWhatsAppInboxOpen(false)}
      />
    </div>
  );
}
