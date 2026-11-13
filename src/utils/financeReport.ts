import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  DriverProfile,
  DriverTopUpRequest,
  KeuanganAdminItem,
  LaporanKeuanganItem,
  Order,
} from '../types';

export type ReportPeriod = 'ALL' | 'TODAY' | 'WEEK' | 'MONTH';
export type ReportYearFilter = 'ALL' | number;

export interface MergedTripFinancial {
  key: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  driverName: string;
  pickupLocation: string;
  destination: string;
  date: string;
  createdAt: string;
  sortTime: number;
  year: number;
  paymentMethod: string;
  paymentStatus: string;
  totalPrice: number;
  commissionAmount: number;
  isArchivedOnly: boolean;
}

export interface FinanceReportRow {
  no: number;
  tanggal: string;
  sortTime: number;
  jenisTransaksi: string;
  namaPihak: string;
  ruteKeterangan: string;
  nominalRp: number;
  status: string;
}

export interface FinanceReportData {
  kopTitle: string;
  kopSubtitle: string;
  printedAtLabel: string;
  periodeLabel: string;
  totalPendapatanPerjalanan: number;
  jumlahOrderPerjalanan: number;
  totalTopUpDriver: number;
  jumlahTopUpDisetujui: number;
  totalKomisiAplikasi: number;
  totalSaldoDriver: number;
  totalTransaksiCount: number;
  totalNilaiGabungan: number;
  rows: FinanceReportRow[];
}

export function parseFlexibleDateMs(dateStr?: string, fallbackMs?: number): number {
  if (typeof fallbackMs === 'number' && Number.isFinite(fallbackMs) && fallbackMs > 0) {
    return fallbackMs;
  }
  if (!dateStr) return 0;
  const raw = String(dateStr).trim();
  if (!raw) return 0;

  // Handle DD/MM/YYYY or D/M/YYYY (with optional time)
  const dmyMatch = raw.match(
    /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[,\s]+(\d{1,2})[:.](\d{2}))?/
  );
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]) - 1;
    const year = Number(dmyMatch[3]);
    const hour = dmyMatch[4] ? Number(dmyMatch[4]) : 0;
    const min = dmyMatch[5] ? Number(dmyMatch[5]) : 0;
    const parsed = new Date(year, month, day, hour, min).getTime();
    if (!Number.isNaN(parsed)) return parsed;
  }

  // Handle YYYY-MM-DD
  const parsedIso = Date.parse(raw);
  if (!Number.isNaN(parsedIso)) return parsedIso;

  return 0;
}

/**
 * Merge archived `laporan_keuangan` records with active `orders` (deduped by orderId)
 * so completed order revenue remains 100% intact even after old `orders` are auto-cleaned.
 */
export function mergeCompletedTripFinancials(
  orders: Order[],
  laporanKeuangan: LaporanKeuanganItem[] = []
): MergedTripFinancial[] {
  const byOrderId = new Map<string, MergedTripFinancial>();

  for (const lk of laporanKeuangan) {
    if (lk.isDeleted) continue;
    const sortTime =
      parseFlexibleDateMs(lk.date || lk.createdAt || lk.createdAtIso, lk.createdAtMs) || 0;
    const year =
      Number(lk.year) || (sortTime > 0 ? new Date(sortTime).getFullYear() : new Date().getFullYear());
    const key = lk.orderId || lk.id;
    byOrderId.set(key, {
      key,
      orderId: lk.orderId || lk.id,
      orderNumber: lk.orderNumber || key,
      customerName: lk.customerName || 'Penumpang M3Car',
      driverName: lk.driverName || '-',
      pickupLocation: lk.pickupLocation || '-',
      destination: lk.destination || '-',
      date: lk.date || lk.createdAt || '-',
      createdAt: lk.createdAt || lk.date || '-',
      sortTime,
      year,
      paymentMethod: lk.paymentMethod || 'TUNAI',
      paymentStatus: lk.paymentStatus || 'LUNAS',
      totalPrice: Number(lk.totalPrice || 0),
      commissionAmount: Number(lk.commissionAmount || 0),
      isArchivedOnly: true,
    });
  }

  for (const o of orders) {
    if (o.isDeleted) continue;
    if (o.status !== 'SELESAI' && o.paymentStatus !== 'LUNAS') continue;
    const sortTime = parseFlexibleDateMs(
      o.date || o.createdAt || o.completedAt,
      (o as { createdAtMs?: number }).createdAtMs
    );
    const year = sortTime > 0 ? new Date(sortTime).getFullYear() : new Date().getFullYear();
    const price = Number(o.totalPrice ?? o.harga ?? 0);
    const comm = Number(o.commissionAmount) || Math.round(price * (o.commissionRate || 0.12));

    byOrderId.set(o.id, {
      key: o.id,
      orderId: o.id,
      orderNumber: o.orderNumber || o.id,
      customerName: o.customerName || 'Penumpang M3Car',
      driverName: o.driverName || 'Belum Ada Driver',
      pickupLocation: o.pickupLocation || o.dari || '-',
      destination: o.destination || o.ke || '-',
      date: o.date || o.createdAt || '-',
      createdAt: o.createdAt || o.date || '-',
      sortTime,
      year,
      paymentMethod: o.paymentMethod || 'TUNAI',
      paymentStatus: o.paymentStatus === 'LUNAS' ? 'Lunas' : o.status === 'SELESAI' ? 'Selesai' : o.status,
      totalPrice: price,
      commissionAmount: comm,
      isArchivedOnly: false,
    });
  }

  return Array.from(byOrderId.values()).sort((a, b) => b.sortTime - a.sortTime);
}

