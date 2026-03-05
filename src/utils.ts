// ============================================================
// UTILS — Shared helpers for LiderControl
// ============================================================

import { db } from './firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';

// Number formatter (Peruvian locale)
export const nf = new Intl.NumberFormat('es-PE');
// Percentage formatter
export const pf = (value: number, total: number) =>
    total ? ((value / total) * 100).toFixed(1) : '0.0';

// Debounce
export function debounce<T extends (...args: any[]) => any>(fn: T, wait = 200) {
    let t: ReturnType<typeof setTimeout>;
    return (...args: Parameters<T>) => {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(null, args), wait);
    };
}

// CSV escape
export const csvEsc = (s: any) => `"${(s ?? '').toString().replace(/"/g, '""')}"`;

// Normalize string (uppercase, no accents)
export const norm = (s: string) =>
    (s || '').toString().trim().toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Incident category buckets
export const BUCKETS: Record<string, string[]> = {
    RIESGO: ['CONDICION DE RIESGO', 'CONDICIÓN DE RIESGO'],
    CODIGOS: ['CODIGO DE SEGURIDAD Y EMERGENCIA', 'CÓDIGOS DE SEGURIDAD Y EMERGENCIA'],
    AMBIENTAL: ['ACTO DE SISTEMA MEDIO AMBIENTAL', 'ACTOS DE SISTEMA MEDIOAMBIENTAL'],
    SSO: ['ACTO DE SEGURIDAD Y SALUD OCUPACIONAL', 'ACTOS DE SEGURIDAD Y SALUD OCUPACIONAL'],
};
export function bucketOf(tipo: string) {
    const t = norm(tipo);
    for (const [k, arr] of Object.entries(BUCKETS)) {
        if (arr.some(x => t.includes(norm(x)))) return k;
    }
    return 'OTROS';
}

// Month names
export const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// Color palette for charts
export const PALETTE = {
    blue: '#4f8ef7',
    blueLt: '#60a5fa',
    violet: '#8b5cf6',
    cyan: '#0ea5e9',
    amber: '#f59e0b',
    red: '#ef4444',
    gray: '#64748b',
    green: '#10b981',
    orange: '#f97316',
    pink: '#ec4899',
    teal: '#14b8a6',
    lime: '#84cc16',
};

export const CHART_COLORS = Object.values(PALETTE);

// Convert Firebase timestamp to Date
export function tsToDate(ts: any): Date | null {
    if (!ts) return null;
    if (ts.toDate) return ts.toDate();
    if (ts instanceof Date) return ts;
    if (typeof ts === 'string' || typeof ts === 'number') {
        const d = new Date(ts);
        return isNaN(d.getTime()) ? null : d;
    }
    return null;
}

// Format date as DD/MM/YYYY
export function formatDate(ts: any): string {
    const d = tsToDate(ts);
    if (!d) return '--';
    return d.toLocaleDateString('es-PE');
}

