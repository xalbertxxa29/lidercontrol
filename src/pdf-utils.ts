import { UI } from './ui';
import Chart from 'chart.js/auto';

// We use pdfMake from CDN (app.html) to avoid Vite bundling issues
const getPdfMake = () => (window as any).pdfMake;

export async function getLogoBase64(): Promise<string | null> {
    try {
        const logoResponse = await fetch('/logo_liberman.png');
        if (!logoResponse.ok) return null;
        const logoBlob = await logoResponse.blob();
        return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(logoBlob);
        });
    } catch (e) {
        console.warn('Could not load logo for PDF', e);
        return null;
    }
}

export async function generateChartImage(labels: string[], data: number[], colors: string[]): Promise<string | null> {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    canvas.style.display = 'none';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const chart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: colors,
                borderColor: colors.map(c => c), // Could darken if needed
                borderWidth: 2,
                borderRadius: 5
            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        font: { size: 12, weight: 'bold' },
                        padding: 15,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                }
            }
        }
    });

    await new Promise(resolve => setTimeout(resolve, 800));
    const image = canvas.toDataURL('image/png');

    document.body.removeChild(canvas);
    chart.destroy();

    return image;
}

export async function exportToPDF(docDefinition: any, filename: string) {
    const pm = getPdfMake();
    if (!pm) {
        UI.toast('Librería PDF no cargada (CDN)', 'error');
        return;
    }
    pm.createPdf(docDefinition).download(filename);
}