function isInSelectedYear(timeMs: number, yearFilter: ReportYearFilter, explicitYear?: number): boolean {
  if (yearFilter === 'ALL') return true;
  if (typeof explicitYear === 'number' && explicitYear > 2000) {
    return explicitYear === yearFilter;
  }
  if (!timeMs) return false;
  return new Date(timeMs).getFullYear() === yearFilter;
}

function isInSelectedPeriod(timeMs: number, period: ReportPeriod, now: Date): boolean {
  if (period === 'ALL' || !timeMs) return true;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfToday = startOfToday + 24 * 60 * 60 * 1000 - 1;

  if (period === 'TODAY') {
    return timeMs >= startOfToday && timeMs <= endOfToday;
  }
  if (period === 'WEEK') {
    const sevenDaysAgo = startOfToday - 6 * 24 * 60 * 60 * 1000;
    return timeMs >= sevenDaysAgo && timeMs <= endOfToday;
  }
  if (period === 'MONTH') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return timeMs >= startOfMonth && timeMs <= endOfToday;
  }
  return true;
}

export function formatPeriodLabel(
  period: ReportPeriod,
  now = new Date(),
  yearFilter: ReportYearFilter = 'ALL'
): string {
  const monthNames = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];
  const todayStr = `${now.getDate()} ${monthNames[now.getMonth()]} ${now.getFullYear()}`;
  const yearSuffix = yearFilter !== 'ALL' ? ` • Tahun ${yearFilter}` : '';

  if (period === 'TODAY') return `Hari Ini (${todayStr})${yearSuffix}`;
  if (period === 'WEEK') {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    const startStr = `${start.getDate()} ${monthNames[start.getMonth()]} ${start.getFullYear()}`;
    return `7 Hari Terakhir (${startStr} - ${todayStr})${yearSuffix}`;
  }
  if (period === 'MONTH') {
    return `Bulan ${monthNames[now.getMonth()]} ${now.getFullYear()}${yearSuffix}`;
  }
  if (yearFilter !== 'ALL') {
    return `Tahun ${yearFilter}`;
  }
  return `Semua Periode (s/d ${todayStr})`;
}

export function formatRupiahSigned(amount: number): string {
  const absVal = Math.abs(Math.round(amount || 0));
  const formatted = absVal.toLocaleString('id-ID');
  return amount < 0 ? `-Rp ${formatted}` : `Rp ${formatted}`;
}