// Format datetime as DD/MM/YYYY HH:MM:SS
export function formatDatetime(ts: any): string {
    const d = tsToDate(ts);
    if (!d) return '--';
    return `${d.toLocaleDateString('es-PE')} ${d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

// Format time HH:MM:SS
export function formatTime(ts: any): string {
    const d = tsToDate(ts);
    if (!d) return '--';
    return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Duration between two timestamps
export function calcDuration(inicio: any, fin: any): string {
    const s = tsToDate(inicio);
    const e = tsToDate(fin);
    if (!s || !e) return '--';
    const ms = e.getTime() - s.getTime();
    if (ms < 0) return '--';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    if (h > 0) return `${h}h ${m}m ${sec}s`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
}

// Parse date string DD/MM/YYYY to Date
export function parseDMY(str: string): Date | null {
    if (!str) return null;
    const [d, m, y] = str.split('/');
    const date = new Date(`${y}-${m}-${d}`);
    return isNaN(date.getTime()) ? null : date;
}

// Get units from CLIENTE_UNIDAD collection for a given client
export async function getUnidadesByCliente(cliente: string): Promise<string[]> {
    if (!cliente) return [];
    try {
        const result: string[] = [];
        const docRef = doc(db, 'CLIENTE_UNIDAD', cliente);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            const data = snap.data();
            if (data.unidades && Array.isArray(data.unidades)) result.push(...data.unidades);
            if (data.UNIDADES && Array.isArray(data.UNIDADES)) result.push(...data.UNIDADES);
        }
        // Also try subcollection
        const subSnap = await getDocs(collection(db, 'CLIENTE_UNIDAD', cliente, 'UNIDADES'));
        subSnap.forEach(d => result.push(d.id));
        return [...new Set(result)].sort();
    } catch {
        return [];
    }
}

// Get all clients list
export async function getAllClientes(): Promise<string[]> {
    const snap = await getDocs(collection(db, 'CLIENTE_UNIDAD'));
    return snap.docs.map(d => d.id).sort();
}

// Unique values from array
export function uniq<T>(arr: T[]): T[] {
    return [...new Set(arr.filter(Boolean))];
}

// Fill a <select> element with options
export function fillSelect(
    el: HTMLSelectElement | null,
    values: string[],
    firstLabel = 'Todos',
    firstValue = '',
    selected?: string
) {
    if (!el) return;
    el.innerHTML = `<option value="${firstValue}">${firstLabel}</option>` +
        values.map(v =>
            `<option value="${v}"${v === selected ? ' selected' : ''}>${v}</option>`
        ).join('');
}

// Status badge HTML
export function statusBadge(status: string): string {
    if (!status) return '<span class="badge badge-gray">—</span>';
    const s = status.toUpperCase();
    if (s.includes('ACTIVO') || s.includes('TERMINADA') || s.includes('AUTORIZADO') || s.includes('SALIDA')) {
        return `<span class="badge badge-success">${status}</span>`;
    } else if (s.includes('INACTIVO') || s.includes('NO REALIZADA') || s.includes('DENEGADO')) {
        return `<span class="badge badge-danger">${status}</span>`;
    } else if (s.includes('INCOMPLET') || s.includes('PENDIENTE')) {
        return `<span class="badge badge-warning">${status}</span>`;
    }
    return `<span class="badge badge-blue">${status}</span>`;
}

// Risk level badge
export function riskBadge(nivel: string): string {
    if (!nivel) return '<span class="badge badge-gray">—</span>';
    const n = nivel.toUpperCase();
    if (n === 'BAJO') return `<span class="badge badge-success">${nivel}</span>`;
    if (n === 'MEDIO') return `<span class="badge badge-warning">${nivel}</span>`;
    if (n === 'ALTO') return `<span class="badge badge-danger">${nivel}</span>`;
    return `<span class="badge badge-info">${nivel}</span>`;
}

// Export data to Excel with xlsx
export async function exportToExcel(data: Record<string, any>[], filename: string, headers?: string[]) {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(data, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Datos');
    XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : filename + '.xlsx');
}

// Show image thumbnail
export function thumbHtml(url: string): string {
    if (!url) return '—';
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">
    <img src="${url}" alt="foto" style="width:40px;height:40px;object-fit:cover;border-radius:6px;border:1px solid rgba(255,255,255,0.1);" loading="lazy" />
  </a>`;
}

// Heatmap color from 0..max
export function heatColor(value: number, max: number): string {
    if (!max) return '#1e293b';
    const ratio = value / max;
    if (ratio === 0) return '#1e293b';
    if (ratio < 0.25) return '#1e3a5f';
    if (ratio < 0.5) return '#1d4ed8';
    if (ratio < 0.75) return '#f59e0b';
    return '#ef4444';
}

// Heatmap text color for readability
export function heatTextColor(value: number, max: number): string {
    if (!max || value === 0) return '#64748b';
    return '#fff';
}
