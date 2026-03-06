import { db } from './firebase';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { accessControl } from './access-control';

export interface CacheUnitMap {
    [cliente: string]: string[];
}

const COLLECTIONS = {
    CLIENT_UNITS: 'CLIENTE_UNIDAD'
};

const CACHE_KEY = 'weblidercontrol_client_units_v1';
const CACHE_TIMESTAMP_KEY = 'weblidercontrol_client_units_ts_v1';
const CACHE_TTL_MS = 1000 * 60 * 60 * 4; // 4 hours

class CacheService {
    private inMemoryCache: CacheUnitMap | null = null;
    private isFetching = false;
    private fetchPromise: Promise<CacheUnitMap> | null = null;

    async getClientUnits(): Promise<CacheUnitMap> {
        if (this.inMemoryCache) {
            return this.inMemoryCache;
        }

        try {
            const storedTs = sessionStorage.getItem(CACHE_TIMESTAMP_KEY);
            if (storedTs) {
                const age = Date.now() - parseInt(storedTs, 10);
                if (age < CACHE_TTL_MS) {
                    const storedData = sessionStorage.getItem(CACHE_KEY);
                    if (storedData) {
                        this.inMemoryCache = JSON.parse(storedData);
                        return this.inMemoryCache!;
                    }
                }
            }
        } catch (e) {
            console.warn('Error reading sessionStorage', e);
        }

        if (this.isFetching && this.fetchPromise) {
            return this.fetchPromise;
        }

        this.isFetching = true;
        this.fetchPromise = this.fetchFromFirebase();

        try {
            return await this.fetchPromise;
        } finally {
            this.isFetching = false;
            this.fetchPromise = null;
        }
    }

    private async fetchFromFirebase(): Promise<CacheUnitMap> {
        const dataMap: CacheUnitMap = {};
        console.log('[CACHE] Fetching Clients & Units from Firestore (One-Time Cost)...');

        try {
            if (accessControl.state?.userType === 'CLIENTE' && accessControl.state?.clienteAsignado) {
                dataMap[accessControl.state.clienteAsignado] = [];
            } else {
                const clientesSnap = await getDocs(query(collection(db, COLLECTIONS.CLIENT_UNITS), limit(200)));
                clientesSnap.forEach(doc => {
                    dataMap[doc.id] = [];
                });
            }

            const clientesArreglo = Object.keys(dataMap);

            const promises = clientesArreglo.map(async (cliente) => {
                try {
                    const unidadesSnap = await getDocs(collection(db, `${COLLECTIONS.CLIENT_UNITS}/${cliente}/UNIDADES`));
                    dataMap[cliente] = unidadesSnap.docs.map(u => Math.max(0, u.id.trim().length) > 0 ? u.id : '').filter(u => u !== '');
                } catch (e) {
                    console.error('[CACHE] Error downloading units for: ', cliente, e);
                }
            });

            await Promise.all(promises);

            this.inMemoryCache = dataMap;
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(dataMap));
            sessionStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());

            console.log('[CACHE] Local cache saved successfully.');
            return dataMap;
        } catch (e) {
            console.error('[CACHE] Critical failure fetching base:', e);
            return {};
        }
    }

    clearCache() {
        this.inMemoryCache = null;
        sessionStorage.removeItem(CACHE_KEY);
        sessionStorage.removeItem(CACHE_TIMESTAMP_KEY);
        console.log('[CACHE] Cache Cleared.');
    }
}

export const masterCache = new CacheService();
