import React from 'react';
import { useM3CarStore } from '../../store/m3carStore';
import {
  X,
  MessageSquare,
  CheckCheck,
  Send,
  ExternalLink,
  Shield,
  Car,
  User,
} from 'lucide-react';

interface WhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WhatsAppModal: React.FC<WhatsAppModalProps> = ({ isOpen, onClose }) => {
  const { notifications } = useM3CarStore();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl bg-neutral-900 border border-neutral-700 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* WhatsApp Branded Header */}
        <div className="bg-[#128C7E] px-5 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <span>M3CAR WhatsApp Gateway</span>
                <span className="text-[10px] bg-emerald-700/80 px-2 py-0.5 rounded-full font-medium">
                  Live Dispatch
                </span>
              </h2>
              <p className="text-xs text-emerald-100">
                Log notifikasi WA otomatis ke Driver & Pelanggan
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* WhatsApp Conversation List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0c1317]">
          {notifications.length === 0 ? (
            <div className="text-center py-12 text-neutral-400">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30 text-emerald-400" />
              <p className="font-semibold text-sm">Belum ada riwayat pesan WhatsApp</p>
              <p className="text-xs text-neutral-500 mt-1">
                Pesan WA akan otomatis tercatat saat Admin ACC/Tolak Driver atau ada Order masuk.
              </p>
            </div>
          ) : (
            notifications.map((notif) => {
              const waUrl = `https://wa.me/${notif.recipientPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
                `*M3CAR Travel Service*\n\n${notif.title}\n\n${notif.message}`
              )}`;

              const roleBadge =
                notif.recipientRole === 'admin' ? (
                  <span className="flex items-center gap-1 text-[10px] text-red-400 bg-red-950/60 px-2 py-0.5 rounded">
                    <Shield className="w-3 h-3" /> Admin
                  </span>
                ) : notif.recipientRole === 'driver' ? (
                  <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded">
                    <Car className="w-3 h-3" /> Mitra Driver
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded">
                    <User className="w-3 h-3" /> Customer
                  </span>
                );

              return (
                <div
                  key={notif.id}
                  className="bg-[#1f2c34] border border-neutral-700/60 rounded-2xl p-3.5 text-neutral-200 shadow-md transition-all hover:border-[#128C7E]/50"
                >
                  {/* Top Sender & Target Info */}
                  <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-neutral-700/50">
                    <div className="flex items-center gap-2">
                      <div className="font-bold text-xs text-emerald-400">{notif.recipientName}</div>
                      <span className="text-[11px] text-neutral-400 font-mono">({notif.recipientPhone})</span>
                      {roleBadge}
                    </div>
                    <span className="text-[10px] text-neutral-400 whitespace-nowrap">{notif.timestamp}</span>
                  </div>

                  {/* Message Title & Content */}
                  <div className="text-sm font-semibold text-white mb-1.5 flex items-center gap-1.5">
                    <span>{notif.title}</span>
                  </div>
                  <div className="text-xs text-neutral-300 leading-relaxed whitespace-pre-wrap bg-[#111b21] p-3 rounded-xl border border-neutral-800">
                    {notif.message}
                  </div>

                  {/* Action Link to Real WhatsApp */}
                  <div className="mt-2.5 pt-2 flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1 text-emerald-400">
                      <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
                      <span>Status: Terkirim via Gateway</span>
                    </div>

                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1 bg-[#128C7E] hover:bg-[#075E54] text-white rounded-lg font-medium transition-colors"
                    >
                      <Send className="w-3 h-3" />
                      <span>Buka di WhatsApp Web/HP</span>
                      <ExternalLink className="w-3 h-3 ml-0.5 opacity-80" />
                    </a>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="bg-neutral-950 p-4 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
          <span>Kirim pesan WA otomatis via Tripay / WhatsApp Cloud API</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-semibold cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