export function buildFinanceReportData(params: {
  orders: Order[];
  laporanKeuangan?: LaporanKeuanganItem[];
  topUpRequests: DriverTopUpRequest[];
  keuanganAdmin: KeuanganAdminItem[];
  drivers: DriverProfile[];
  period: ReportPeriod;
  yearFilter?: ReportYearFilter;
}): FinanceReportData {
  const now = new Date();
  const {
    orders,
    laporanKeuangan = [],
    topUpRequests,
    keuanganAdmin,
    drivers,
    period,
    yearFilter = 'ALL',
  } = params;

  const activeDrivers = drivers.filter((d) => !d.isDeleted);
  const totalSaldoDriver = activeDrivers.reduce(
    (sum, d) => sum + Number(d.saldo ?? d.balance ?? 0),
    0
  );

  const rawRows: Omit<FinanceReportRow, 'no'>[] = [];

  // 1. Pendapatan Perjalanan (Pesanan Selesai atau Lunas + Arsip laporan_keuangan)
  const mergedTrips = mergeCompletedTripFinancials(orders, laporanKeuangan);

  let totalPendapatanPerjalanan = 0;
  let jumlahOrderPerjalanan = 0;
  let totalKomisiAplikasi = 0;

  for (const trip of mergedTrips) {
    if (!isInSelectedYear(trip.sortTime, yearFilter, trip.year)) continue;
    if (!isInSelectedPeriod(trip.sortTime, period, now)) continue;

    totalPendapatanPerjalanan += trip.totalPrice;
    totalKomisiAplikasi += trip.commissionAmount;
    jumlahOrderPerjalanan += 1;

    rawRows.push({
      tanggal: trip.date || trip.createdAt || '-',
      sortTime: trip.sortTime,
      jenisTransaksi: 'Pendapatan Perjalanan',
      namaPihak: `Penumpang: ${trip.customerName} | Driver: ${trip.driverName}`,
      ruteKeterangan: `${trip.orderNumber ? trip.orderNumber + ' - ' : ''}${trip.pickupLocation} -> ${trip.destination} (${trip.paymentMethod})`,
      nominalRp: trip.totalPrice,
      status: trip.paymentStatus === 'LUNAS' ? 'Lunas' : trip.paymentStatus,
    });
  }

  // 2. Isi Saldo (Top-Up) Driver (disimpan 1 tahun penuh)
  const activeTopUps = topUpRequests.filter((r) => !r.isDeleted);
  let totalTopUpDriver = 0;
  let jumlahTopUpDisetujui = 0;

  for (const req of activeTopUps) {
    const timeMs = parseFlexibleDateMs(req.createdAt, req.createdAtMs);
    if (!isInSelectedYear(timeMs, yearFilter)) continue;
    if (!isInSelectedPeriod(timeMs, period, now)) continue;

    const amount = Number(req.amount || 0);
    if (req.status === 'BERHASIL') {
      totalTopUpDriver += amount;
      jumlahTopUpDisetujui += 1;
    }

    const statusText =
      req.status === 'BERHASIL'
        ? 'Disetujui'
        : req.status === 'MENUNGGU'
        ? 'Menunggu Konfirmasi'
        : 'Ditolak';

    rawRows.push({
      tanggal: req.createdAt || '-',
      sortTime: timeMs,
      jenisTransaksi: 'Isi Saldo (Top-Up) Driver',
      namaPihak: `${req.driverName || '-'}${req.driverPlate ? ' (' + req.driverPlate + ')' : ''}`,
      ruteKeterangan: `Transfer ${req.bankName || 'SeaBank'} (${req.accountNumber || '901102051050'})${
        req.note ? ' - ' + req.note : ''
      }`,
      nominalRp: amount,
      status: statusText,
    });
  }

  // 3. Buku Kas Admin (keuangan_admin)
  const activeKas = keuanganAdmin.filter((k) => !k.isDeleted);
  for (const k of activeKas) {
    const timeMs = parseFlexibleDateMs(k.tanggal || k.createdAt, k.createdAtMs);
    if (!isInSelectedYear(timeMs, yearFilter)) continue;
    if (!isInSelectedPeriod(timeMs, period, now)) continue;

    const amount = Number(k.jumlah_rp || 0);
    const signedNominal = k.jenis === 'masuk' ? amount : -amount;
    const pihak =
      [k.nama_driver, k.nama_customer].filter(Boolean).join(' / ') || 'Kas Internal Admin M3CAR';

    rawRows.push({
      tanggal: k.tanggal || k.createdAt || '-',
      sortTime: timeMs,
      jenisTransaksi: k.jenis === 'masuk' ? 'Kas Masuk Admin' : 'Kas Keluar Admin',
      namaPihak: pihak,
      ruteKeterangan: `${k.id_transaksi ? k.id_transaksi + ' - ' : ''}${k.keterangan || '-'}`,
      nominalRp: signedNominal,
      status: k.jenis === 'masuk' ? 'Kas Masuk' : 'Kas Keluar',
    });
  }

  // Sort newest first so latest financial activity is on top
  rawRows.sort((a, b) => b.sortTime - a.sortTime);

  const rows: FinanceReportRow[] = rawRows.map((item, idx) => ({
    ...item,
    no: idx + 1,
  }));

  const printedAtLabel = now.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return {
    kopTitle: 'LAPORAN KEUANGAN M3CAR - CV. ROYAL TRANS BERKAH GROUP',
    kopSubtitle:
      'Layanan Travel Jakarta - Ujung Kulon | Desa Tunggaljaya, Kec. Sumur, Kab. Pandeglang, Banten 42284',
    printedAtLabel: `${printedAtLabel} WIB`,
    periodeLabel: formatPeriodLabel(period, now, yearFilter),
    totalPendapatanPerjalanan,
    jumlahOrderPerjalanan,
    totalTopUpDriver,
    jumlahTopUpDisetujui,
    totalKomisiAplikasi,
    totalSaldoDriver,
    totalTransaksiCount: rows.length,
    totalNilaiGabungan: totalPendapatanPerjalanan + totalTopUpDriver,
    rows,
  };
}

export function exportFinanceReportPdf(data: FinanceReportData): void {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 297mm on A4 landscape
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2; // 269mm

  // Official Kop Laporan Header Banner
  doc.setFillColor(15, 41, 74); // #0F294A Navy
  doc.rect(marginX, 12, contentWidth, 22, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.text(data.kopTitle, marginX + 5, 21);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(226, 232, 240);
  doc.text(data.kopSubtitle, marginX + 5, 27.5);

  // Meta Info: Tanggal Cetak & Periode Laporan
  doc.setTextColor(51, 65, 85);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Periode Laporan : ${data.periodeLabel}`, marginX, 41);
  doc.text(`Tanggal Cetak   : ${data.printedAtLabel}`, pageWidth - marginX, 41, {
    align: 'right',
  });

  // Ringkasan Total (3 Kotak Sejajar)
  const boxGap = 4;
  const boxWidth = (contentWidth - boxGap * 2) / 3;
  const boxY = 45;
  const boxH = 19;

  const summaryBoxes = [
    {
      label: 'TOTAL PENDAPATAN PERJALANAN',
      value: formatRupiahSigned(data.totalPendapatanPerjalanan),
      sub: `${data.jumlahOrderPerjalanan} Pesanan Selesai / Lunas`,
      accent: [15, 41, 74] as [number, number, number],
    },
    {
      label: 'TOTAL ISI SALDO (TOP-UP) DRIVER',
      value: formatRupiahSigned(data.totalTopUpDriver),
      sub: `${data.jumlahTopUpDisetujui} Pengajuan Top-Up Disetujui`,
      accent: [5, 150, 105] as [number, number, number],
    },
    {
      label: 'TOTAL TRANSAKSI KESELURUHAN',
      value: `${data.totalTransaksiCount.toLocaleString('id-ID')} Transaksi`,
      sub: `Akumulasi Nilai: ${formatRupiahSigned(data.totalNilaiGabungan)}`,
      accent: [185, 28, 28] as [number, number, number],
    },
  ];

  summaryBoxes.forEach((box, idx) => {
    const bx = marginX + idx * (boxWidth + boxGap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.35);
    doc.roundedRect(bx, boxY, boxWidth, boxH, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(box.label, bx + 4, boxY + 5.5);

    doc.setFontSize(12);
    doc.setTextColor(box.accent[0], box.accent[1], box.accent[2]);
    doc.text(box.value, bx + 4, boxY + 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(box.sub, bx + 4, boxY + 16.5);
  });

  // Tabel Rekap Otomatis
  const tableRows = data.rows.map((r) => [
    String(r.no),
    r.tanggal,
    r.jenisTransaksi,
    r.namaPihak,
    r.ruteKeterangan,
    formatRupiahSigned(r.nominalRp),
    r.status,
  ]);

  if (tableRows.length === 0) {
    tableRows.push(['-', '-', 'Belum ada data transaksi pada periode ini', '-', '-', 'Rp 0', '-']);
  }

  autoTable(doc, {
    startY: boxY + boxH + 6,
    margin: { left: marginX, right: marginX, top: 14, bottom: 16 },
    head: [
      [
        'No',
        'Tanggal',
        'Jenis Transaksi',
        'Nama Driver/Pelanggan',
        'Rute/Keterangan',
        'Nominal Rp',
        'Status',
      ],
    ],
    body: tableRows,
    foot: [
      [
        '',
        '',
        'REKAP TOTAL',
        `${data.totalTransaksiCount} Transaksi`,
        `Komisi Aplikasi: ${formatRupiahSigned(data.totalKomisiAplikasi)}`,
        formatRupiahSigned(data.totalNilaiGabungan),
        'Terverifikasi',
      ],
    ],
    showHead: 'everyPage',
    showFoot: 'lastPage',
    rowPageBreak: 'avoid',
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.25,
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [15, 41, 74],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'left',
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 11, halign: 'center' },
      1: { cellWidth: 32 },
      2: { cellWidth: 38, fontStyle: 'bold' },
      3: { cellWidth: 52 },
      4: { cellWidth: 78 },
      5: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
      6: { cellWidth: 28, halign: 'center' },
    },
    didParseCell: (hookData) => {
      if (hookData.section === 'head' && hookData.column.index === 0) {
        hookData.cell.styles.halign = 'center';
      }
      if (hookData.section === 'head' && hookData.column.index === 5) {
        hookData.cell.styles.halign = 'right';
      }
      if (hookData.section === 'head' && hookData.column.index === 6) {
        hookData.cell.styles.halign = 'center';
      }
      if (hookData.section === 'foot' && hookData.column.index === 5) {
        hookData.cell.styles.halign = 'right';
      }
      if (hookData.section === 'foot' && hookData.column.index === 6) {
        hookData.cell.styles.halign = 'center';
      }
    },
    didDrawPage: () => {
      const pageCount = doc.getNumberOfPages();
      const currentPage = doc.getCurrentPageInfo().pageNumber;
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(
        'M3CAR - CV. Royal Trans Berkah Group | Dokumen Rekap Keuangan Resmi',
        marginX,
        pageHeight - 7
      );
      doc.text(`Halaman ${currentPage} dari ${pageCount}`, pageWidth - marginX, pageHeight - 7, {
        align: 'right',
      });
    },
  });

  const dateStamp = new Date().toISOString().slice(0, 10);
  doc.save(`Laporan-Keuangan-M3CAR-${dateStamp}.pdf`);
}

function escapeCsvCell(value: string | number): string {
  const clean = String(value ?? '')
    .replace(/\r?\n|\r/g, ' ')
    .replace(/\u2192/g, '->')
    .trim();
  const escaped = clean.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function exportFinanceReportCsv(data: FinanceReportData): void {
  // Directive "sep=," ensures Indonesian & International Microsoft Excel split columns immediately
  const lines: string[] = [
    'sep=,',
    [
      'No',
      'Tanggal',
      'Jenis Transaksi',
      'Nama Driver/Pelanggan',
      'Rute/Keterangan',
      'Nominal (Rp)',
      'Status',
    ]
      .map(escapeCsvCell)
      .join(','),
  ];

  for (const row of data.rows) {
    lines.push(
      [
        row.no,
        row.tanggal,
        row.jenisTransaksi,
        row.namaPihak,
        row.ruteKeterangan,
        row.nominalRp,
        row.status,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  }

  // Ringkasan Total section at the bottom of the CSV sheet
  lines.push('');
  lines.push(
    [
      '',
      'Periode Laporan',
      data.periodeLabel,
      'Tanggal Cetak',
      data.printedAtLabel,
      '',
      '',
    ]
      .map(escapeCsvCell)
      .join(',')
  );
  lines.push(
    [
      '',
      'Total Pendapatan Perjalanan',
      `${data.jumlahOrderPerjalanan} Pesanan`,
      '',
      '',
      data.totalPendapatanPerjalanan,
      'Terverifikasi',
    ]
      .map(escapeCsvCell)
      .join(',')
  );
  lines.push(
    [
      '',
      'Total Isi Saldo (Top-Up) Driver',
      `${data.jumlahTopUpDisetujui} Pengajuan Disetujui`,
      '',
      '',
      data.totalTopUpDriver,
      'Terverifikasi',
    ]
      .map(escapeCsvCell)
      .join(',')
  );
  lines.push(
    [
      '',
      'Total Transaksi Keseluruhan',
      `${data.totalTransaksiCount} Transaksi`,
      'Akumulasi Pendapatan & Top-Up',
      '',
      data.totalNilaiGabungan,
      'Rekap Resmi',
    ]
      .map(escapeCsvCell)
      .join(',')
  );

  const csvContent = lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  const dateStamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `Laporan-Keuangan-M3CAR-${dateStamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
